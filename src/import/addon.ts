// Import an existing add-on (.mcaddon / .mcpack / .zip) into a project.
//
// Reads the behavior and resource packs (also packs nested inside an .mcaddon) and turns what the editor
// understands into elements: blocks, items, food, recipes, loot tables, functions, sounds and structures,
// with their textures, models, names and settings. Anything else (mobs, scripts, spawn and feature rules,
// UI files...) is listed in the report so nothing is lost silently.

import JSZip from "jszip";
import { createElement, uid } from "../model/registry";
import type {
  BlockElement, BlockFace, CustomBlockState, FoodElement, FunctionElement, ItemElement, LootElement, LootPool, MenuCategory,
  ModElement, Project, RecipeElement, SoundElement, StructureElement, TextureAsset, ToolElement,
} from "../model/types";

export interface ImportReport {
  /** Pack names found. */
  packs: string[];
  /** How many of each element kind were made. */
  counts: Record<string, number>;
  /** Things that were imported only partly (one line each). */
  notes: string[];
  /** Things that couldn't be imported. */
  skipped: string[];
}

export interface ImportResult {
  name: string;
  namespace: string;
  description: string;
  elements: ModElement[];
  textures: TextureAsset[];
  report: ImportReport;
}

type Files = Map<string, Uint8Array>;
interface Pack { type: "bp" | "rp"; name: string; description: string; files: Files; scripts: boolean }

const dec = new TextDecoder();
const text = (b: Uint8Array) => dec.decode(b).replace(/^﻿/, "");

/** JSON as Minecraft reads it: comments and trailing commas allowed. */
export function looseJson(src: string): unknown {
  let out = "", i = 0, str = false;
  while (i < src.length) {
    const c = src[i];
    if (str) {
      out += c;
      if (c === "\\") { out += src[i + 1] ?? ""; i += 2; continue; }
      if (c === '"') str = false;
      i++;
      continue;
    }
    if (c === '"') { str = true; out += c; i++; continue; }
    if (src.startsWith("//", i)) { const j = src.indexOf("\n", i); i = j < 0 ? src.length : j; continue; }
    if (src.startsWith("/*", i)) { const j = src.indexOf("*/", i + 2); i = j < 0 ? src.length : j + 2; continue; }
    out += c; i++;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

const asObj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);
/** "ns:some/thing-1" -> "some_thing_1" (an element name). */
const nameOf = (id: string) => (id.split(":").pop() ?? id).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "_$1") || "imported";
const nsOf = (id: string) => (id.includes(":") ? id.split(":")[0] : "");
const titleCase = (n: string) => n.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** Width and height from a PNG header, or null if it isn't a PNG. */
function pngSize(b: Uint8Array): [number, number] | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

/** Opens a zip and every zip inside it (an .mcaddon holds .mcpack files), then finds the packs by their manifest. */
async function readPacks(bytes: Uint8Array): Promise<Pack[]> {
  const all: Files = new Map();
  const unzip = async (data: Uint8Array, prefix: string, depth: number) => {
    const zip = await JSZip.loadAsync(data);
    for (const f of Object.values(zip.files)) {
      if (f.dir) continue;
      const b = await f.async("uint8array");
      const path = prefix + f.name.replace(/\\/g, "/");
      if (/\.(mcpack|mcaddon|zip)$/i.test(path) && depth < 2) await unzip(b, path.replace(/\.(mcpack|mcaddon|zip)$/i, "") + "/", depth + 1);
      else all.set(path, b);
    }
  };
  await unzip(bytes, "", 0);
  const packs: Pack[] = [];
  const roots = [...all.keys()].filter((p) => /(^|\/)manifest\.json$/i.test(p)).map((p) => p.slice(0, p.length - "manifest.json".length))
    .sort((a, b) => b.length - a.length);
  const claimed = new Set<string>();
  for (const root of roots) {
    let m: Record<string, any>;
    try { m = asObj(looseJson(text(all.get(root + "manifest.json")!))); } catch { continue; }
    const modules: Record<string, any>[] = Array.isArray(m.modules) ? m.modules : [];
    const types = modules.map((x) => String(x.type));
    const type = types.includes("resources") ? "rp" : types.includes("data") || types.includes("script") ? "bp" : null;
    if (!type) continue;
    const files: Files = new Map();
    for (const [p, b] of all) if (p.startsWith(root) && !claimed.has(p)) { files.set(p.slice(root.length), b); claimed.add(p); }
    packs.push({ type, name: String(m.header?.name ?? "Pack"), description: String(m.header?.description ?? ""), files, scripts: types.includes("script") });
  }
  return packs;
}

