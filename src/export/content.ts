// Blocks, plants, items, tools, armor and food.
import type {
  CustomBlockState,
  ArmorElement, ArmorSlot, BlockElement, FoodElement, ItemElement, PlantElement, ToolElement,
} from "../model/types";
import { FORMATS, GenContext, blockTagComponents, cleanTags, geometryIdentifier, maxVersion } from "./context";
import { shapeParts } from "./shapes";
import { rangedItemComponents } from "./ranged";

const menu = (category: string, group?: string) => (group ? { category, group } : { category });

// ---------- Blocks ----------

const TOOL_TAGS: Record<BlockElement["bestTool"], string[]> = {
  none: [],
  pickaxe: ["stone", "minecraft:is_pickaxe_item_destructible"],
  axe: ["wood", "minecraft:is_axe_item_destructible"],
  shovel: ["dirt", "minecraft:is_shovel_item_destructible"],
  hoe: ["minecraft:is_hoe_item_destructible"],
};

export function genBlock(ctx: GenContext, b: BlockElement) {
  const id = ctx.id(b.name);
  const rm = b.renderMethod;
  const inst = (texId: string | undefined) => {
    const key = ctx.terrainKey(texId);
    return key ? { texture: key, render_method: rm } : undefined;
  };

  const t = b.textures;
  const instances: Record<string, unknown> = {};
  if (b.textureMode === "all") {
    instances["*"] = inst(t.all);
  } else if (b.textureMode === "pillar") {
    instances["*"] = inst(t.side ?? t.all);
    instances.up = inst(t.top ?? t.side);
    instances.down = inst(t.bottom ?? t.top ?? t.side);
  } else {
    instances["*"] = inst(t.north ?? t.side ?? t.all);
    for (const f of ["north", "south", "east", "west"] as const) instances[f] = inst(t[f] ?? t.side ?? t.all);
    instances.up = inst(t.top);
    instances.down = inst(t.bottom);
  }
  for (const k of Object.keys(instances)) if (!instances[k]) delete instances[k];
  if (!instances["*"]) {
    ctx.warn(b, "has no texture yet. It will show as a missing-texture block.");
    instances["*"] = { texture: "missing", render_method: rm };
  }

  let geometry = "minecraft:geometry.full_block";
  let modelBox: { origin: number[]; size: number[] } | null = null;
  if (b.geometry === "custom") {
    const geoId = geometryIdentifier(b.customGeometry);
    if (geoId) {
      geometry = geoId;
      ctx.rp(`models/blocks/${ctx.ns}_${b.name}.geo.json`, b.customGeometry);
      modelBox = modelBounds(b.customGeometry);
      const fit = modelFit(b.customGeometry);
      if (fit) ctx.warn(b, fit.replace(/^This model/, "custom model").replace(/^Parts of this model/, "custom model: parts of it"));
    } else {
      ctx.warn(b, "custom model could not be read, using a full block instead.", "error");
    }
  }

  const components: Record<string, unknown> = {
    "minecraft:geometry": geometry,
    "minecraft:material_instances": instances,
    "minecraft:destructible_by_mining": b.hardness < 0 ? false : { seconds_to_destroy: round(b.hardness) },
    "minecraft:destructible_by_explosion": { explosion_resistance: round(b.explosionResistance) },
    "minecraft:map_color": b.mapColor,
  };
  if (b.lightEmission > 0) components["minecraft:light_emission"] = clampInt(b.lightEmission, 0, 15);
  const dampening = b.lightDampening;
  if (dampening !== 15) components["minecraft:light_dampening"] = clampInt(dampening, 0, 15);
  if (Math.abs(b.friction - 0.4) > 1e-6) components["minecraft:friction"] = round(Math.min(0.9, Math.max(0, b.friction)));
  if (b.flammable) components["minecraft:flammable"] = { catch_chance_modifier: 5, destroy_chance_modifier: 20 };
  if (b.drops === "nothing") components["minecraft:loot"] = "loot_tables/empty.json";
  if (b.drops === "loot") {
    const loot = ctx.project.elements.find((e) => e.id === b.lootTable && e.kind === "loot");
    if (loot && loot.kind === "loot") components["minecraft:loot"] = `loot_tables/${loot.lootType}/${ctx.ns}_${loot.name}.json`;
    else ctx.warn(b, "is set to drop a loot table, but none is selected. It will drop itself.");
  }
  for (const tag of TOOL_TAGS[b.bestTool]) components[`tag:${tag}`] = {};
  Object.assign(components, blockTagComponents(b.tags));

  // Hitbox for custom models.
  if (b.geometry === "custom" && modelBox) {
    const mode = b.collision ?? "model";
    if (mode === "none") {
      components["minecraft:collision_box"] = false;
      components["minecraft:selection_box"] = modelBox;
    } else if (mode === "model") {
      components["minecraft:collision_box"] = modelBox;
      components["minecraft:selection_box"] = modelBox;
    }
  }

  // Each feature needs a minimum block format (and sometimes game / Script API version).
  let format = FORMATS.block;
  const need = (fmt: string, reason: string, engine?: string, api?: string) => {
    format = maxVersion(format, fmt);
    ctx.requires.push({ engine: engine ?? fmt, api, reason: `${b.displayName}: ${reason}`, elementId: b.id });
  };

  // What the block does when used.
  const fn = b.function ?? "none";
  if (fn === "crafting") {
    const tags = (b.craftingTags?.length ? b.craftingTags : [id]).slice(0, 64);
    components["minecraft:crafting_table"] = { crafting_tags: tags, table_name: b.tableName || b.displayName };
  } else if (fn === "storage") {
    components["minecraft:block_entity"] = { container: { slot_count: clampInt(b.slotCount ?? 27, 1, 54), title: (b.containerTitle || b.displayName).slice(0, 256) } };
    need("1.26.20", "storage blocks", "1.26.60");
  }

  // Redstone.
  const power = clampInt(b.redstonePower ?? 0, 0, 15);
  const toggle = power > 0 && b.redstoneMode === "toggle";
  const input = !!b.redstoneInput;
  const onState = `${ctx.ns}:on`;
  const lit = !!b.litWhenPowered && (toggle || input);
  const hasOnState = toggle || (input && (lit || !!b.poweredTexture));
  const states: Record<string, unknown> = {};
  const onComponents: Record<string, unknown> = {};
  if (power > 0 && !toggle) {
    components["minecraft:redstone_producer"] = { power };
    need("1.21.120", "redstone output");
  }
  if (toggle) {
    onComponents["minecraft:redstone_producer"] = { power };
    need("1.21.120", "redstone output");
  }
  if (input) {
    components["minecraft:redstone_consumer"] = { min_power: 0, propagates_power: !!b.passesPower };
    need("1.26.0", "redstone input", "1.26.0", "2.5.0");
  }
  if (hasOnState) {
    states[onState] = [false, true];
    if (lit) onComponents["minecraft:light_emission"] = clampInt(b.litLevel ?? 15, 1, 15);
    if (b.poweredTexture) {
      const key = ctx.terrainKey(b.poweredTexture);
      if (key) onComponents["minecraft:material_instances"] = { "*": { texture: key, render_method: rm } };
    }
  }
  // Built-in shapes (slab, stairs, door, fence, ...): their own model, states, boxes and behaviour.
  const shape = b.geometry === "custom" ? null : shapeParts(b.shape ?? "cube", ctx.ns, b.name);
  if (shape) {
    ctx.rp(`models/blocks/${ctx.ns}_${b.name}.geo.json`, shape.geometry);
    components["minecraft:geometry"] = shape.boneVisibility ? { identifier: shape.geometryId, bone_visibility: shape.boneVisibility } : shape.geometryId;
    components["minecraft:collision_box"] = shape.collision;
    components["minecraft:selection_box"] = shape.selection;
    if (b.renderMethod === "opaque") (components["minecraft:material_instances"] as Record<string, { render_method: string }>)["*"].render_method = "alpha_test";
    components["minecraft:light_dampening"] = 0;
    if (b.shape === "door") {
      const lower = inst(t.bottom ?? t.all), upper = inst(t.top ?? t.all);
      if (lower) components["minecraft:material_instances"] = { "*": { ...lower, render_method: "alpha_test" } };
      if (upper) shape.permutations.push({ condition: `q.block_state('${ctx.ns}:upper')`, components: { "minecraft:material_instances": { "*": { ...upper, render_method: "alpha_test" } } } });
      ctx.bp("loot_tables/empty.json", { pools: [] });
    }
    if (b.shape === "slab") {
      ctx.bp(`loot_tables/blocks/${ctx.ns}_${b.name}_double.json`, { pools: [{ rolls: 1, entries: [{ type: "item", name: id, functions: [{ function: "set_count", count: 2 }] }] }] });
    }
    Object.assign(states, shape.states ?? {});
  }

  if (toggle || input || shape?.logic) {
    // Script behaviour lives in a custom component registered in main.js.
    const component = `${ctx.ns}:${b.name}_logic`;
    components[component] = {};
    need("1.21.90", shape?.logic ? `${b.shape} behaviour` : "lever / redstone behaviour");
    ctx.script.blocks.push({
      id, component, toggleState: toggle ? onState : undefined, litState: input && hasOnState ? onState : undefined, input,
      shape: shape?.logic, group: shape?.logic === "connect" ? b.shape : undefined,
    });
  }

  const custom = customStateParts(ctx, b, states, rm);
  Object.assign(states, custom.states);

  const block: Record<string, unknown> = {
    description: { identifier: id, menu_category: menu(b.category, b.group), ...(Object.keys(states).length ? { states } : {}) } as Record<string, unknown>,
    components,
  };

  if (shape) {
    // Shapes bring their own placement rules (facing, top/bottom half).
    if (shape.traits) (block.description as Record<string, unknown>).traits = shape.traits;
    block.permutations = shape.permutations;
  } else if (b.rotation === "facing") {
    (block.description as Record<string, unknown>).traits = {
      "minecraft:placement_direction": { enabled_states: ["minecraft:cardinal_direction"], y_rotation_offset: 180 },
    };
    block.permutations = (
      [["north", 0], ["west", 90], ["south", 180], ["east", -90]] as const
    ).map(([dir, y]) => ({
      condition: `q.block_state('minecraft:cardinal_direction') == '${dir}'`,
      components: { "minecraft:transformation": { rotation: [0, y, 0] } },
    }));
  } else if (b.rotation === "axis") {
    (block.description as Record<string, unknown>).traits = {
      "minecraft:placement_position": { enabled_states: ["minecraft:block_face"] },
    };
    block.permutations = [
      { condition: "q.block_state('minecraft:block_face') == 'up' || q.block_state('minecraft:block_face') == 'down'", components: { "minecraft:transformation": { rotation: [0, 0, 0] } } },
      { condition: "q.block_state('minecraft:block_face') == 'north' || q.block_state('minecraft:block_face') == 'south'", components: { "minecraft:transformation": { rotation: [90, 0, 0] } } },
      { condition: "q.block_state('minecraft:block_face') == 'east' || q.block_state('minecraft:block_face') == 'west'", components: { "minecraft:transformation": { rotation: [0, 0, 90] } } },
    ];
  }

  if (Object.keys(onComponents).length) {
    block.permutations = [...((block.permutations as unknown[]) ?? []), { condition: `q.block_state('${onState}')`, components: onComponents }];
  }
  if (custom.permutations.length) block.permutations = [...((block.permutations as unknown[]) ?? []), ...custom.permutations];
  ctx.bp(`blocks/${b.name}.json`, { format_version: format, "minecraft:block": block });
  ctx.blockSounds[id] = { sound: b.sound };
  ctx.lang.push(`tile.${id}.name=${b.displayName}`);
}

