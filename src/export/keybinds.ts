// "Key bindings". Bedrock add-ons can't add keys, so each binding is a combo of inputs the Script API
// can see: jump and sneak presses (playerButtonInput), hotbar changes, item use and arm swings.
// Each binding runs its own steps with the player as the context.

import type { KeyBindElement, KeyInput } from "../model/types";
import type { GenContext } from "./context";
import { clampInt, round } from "./content";
import { actionsBody } from "./scripts";

const S = JSON.stringify;

export const KEY_LABELS: Record<KeyInput, string> = {
  double_jump: "Double-tap jump", double_sneak: "Double-tap sneak", hold_sneak: "Hold sneak", sneak_jump: "Jump while sneaking",
  sneak_use: "Use an item while sneaking", sneak_slot: "Sneak + hotbar number", swing: "Left-click (swing)", sneak_swing: "Left-click while sneaking",
};
/** Inputs that need Script API 2.11 (playerSwingStart). */
export const KEY_NEEDS_211: KeyInput[] = ["swing", "sneak_swing"];

export function genKeyBinds(ctx: GenContext) {
  const list = ctx.project.elements.filter((e): e is KeyBindElement => e.kind === "keybind");
  if (!list.length) return;
  const api = ctx.project.scriptApi ?? "2.1.0";
  const has211 = !/^2\.[0-9]\./.test(api);
  const used = new Set<KeyInput>();
  const seenSlots = new Map<number, string>();

  const defs = list.flatMap((k) => {
    if (KEY_NEEDS_211.includes(k.input) && !has211) {
      ctx.warn(k, `${KEY_LABELS[k.input].toLowerCase()} needs Script API 2.11.0 or newer (Minecraft 1.26.60). Change it in Settings.`, "error");
      return [];
    }
    if (!k.actions.length) ctx.warn(k, "doesn't do anything yet. Add a step.");
    if (k.input === "sneak_slot") {
      const slot = clampInt(k.slot, 1, 9);
      const other = seenSlots.get(slot);
      if (other) ctx.warn(k, `uses sneak + ${slot}, like “${other}”. Both run.`, "info");
      seenSlots.set(slot, k.displayName);
    }
    used.add(k.input);
    const item = k.item ? (k.item.includes(":") ? k.item : `minecraft:${k.item}`) : "";
    const ticks = Math.max(2, Math.round((Number(k.seconds) || 0.4) * 20));
    return [`  { name: ${S(k.name)}, input: ${S(k.input)}, item: ${S(item)}, slot: ${clampInt(k.slot, 1, 9) - 1}, ticks: ${ticks}, cooldown: ${Math.max(0, Math.round(round(Number(k.cooldown) || 0) * 20))},
    run: (ctx) => {
${actionsBody(k.actions, `Key ${k.displayName}`, 3)}    } }`];
  });
  if (!defs.length) return;

  const any = (...inputs: KeyInput[]) => inputs.some((i) => used.has(i));
  if (any("double_jump", "double_sneak", "hold_sneak", "sneak_jump")) { ctx.script.imports.add("ButtonState"); ctx.script.imports.add("InputButton"); }
  const hooks: string[] = [];
  if (any("double_jump", "double_sneak", "hold_sneak", "sneak_jump")) hooks.push(`world.afterEvents.playerButtonInput.subscribe((ev) => {
  const p = ev.player, st = bcKeyState(p), t = system.currentTick;
  if (ev.newButtonState !== ButtonState.Pressed) {
    if (ev.button === InputButton.Sneak) st.sneakSince = 0;
    return;
  }
  const jump = ev.button === InputButton.Jump;
  for (const k of BC_KEYS) {
    if (jump && k.input === "sneak_jump" && p.isSneaking) bcKeyFire(p, k);
    if (k.input === (jump ? "double_jump" : "double_sneak")) {
      const last = st.taps[k.name] ?? -9999;
      if (t - last <= k.ticks) { st.taps[k.name] = -9999; bcKeyFire(p, k); } else st.taps[k.name] = t;
    }
  }
  if (!jump) { st.sneakSince = t; st.held = {}; }
});`);
  if (used.has("hold_sneak")) hooks.push(`system.runInterval(() => {
  const t = system.currentTick;
  for (const p of world.getAllPlayers()) {
    const st = bcKeyState(p);
    if (!st.sneakSince) continue;
    for (const k of BC_KEYS) if (k.input === "hold_sneak" && !st.held[k.name] && t - st.sneakSince >= k.ticks) { st.held[k.name] = true; bcKeyFire(p, k); }
  }
}, 2);`);
  if (used.has("sneak_use")) hooks.push(`world.afterEvents.itemUse.subscribe((ev) => {
  if (!ev.source.isSneaking) return;
  for (const k of BC_KEYS) if (k.input === "sneak_use") bcKeyFire(ev.source, k);
});`);
  if (used.has("sneak_slot")) hooks.push(`world.afterEvents.playerHotbarSelectedSlotChange.subscribe((ev) => {
  const p = ev.player, st = bcKeyState(p);
  // Putting the slot back fires this event again: skip that one.
  if (st.restoring === ev.newSlotSelected) { st.restoring = -1; return; }
  if (!p.isSneaking) return;
  const keys = BC_KEYS.filter((k) => k.input === "sneak_slot" && k.slot === ev.newSlotSelected);
  if (!keys.length) return;
  // Acts like a key: the hotbar stays where it was.
  st.restoring = ev.previousSlotSelected;
  p.selectedSlotIndex = ev.previousSlotSelected;
  for (const k of keys) bcKeyFire(p, k);
});`);
  if (any("swing", "sneak_swing")) hooks.push(`world.afterEvents.playerSwingStart.subscribe((ev) => {
  const p = ev.player;
  for (const k of BC_KEYS) if (k.input === "swing" || (k.input === "sneak_swing" && p.isSneaking)) bcKeyFire(p, k);
});`);

  ctx.script.sections.push(`// ----- Key bindings (input combos) -----
/** name, input, item (held, "" = any), slot (0-8), ticks (double-tap gap or hold time), cooldown (ticks), run. */
const BC_KEYS = [
${defs.join(",\n")}
];
/** Per player: last taps, when sneak was pressed, holds already fired, cooldowns, slot being put back. */
const BC_KEY_STATE = new Map();
function bcKeyState(p) {
  let st = BC_KEY_STATE.get(p.id);
  if (!st) { st = { taps: {}, sneakSince: 0, held: {}, cool: {}, restoring: -1 }; BC_KEY_STATE.set(p.id, st); }
  return st;
}
function bcKeyFire(p, k) {
  if (k.item && BC.held(p) !== k.item) return;
  const st = bcKeyState(p), t = system.currentTick;
  if (k.cooldown && t < (st.cool[k.name] ?? 0)) return;
  st.cool[k.name] = t + k.cooldown;
  k.run(BC.ctxP(p));
}
${hooks.join("\n")}
world.afterEvents.playerLeave.subscribe((ev) => BC_KEY_STATE.delete(ev.playerId));
`);
}
