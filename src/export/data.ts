import type { FunctionElement, LootElement, OreElement, RecipeElement, SoundElement } from "../model/types";
import { FORMATS, GenContext, dataUrlToBytes } from "./context";
import { POTION_CONTAINERS, POTION_TYPES } from "../model/vanilla";
import { clampInt, round } from "./content";

/** Shrinks a 3x3 grid to its bounding box and assigns a key letter per distinct item. */
/** A recipe ingredient: an item id, or "#tag" for any item with that tag. */
export const ingredient = (v: string) => (v.startsWith("#") ? { tag: v.slice(1) } : { item: v });

export function shapedPattern(grid: string[]) {
  const rows = [0, 1, 2].map((r) => grid.slice(r * 3, r * 3 + 3));
  const usedRows = rows.map((r) => r.some(Boolean));
  const usedCols = [0, 1, 2].map((c) => rows.some((r) => r[c]));
  const r0 = usedRows.indexOf(true), r1 = usedRows.lastIndexOf(true);
  const c0 = usedCols.indexOf(true), c1 = usedCols.lastIndexOf(true);
  if (r0 < 0) return null;
  const letters = "ABCDEFGHI";
  const keyOf = new Map<string, string>();
  const pattern: string[] = [];
  for (let r = r0; r <= r1; r++) {
    let line = "";
    for (let c = c0; c <= c1; c++) {
      const item = rows[r][c];
      if (!item) { line += " "; continue; }
      if (!keyOf.has(item)) keyOf.set(item, letters[keyOf.size]);
      line += keyOf.get(item);
    }
    pattern.push(line);
  }
  const key = Object.fromEntries([...keyOf].map(([item, k]) => [k, ingredient(item)]));
  return { pattern, key };
}

/** Where a crafting recipe can be made: the vanilla table and/or custom crafting stations (their tags). */
const stations = (r: RecipeElement) => (r.stations?.length ? r.stations : ["crafting_table"]);

export function genRecipe(ctx: GenContext, r: RecipeElement) {
  const identifier = ctx.id(r.name);
  const count = clampInt(r.count, 1, 64);
  if (r.recipeType === "brewing") return genBrewing(ctx, r);
  if (!r.result && r.recipeType !== "furnace") return ctx.warn(r, "has no result item, so it was skipped.", "error");
  const result = { item: r.result, count };
  let body: Record<string, unknown> | null = null;

  switch (r.recipeType) {
    case "shaped": {
      const p = shapedPattern(r.grid);
      if (!p) return ctx.warn(r, "has an empty crafting grid, so it was skipped.", "error");
      body = { "minecraft:recipe_shaped": { description: { identifier }, tags: stations(r), ...p, result } };
      break;
    }
    case "shapeless": {
      const ingredients = r.grid.filter(Boolean).map(ingredient);
      if (!ingredients.length) return ctx.warn(r, "has no ingredients, so it was skipped.", "error");
      body = { "minecraft:recipe_shapeless": { description: { identifier }, tags: stations(r), ingredients, result } };
      break;
    }
    case "furnace": {
      if (!r.input || !r.result) return ctx.warn(r, "needs both an input and an output item.", "error");
      const tags = r.furnaceTags.length ? r.furnaceTags : ["furnace"];
      body = { "minecraft:recipe_furnace": { description: { identifier }, tags, input: r.input, output: r.result } };
      break;
    }
    case "stonecutter": {
      if (!r.input) return ctx.warn(r, "needs an input item.", "error");
      body = { "minecraft:recipe_shapeless": { description: { identifier }, tags: ["stonecutter"], priority: 0, ingredients: [{ item: r.input }], result } };
      break;
    }
    case "smithing": {
      if (!r.smithingBase || !r.smithingAddition) return ctx.warn(r, "needs a base item and an addition item.", "error");
      body = {
        "minecraft:recipe_smithing_transform": {
          description: { identifier }, tags: ["smithing_table"],
          template: r.smithingTemplate, base: r.smithingBase, addition: r.smithingAddition, result: r.result,
        },
      };
      break;
    }
  }
  ctx.bp(`recipes/${r.name}.json`, { format_version: FORMATS.recipe, ...body });
}