/** Bedrock only draws block models that fit in 30×30×30 pixels around the block. Returns a warning, or null. */
export function modelFit(geometryJson: string): string | null {
  try {
    const bones = JSON.parse(geometryJson)["minecraft:geometry"]?.[0]?.bones ?? [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const bone of bones) for (const c of bone.cubes ?? []) {
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], Number(c.origin[i]));
        hi[i] = Math.max(hi[i], Number(c.origin[i]) + Number(c.size[i]));
      }
    }
    if (!Number.isFinite(lo[0])) return "This model has no cubes, so the block would be invisible.";
    const size = [0, 1, 2].map((i) => Math.round((hi[i] - lo[i]) * 100) / 100);
    if (size.some((v) => v > 30)) return `This model is ${size.join(" × ")} pixels. Minecraft only draws block models up to 30 × 30 × 30 (a block is 16), so it won't appear in game. Scale it down in Blockbench.`;
    const out = lo[0] < -15 || hi[0] > 15 || lo[2] < -15 || hi[2] > 15 || lo[1] < -7 || hi[1] > 23;
    if (out) return "Parts of this model reach more than 7 pixels outside the block. Minecraft won't draw it in game. In Blockbench, keep it centred on the block (x and z from -8 to 8, standing on y = 0).";
    return null;
  } catch {
    return null;
  }
}

