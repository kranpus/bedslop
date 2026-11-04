import type { EntityElement } from "../model/types";
import { FORMATS, GenContext, geometryIdentifier } from "./context";
import { clampInt, round } from "./content";
import { boneRenames, buildAnimations, exportAnimationId, renameAnimationBones } from "./entityAnimations";
import { parseLenientJson } from "../vanilla/json";

type Cube = { origin: number[]; size: number[]; uv: number[]; inflate?: number };
const bone = (name: string, pivot: number[], cubes: Cube[], parent?: string) => ({ name, pivot, ...(parent ? { parent } : {}), cubes });

/** Player-skin compatible humanoid (64x64 texture). Any Minecraft skin works as its texture. */
export function humanoidGeometry(ns: string) {
  return {
    format_version: FORMATS.geometry,
    "minecraft:geometry": [{
      description: { identifier: `geometry.${ns}.humanoid`, texture_width: 64, texture_height: 64, visible_bounds_width: 2, visible_bounds_height: 3, visible_bounds_offset: [0, 1.5, 0] },
      bones: [
        bone("root", [0, 0, 0], []),
        bone("body", [0, 24, 0], [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }], "root"),
        bone("head", [0, 24, 0], [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }, { origin: [-4, 24, -4], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 }], "body"),
        bone("rightArm", [-5, 22, 0], [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }], "body"),
        bone("leftArm", [5, 22, 0], [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [32, 48] }], "body"),
        bone("rightLeg", [-1.9, 12, 0], [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }], "root"),
        bone("leftLeg", [1.9, 12, 0], [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] }], "root"),
      ],
    }],
  };
}

/** Four-legged animal (64x64 texture). Layout matches the quadruped texture template. */
export function quadrupedGeometry(ns: string) {
  const leg = (name: string, x: number, z: number) =>
    bone(name, [x + 2, 6, z + 2], [{ origin: [x, 0, z], size: [4, 6, 4], uv: [0, 40] }], "root");
  return {
    format_version: FORMATS.geometry,
    "minecraft:geometry": [{
      description: { identifier: `geometry.${ns}.quadruped`, texture_width: 64, texture_height: 64, visible_bounds_width: 2, visible_bounds_height: 2, visible_bounds_offset: [0, 0.75, 0] },
      bones: [
        bone("root", [0, 0, 0], []),
        bone("body", [0, 10, 0], [{ origin: [-5, 6, -8], size: [10, 8, 16], uv: [0, 16] }], "root"),
        bone("head", [0, 12, -8], [{ origin: [-4, 8, -16], size: [8, 8, 8], uv: [0, 0] }], "body"),
        leg("leg_front_right", -5, -7),
        leg("leg_front_left", 1, -7),
        leg("leg_back_right", -5, 3),
        leg("leg_back_left", 1, 3),
      ],
    }],
  };
}

export function presetAnimations(ns: string) {
  const swing = (mult: number) => `math.cos(query.modified_distance_moved * 38.17) * ${mult} * query.modified_move_speed`;
  return {
    format_version: FORMATS.animation,
    animations: {
      [`animation.${ns}.humanoid.walk`]: {
        loop: true,
        bones: {
          rightArm: { rotation: [swing(40), 0, 0] },
          leftArm: { rotation: [`-${swing(40)}`, 0, 0] },
          rightLeg: { rotation: [`-${swing(57.3)}`, 0, 0] },
          leftLeg: { rotation: [swing(57.3), 0, 0] },
        },
      },
      [`animation.${ns}.quadruped.walk`]: {
        loop: true,
        bones: {
          leg_front_right: { rotation: [swing(70), 0, 0] },
          leg_back_left: { rotation: [swing(70), 0, 0] },
          leg_front_left: { rotation: [`-${swing(70)}`, 0, 0] },
          leg_back_right: { rotation: [`-${swing(70)}`, 0, 0] },
        },
      },
      [`animation.${ns}.look_at_target`]: {
        loop: true,
        bones: { head: { rotation: ["query.target_x_rotation", "query.target_y_rotation", 0] } },
      },
    },
  };
}