/** Every file in the packs of one type, by path inside the pack. */
function merged(packs: Pack[], type: "bp" | "rp"): Files {
  const out: Files = new Map();
  for (const p of packs) if (p.type === type) for (const [k, v] of p.files) if (!out.has(k)) out.set(k, v);
  return out;
}

function parseLang(src: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of src.split(/\r?\n/)) {
    const t = line.replace(/\t*##.*$/, "").trim();
    const i = t.indexOf("=");
    if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return m;
}

const MENU: MenuCategory[] = ["construction", "equipment", "items", "nature", "none"];

export async function importAddon(bytes: Uint8Array): Promise<ImportResult> {
  const packs = await readPacks(bytes);
  if (!packs.length) throw new Error("No behavior or resource pack was found in that file (no manifest.json).");
  const bp = merged(packs, "bp"), rp = merged(packs, "rp");
  const report: ImportReport = { packs: packs.map((p) => `${p.name} (${p.type === "bp" ? "behavior" : "resource"} pack)`), counts: {}, notes: [], skipped: [] };
  const elements: ModElement[] = [];
  const textures: TextureAsset[] = [];
  const add = (e: ModElement) => { elements.push(e); report.counts[e.kind] = (report.counts[e.kind] ?? 0) + 1; };
  const json = (files: Files, path: string): Record<string, any> | null => {
    const b = files.get(path);
    if (!b) return null;
    try { return asObj(looseJson(text(b))); } catch { report.notes.push(`${path} couldn't be read (not valid JSON).`); return null; }
  };
  const under = (files: Files, dir: string, ext: string) => [...files.keys()].filter((p) => p.startsWith(dir) && p.toLowerCase().endsWith(ext)).sort();

  // Names from the English language file.
  const lang = rp.get("texts/en_US.lang") ? parseLang(text(rp.get("texts/en_US.lang")!)) : new Map<string, string>();

  // Textures: atlas key -> texture id (loaded once per file path).
  const byPath = new Map<string, string>();
  const loadTexture = (path: string, kind: TextureAsset["kind"]): string => {
    const clean = path.replace(/\.(png|tga)$/i, "");
    if (byPath.has(clean)) return byPath.get(clean)!;
    const b = rp.get(clean + ".png");
    if (!b) {
      if (rp.has(clean + ".tga")) report.notes.push(`${clean}.tga is a TGA image, which isn't supported. Re-save it as PNG and upload it.`);
      byPath.set(clean, "");
      return "";
    }
    const size = pngSize(b);
    if (!size) { byPath.set(clean, ""); return ""; }
    const name = clean.split("/").pop()!.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const t: TextureAsset = { id: uid(), name: textures.some((x) => x.name === name) ? `${name}_${textures.length}` : name, kind, width: size[0], height: size[1], dataUrl: `data:image/png;base64,${base64(b)}` };
    textures.push(t);
    byPath.set(clean, t.id);
    return t.id;
  };
  const atlas = (file: string) => asObj(json(rp, file)?.texture_data);
  const itemAtlas = atlas("textures/item_texture.json"), terrainAtlas = atlas("textures/terrain_texture.json");
  const atlasPath = (entry: unknown): string => {
    const t = asObj(entry).textures ?? entry;
    const first = Array.isArray(t) ? t[0] : t;
    return typeof first === "string" ? first : typeof asObj(first).path === "string" ? asObj(first).path : "";
  };
  const terrainTex = (key: string) => (key && terrainAtlas[key] ? loadTexture(atlasPath(terrainAtlas[key]), "block") : "");
  const itemTex = (key: string) => (key && itemAtlas[key] ? loadTexture(atlasPath(itemAtlas[key]), "item") : "");

  // Block models: geometry identifier -> that geometry as a file of its own.
  const geometries = new Map<string, string>();
  for (const path of under(rp, "models/", ".json")) {
    const doc = json(rp, path);
    for (const g of Array.isArray(doc?.["minecraft:geometry"]) ? doc!["minecraft:geometry"] : []) {
      const id = asObj(g).description?.identifier;
      if (typeof id === "string") geometries.set(id, JSON.stringify({ format_version: doc!.format_version ?? "1.12.0", "minecraft:geometry": [g] }, null, 2));
    }
  }

  // Count identifiers to pick the add-on's namespace.
  const nsCount = new Map<string, number>();
  const seen = (id: string) => { const n = nsOf(id); if (n && n !== "minecraft") nsCount.set(n, (nsCount.get(n) ?? 0) + 1); };

  // ----- Loot tables first, so blocks can point at them. -----
  const lootByPath = new Map<string, string>();
  for (const path of under(bp, "loot_tables/", ".json")) {
    const doc = json(bp, path);
    if (!doc) continue;
    const rel = path.slice("loot_tables/".length).replace(/\.json$/, "");
    const folder = rel.split("/")[0];
    const lootType = (["blocks", "entities", "chests", "gameplay"].includes(folder) ? folder : "gameplay") as LootElement["lootType"];
    const el = createElement("loot", nameOf(rel.replace(/\//g, "_")), titleCase(nameOf(rel.split("/").pop()!)));
    el.lootType = lootType;
    let partial = false;
    el.pools = (Array.isArray(doc.pools) ? doc.pools : []).map((p: Record<string, any>): LootPool => {
      const rolls = p.rolls;
      const entries = (Array.isArray(p.entries) ? p.entries : []).flatMap((e: Record<string, any>) => {
        if (e.type !== "item" || typeof e.name !== "string") { if (e.type !== "empty") partial = true; return []; }
        const count = (Array.isArray(e.functions) ? e.functions : []).find((f: Record<string, any>) => f.function === "set_count")?.count;
        if ((Array.isArray(e.functions) ? e.functions : []).some((f: Record<string, any>) => f.function !== "set_count") || e.conditions) partial = true;
        return [{ item: e.name, weight: num(e.weight, 1), min: num(asObj(count).min ?? count, 1), max: num(asObj(count).max ?? count, 1) }];
      });
      if (p.conditions || p.tiers) partial = true;
      return { rollsMin: num(asObj(rolls).min ?? rolls, 1), rollsMax: num(asObj(rolls).max ?? rolls, 1), entries };
    }).filter((p: LootPool) => p.entries.length);
    if (partial) report.notes.push(`Loot table ${rel}: only item drops with counts were kept (other functions, conditions and entry types were dropped).`);
    lootByPath.set(path.replace(/\.json$/, ""), el.id);
    add(el);
  }

  // ----- Blocks -----
  const rpBlocks = asObj(json(rp, "blocks.json"));
  for (const path of under(bp, "blocks/", ".json")) {
    const doc = asObj(json(bp, path)?.["minecraft:block"]);
    const id = doc.description?.identifier;
    if (typeof id !== "string") continue;
    seen(id);
    const c = asObj(doc.components);
    const name = nameOf(id);
    const el = createElement("block", name, lang.get(`tile.${id}.name`) ?? lang.get(`block.${id}.name`) ?? titleCase(name)) as BlockElement;
    const menu = asObj(doc.description.menu_category);
    if (MENU.includes(menu.category)) el.category = menu.category;
    if (typeof menu.group === "string") el.group = menu.group;

    // States the block keeps (not Minecraft's own trait states).
    const states: CustomBlockState[] = [];
    for (const [key, values] of Object.entries(asObj(doc.description.states))) {
      if (key.startsWith("minecraft:")) continue;
      const short = (key.split(":").pop() ?? key).toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (Array.isArray(values) && values.every((v) => typeof v === "boolean")) states.push({ name: short, type: "bool" });
      else if (Array.isArray(values) && values.every((v) => typeof v === "number")) states.push({ name: short, type: "int", min: Math.min(...values), max: Math.max(...values) });
      else if (Array.isArray(values) && values.every((v) => typeof v === "string")) states.push({ name: short, type: "enum", options: values as string[] });
      else if (asObj(values).values) { const r = asObj(asObj(values).values); states.push({ name: short, type: "int", min: num(r.min, 0), max: num(r.max, 1) }); }
    }
    if (states.length) el.customStates = states;
    const traits = asObj(doc.description.traits);
    if (asObj(traits["minecraft:placement_direction"]).enabled_states?.includes?.("minecraft:cardinal_direction")) el.rotation = "facing";
    else if (traits["minecraft:placement_position"]) report.notes.push(`Block ${id}: its placement trait (block face) wasn't converted.`);

    // Main settings.
    const mining = c["minecraft:destructible_by_mining"];
    if (mining === false) el.hardness = -1;
    else if (mining !== undefined) el.hardness = num(asObj(mining).seconds_to_destroy ?? mining, el.hardness);
    const blast = c["minecraft:destructible_by_explosion"];
    if (blast !== undefined) el.explosionResistance = blast === false ? 3600000 : num(asObj(blast).explosion_resistance ?? blast, el.explosionResistance);
    el.lightEmission = num(c["minecraft:light_emission"], el.lightEmission);
    el.lightDampening = num(c["minecraft:light_dampening"], el.lightDampening);
    el.friction = num(c["minecraft:friction"], el.friction);
    const map = c["minecraft:map_color"];
    if (typeof map === "string") el.mapColor = map;
    else if (Array.isArray(map) && map.length === 3) el.mapColor = "#" + map.map((v: number) => Math.round(num(v, 0)).toString(16).padStart(2, "0")).join("");
    else if (typeof asObj(map).color === "string") el.mapColor = asObj(map).color;
    el.flammable = !!c["minecraft:flammable"];
    if (c["minecraft:collision_box"] === false) el.collision = "none";
    const tags = [...(Array.isArray(asObj(c["minecraft:tags"]).tags) ? asObj(c["minecraft:tags"]).tags : []), ...Object.keys(c).filter((k) => k.startsWith("tag:")).map((k) => k.slice(4))];
    if (tags.length) el.tags = tags;

    // Look: model and textures.
    const geo = c["minecraft:geometry"];
    const geoId = typeof geo === "string" ? geo : asObj(geo).identifier;
    if (typeof geoId === "string" && geoId !== "minecraft:geometry.full_block") {
      const model = geometries.get(geoId);
      if (model) { el.geometry = "custom"; el.customGeometry = model; }
      else report.notes.push(`Block ${id}: its model ${geoId} wasn't in the resource pack, so it's a full block for now.`);
      if (asObj(geo).bone_visibility) report.notes.push(`Block ${id}: model part visibility rules weren't converted. Add them as state rules.`);
    }
    const inst = asObj(c["minecraft:material_instances"]);
    const faceTex = (k: string) => (typeof asObj(inst[k]).texture === "string" ? terrainTex(asObj(inst[k]).texture) : "");
    const rm = asObj(inst["*"]).render_method ?? Object.values(inst).map((v) => asObj(v).render_method).find(Boolean);
    if (rm === "alpha_test" || rm === "blend" || rm === "opaque") el.renderMethod = rm;
    else if (rm === "alpha_test_single_sided" || rm === "double_sided") el.renderMethod = "alpha_test";
    const faces: Partial<Record<BlockFace, string>> = {};
    if (Object.keys(inst).length) {
      const all = faceTex("*");
      const up = faceTex("up"), down = faceTex("down");
      const sides = (["north", "south", "east", "west"] as const).map((f) => faceTex(f) || faceTex("side") || all);
      if (!up && !down && sides.every((s) => s === all)) { el.textureMode = "all"; faces.all = all; }
      else if (sides.every((s) => s === sides[0])) { el.textureMode = "pillar"; faces.side = sides[0]; faces.top = up || all; faces.bottom = down || up || all; }
      else { el.textureMode = "six"; (["north", "south", "east", "west"] as const).forEach((f, i) => { faces[f] = sides[i]; }); faces.top = up || all; faces.bottom = down || all; }
    } else {
      // Older add-ons put block textures in the resource pack's blocks.json.
      const entry = asObj(rpBlocks[id]);
      const t = entry.textures;
      if (typeof t === "string") { el.textureMode = "all"; faces.all = terrainTex(t); }
      else if (t) {
        const o = asObj(t);
        el.textureMode = "six";
        faces.top = terrainTex(o.up); faces.bottom = terrainTex(o.down);
        for (const f of ["north", "south", "east", "west"] as const) faces[f] = terrainTex(o[f] ?? o.side);
      }
    }
    el.textures = Object.fromEntries(Object.entries(faces).filter(([, v]) => v)) as BlockElement["textures"];
    const sound = asObj(rpBlocks[id]).sound;
    if (typeof sound === "string") el.sound = sound;

    // Drops.
    const loot = c["minecraft:loot"];
    if (typeof loot === "string") {
      const lootId = lootByPath.get(loot.replace(/\.json$/, ""));
      if (lootId) { el.drops = "loot"; el.lootTable = lootId; }
      else if (/empty/.test(loot)) el.drops = "nothing";
      else report.notes.push(`Block ${id}: its loot table ${loot} wasn't found, so it drops itself.`);
    }

    // What it does.
    const container = asObj(asObj(c["minecraft:block_entity"]).container);
    if (Object.keys(container).length) { el.function = "storage"; el.slotCount = num(container.slot_count, 27); if (typeof container.title === "string") el.containerTitle = container.title; }
    const table = asObj(c["minecraft:crafting_table"]);
    if (Object.keys(table).length) { el.function = "crafting"; el.craftingTags = Array.isArray(table.crafting_tags) ? table.crafting_tags : []; if (typeof table.table_name === "string") el.tableName = table.table_name; }

    const perms = Array.isArray(doc.permutations) ? doc.permutations : [];
    const onlyTurns = perms.every((p: Record<string, any>) => Object.keys(asObj(p.components)).every((k) => k === "minecraft:transformation"));
    if (perms.length && !onlyTurns) report.notes.push(`Block ${id}: ${perms.length} permutation${perms.length > 1 ? "s" : ""} (state-based changes) weren't converted. Add them as state rules.`);
    const custom = Object.keys(c).filter((k) => !k.startsWith("minecraft:") && !k.startsWith("tag:"));
    if (custom.length || c["minecraft:custom_components"]) report.notes.push(`Block ${id}: script behaviour (custom components) can't be converted. Rebuild it with procedures.`);
    add(el);
  }

  // ----- Items and food -----
  for (const path of under(bp, "items/", ".json")) {
    const doc = asObj(json(bp, path)?.["minecraft:item"]);
    const id = doc.description?.identifier;
    if (typeof id !== "string") continue;
    seen(id);
    const c = asObj(doc.components);
    const name = nameOf(id);
    const display = typeof asObj(c["minecraft:display_name"]).value === "string" && !String(asObj(c["minecraft:display_name"]).value).includes(".")
      ? String(asObj(c["minecraft:display_name"]).value) : lang.get(`item.${id}.name`) ?? lang.get(`item.${id}`) ?? titleCase(name);
    const icon = c["minecraft:icon"];
    const iconKey = typeof icon === "string" ? icon : typeof asObj(icon).texture === "string" ? asObj(icon).texture : asObj(asObj(icon).textures).default ?? doc.description.icon;
    const texture = typeof iconKey === "string" ? itemTex(iconKey) : "";
    const stack = num(asObj(c["minecraft:max_stack_size"]).value ?? c["minecraft:max_stack_size"], 64);
    const glintV = c["minecraft:glint"];
    const glint = glintV === true || asObj(glintV).value === true;
    const food = asObj(c["minecraft:food"]);
    const menu = asObj(doc.description.menu_category);
    if (Object.keys(food).length) {
      const el = createElement("food", name, display) as FoodElement;
      el.texture = texture; el.maxStack = stack; el.glint = glint;
      el.nutrition = num(food.nutrition, el.nutrition);
      const sat = food.saturation_modifier;
      el.saturation = typeof sat === "string" ? ({ poor: 0.1, low: 0.3, normal: 0.6, good: 0.8, max: 1, supernatural: 1.2 } as Record<string, number>)[sat] ?? el.saturation : num(sat, el.saturation);
      el.canAlwaysEat = !!food.can_always_eat;
      if (typeof food.using_converts_to === "string") el.convertsTo = food.using_converts_to;
      if (c["minecraft:use_animation"] === "drink") el.animation = "drink";
      el.useDuration = num(asObj(c["minecraft:use_modifiers"]).use_duration, el.useDuration);
      if (food.effects) report.notes.push(`Food ${id}: its old-style effects weren't converted. Add them on its page.`);
      add(el);
      continue;
    }
    // Tools: tagged minecraft:is_<type>, enchantable as one, or a digger/damage item named like one.
    const itemTags: string[] = Array.isArray(asObj(c["minecraft:tags"]).tags) ? asObj(c["minecraft:tags"]).tags : [];
    const slot = asObj(c["minecraft:enchantable"]).slot;
    const toolType = (["pickaxe", "axe", "shovel", "hoe", "sword"] as const).find((t) =>
      itemTags.includes(`minecraft:is_${t}`) || slot === t || ((c["minecraft:digger"] || c["minecraft:damage"]) && new RegExp(`(^|_)${t}$`).test(name)));
    if (toolType) {
      const el = createElement("tool", name, display) as ToolElement;
      el.toolType = toolType; el.texture = texture; el.glint = glint;
      el.tier = (["wooden", "stone", "iron", "golden", "diamond", "netherite"] as const).find((t) => itemTags.includes(`minecraft:${t}_tier`)) ?? el.tier;
      el.attackDamage = num(asObj(c["minecraft:damage"]).value ?? c["minecraft:damage"], el.attackDamage);
      el.durability = num(asObj(asObj(c["minecraft:durability"]).max_durability).max ?? asObj(c["minecraft:durability"]).max_durability, el.durability);
      const speeds = asObj(c["minecraft:digger"]).destroy_speeds;
      if (Array.isArray(speeds) && speeds.length) el.miningSpeed = num(asObj(speeds[0]).speed, el.miningSpeed);
      el.enchantability = num(asObj(c["minecraft:enchantable"]).value, el.enchantability);
      const repair = asObj((asObj(c["minecraft:repairable"]).repair_items ?? [])[0]).items;
      if (Array.isArray(repair) && typeof repair[0] === "string") el.repairItem = repair[0];
      const extraTags = itemTags.filter((t) => !/^minecraft:(is_|.*_tier$)/.test(t));
      if (extraTags.length) el.tags = extraTags;
      if (Array.isArray(speeds) && speeds.length > 1) report.notes.push(`Item ${id}: its mining speeds were simplified to one speed for ${toolType} blocks.`);
      add(el);
      continue;
    }
    const el = createElement("item", name, display) as ItemElement;
    el.texture = texture; el.maxStack = stack; el.glint = glint;
    el.handEquipped = c["minecraft:hand_equipped"] === true || asObj(c["minecraft:hand_equipped"]).value === true;
    el.fuelSeconds = num(asObj(c["minecraft:fuel"]).duration, 0);
    if (MENU.includes(menu.category)) el.category = menu.category;
    if (typeof menu.group === "string") el.group = menu.group;
    const dur = asObj(c["minecraft:durability"]).max_durability;
    if (dur !== undefined) el.durability = num(asObj(dur).max ?? dur, 0);
    const tags = asObj(c["minecraft:tags"]).tags;
    if (Array.isArray(tags)) el.tags = tags;
    if (!texture && iconKey) report.notes.push(`Item ${id}: its icon "${iconKey}" wasn't found in the resource pack.`);
    const special = ["minecraft:digger", "minecraft:wearable", "minecraft:damage", "minecraft:shooter", "minecraft:throwable", "minecraft:projectile", "minecraft:enchantable"].filter((k) => k in c);
    if (special.length) report.notes.push(`Item ${id}: ${special.map((k) => k.slice(10)).join(", ")} weren't converted (imported as a plain item). Remake it as a tool, armour or ranged item if needed.`);
    if (Object.keys(c).some((k) => !k.startsWith("minecraft:") && !k.startsWith("tag:")) || c["minecraft:custom_components"]) report.notes.push(`Item ${id}: script behaviour (custom components) can't be converted.`);
    add(el);
  }

  // ----- Recipes -----
  const ing = (v: unknown): string => {
    // Old data-value ids ("minecraft:wool:1") lose the number; potion types ("minecraft:potion_type:awkward") stay whole.
    if (typeof v === "string") return /:\d+$/.test(v) && v.split(":").length > 2 ? v.replace(/:\d+$/, "") : v;
    const o = asObj(v);
    return typeof o.tag === "string" ? `#${o.tag}` : typeof o.item === "string" ? o.item : "";
  };
  const result = (v: unknown): [string, number] => {
    const r = Array.isArray(v) ? v[0] : v;
    return typeof r === "string" ? [r, 1] : [ing(r), num(asObj(r).count, 1)];
  };
  for (const path of under(bp, "recipes/", ".json")) {
    const doc = json(bp, path);
    if (!doc) continue;
    const key = Object.keys(doc).find((k) => k.startsWith("minecraft:recipe_"));
    if (!key) continue;
    const r = asObj(doc[key]);
    const rid = String(asObj(r.description).identifier ?? path);
    const el = createElement("recipe", nameOf(rid), titleCase(nameOf(rid))) as RecipeElement;
    const tags: string[] = Array.isArray(r.tags) ? r.tags : [];
    if (key === "minecraft:recipe_shaped") {
      el.recipeType = "shaped";
      const pattern: string[] = Array.isArray(r.pattern) ? r.pattern : [];
      const keys = asObj(r.key);
      el.grid = Array.from({ length: 9 }, (_, i) => { const ch = pattern[Math.floor(i / 3)]?.[i % 3]; return ch && ch !== " " ? ing(keys[ch]) : ""; });
      [el.result, el.count] = result(r.result);
      if (pattern.length > 3 || pattern.some((row) => row.length > 3)) report.notes.push(`Recipe ${rid}: bigger than 3×3, so it was cut down.`);
    } else if (key === "minecraft:recipe_shapeless") {
      [el.result, el.count] = result(r.result);
      const items = (Array.isArray(r.ingredients) ? r.ingredients : []).flatMap((x: unknown) => Array(Math.max(1, num(asObj(x).count, 1))).fill(ing(x)));
      if (tags.includes("stonecutter")) { el.recipeType = "stonecutter"; el.input = items[0] ?? ""; }
      else { el.recipeType = "shapeless"; el.grid = Array.from({ length: 9 }, (_, i) => items[i] ?? ""); }
    } else if (key === "minecraft:recipe_furnace") {
      el.recipeType = "furnace"; el.input = ing(r.input); el.result = result(r.output)[0]; el.count = 1; el.furnaceTags = tags;
    } else if (key === "minecraft:recipe_smithing_transform") {
      el.recipeType = "smithing"; el.smithingTemplate = ing(r.template); el.smithingBase = ing(r.base); el.smithingAddition = ing(r.addition); el.result = result(r.result)[0];
    } else if (key === "minecraft:recipe_brewing_mix" || key === "minecraft:recipe_brewing_container") {
      el.recipeType = "brewing"; el.brewMode = key.endsWith("mix") ? "mix" : "container"; el.input = ing(r.input); el.reagent = ing(r.reagent); el.result = ing(r.output);
    } else { report.skipped.push(`Recipe ${rid} (${key.slice(17)}) isn't a type the editor makes.`); continue; }
    const stations = tags.filter((t) => !["crafting_table", "furnace", "stonecutter", "smithing_table", "brewing_stand"].includes(t));
    if (stations.length && (el.recipeType === "shaped" || el.recipeType === "shapeless")) el.stations = stations;
    add(el);
  }

  // ----- Functions -----
  const tick = json(bp, "functions/tick.json");
  const ticking = new Set<string>(Array.isArray(tick?.values) ? tick!.values : []);
  for (const path of under(bp, "functions/", ".mcfunction")) {
    const rel = path.slice("functions/".length).replace(/\.mcfunction$/, "");
    const el = createElement("function", nameOf(rel.replace(/\//g, "_")), titleCase(nameOf(rel.split("/").pop()!))) as FunctionElement;
    el.body = text(bp.get(path)!);
    el.runEveryTick = ticking.has(rel);
    if (rel.includes("/")) report.notes.push(`Function ${rel} is now called ${el.name} (functions are kept in one folder).`);
    add(el);
  }

  // ----- Sounds (from sound_definitions.json) -----
  const defs = asObj(asObj(json(rp, "sounds/sound_definitions.json")).sound_definitions ?? json(rp, "sounds/sound_definitions.json"));
  for (const [event, d] of Object.entries(defs)) {
    if (event === "format_version") continue;
    const first = (Array.isArray(asObj(d).sounds) ? asObj(d).sounds : [])[0];
    const file = typeof first === "string" ? first : asObj(first).name;
    const ogg = typeof file === "string" ? rp.get(file.replace(/\.ogg$/, "") + ".ogg") : undefined;
    if (!ogg) continue;
    const el = createElement("sound", nameOf(event.replace(/\./g, "_")), titleCase(nameOf(event.replace(/\./g, "_")))) as SoundElement;
    el.file = `data:audio/ogg;base64,${base64(ogg)}`;
    el.fileName = String(file).split("/").pop() + ".ogg";
    const cat = asObj(d).category;
    if (["ambient", "block", "hostile", "music", "neutral", "player", "record", "weather", "ui"].includes(cat)) el.category = cat;
    el.volume = num(asObj(first).volume, 1); el.pitch = num(asObj(first).pitch, 1);
    report.notes.push(`Sound ${event} is now played as <namespace>.${el.name}.`);
    add(el);
  }

  // ----- Structures -----
  for (const path of under(bp, "structures/", ".mcstructure")) {
    const rel = path.slice("structures/".length).replace(/\.mcstructure$/, "");
    const el = createElement("structure", nameOf(rel.replace(/\//g, "_")), titleCase(nameOf(rel.split("/").pop()!))) as StructureElement;
    el.file = `data:application/octet-stream;base64,${base64(bp.get(path)!)}`;
    el.fileName = rel.split("/").pop() + ".mcstructure";
    el.generate = false;
    add(el);
  }

  // ----- What couldn't be imported -----
  const countDir = (files: Files, dir: string) => [...files.keys()].filter((p) => p.startsWith(dir) && !p.endsWith("/")).length;
  const entities = under(bp, "entities/", ".json");
  if (entities.length) report.skipped.push(`${entities.length} mob${entities.length > 1 ? "s" : ""} (entities/): mobs aren't imported yet. Remake them as Mob elements; their models and textures can be imported there.`);
  if (packs.some((p) => p.scripts) || countDir(bp, "scripts/")) report.skipped.push("Scripts (scripts/): code can't be turned back into procedures. Rebuild the behaviour with procedures, or keep the original pack alongside.");
  for (const [dir, what] of [["spawn_rules/", "spawn rules"], ["feature_rules/", "feature rules"], ["features/", "world features"], ["trading/", "trade tables"], ["biomes/", "biomes"], ["item_catalog/", "creative inventory groups"], ["dialogue/", "NPC dialogue"], ["animation_controllers/", "animation controllers"]] as const) {
    const n = countDir(bp, dir);
    if (n) report.skipped.push(`${n} ${what} file${n > 1 ? "s" : ""} (${dir}).`);
  }
  for (const [dir, what] of [["ui/", "JSON UI"], ["particles/", "particle effects"], ["animations/", "animations"], ["render_controllers/", "render controllers"], ["entity/", "mob client files"], ["attachables/", "attachables (worn items)"]] as const) {
    const n = countDir(rp, dir);
    if (n) report.skipped.push(`${n} ${what} file${n > 1 ? "s" : ""} (resource pack ${dir}).`);
  }

  // One line per block or item, however many things it lost.
  const grouped = new Map<string, string[]>();
  const rest: string[] = [];
  for (const n of report.notes) {
    const m = /^((?:Block|Item|Food) [^ :]+:[^ :]+): (.*)$/.exec(n);
    if (m) grouped.set(m[1], [...(grouped.get(m[1]) ?? []), m[2].charAt(0).toUpperCase() + m[2].slice(1)]);
    else rest.push(n);
  }
  report.notes = [...[...grouped].map(([k, parts]) => `${k}: ${parts.join(" ")}`), ...rest];

  const namespace = [...nsCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "imported";
  const others = [...nsCount.keys()].filter((n) => n !== namespace);
  if (others.length) report.notes.push(`Identifiers from ${others.map((n) => `"${n}:"`).join(", ")} now use "${namespace}:" like the rest. Recipes and loot that name them may need updating.`);
  const bpPack = packs.find((p) => p.type === "bp") ?? packs[0];
  return { name: bpPack.name.replace(/\s+(BP|RP|Behaviou?r Pack|Resource Pack)$/i, "") || "Imported add-on", namespace, description: bpPack.description, elements, textures, report };
}

/** Puts an import into a fresh project (keeping its ids and settings). */
export function applyImport(p: Project, r: ImportResult): Project {
  return { ...p, name: r.name, namespace: r.namespace.replace(/[^a-z0-9_]/g, "_") || p.namespace, description: r.description || p.description, elements: r.elements, textures: r.textures };
}