/** Valid custom state names: lower case letters, digits and underscores. */
const STATE_NAME = /^[a-z][a-z0-9_]{0,31}$/;

/** The values a custom state can take, in order (the first is the default). */
export function stateValues(st: CustomBlockState): (string | number | boolean)[] {
  if (st.type === "bool") return [false, true];
  if (st.type === "int") {
    const lo = Math.round(Math.min(st.min ?? 0, st.max ?? 3)), hi = Math.round(Math.max(st.min ?? 0, st.max ?? 3));
    return Array.from({ length: Math.min(16, hi - lo + 1) }, (_, i) => lo + i);
  }
  return Array.from(new Set((st.options ?? []).map((o) => o.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_")).filter(Boolean)));
}

/** Molang test for one state value, e.g. q.block_state('ns:lit') == true. */
function stateTest(key: string, st: CustomBlockState, raw: string): string | null {
  const v = String(raw).trim().toLowerCase();
  const values = stateValues(st);
  if (st.type === "bool") return v === "true" || v === "1" ? `q.block_state('${key}')` : `!q.block_state('${key}')`;
  if (st.type === "int") return values.includes(Number(v)) ? `q.block_state('${key}') == ${Number(v)}` : null;
  return values.includes(v) ? `q.block_state('${key}') == '${v}'` : null;
}

/** States and permutations the user added to a block. */
function customStateParts(ctx: GenContext, b: BlockElement, existing: Record<string, unknown>, rm: string) {
  const states: Record<string, unknown> = {};
  const defs = new Map<string, CustomBlockState>();
  for (const st of b.customStates ?? []) {
    const key = `${ctx.ns}:${st.name}`;
    if (!STATE_NAME.test(st.name)) { ctx.warn(b, `state "${st.name}" needs a name of lower-case letters, digits and _ (starting with a letter). It was skipped.`, "error"); continue; }
    if (key in existing || defs.has(st.name)) { ctx.warn(b, `state "${st.name}" is already used by this block (its shape, redstone or another state). Rename it.`, "error"); continue; }
    const values = stateValues(st);
    if (values.length < 2) { ctx.warn(b, `state "${st.name}" needs at least two values.`, "error"); continue; }
    if (st.type === "int" && Math.abs((st.max ?? 3) - (st.min ?? 0)) >= 16) ctx.warn(b, `state "${st.name}" can have at most 16 numbers, so it stops at ${values[values.length - 1]}.`);
    states[key] = values;
    defs.set(st.name, st);
  }
  const permutations: { condition: string; components: Record<string, unknown> }[] = [];
  (b.stateRules ?? []).forEach((r, i) => {
    const tests: string[] = [];
    for (const w of r.when) {
      const st = defs.get(w.state);
      const t = st ? stateTest(`${ctx.ns}:${w.state}`, st, w.value) : null;
      if (!t) { ctx.warn(b, `rule ${i + 1} checks ${w.state} = ${w.value}, which isn't one of the block's states or values. The rule was skipped.`, "error"); return; }
      tests.push(t);
    }
    if (!tests.length) return;
    const c: Record<string, unknown> = {};
    if (r.texture) { const key = ctx.terrainKey(r.texture); if (key) c["minecraft:material_instances"] = { "*": { texture: key, render_method: rm } }; }
    if (r.light != null) c["minecraft:light_emission"] = clampInt(r.light, 0, 15);
    if (r.mapColor) c["minecraft:map_color"] = r.mapColor;
    if (r.hardness != null) c["minecraft:destructible_by_mining"] = r.hardness < 0 ? false : { seconds_to_destroy: round(r.hardness) };
    if (r.noCollision) c["minecraft:collision_box"] = false;
    if (r.friction != null) c["minecraft:friction"] = round(Math.min(0.9, Math.max(0, r.friction)));
    if (!Object.keys(c).length) { ctx.warn(b, `rule ${i + 1} doesn't change anything yet.`, "info"); return; }
    permutations.push({ condition: tests.join(" && "), components: c });
  });
  return { states, permutations };
}

/** The space a custom block model fills, as a collision/selection box (block pixels, x/z -8..8, y 0..16). */
export function modelBounds(geometryJson: string): { origin: number[]; size: number[] } | null {
  try {
    const bones = JSON.parse(geometryJson)["minecraft:geometry"]?.[0]?.bones ?? [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const bone of bones) for (const c of bone.cubes ?? []) {
      const inf = Number(c.inflate) || 0;
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], Number(c.origin[i]) - inf);
        hi[i] = Math.max(hi[i], Number(c.origin[i]) + Number(c.size[i]) + inf);
      }
    }
    if (!Number.isFinite(lo[0])) return null;
    const clampAxis = (i: number) => {
      const [min, max] = i === 1 ? [0, 16] : [-8, 8];
      let a = Math.max(min, Math.min(max, lo[i])), z = Math.max(min, Math.min(max, hi[i]));
      // Flat models (e.g. a sign) still need a little thickness to be clickable.
      if (z - a < 1) { const mid = (a + z) / 2; a = Math.max(min, mid - 0.5); z = Math.min(max, a + 1); }
      return [round(a), round(z - a)];
    };
    const axes = [0, 1, 2].map(clampAxis);
    return { origin: axes.map((x) => x[0]), size: axes.map((x) => x[1]) };
  } catch {
    return null;
  }
}