export function genEntity(ctx: GenContext, e: EntityElement) {
  if (e.model === "vanilla") return genVanillaEntity(ctx, e);
  const id = ctx.id(e.name);
  const ns = ctx.ns;
  const families = Array.from(new Set([e.name, "mob", e.behavior === "hostile" ? "monster" : "animal", ...e.families.filter(Boolean)]));

  // ----- Behavior pack -----
  const c: Record<string, unknown> = {
    "minecraft:type_family": { family: families },
    "minecraft:health": { value: clampInt(e.health, 1, 10000), max: clampInt(e.health, 1, 10000) },
    "minecraft:collision_box": { width: round(e.width), height: round(e.height) },
    "minecraft:movement": { value: round(e.speed) },
    "minecraft:movement.basic": {},
    "minecraft:jump.static": {},
    "minecraft:navigation.walk": { can_path_over_water: true, avoid_water: !e.canSwim, avoid_damage_blocks: true },
    "minecraft:physics": {},
    "minecraft:pushable": { is_pushable: true, is_pushable_by_piston: true },
    "minecraft:breathable": { total_supply: 15, suffocate_time: 0 },
    "minecraft:nameable": {},
    "minecraft:experience_reward": { on_death: `query.last_hit_by_player ? ${clampInt(e.xp, 0, 1000)} : 0` },
    "minecraft:behavior.random_stroll": { priority: 6, speed_multiplier: 1 },
    "minecraft:behavior.look_at_player": { priority: 7, look_distance: 6, probability: 0.02 },
    "minecraft:behavior.random_look_around": { priority: 8 },
  };
  if (e.scale !== 1) c["minecraft:scale"] = { value: round(e.scale) };
  if (e.canSwim) c["minecraft:behavior.float"] = { priority: 0 };
  if (e.fireImmune) c["minecraft:fire_immune"] = true;
  if (e.burnsInDaylight) c["minecraft:burns_in_daylight"] = {};
  if (e.knockbackResistance > 0) c["minecraft:knockback_resistance"] = { value: round(Math.min(1, e.knockbackResistance)) };
  if (e.temptItems.length) c["minecraft:behavior.tempt"] = { priority: 4, speed_multiplier: 1.2, items: e.temptItems };

  if (e.behavior === "passive") {
    c["minecraft:behavior.panic"] = { priority: 1, speed_multiplier: 1.25 };
  } else {
    c["minecraft:attack"] = { damage: clampInt(e.attackDamage, 0, 1000) };
    c["minecraft:behavior.melee_attack"] = { priority: 3, speed_multiplier: 1.2, track_target: true };
    c["minecraft:behavior.hurt_by_target"] = { priority: 1 };
  }
  if (e.behavior === "hostile") {
    c["minecraft:follow_range"] = { value: 32, max: 32 };
    c["minecraft:behavior.nearest_attackable_target"] = {
      priority: 2,
      must_see: true,
      reselect_targets: true,
      entity_types: [{
        filters: { any_of: [{ test: "is_family", subject: "other", value: "player" }, { test: "is_family", subject: "other", value: "irongolem" }] },
        max_dist: 24,
      }],
    };
    c["minecraft:despawn"] = { despawn_from_distance: {} };
  }

  const drops = e.drops.filter((d) => d.item);
  if (drops.length) {
    const path = `loot_tables/entities/${ns}_${e.name}.json`;
    ctx.bp(path, {
      pools: drops.map((d) => ({
        rolls: 1,
        ...(d.chance < 100 ? { conditions: [{ condition: "random_chance", chance: round(d.chance / 100) }] } : {}),
        entries: [{
          type: "item", name: d.item, weight: 1,
          functions: [{ function: "set_count", count: { min: clampInt(d.min, 0, 64), max: clampInt(Math.max(d.min, d.max), 0, 64) } }],
        }],
      })),
    });
    c["minecraft:loot"] = { table: path };
  }

  ctx.bp(`entities/${e.name}.json`, {
    format_version: FORMATS.entity,
    "minecraft:entity": {
      description: { identifier: id, is_spawnable: true, is_summonable: true, is_experimental: false },
      component_groups: {},
      components: c,
      events: {},
    },
  });

  if (e.spawnEnabled) genSpawnRules(ctx, e, id);

  // ----- Resource pack -----
  const texPath = ctx.writeTexture(e.texture, "entity");
  if (!texPath) ctx.warn(e, "has no texture yet. It will render as a missing texture.");

  let geometryId: string;
  const animations: Record<string, string> = {};
  const animate: unknown[] = [];
  if (e.model === "custom") {
    const geo = geometryIdentifier(e.customGeometry);
    if (!geo) {
      ctx.warn(e, e.customGeometry.trim()
        ? "the custom model file couldn't be read. Import a Blockbench .bbmodel, or a Bedrock .geo.json (Blockbench: File → Export → Export Bedrock Geometry)."
        : "is set to use a Blockbench model, but no model file has been imported yet.", "error");
      ctx.rp(`models/entity/${ns}_humanoid.geo.json`, humanoidGeometry(ns));
    } else {
      // Bone names with spaces or symbols are renamed the same way in the model and every animation.
      const renames = boneRenames(e.customGeometry);
      if (renames.size) {
        const g = JSON.parse(e.customGeometry);
        for (const b of g["minecraft:geometry"]?.[0]?.bones ?? []) {
          b.name = renames.get(String(b.name).toLowerCase()) ?? b.name;
          if (b.parent) b.parent = renames.get(String(b.parent).toLowerCase()) ?? b.parent;
        }
        ctx.rp(`models/entity/${ns}_${e.name}.geo.json`, g);
      } else ctx.rp(`models/entity/${ns}_${e.name}.geo.json`, e.customGeometry);
      const tex = ctx.texture(e.texture);
      try {
        const d = JSON.parse(e.customGeometry)["minecraft:geometry"]?.[0]?.description;
        if (tex && d?.texture_width && d?.texture_height && Math.abs(tex.width / tex.height - d.texture_width / d.texture_height) > 0.01) {
          ctx.warn(e, `texture is ${tex.width}×${tex.height} but the model was made for ${d.texture_width}×${d.texture_height}, so it will be stretched. Use the texture painted for this model.`);
        }
      } catch { /* checked above */ }
    }
    geometryId = geo ?? `geometry.${ns}.humanoid`;
    if (e.customAnimations.trim() && !e.customAnimations.includes('"animations"')) ctx.warn(e, "animation file could not be read and was skipped.");
    if (geo) {
      // Uploaded files go into the pack unchanged.
      const renames = boneRenames(e.customGeometry);
      if (e.customAnimations.trim().includes('"animations"')) {
        try {
          const src = JSON.parse(e.customAnimations);
          const ids = Object.keys(src.animations ?? {});
          const bad = ids.filter((id) => !id.startsWith("animation."));
          if (bad.length || renames.size) {
            src.animations = Object.fromEntries(Object.entries(src.animations ?? {}).map(([id, def]) => [exportAnimationId(ns, e.name, id), def]));
            ctx.rp(`animations/${ns}_${e.name}.source.animation.json`, renameAnimationBones(src, renames));
          } else ctx.rp(`animations/${ns}_${e.name}.source.animation.json`, e.customAnimations);
          if (bad.length) ctx.warn(e, `animation names must start with "animation." in Bedrock, so ${bad.map((b) => `"${b}"`).join(", ")} were exported as ${bad.map((b) => exportAnimationId(ns, e.name, b)).join(", ")}. Nothing to fix.`, "info");
        } catch { /* reported above */ }
      }
      if (e.customControllers?.trim()) {
        try {
          const src = JSON.parse(e.customControllers);
          const keys = Object.keys(src.animation_controllers ?? {});
          if (keys.some((k) => !k.startsWith("controller.animation."))) {
            src.animation_controllers = Object.fromEntries(Object.entries(src.animation_controllers).map(([k, v]) => [exportAnimationId(ns, e.name, k, true), v]));
            ctx.rp(`animation_controllers/${ns}_${e.name}.source.animation_controllers.json`, src);
          } else ctx.rp(`animation_controllers/${ns}_${e.name}.source.animation_controllers.json`, e.customControllers);
        } catch {
          ctx.warn(e, "animation controllers file could not be read and was skipped.");
        }
      }
      const built = buildAnimations(ns, e);
      for (const p of built.problems) ctx.warn(e, p);
      if (built.animationFile) ctx.rp(`animations/${ns}_${e.name}.animation.json`, renameAnimationBones(built.animationFile as never, renames));
      if (built.controllerFile) ctx.rp(`animation_controllers/${ns}_${e.name}.animation_controllers.json`, built.controllerFile);
      Object.assign(animations, built.animations);
      animate.push(...built.animate);
    }
  } else {
    const preset = e.model;
    const tex = ctx.texture(e.texture);
    if (tex && (tex.width !== 64 || tex.height !== 64)) {
      ctx.warn(e, `texture is ${tex.width}×${tex.height}, but the ${preset} model expects a 64×64 layout. If you made this mob in Blockbench, choose "Blockbench model" and import it.`);
    }
    geometryId = `geometry.${ns}.${preset}`;
    ctx.rp(`models/entity/${ns}_${preset}.geo.json`, preset === "humanoid" ? humanoidGeometry(ns) : quadrupedGeometry(ns));
    ctx.rp(`animations/${ns}_presets.animation.json`, presetAnimations(ns));
    animations.walk = `animation.${ns}.${preset}.walk`;
    animations.look_at_target = `animation.${ns}.look_at_target`;
    animate.push("walk", "look_at_target");
  }

  ctx.rp(`entity/${e.name}.entity.json`, {
    format_version: FORMATS.clientEntity,
    "minecraft:client_entity": {
      description: {
        identifier: id,
        materials: { default: "entity_alphatest" },
        textures: { default: texPath || "textures/misc/missing_texture" },
        geometry: { default: geometryId },
        ...(Object.keys(animations).length ? { animations } : {}),
        scripts: animate.length ? { animate } : {},
        render_controllers: ["controller.render.default"],
        spawn_egg: { base_color: e.eggBase, overlay_color: e.eggOverlay },
      },
    },
  });
  ctx.lang.push(`entity.${id}.name=${e.displayName}`);
  ctx.lang.push(`item.spawn_egg.entity.${id}.name=${e.displayName} Spawn Egg`);
}


