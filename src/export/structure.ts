// .mcstructure import: read what's inside, put loot tables in its containers, and generate it in the world.

import type { LootElement, StructureElement } from "../model/types";
import { FORMATS, GenContext, dataUrlToBytes } from "./context";
import { clampInt } from "./content";
import { lootPath } from "./data";
import { T, asInts, asList, asString, nbt, path, readNbt, writeNbt, type NbtRoot } from "./nbt";

export interface StructureContainer {
  /** Block index in the structure (the key used by block_position_data). */
  index: number;
  pos: [number, number, number];
  /** Block name, e.g. minecraft:chest. */
  block: string;
  /** Block entity id, e.g. Chest. */
  entity: string;
  items: number;
  /** Loot table already stored in the file, if any. */
  loot: string;
}

export interface StructureInfo {
  root: NbtRoot;
  size: [number, number, number];
  /** Block names in the palette. */
  palette: string[];
  /** Palette index per block (layer 0), -1 = structure void. Order: x, then y, then z (z fastest). */
  blocks: Int32Array;
  /** Non-air block counts by name, most common first. */
  counts: [string, number][];
  containers: StructureContainer[];
  entities: string[];
}

const AIRISH = new Set(["minecraft:air", "minecraft:structure_void"]);

export const posOf = (index: number, size: [number, number, number]): [number, number, number] => {
  const [, sy, sz] = size;
  return [Math.floor(index / (sy * sz)), Math.floor(index / sz) % sy, index % sz];
};

/** Reads a .mcstructure. Throws a readable error when it isn't one. */
export function parseStructure(bytes: Uint8Array): StructureInfo {
  const root = readNbt(bytes);
  const size = asInts(root.tag.value.get("size"));
  if (size.length !== 3) throw new Error("This file has no structure size. Is it a Bedrock .mcstructure?");
  const s: [number, number, number] = [size[0], size[1], size[2]];
  const struct = root.tag.value.get("structure");
  const layers = asList(path(struct, "block_indices"));
  const blocks = asInts(layers[0]);
  if (blocks.length !== s[0] * s[1] * s[2]) throw new Error(`The block list (${blocks.length}) doesn't match the size ${s.join(" × ")}.`);
  const def = path(struct, "palette", "default");
  const palette = asList(path(def, "block_palette")).map((b) => asString(path(b, "name")) ?? "minecraft:air");

  const tally = new Map<string, number>();
  for (const i of blocks) {
    if (i < 0) continue;
    const name = palette[i] ?? "minecraft:air";
    if (!AIRISH.has(name)) tally.set(name, (tally.get(name) ?? 0) + 1);
  }

  const containers: StructureContainer[] = [];
  const data = path(def, "block_position_data");
  if (data?.type === T.Compound) {
    for (const [key, entry] of data.value) {
      const be = path(entry, "block_entity_data");
      const items = path(be, "Items");
      const entity = asString(path(be, "id")) ?? "";
      if (!be || (!items && !CONTAINER_ENTITIES.has(entity))) continue;
      const index = Number(key);
      containers.push({
        index, pos: posOf(index, s), entity,
        block: palette[blocks[index]] ?? entity,
        items: asList(items).length,
        loot: asString(path(be, "LootTable")) ?? "",
      });
    }
  }
  containers.sort((a, b) => a.index - b.index);

  const entities = asList(path(struct, "entities")).map((e) => asString(path(e, "identifier")) ?? "entity");
  return { root, size: s, palette, blocks, counts: [...tally].sort((a, b) => b[1] - a[1]), containers, entities };
}

const CONTAINER_ENTITIES = new Set(["Chest", "Barrel", "ShulkerBox", "Dispenser", "Dropper", "Hopper"]);

/** Returns a copy of the file with these loot tables set on its containers (their stored items are cleared). */
export function withLoot(info: StructureInfo, loot: Record<number, string>): Uint8Array {
  const data = path(info.root.tag.value.get("structure"), "palette", "default", "block_position_data");
  for (const [key, table] of Object.entries(loot)) {
    if (!table) continue;
    const be = path(data, String(key), "block_entity_data");
    if (be?.type !== T.Compound) continue;
    be.value.set("LootTable", nbt.str(table));
    be.value.set("LootTableSeed", nbt.int(0));
    be.value.set("Items", nbt.list(T.Compound, []));
  }
  return writeNbt(info.root);
}