// ---------- Plants ----------

export function crossGeometry(ns: string) {
  const face = { north: { uv: [0, 0], uv_size: [16, 16] }, south: { uv: [16, 0], uv_size: [-16, 16] } };
  return {
    format_version: FORMATS.geometry,
    "minecraft:geometry": [
      {
        description: { identifier: `geometry.${ns}_cross`, texture_width: 16, texture_height: 16, visible_bounds_width: 2, visible_bounds_height: 2, visible_bounds_offset: [0, 0.5, 0] },
        bones: [
          {
            name: "plant",
            pivot: [0, 0, 0],
            cubes: [
              { origin: [-8, 0, 0], size: [16, 16, 0], pivot: [0, 0, 0], rotation: [0, 45, 0], uv: face },
              { origin: [-8, 0, 0], size: [16, 16, 0], pivot: [0, 0, 0], rotation: [0, -45, 0], uv: face },
            ],
          },
        ],
      },
    ],
  };
}

export function genPlant(ctx: GenContext, p: PlantElement) {
  const id = ctx.id(p.name);
  const key = ctx.terrainKey(p.texture);
  if (!key) ctx.warn(p, "has no texture yet.");
  ctx.rp(`models/blocks/${ctx.ns}_cross.geo.json`, crossGeometry(ctx.ns));
  const components: Record<string, unknown> = {
    "minecraft:geometry": `geometry.${ctx.ns}_cross`,
    "minecraft:material_instances": {
      "*": { texture: key || "missing", render_method: "alpha_test", face_dimming: false, ambient_occlusion: false },
    },
    "minecraft:collision_box": false,
    "minecraft:selection_box": { origin: [-6, 0, -6], size: [12, 13, 12] },
    "minecraft:destructible_by_mining": { seconds_to_destroy: round(Math.max(0, p.hardness)) },
    "minecraft:destructible_by_explosion": { explosion_resistance: 0 },
    "minecraft:light_dampening": 0,
    "minecraft:flammable": { catch_chance_modifier: 60, destroy_chance_modifier: 100 },
    ...blockTagComponents(p.tags),
    "minecraft:map_color": "#4f8a3a",
    "minecraft:placement_filter": {
      conditions: [{ allowed_faces: ["up"], block_filter: p.placeableOn.length ? p.placeableOn : ["minecraft:grass_block"] }],
    },
  };
  if (p.lightEmission > 0) components["minecraft:light_emission"] = clampInt(p.lightEmission, 0, 15);
  ctx.bp(`blocks/${p.name}.json`, {
    format_version: FORMATS.block,
    "minecraft:block": { description: { identifier: id, menu_category: menu("nature") }, components },
  });
  ctx.blockSounds[id] = { sound: p.sound };
  ctx.lang.push(`tile.${id}.name=${p.displayName}`);

  if (p.generate) {
    ctx.bp(`features/${p.name}_feature.json`, {
      format_version: FORMATS.feature,
      "minecraft:single_block_feature": {
        description: { identifier: `${id}_feature` },
        places_block: id,
        enforce_placement_rules: true,
        enforce_survivability_rules: true,
        may_attach_to: { min_sides_must_attach: 1, bottom: p.placeableOn },
      },
    });
    ctx.bp(`feature_rules/${p.name}_rule.json`, {
      format_version: FORMATS.feature,
      "minecraft:feature_rules": {
        description: { identifier: `${id}_rule`, places_feature: `${id}_feature` },
        conditions: {
          placement_pass: "surface_pass",
          "minecraft:biome_filter": [{ test: "has_biome_tag", operator: "==", value: "overworld" }],
        },
        distribution: {
          iterations: clampInt(p.generateTries, 1, 64),
          scatter_chance: { numerator: 1, denominator: 3 },
          x: { distribution: "uniform", extent: [0, 15] },
          y: "query.heightmap(variable.worldx, variable.worldz)",
          z: { distribution: "uniform", extent: [0, 15] },
        },
      },
    });
  }
}