/**
 * A mob based on a vanilla one: keeps its behaviour, AI and events, and points its looks at the
 * game's own model, textures and animations. Our editor's values are applied on top.
 */
function genVanillaEntity(ctx: GenContext, e: EntityElement) {
  const id = ctx.id(e.name);
  const base = e.vanillaBase ?? "";
  let behavior: Record<string, any> | null = null, client: Record<string, any> | null = null;
  try { behavior = parseLenientJson(e.vanillaBehavior ?? "") as Record<string, any>; } catch { /* reported below */ }
  try { client = parseLenientJson(e.vanillaClient ?? "") as Record<string, any>; } catch { /* reported below */ }
  const ent = behavior?.["minecraft:entity"], cl = client?.["minecraft:client_entity"];
  if (!ent?.description || !cl?.description) {
    return ctx.warn(e, `the template${base ? ` (${base})` : ""} is missing its behaviour or resource file. Load the template again on the mob's page.`, "error");
  }

  // ----- Behavior: rename, link to the original for engine-level behaviour, apply our values -----
  ent.description.identifier = id;
  if (!ent.description.runtime_identifier) ent.description.runtime_identifier = base;
  ent.description.is_spawnable = true;
  ent.description.is_summonable = true;
  ent.description.is_experimental = false;
  const c = (ent.components ??= {});
  c["minecraft:health"] = { ...(c["minecraft:health"] ?? {}), value: clampInt(e.health, 1, 10000), max: clampInt(e.health, 1, 10000) };
  c["minecraft:movement"] = { ...(c["minecraft:movement"] ?? {}), value: round(e.speed) };
  if (c["minecraft:attack"]) c["minecraft:attack"] = { ...c["minecraft:attack"], damage: clampInt(e.attackDamage, 0, 1000) };
  c["minecraft:collision_box"] = { width: round(e.width), height: round(e.height) };
  if (e.scale !== 1) c["minecraft:scale"] = { value: round(e.scale) };
  if (e.knockbackResistance > 0) c["minecraft:knockback_resistance"] = { value: round(Math.min(1, e.knockbackResistance)) };
  if (e.fireImmune) c["minecraft:fire_immune"] = true;
  if (e.families.length) {
    const fam = c["minecraft:type_family"]?.family ?? [];
    c["minecraft:type_family"] = { family: Array.from(new Set([...fam, ...e.families])) };
  }
  const drops = e.drops.filter((d) => d.item);
  if (drops.length) {
    // Your drops replace the original mob's loot table.
    const path = `loot_tables/entities/${ctx.ns}_${e.name}.json`;
    ctx.bp(path, { pools: drops.map((d) => ({
      rolls: 1,
      ...(d.chance < 100 ? { conditions: [{ condition: "random_chance", chance: round(d.chance / 100) }] } : {}),
      entries: [{ type: "item", name: d.item, weight: 1, functions: [{ function: "set_count", count: { min: clampInt(d.min, 0, 64), max: clampInt(Math.max(d.min, d.max), 0, 64) } }] }],
    })) });
    c["minecraft:loot"] = { table: path };
  }
  ctx.bp(`entities/${e.name}.json`, behavior!);
  if (e.spawnEnabled) genSpawnRules(ctx, e, id);

  // ----- Client: same looks as the original, under our id -----
  cl.description.identifier = id;
  cl.description.spawn_egg = { base_color: e.eggBase, overlay_color: e.eggOverlay };
  const reskin = ctx.writeTexture(e.texture, "entity");
  if (reskin) cl.description.textures = { ...(cl.description.textures ?? {}), default: reskin };
  ctx.rp(`entity/${e.name}.entity.json`, client!);
  if (e.vanillaSounds) {
    try { ctx.entitySounds[id] = JSON.parse(e.vanillaSounds); } catch { /* optional */ }
  }
  ctx.lang.push(`entity.${id}.name=${e.displayName}`);
  ctx.lang.push(`item.spawn_egg.entity.${id}.name=${e.displayName} Spawn Egg`);
}

