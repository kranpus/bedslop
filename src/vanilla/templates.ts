// Vanilla mob templates. Files are downloaded from Mojang's official bedrock-samples repository
// (pinned to a release) when the user picks a mob; nothing of Mojang's is bundled with the app.
import index from "./index.json";
import { parseLenientJson, parseLenientJsonWithNote } from "./json";
import type { EntityElement } from "../model/types";

export interface VanillaMob { id: string; bp: string; rp: string; geometry?: string | null; geometryFile: string | null; texture: string | null }

export const SAMPLES_TAG: string = index.tag;
export const SAMPLES_BASE = `https://raw.githubusercontent.com/Mojang/bedrock-samples/${SAMPLES_TAG}/`;
export const SAMPLES_PAGE = `https://github.com/Mojang/bedrock-samples/tree/${SAMPLES_TAG}`;
export const VANILLA_MOBS: VanillaMob[] = index.mobs;

/** "minecraft:villager_v2" -> "Villager"; an older mob that has a newer version gets "(classic)". */
export const mobLabel = (id: string) => {
  const name = id.replace(/^minecraft:/, "").replace(/_v\d$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return !/_v\d$/.test(id) && VANILLA_MOBS.some((m) => m.id === `${id}_v2`) ? `${name} (classic)` : name;
};

/** Where each file lives in Mojang's repo, for links and manual downloads. */
export const mobFileUrls = (m: VanillaMob) => ({
  behavior: `${SAMPLES_BASE}behavior_pack/entities/${m.bp}`,
  client: `${SAMPLES_BASE}resource_pack/entity/${m.rp}`,
  geometry: m.geometryFile ? `${SAMPLES_BASE}resource_pack/models/entity/${m.geometryFile}` : "",
  texture: m.texture ? `${SAMPLES_BASE}resource_pack/${m.texture}.png` : "",
  sounds: `${SAMPLES_BASE}resource_pack/sounds.json`,
});

async function getText(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

/** The sounds.json entry for a mob, if it has one. */
export function soundsEntry(soundsJson: string, id: string): string {
  try {
    const all = parseLenientJson(soundsJson) as { entity_sounds?: { entities?: Record<string, unknown> } };
    const entry = all.entity_sounds?.entities?.[id.replace(/^minecraft:/, "")];
    return entry ? JSON.stringify(entry) : "";
  } catch {
    return "";
  }
}

/** Reads the starting values our editor shows (health, speed, ...) from the mob's own files. */
export function templateFields(behavior: string, client: string): Partial<EntityElement> {
  const out: Partial<EntityElement> = {};
  try {
    const e = (parseLenientJson(behavior) as { "minecraft:entity"?: { components?: Record<string, Record<string, unknown>> } })["minecraft:entity"];
    const c = e?.components ?? {};
    const health = Number(c["minecraft:health"]?.value ?? c["minecraft:health"]?.max);
    if (health) out.health = health;
    const speed = Number(c["minecraft:movement"]?.value);
    if (speed) out.speed = speed;
    const dmg = c["minecraft:attack"]?.damage;
    out.attackDamage = Array.isArray(dmg) ? Number(dmg[1]) || 0 : Number(dmg) || 0;
    const box = c["minecraft:collision_box"];
    if (box) { out.width = Number(box.width) || 0.6; out.height = Number(box.height) || 1.8; }
    out.knockbackResistance = Number(c["minecraft:knockback_resistance"]?.value) || 0;
    out.fireImmune = c["minecraft:fire_immune"] !== undefined;
  } catch { /* keep defaults */ }
  try {
    const d = (parseLenientJson(client) as { "minecraft:client_entity"?: { description?: { spawn_egg?: { base_color?: string; overlay_color?: string } } } })["minecraft:client_entity"]?.description;
    if (d?.spawn_egg?.base_color) out.eggBase = d.spawn_egg.base_color;
    if (d?.spawn_egg?.overlay_color) out.eggOverlay = d.spawn_egg.overlay_color;
  } catch { /* keep defaults */ }
  return out;
}

/** Downloads a mob's files from Mojang's repository. Throws if the browser can't reach GitHub. */
export async function downloadTemplate(m: VanillaMob): Promise<Partial<EntityElement>> {
  const urls = mobFileUrls(m);
  const [behavior, client, sounds, geometry] = await Promise.all([
    getText(urls.behavior), getText(urls.client),
    getText(urls.sounds).catch(() => ""), urls.geometry ? getText(urls.geometry).catch(() => "") : Promise.resolve(""),
  ]);
  return {
    model: "vanilla", vanillaBase: m.id, vanillaBehavior: behavior, vanillaClient: client,
    vanillaSounds: sounds ? soundsEntry(sounds, m.id) : "", vanillaGeometry: geometry, vanillaTexture: urls.texture,
    spawnEnabled: false, drops: [], families: [],
    ...templateFields(behavior, client),
  };
}

export interface TemplateFiles {
  behavior: string;
  client: string;
  base: string;
  notes: string[];
}

/**
 * Checks two uploaded files (in any order): one behaviour file ("minecraft:entity") and one resource
 * file ("minecraft:client_entity") for the same mob. Returns clean JSON text, or throws a readable error.
 */
export function readTemplateFiles(files: { name: string; text: string }[]): TemplateFiles {
  let behavior: { name: string; value: any } | undefined, client: { name: string; value: any } | undefined;
  const notes: string[] = [];
  for (const f of files) {
    let r;
    try {
      r = parseLenientJsonWithNote(f.text);
    } catch {
      throw new Error(`${f.name} isn't readable JSON. Download it again from the link and upload it without editing.`);
    }
    if (r.repaired) notes.push(`${f.name} had been squashed onto one line, so its // comments cut off the rest of the file. It was recovered, but re-downloading the original is safest.`);
    const v = r.value as Record<string, unknown>;
    if (v?.["minecraft:entity"]) behavior = { name: f.name, value: v };
    else if (v?.["minecraft:client_entity"]) client = { name: f.name, value: v };
    else throw new Error(`${f.name} isn't a mob file. You need the behaviour file (behavior_pack/entities) and the .entity.json (resource_pack/entity).`);
  }
  if (!behavior) throw new Error("The behaviour file is missing (from behavior_pack/entities, it contains \"minecraft:entity\").");
  if (!client) throw new Error("The resource file is missing (from resource_pack/entity, it contains \"minecraft:client_entity\").");
  const bId = behavior.value["minecraft:entity"]?.description?.identifier;
  const cId = client.value["minecraft:client_entity"]?.description?.identifier;
  if (!bId || !cId) throw new Error("One of the files has no identifier in its description.");
  if (bId !== cId) throw new Error(`The files are for different mobs: ${behavior.name} is ${bId}, ${client.name} is ${cId}.`);
  const legacy = client.value.format_version && Number(String(client.value.format_version).split(".")[1]) < 10 && /v1\.0/.test(client.name + JSON.stringify(client.value).slice(0, 400));
  if (legacy) notes.push(`${client.name} looks like an older version of this mob's look. The current one is usually the file without “v1.0” in its name.`);
  return { behavior: JSON.stringify(behavior.value, null, 2), client: JSON.stringify(client.value, null, 2), base: bId, notes };
}

/** Points every reference to the original mob (breeding, offspring, spawned babies) at the copy. */
export function retargetSelfReferences(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value === from ? to : value;
  if (Array.isArray(value)) return value.map((v) => retargetSelfReferences(v, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k === from ? to : k, retargetSelfReferences(v, from, to)]));
  }
  return value;
}

/** Builds a template from the local library of imported packs (see library.ts). */
export function templateFromLibrary(lib: import("./library").VanillaLibrary, id: string, libraryMob: typeof import("./library").libraryMob): Partial<EntityElement> | null {
  const m = libraryMob(lib, id);
  if (!m) return null;
  return {
    model: "vanilla", vanillaBase: id, vanillaBehavior: m.behavior, vanillaClient: m.client, vanillaSounds: m.sounds,
    vanillaGeometry: m.geometry, vanillaTexture: m.texture, spawnEnabled: false, drops: [], families: [],
    ...templateFields(m.behavior, m.client),
  };
}