// ---------- Items ----------

export function itemBase(ctx: GenContext, el: { name: string; displayName: string }, iconKey: string, extra: Record<string, unknown>, category: string, group = "") {
  const id = ctx.id(el.name);
  const langKey = `item.${id}.name`;
  ctx.lang.push(`${langKey}=${el.displayName}`);
  const components: Record<string, unknown> = {
    "minecraft:display_name": { value: langKey },
    ...(iconKey ? { "minecraft:icon": { textures: { default: iconKey } } } : {}),
    ...extra,
  };
  return {
    format_version: FORMATS.item,
    "minecraft:item": { description: { identifier: id, menu_category: menu(category, group) }, components },
  };
}

export function genItem(ctx: GenContext, it: ItemElement) {
  const key = ctx.itemKey(it.texture);
  if (!key) ctx.warn(it, "has no texture yet.");
  const extra: Record<string, unknown> = { "minecraft:max_stack_size": { value: clampInt(it.maxStack, 1, 64) } };
  if (it.glint) extra["minecraft:glint"] = { value: true };
  if (it.handEquipped) extra["minecraft:hand_equipped"] = { value: true };
  if (it.fuelSeconds > 0) extra["minecraft:fuel"] = { duration: round(it.fuelSeconds) };
  if (cleanTags(it.tags).length) extra["minecraft:tags"] = { tags: cleanTags(it.tags) };
  Object.assign(extra, rangedItemComponents(ctx, it));
  ctx.bp(`items/${it.name}.json`, itemBase(ctx, it, key, extra, it.category, it.group));
}