/** Brewing stand recipes: potion type to potion type (mix), or bottle to bottle (container). */
function genBrewing(ctx: GenContext, r: RecipeElement) {
  const mode = r.brewMode ?? "mix";
  const allowed = mode === "mix" ? POTION_TYPES : POTION_CONTAINERS;
  const what = mode === "mix" ? "potion type" : "bottle";
  if (!r.reagent) return ctx.warn(r, "needs an ingredient to add to the brewing stand.", "error");
  for (const [label, v] of [["starting", r.input], ["result", r.result]] as const) {
    if (!allowed.includes(v)) return ctx.warn(r, `needs a ${label} ${what} from the list${v ? ` ("${v}" isn't one)` : ""}. Bedrock can only brew vanilla potions; for your own potions, make a Food element that you drink.`, "error");
  }
  if (r.input === r.result) ctx.warn(r, "turns a potion into the same potion, so it does nothing.");
  ctx.bp(`recipes/${r.name}.json`, {
    format_version: "1.20.10",
    [mode === "mix" ? "minecraft:recipe_brewing_mix" : "minecraft:recipe_brewing_container"]: {
      description: { identifier: ctx.id(r.name) }, tags: ["brewing_stand"], input: r.input, reagent: r.reagent, output: r.result,
    },
  });
}

export function lootPath(ctx: GenContext, l: LootElement) {
  return `loot_tables/${l.lootType}/${ctx.ns}_${l.name}.json`;
}

export function genLoot(ctx: GenContext, l: LootElement) {
  const pools = l.pools
    .map((p) => ({
      rolls: p.rollsMin === p.rollsMax ? clampInt(p.rollsMin, 0, 64) : { min: clampInt(p.rollsMin, 0, 64), max: clampInt(Math.max(p.rollsMin, p.rollsMax), 0, 64) },
      entries: p.entries.filter((e) => e.item).map((e) => ({
        type: "item",
        name: e.item,
        weight: clampInt(e.weight, 1, 1000),
        functions: [{ function: "set_count", count: { min: clampInt(e.min, 0, 64), max: clampInt(Math.max(e.min, e.max), 0, 64) } }],
      })),
    }))
    .filter((p) => p.entries.length);
  if (!pools.length) ctx.warn(l, "has no items, so it drops nothing.");
  ctx.bp(lootPath(ctx, l), { pools });
}

const DIMENSION_TAG: Record<OreElement["dimension"], string> = { overworld: "overworld", nether: "nether", the_end: "the_end" };

export function genOre(ctx: GenContext, o: OreElement) {
  if (!o.block) return ctx.warn(o, "has no block selected, so nothing will generate.", "error");
  const feature = ctx.id(`${o.name}_feature`);
  ctx.bp(`features/${o.name}_feature.json`, {
    format_version: FORMATS.feature,
    "minecraft:ore_feature": {
      description: { identifier: feature },
      count: clampInt(o.veinSize, 1, 64),
      replace_rules: [{ places_block: o.block, may_replace: o.replaces.length ? o.replaces : ["minecraft:stone"] }],
    },
  });
  const lo = Math.round(Math.min(o.minY, o.maxY));
  const hi = Math.round(Math.max(o.minY, o.maxY));
  ctx.bp(`feature_rules/${o.name}_rule.json`, {
    format_version: FORMATS.feature,
    "minecraft:feature_rules": {
      description: { identifier: ctx.id(`${o.name}_rule`), places_feature: feature },
      conditions: {
        placement_pass: "underground_pass",
        "minecraft:biome_filter": [{ any_of: [{ test: "has_biome_tag", operator: "==", value: DIMENSION_TAG[o.dimension] }] }],
      },
      distribution: {
        iterations: clampInt(o.veinsPerChunk, 1, 256),
        coordinate_eval_order: "zyx",
        x: { distribution: "uniform", extent: [0, 16] },
        y: { distribution: "uniform", extent: [lo, hi] },
        z: { distribution: "uniform", extent: [0, 16] },
      },
    },
  });
}

export function genFunction(ctx: GenContext, f: FunctionElement) {
  const body = f.body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\//, "").trimEnd())
    .join("\n");
  ctx.bp(`functions/${ctx.ns}/${f.name}.mcfunction`, body.endsWith("\n") ? body : body + "\n");
  if (f.runEveryTick) ctx.tickFunctions.push(`${ctx.ns}/${f.name}`);
}

export function genSound(ctx: GenContext, s: SoundElement) {
  if (!s.file) return ctx.warn(s, "has no .ogg file yet.", "error");
  const path = `sounds/${ctx.ns}/${s.name}`;
  ctx.rp(`${path}.ogg`, dataUrlToBytes(s.file));
  ctx.soundDefs[`${ctx.ns}.${s.name}`] = {
    category: s.category,
    sounds: [{ name: path, volume: round(s.volume), pitch: round(s.pitch) }],
  };
}