function genSpawnRules(ctx: GenContext, e: EntityElement, id: string) {
  const tags = e.spawnBiomeTags.length ? e.spawnBiomeTags : ["animal"];
  const cond: Record<string, unknown> = {};
  if (e.spawnSurface) cond["minecraft:spawns_on_surface"] = {};
  if (!e.spawnSurface || e.populationControl === "monster") cond["minecraft:spawns_underground"] = {};
  cond["minecraft:brightness_filter"] = { min: clampInt(e.lightMin, 0, 15), max: clampInt(Math.max(e.lightMin, e.lightMax), 0, 15), adjust_for_weather: true };
  cond["minecraft:weight"] = { default: clampInt(e.spawnWeight, 1, 1000) };
  cond["minecraft:herd"] = { min_size: clampInt(e.herdMin, 1, 32), max_size: clampInt(Math.max(e.herdMin, e.herdMax), 1, 32) };
  if (e.populationControl === "monster") cond["minecraft:difficulty_filter"] = { min: "easy", max: "hard" };
  cond["minecraft:biome_filter"] = tags.length === 1
    ? { test: "has_biome_tag", operator: "==", value: tags[0] }
    : { any_of: tags.map((t) => ({ test: "has_biome_tag", operator: "==", value: t })) };
  ctx.bp(`spawn_rules/${e.name}.json`, {
    format_version: FORMATS.spawnRules,
    "minecraft:spawn_rules": { description: { identifier: id, population_control: e.populationControl }, conditions: [cond] },
  });
}