/** Vanilla chest loot tables, for the loot pickers. */
export const VANILLA_CHEST_LOOT = [
  "abandoned_mineshaft", "ancient_city", "bastion_treasure", "bastion_other", "buriedtreasure", "desert_pyramid", "end_city_treasure",
  "igloo_chest", "jungle_temple", "monster_room", "nether_bridge", "pillager_outpost", "ruined_portal", "shipwreck", "shipwrecksupply",
  "shipwrecktreasure", "simple_dungeon", "spawn_bonus_chest", "stronghold_corridor", "stronghold_crossing", "stronghold_library",
  "trial_chambers/reward", "trial_chambers/supply", "underwater_ruin_big", "underwater_ruin_small", "village/village_armorer",
  "village/village_plains_house", "village/village_toolsmith", "village/village_weaponsmith", "village_two_room_house", "woodland_mansion",
].map((n) => `loot_tables/chests/${n}.json`);

/** Structure id used by features, /structure and the Script API. */
export const structureId = (ns: string, name: string) => `${ns}:${name}`;

const DIMENSION_TAG: Record<StructureElement["dimension"], string> = { overworld: "overworld", nether: "nether", the_end: "the_end" };

export function genStructure(ctx: GenContext, s: StructureElement) {
  if (!s.file) return ctx.warn(s, "has no .mcstructure file yet.", "error");
  let info: StructureInfo;
  try {
    info = parseStructure(dataUrlToBytes(s.file));
  } catch (e) {
    return ctx.warn(s, `couldn't be read: ${e instanceof Error ? e.message : e}`, "error");
  }

  // Loot tables: our own loot elements by name, or vanilla paths.
  const loot: Record<number, string> = {};
  for (const [key, ref] of Object.entries(s.loot)) {
    if (!ref) continue;
    if (!info.containers.some((c) => String(c.index) === key)) continue; // container no longer in the file
    if (ref.startsWith("loot_tables/")) { loot[Number(key)] = ref; continue; }
    const l = ctx.project.elements.find((e): e is LootElement => e.kind === "loot" && e.name === ref);
    if (!l) { ctx.warn(s, `uses the loot table "${ref}", which doesn't exist (renamed or deleted?).`, "error"); continue; }
    loot[Number(key)] = lootPath(ctx, l);
  }
  const bytes = Object.keys(loot).length ? withLoot(info, loot) : dataUrlToBytes(s.file);
  ctx.bp(`structures/${ctx.ns}/${s.name}.mcstructure`, bytes);
  const [sx, sy, sz] = info.size;
  if (sx > 64 || sz > 64 || sy > 384) ctx.warn(s, `is ${sx} × ${sy} × ${sz}; structure features place at most 64 × 384 × 64, so world generation may cut it off.`);

  if (!s.generate) return;
  const feature = ctx.id(`${s.name}_feature`);
  const constraints: Record<string, unknown> = {};
  if (s.grounded) constraints.grounded = {};
  if (s.unburied) constraints.unburied = {};
  if (s.canReplace.length) constraints.block_intersection = { block_allowlist: s.canReplace };
  ctx.bp(`features/${s.name}_feature.json`, {
    format_version: FORMATS.feature,
    "minecraft:structure_template_feature": {
      description: { identifier: feature },
      structure_name: structureId(ctx.ns, s.name),
      adjustment_radius: clampInt(s.adjustmentRadius, 0, 16),
      facing_direction: s.facing,
      constraints,
    },
  });
  const surface = s.placement === "surface";
  if (surface && s.dimension === "nether") ctx.warn(s, "generates on the surface of the Nether, which is its bedrock roof. Choose “Underground” with a height range instead.");
  const lo = Math.round(Math.min(s.minY, s.maxY));
  const hi = Math.round(Math.max(s.minY, s.maxY));
  const sink = clampInt(s.sink, 0, 64);
  const rarity = clampInt(s.rarity, 1, 10000);
  ctx.bp(`feature_rules/${s.name}_rule.json`, {
    format_version: FORMATS.feature,
    "minecraft:feature_rules": {
      description: { identifier: ctx.id(`${s.name}_rule`), places_feature: feature },
      conditions: {
        placement_pass: surface ? "surface_pass" : "underground_pass",
        "minecraft:biome_filter": [
          { test: "has_biome_tag", operator: "==", value: DIMENSION_TAG[s.dimension] },
          ...(s.biomeTags.length ? [{ any_of: s.biomeTags.map((value) => ({ test: "has_biome_tag", operator: "==", value })) }] : []),
        ],
      },
      distribution: {
        iterations: 1,
        ...(rarity > 1 ? { scatter_chance: { numerator: 1, denominator: rarity } } : {}),
        x: { distribution: "uniform", extent: [0, 15] },
        y: surface ? (sink ? `query.heightmap(variable.worldx, variable.worldz) - ${sink}` : "query.heightmap(variable.worldx, variable.worldz)") : { distribution: "uniform", extent: [lo, hi] },
        z: { distribution: "uniform", extent: [0, 15] },
      },
    },
  });
}

