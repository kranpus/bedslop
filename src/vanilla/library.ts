// A local library of Minecraft's vanilla mob files, imported once from Mojang's packs (ZIPs) and kept
// in this browser. Lets templates work where downloading from GitHub is blocked.
import JSZip from "jszip";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { parseLenientJson } from "./json";

export interface VanillaLibrary {
  sources: string[];
  importedAt: number;
  /** Behaviour files by mob id. */
  behaviors: Record<string, string>;
  /** Newest resource (client) file by mob id, with its format version. */
  clients: Record<string, { text: string; format: string }>;
  /** Model files by path, and which file defines each geometry id. */
  modelFiles: Record<string, string>;
  geometryFile: Record<string, string>;
  /** Entity textures (PNG data URLs) by path without extension, e.g. "textures/entity/zombie/zombie". */
  textures: Record<string, string>;
  /** sounds.json entity entries by short id ("zombie"). */
  sounds: Record<string, string>;
}

const KEY = "bc:vanilla-library";
export const emptyLibrary = (): VanillaLibrary => ({ sources: [], importedAt: 0, behaviors: {}, clients: {}, modelFiles: {}, geometryFile: {}, textures: {}, sounds: {} });

export async function loadLibrary(): Promise<VanillaLibrary | null> {
  try { return ((await idbGet(KEY)) as VanillaLibrary | undefined) ?? null; } catch { return null; }
}
export async function saveLibrary(lib: VanillaLibrary) {
  await idbSet(KEY, lib);
}
export async function clearLibrary() {
  try { await idbDel(KEY); } catch { /* nothing stored */ }
}

const newer = (a: string, b: string) => {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < 4; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

function toDataUrl(bytes: Uint8Array, mime = "image/png") {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export interface ImportInput { name: string; data: ArrayBuffer | Uint8Array | string }
export interface ImportReport { mobs: number; added: { behaviors: number; clients: number; models: number; textures: number; sounds: number }; problems: string[] }

/**
 * Reads Mojang's vanilla behaviour/resource packs (ZIP or .mcpack), the bedrock-samples download,
 * or loose .json files, and adds what mob templates need to the library.
 */
export async function importIntoLibrary(lib: VanillaLibrary, inputs: ImportInput[]): Promise<ImportReport> {
  const added = { behaviors: 0, clients: 0, models: 0, textures: 0, sounds: 0 };
  const problems: string[] = [];
  const pngs: { path: string; read: () => Promise<Uint8Array> }[] = [];

  const consider = (path: string, text: string) => {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    let data: any;
    try { data = parseLenientJson(text); } catch { return; }
    if (!data || typeof data !== "object") return;
    if (data["minecraft:entity"]?.description?.identifier) {
      lib.behaviors[data["minecraft:entity"].description.identifier] = text;
      added.behaviors++;
    } else if (data["minecraft:client_entity"]?.description?.identifier) {
      const id = data["minecraft:client_entity"].description.identifier;
      const format = String(data.format_version ?? "0");
      const cur = lib.clients[id];
      // Several files can describe one mob; keep the newest (and not the legacy v1.0 ones on a tie).
      if (!cur || newer(format, cur.format) || (!newer(cur.format, format) && !lower.includes("v1.0"))) lib.clients[id] = { text, format };
      added.clients++;
    } else if (data["minecraft:geometry"] || Object.keys(data).some((k) => k.startsWith("geometry."))) {
      lib.modelFiles[lower] = text;
      for (const g of data["minecraft:geometry"] ?? []) if (g?.description?.identifier) lib.geometryFile[g.description.identifier] = lower;
      for (const k of Object.keys(data)) if (k.startsWith("geometry.")) lib.geometryFile[k.split(":")[0]] = lower;
      added.models++;
    } else if (data.entity_sounds?.entities && /(^|\/)sounds\.json$/.test(lower)) {
      for (const [k, v] of Object.entries(data.entity_sounds.entities)) lib.sounds[k] = JSON.stringify(v);
      added.sounds++;
    }
  };

  for (const input of inputs) {
    const isZip = /\.(zip|mcpack|mcaddon)$/i.test(input.name);
    if (!isZip) {
      const text = typeof input.data === "string" ? input.data : new TextDecoder().decode(input.data);
      consider(input.name, text);
      continue;
    }
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(input.data);
    } catch {
      problems.push(`${input.name} isn't a ZIP file that can be opened.`);
      continue;
    }
    const entries = Object.values(zip.files).filter((f) => !f.dir);
    for (const f of entries) {
      const p = f.name.toLowerCase();
      // Only the folders templates use: behaviour entities, client entities, entity models, sounds.json.
      if (/(^|\/)(entities|entity|models\/entity)\/[^/]+\.json$/.test(p) || /(^|\/)sounds\.json$/.test(p)) {
        consider(f.name, await f.async("string"));
      } else if (/(^|\/)textures\/entity\/.+\.png$/.test(p)) {
        pngs.push({ path: f.name, read: () => f.async("uint8array") });
      }
    }
    lib.sources = Array.from(new Set([...lib.sources, input.name]));
  }

  // Keep only the default texture of each known mob (for the preview), not every texture.
  const wanted = new Set<string>();
  for (const { text } of Object.values(lib.clients)) {
    try {
      const t = (parseLenientJson(text) as any)["minecraft:client_entity"].description.textures ?? {};
      const path = t.default ?? Object.values(t)[0];
      if (typeof path === "string") wanted.add(path.toLowerCase());
    } catch { /* skip */ }
  }
  for (const png of pngs) {
    const key = png.path.toLowerCase().replace(/\\/g, "/").replace(/\.png$/, "");
    const match = [...wanted].find((w) => key.endsWith(w));
    if (match && !lib.textures[match]) {
      lib.textures[match] = toDataUrl(await png.read());
      added.textures++;
    }
  }
  lib.importedAt = Date.now();
  if (!added.behaviors && !added.clients) problems.push("No mob files were found. Use Minecraft's vanilla behaviour and resource packs (or the bedrock-samples download).");
  return { mobs: libraryMobIds(lib).length, added, problems };
}

/** Mobs the library can make a template from: a behaviour file with health and a resource file. */
export function libraryMobIds(lib: VanillaLibrary | null): string[] {
  if (!lib) return [];
  return Object.keys(lib.behaviors).filter((id) => {
    if (!lib.clients[id]) return false;
    try { return !!(parseLenientJson(lib.behaviors[id]) as any)["minecraft:entity"]?.components?.["minecraft:health"]; } catch { return false; }
  }).sort();
}

/** Everything a template needs for one mob, from the library. */
export function libraryMob(lib: VanillaLibrary, id: string) {
  const behavior = lib.behaviors[id], client = lib.clients[id]?.text;
  if (!behavior || !client) return null;
  let geometry = "", texture = "";
  try {
    const d = (parseLenientJson(client) as any)["minecraft:client_entity"].description;
    const geoId = d.geometry?.default;
    const file = geoId ? lib.geometryFile[geoId] : undefined;
    if (file) geometry = lib.modelFiles[file] ?? "";
    const tex = d.textures?.default ?? Object.values(d.textures ?? {})[0];
    if (typeof tex === "string") texture = lib.textures[tex.toLowerCase()] ?? "";
  } catch { /* preview extras are optional */ }
  return { behavior, client, geometry, texture, sounds: lib.sounds[id.replace(/^minecraft:/, "")] ?? "" };
}