const DIG: Record<ToolElement["toolType"], string> = {
  pickaxe: "q.any_tag('stone', 'metal', 'rock', 'minecraft:is_pickaxe_item_destructible')",
  axe: "q.any_tag('wood', 'pumpkin', 'plant', 'minecraft:is_axe_item_destructible')",
  shovel: "q.any_tag('dirt', 'sand', 'gravel', 'grass', 'snow', 'minecraft:is_shovel_item_destructible')",
  hoe: "q.any_tag('plant', 'minecraft:is_hoe_item_destructible')",
  sword: "q.any_tag('minecraft:is_sword_item_destructible')",
};

export function genTool(ctx: GenContext, t: ToolElement) {
  const key = ctx.itemKey(t.texture);
  if (!key) ctx.warn(t, "has no texture yet.");
  const durability = clampInt(t.durability, 1, 100000);
  const extra: Record<string, unknown> = {
    "minecraft:max_stack_size": { value: 1 },
    "minecraft:hand_equipped": { value: true },
    "minecraft:durability": { max_durability: durability },
    "minecraft:damage": { value: clampInt(t.attackDamage, 0, 1000) },
    "minecraft:enchantable": { slot: t.toolType, value: clampInt(t.enchantability, 0, 100) },
    "minecraft:digger": {
      use_efficiency: true,
      destroy_speeds: [{ block: { tags: DIG[t.toolType] }, speed: Math.max(1, Math.round(t.toolType === "sword" ? 15 : t.miningSpeed)) }],
    },
    "minecraft:tags": { tags: cleanTags(["minecraft:is_tool", `minecraft:is_${t.toolType}`, `minecraft:${t.tier}_tier`, ...(t.tags ?? [])]) },
  };
  if (t.toolType === "sword") extra["minecraft:can_destroy_in_creative"] = { value: false };
  if (t.glint) extra["minecraft:glint"] = { value: true };
  if (t.repairItem) {
    extra["minecraft:repairable"] = { repair_items: [{ items: [t.repairItem], repair_amount: Math.ceil(durability / 4) }] };
  }
  ctx.bp(`items/${t.name}.json`, itemBase(ctx, t, key, extra, "equipment"));
  ctx.script.tools[ctx.id(t.name)] = t.toolType === "sword" ? [2, 1] : [1, 2];
}