/** Rough colour for a block name, for the 3D preview. */
export function blockColor(name: string): [number, number, number, number] {
  const n = name.replace(/^minecraft:/, "");
  const has = (...k: string[]) => k.some((x) => n.includes(x));
  const COLORS: [string[], [number, number, number, number]][] = [
    [["water"], [64, 110, 220, 0.55]], [["lava"], [230, 110, 30, 1]], [["glass", "ice"], [190, 225, 240, 0.4]],
    [["leaves", "azalea"], [70, 130, 50, 1]], [["grass", "moss", "vine", "fern"], [100, 160, 70, 1]],
    [["white"], [230, 230, 230, 1]], [["orange"], [225, 125, 40, 1]], [["magenta"], [190, 75, 180, 1]], [["light_blue"], [100, 170, 220, 1]],
    [["yellow"], [235, 200, 50, 1]], [["lime"], [120, 190, 40, 1]], [["pink"], [230, 140, 170, 1]], [["light_gray"], [155, 155, 150, 1]],
    [["gray"], [75, 80, 85, 1]], [["cyan"], [30, 135, 145, 1]], [["purple"], [120, 50, 170, 1]], [["blue"], [50, 60, 160, 1]],
    [["brown"], [110, 75, 45, 1]], [["green"], [80, 110, 30, 1]], [["red", "nether_wart"], [160, 40, 35, 1]], [["black"], [25, 25, 30, 1]],
    [["chest", "barrel", "crafting", "bookshelf"], [160, 110, 50, 1]],
    [["birch"], [205, 190, 135, 1]], [["spruce"], [110, 80, 50, 1]], [["dark_oak"], [70, 45, 25, 1]], [["jungle"], [160, 115, 80, 1]],
    [["acacia"], [170, 90, 50, 1]], [["mangrove"], [120, 50, 45, 1]], [["cherry"], [225, 175, 165, 1]], [["bamboo"], [195, 175, 85, 1]],
    [["crimson"], [120, 50, 75, 1]], [["warped"], [45, 110, 110, 1]],
    [["log", "wood", "plank", "fence", "door", "trapdoor", "stairs_wood", "oak"], [150, 115, 70, 1]],
    [["sandstone", "sand"], [215, 200, 145, 1]], [["dirt", "mud", "podzol", "farmland", "path"], [125, 90, 60, 1]],
    [["stone_brick", "smooth_stone", "polished_andesite", "stone_slab", "cobblestone"], [128, 128, 128, 1]],
    [["nether_brick"], [70, 35, 40, 1]], [["mud_brick"], [140, 105, 80, 1]], [["brick"], [150, 75, 60, 1]], [["deepslate", "blackstone", "basalt"], [70, 70, 75, 1]], [["netherrack"], [110, 50, 50, 1]],
    [["end_stone", "purpur"], [215, 210, 160, 1]], [["quartz", "snow", "calcite", "bone"], [235, 230, 220, 1]],
    [["gold"], [240, 200, 60, 1]], [["iron", "anvil"], [200, 200, 200, 1]], [["diamond"], [100, 220, 210, 1]], [["emerald"], [60, 190, 90, 1]],
    [["copper"], [195, 110, 80, 1]], [["torch", "lantern", "glowstone", "lamp", "fire"], [255, 210, 110, 1]],
    [["stone", "cobble", "andesite", "diorite", "granite", "tuff", "gravel", "ore", "furnace"], [128, 128, 128, 1]],
  ];
  for (const [keys, c] of COLORS) if (has(...keys)) return c;
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [90 + (h % 120), 90 + ((h >> 8) % 120), 90 + ((h >> 16) % 120), 1];
}

