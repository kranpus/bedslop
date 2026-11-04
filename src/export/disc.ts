// Music discs. Bedrock's stable record component can only play the vanilla disc sound events, so each disc
// plays through one of those slots and the resource pack points that slot's sound at the disc's .ogg.

import type { DiscElement, Project } from "../model/types";
import { DISC_SLOTS } from "../model/vanilla";
import { GenContext, dataUrlToBytes } from "./context";
import { clampInt, itemBase, round } from "./content";

/** The slot each disc uses: its chosen one, or the first slot no other disc has taken. */
export function discSlots(p: Project): Map<string, string> {
  const discs = p.elements.filter((e): e is DiscElement => e.kind === "disc");
  const taken = new Set(discs.map((d) => d.replaces).filter(Boolean));
  const out = new Map<string, string>();
  for (const d of discs) {
    if (d.replaces) { out.set(d.id, d.replaces); continue; }
    const free = DISC_SLOTS.find((s) => !taken.has(s)) ?? DISC_SLOTS[0];
    taken.add(free);
    out.set(d.id, free);
  }
  return out;
}

export const slotLabel = (slot: string) => `"${slot.replace("record.", "").replace(/_/g, " ")}"`;

export function genDisc(ctx: GenContext, d: DiscElement) {
  const slot = discSlots(ctx.project).get(d.id)!;
  const others = ctx.project.elements.filter((e): e is DiscElement => e.kind === "disc" && e.id !== d.id && discSlots(ctx.project).get(e.id) === slot);
  if (others.length) ctx.warn(d, `plays through the same vanilla disc slot (${slotLabel(slot)}) as ${others.map((o) => o.displayName).join(", ")}, so they'd play the same song. Pick another slot.`, "error");
  if (!d.file) ctx.warn(d, "has no song (.ogg) yet.", "error");
  if (!(d.duration > 0)) ctx.warn(d, "has no length set. Jukeboxes need it to know when the song ends.");

  const key = ctx.itemKey(d.texture);
  if (!key) ctx.warn(d, "has no icon yet.");
  ctx.bp(`items/${d.name}.json`, itemBase(ctx, d, key, {
    "minecraft:max_stack_size": { value: 1 },
    "minecraft:record": { sound_event: slot, duration: round(Math.max(0, d.duration)), comparator_signal: clampInt(d.comparator, 1, 15) },
  }, "items", "minecraft:itemGroup.name.record"));

  if (!d.file) return;
  const path = `sounds/${ctx.ns}/records/${d.name}`;
  ctx.rp(`${path}.ogg`, dataUrlToBytes(d.file));
  // Same shape as the vanilla record definitions: streamed, heard up to 64 blocks away.
  ctx.soundDefs[slot] = {
    __use_legacy_max_distance: "true",
    category: "record",
    max_distance: 64,
    min_distance: null,
    sounds: [{ name: path, stream: true, load_on_low_memory: true, volume: round(Math.max(0, Math.min(100, d.volume)) / 100) }],
  };
  ctx.warn(d, `plays through the vanilla ${slotLabel(slot)} disc's sound, so that disc plays this song too while the add-on is on.`, "info");
}