const ARMOR: Record<ArmorSlot, { slot: string; ench: string; base: number; layer: 1 | 2; geo: string; visible: string; label: string }> = {
  helmet: { slot: "slot.armor.head", ench: "armor_head", base: 11, layer: 1, geo: "geometry.player.armor.helmet", visible: "variable.helmet_layer_visible = 0.0;", label: "Helmet" },
  chestplate: { slot: "slot.armor.chest", ench: "armor_torso", base: 16, layer: 1, geo: "geometry.player.armor.chestplate", visible: "variable.chest_layer_visible = 0.0;", label: "Chestplate" },
  leggings: { slot: "slot.armor.legs", ench: "armor_legs", base: 15, layer: 2, geo: "geometry.player.armor.leggings", visible: "variable.leg_layer_visible = 0.0;", label: "Leggings" },
  boots: { slot: "slot.armor.feet", ench: "armor_feet", base: 13, layer: 1, geo: "geometry.player.armor.boots", visible: "variable.boot_layer_visible = 0.0;", label: "Boots" },
};

export function genArmor(ctx: GenContext, a: ArmorElement) {
  const layer1 = ctx.writeTexture(a.layer1, "models/armor");
  const layer2 = ctx.writeTexture(a.layer2, "models/armor");
  for (const slot of Object.keys(ARMOR) as ArmorSlot[]) {
    const piece = a.pieces[slot];
    if (!piece.enabled) continue;
    const info = ARMOR[slot];
    const name = `${a.name}_${slot}`;
    const id = ctx.id(name);
    const key = ctx.itemKey(piece.texture);
    if (!key) ctx.warn(a, `${info.label.toLowerCase()} has no icon texture yet.`);
    const layerPath = info.layer === 1 ? layer1 : layer2;
    if (!layerPath) ctx.warn(a, `is missing the worn texture (layer ${info.layer}) used by the ${info.label.toLowerCase()}.`);
    const durability = Math.max(1, Math.round(info.base * a.durabilityMultiplier));
    const extra: Record<string, unknown> = {
      "minecraft:max_stack_size": { value: 1 },
      "minecraft:wearable": { slot: info.slot, protection: clampInt(piece.protection, 0, 100) },
      "minecraft:durability": { max_durability: durability },
      "minecraft:enchantable": { slot: info.ench, value: clampInt(a.enchantability, 0, 100) },
      "minecraft:tags": { tags: cleanTags(["minecraft:is_armor", ...(a.tags ?? [])]) },
    };
    if (a.repairItem) extra["minecraft:repairable"] = { repair_items: [{ items: [a.repairItem], repair_amount: Math.ceil(durability / 4) }] };
    ctx.bp(`items/${name}.json`, itemBase(ctx, { name, displayName: `${a.displayName} ${info.label}` }, key, extra, "equipment"));
    ctx.rp(`attachables/${name}.json`, {
      format_version: FORMATS.attachable,
      "minecraft:attachable": {
        description: {
          identifier: id,
          materials: { default: "armor", enchanted: "armor_enchanted" },
          textures: { default: layerPath || "textures/misc/missing_texture", enchanted: "textures/misc/enchanted_actor_glint" },
          geometry: { default: info.geo },
          scripts: { parent_setup: info.visible },
          render_controllers: ["controller.render.armor"],
        },
      },
    });
  }
}

export function genFood(ctx: GenContext, f: FoodElement) {
  const key = ctx.itemKey(f.texture);
  if (!key) ctx.warn(f, "has no texture yet.");
  const food: Record<string, unknown> = {
    nutrition: clampInt(f.nutrition, 0, 20),
    saturation_modifier: round(f.saturation),
    can_always_eat: f.canAlwaysEat,
  };
  if (f.convertsTo) food.using_converts_to = f.convertsTo;
  const extra: Record<string, unknown> = {
    "minecraft:max_stack_size": { value: clampInt(f.maxStack, 1, 64) },
    "minecraft:food": food,
    "minecraft:use_animation": f.animation,
    "minecraft:use_modifiers": { use_duration: round(Math.max(0.1, f.useDuration)), movement_modifier: 0.35 },
  };
  if (f.glint) extra["minecraft:glint"] = { value: true };
  if (cleanTags(f.tags).length) extra["minecraft:tags"] = { tags: cleanTags(["minecraft:is_food", ...(f.tags ?? [])]) };
  ctx.bp(`items/${f.name}.json`, itemBase(ctx, f, key, extra, "items"));
  const fx = f.effects.filter((e) => e.effect);
  if (fx.length) {
    ctx.script.foods[ctx.id(f.name)] = fx.map((e) => [e.effect, Math.round(e.seconds * 20), clampInt(e.amplifier, 0, 255), clampInt(e.chance, 0, 100)]);
  }
}

export const round = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
export const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));
