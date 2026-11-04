// Projectiles, throwable/bow/ammo items, and crops.
import type { CropElement, ItemElement, ProjectileElement } from "../model/types";
import { FORMATS, GenContext, blockTagComponents, geometryIdentifier } from "./context";
import { clampInt, round } from "./content";

export function genProjectile(ctx: GenContext, p: ProjectileElement) {
  const id = ctx.id(p.name);
  const onHit: Record<string, unknown> = {
    impact_damage: {
      damage: { min: clampInt(p.damage, 0, 1000), max: clampInt(p.damage, 0, 1000) },
      knockback: p.knockback,
      catch_fire: p.fireSeconds > 0,
      apply_knockback_to_blocking_targets: true,
      ...(p.onHit === "stick" ? { destroy_on_hit: true } : {}),
    },
  };
  const fx = p.effects.filter((e) => e.effect);
  if (fx.length) {
    onHit.mob_effect = {
      effects: fx.map((e) => {
        const ticks = Math.max(1, Math.round(e.seconds * 20));
        return { effect: e.effect, amplifier: clampInt(e.amplifier, 0, 255), durationeasy: ticks, durationnormal: ticks, durationhard: ticks };
      }),
    };
  }
  if (p.onHit === "stick") onHit.stick_in_ground = { shake_time: 0.35 };
  else onHit.remove_on_hit = {};

  const size = round(Math.max(0.1, p.size));
  ctx.bp(`entities/${p.name}.json`, {
    format_version: FORMATS.entity,
    "minecraft:entity": {
      description: { identifier: id, is_spawnable: false, is_summonable: true, is_experimental: false },
      components: {
        "minecraft:collision_box": { width: size, height: size },
        "minecraft:physics": {},
        "minecraft:pushable": { is_pushable: false, is_pushable_by_piston: true },
        "minecraft:conditional_bandwidth_optimization": { default_values: { max_optimized_distance: 80, max_dropped_ticks: 7, use_motion_prediction_hints: true } },
        "minecraft:projectile": {
          anchor: "eye_height",
          offset: [0, -0.1, 0],
          power: round(p.speed),
          gravity: round(p.gravity),
          ...(p.fireSeconds > 0 ? { on_fire_time: round(p.fireSeconds) } : {}),
          ...(p.hitSound ? { hit_sound: p.hitSound } : {}),
          ...(p.onHit === "stick" ? { should_bounce: "if_no_damage_dealt", uncertainty_base: 16, uncertainty_multiplier: 4 } : {}),
          on_hit: onHit,
        },
      },
    },
  });

  // Looks: the game's own sprite or arrow renderers with our texture, or a Blockbench model.
  const description: Record<string, unknown> = { identifier: id };
  if (p.look === "sprite") {
    const tex = ctx.writeTexture(p.texture, "items");
    if (!tex) ctx.warn(p, "has no texture yet, so it will be invisible.");
    Object.assign(description, {
      materials: { default: "snowball" },
      textures: { default: tex || "textures/items/snowball" },
      geometry: { default: "geometry.item_sprite" },
      render_controllers: ["controller.render.item_sprite"],
      animations: { flying: "animation.actor.billboard" },
      scripts: { animate: ["flying"] },
    });
  } else if (p.look === "arrow") {
    const tex = ctx.writeTexture(p.texture, "entity");
    if (!tex) ctx.warn(p, "has no arrow texture yet, so it will use the normal arrow texture.");
    Object.assign(description, {
      materials: { default: "arrow" },
      textures: { default: tex || "textures/entity/arrows" },
      geometry: { default: "geometry.arrow" },
      animations: { move: "animation.arrow.move" },
      scripts: {
        pre_animation: [
          "variable.shake = query.shake_time - query.frame_alpha;",
          "variable.shake_power = variable.shake > 0.0 ? -Math.sin(variable.shake * 200.0) * variable.shake : 0.0;",
        ],
        animate: ["move"],
      },
      render_controllers: ["controller.render.arrow"],
    });
  } else {
    const geo = geometryIdentifier(p.customGeometry);
    if (!geo) ctx.warn(p, "is set to use a Blockbench model, but none has been imported.", "error");
    else ctx.rp(`models/entity/${ctx.ns}_${p.name}.geo.json`, p.customGeometry);
    Object.assign(description, {
      materials: { default: "entity_alphatest" },
      textures: { default: ctx.writeTexture(p.texture, "entity") || "textures/misc/missing_texture" },
      geometry: { default: geo ?? "geometry.item_sprite" },
      render_controllers: ["controller.render.default"],
    });
  }
  ctx.rp(`entity/${p.name}.entity.json`, { format_version: FORMATS.clientEntity, "minecraft:client_entity": { description } });
  ctx.lang.push(`entity.${id}.name=${p.displayName}`);
}

/** Item components for throwing, shooting and ammo. Returns problems to report. */
export function rangedItemComponents(ctx: GenContext, it: ItemElement): Record<string, unknown> {
  const use = it.use ?? "none";
  if (use === "none") return {};
  const projectileId = (name: string | undefined) => {
    const proj = ctx.project.elements.find((e) => e.kind === "projectile" && e.name === name);
    if (!proj) ctx.warn(it, `is set to ${use === "throw" ? "throw" : "be ammo for"} a projectile, but none is chosen (or it was deleted).`, "error");
    return proj ? ctx.id(proj.name) : "";
  };
  const out: Record<string, unknown> = {};
  if (use === "throw") {
    const pid = projectileId(it.projectile);
    if (pid) {
      out["minecraft:throwable"] = { do_swing_animation: true, launch_power_scale: 1, max_launch_power: 1 };
      out["minecraft:projectile"] = { projectile_entity: pid };
    }
  } else if (use === "ammo") {
    const pid = projectileId(it.projectile);
    if (pid) out["minecraft:projectile"] = { projectile_entity: pid, minimum_critical_power: 1.0 };
  } else if (use === "bow") {
    const ammo = (it.ammo?.length ? it.ammo : ["minecraft:arrow"]).filter(Boolean);
    out["minecraft:shooter"] = {
      ammunition: ammo.map((item) => ({ item, use_offhand: true, search_inventory: true, use_in_creative: true })),
      max_draw_duration: round(Math.max(0.1, it.drawSeconds ?? 1)),
      scale_power_by_draw_duration: true,
      charge_on_draw: false,
    };
    out["minecraft:use_animation"] = "bow";
    out["minecraft:use_modifiers"] = { use_duration: 3600, movement_modifier: 0.35 };
    out["minecraft:max_stack_size"] = { value: 1 };
    out["minecraft:hand_equipped"] = { value: true };
    out["minecraft:enchantable"] = { slot: "bow", value: 1 };
    if ((it.durability ?? 0) > 0) out["minecraft:durability"] = { max_durability: clampInt(it.durability!, 1, 100000) };
  }
  return out;
}

// ---------- Crops ----------

function cropGeometry(ns: string) {
  // Four planes in a # pattern, like vanilla wheat; each faces both ways.
  const plane = (origin: number[], size: number[]) => ({
    origin, size,
    uv: size[0] === 0
      ? { east: { uv: [0, 0], uv_size: [16, 16] }, west: { uv: [16, 0], uv_size: [-16, 16] } }
      : { north: { uv: [0, 0], uv_size: [16, 16] }, south: { uv: [16, 0], uv_size: [-16, 16] } },
  });
  return {
    format_version: FORMATS.geometry,
    "minecraft:geometry": [{
      description: { identifier: `geometry.${ns}_crop`, texture_width: 16, texture_height: 16, visible_bounds_width: 2, visible_bounds_height: 2, visible_bounds_offset: [0, 0.5, 0] },
      bones: [{
        name: "crop", pivot: [0, 0, 0],
        cubes: [plane([-4, 0, -8], [0, 16, 16]), plane([4, 0, -8], [0, 16, 16]), plane([-8, 0, -4], [16, 16, 0]), plane([-8, 0, 4], [16, 16, 0])],
      }],
    }],
  };
}

export function genCrop(ctx: GenContext, c: CropElement) {
  const id = ctx.id(c.name), seedsId = ctx.id(`${c.name}_seeds`);
  const stages = Math.max(2, Math.min(8, c.stageTextures.length));
  const max = stages - 1;
  const state = `${ctx.ns}:growth`;
  const keys = c.stageTextures.slice(0, stages).map((t) => ctx.terrainKey(t));
  if (keys.some((k) => !k)) ctx.warn(c, "is missing a texture for some growth stages.");
  if (!c.produce) ctx.warn(c, "has no produce item chosen, so fully grown crops only drop seeds.");
  const geometryName = c.look === "crop" ? `geometry.${ctx.ns}_crop` : `geometry.${ctx.ns}_cross`;
  if (c.look === "crop") ctx.rp(`models/blocks/${ctx.ns}_crop.geo.json`, cropGeometry(ctx.ns));
  else {
    // The cross model is shared with plants.
    ctx.rp(`models/blocks/${ctx.ns}_cross.geo.json`, {
      format_version: FORMATS.geometry,
      "minecraft:geometry": [{
        description: { identifier: `geometry.${ctx.ns}_cross`, texture_width: 16, texture_height: 16 },
        bones: [{ name: "plant", pivot: [0, 0, 0], cubes: [
          { origin: [-8, 0, 0], size: [16, 16, 0], pivot: [0, 0, 0], rotation: [0, 45, 0], uv: { north: { uv: [0, 0], uv_size: [16, 16] }, south: { uv: [16, 0], uv_size: [-16, 16] } } },
          { origin: [-8, 0, 0], size: [16, 16, 0], pivot: [0, 0, 0], rotation: [0, -45, 0], uv: { north: { uv: [0, 0], uv_size: [16, 16] }, south: { uv: [16, 0], uv_size: [-16, 16] } } },
        ] }],
      }],
    });
  }

  // Loot: young crops drop a seed; fully grown ones drop produce and seeds.
  ctx.bp(`loot_tables/blocks/${ctx.ns}_${c.name}_young.json`, { pools: [{ rolls: 1, entries: [{ type: "item", name: seedsId }] }] });
  ctx.bp(`loot_tables/blocks/${ctx.ns}_${c.name}_grown.json`, {
    pools: [
      ...(c.produce ? [{ rolls: 1, entries: [{ type: "item", name: c.produce, functions: [{ function: "set_count", count: { min: clampInt(c.produceMin, 0, 64), max: clampInt(Math.max(c.produceMin, c.produceMax), 0, 64) } }] }] }] : []),
      { rolls: 1, entries: [{ type: "item", name: seedsId, functions: [{ function: "set_count", count: { min: 1, max: clampInt(Math.max(1, c.seedsMax), 1, 64) } }] }] },
    ],
  });

  const component = `${ctx.ns}:${c.name}_logic`;
  const mat = (key: string) => ({ "*": { texture: key || "missing", render_method: "alpha_test", face_dimming: false, ambient_occlusion: false } });
  ctx.bp(`blocks/${c.name}.json`, {
    format_version: "1.21.90",
    "minecraft:block": {
      description: { identifier: id, menu_category: { category: "none" }, states: { [state]: Array.from({ length: stages }, (_, i) => i) } },
      components: {
        "minecraft:geometry": geometryName,
        "minecraft:material_instances": mat(keys[0]),
        "minecraft:collision_box": false,
        "minecraft:selection_box": { origin: [-6, 0, -6], size: [12, 3, 12] },
        "minecraft:destructible_by_mining": { seconds_to_destroy: 0 },
        "minecraft:destructible_by_explosion": { explosion_resistance: 0 },
        "minecraft:light_dampening": 0,
        "minecraft:flammable": { catch_chance_modifier: 60, destroy_chance_modifier: 100 },
        "minecraft:placement_filter": { conditions: [{ allowed_faces: ["up"], block_filter: c.placeableOn.length ? c.placeableOn : ["minecraft:farmland"] }] },
        "minecraft:loot": `loot_tables/blocks/${ctx.ns}_${c.name}_young.json`,
        [component]: {},
        ...blockTagComponents(c.tags),
      },
      permutations: Array.from({ length: stages }, (_, i) => ({
        condition: `q.block_state('${state}') == ${i}`,
        components: {
          "minecraft:material_instances": mat(keys[i]),
          "minecraft:selection_box": { origin: [-6, 0, -6], size: [12, Math.max(2, Math.round(((i + 1) / stages) * 14)), 12] },
          ...(i === max ? { "minecraft:loot": `loot_tables/blocks/${ctx.ns}_${c.name}_grown.json` } : {}),
        },
      })),
    },
  });
  ctx.blockSounds[id] = { sound: "grass" };
  ctx.lang.push(`tile.${id}.name=${c.displayName}`);

  // Seeds plant the crop.
  const seedsKey = ctx.itemKey(c.seedsTexture);
  if (!seedsKey) ctx.warn(c, "has no seeds texture yet.");
  ctx.lang.push(`item.${seedsId}.name=${c.displayName} Seeds`);
  ctx.bp(`items/${c.name}_seeds.json`, {
    format_version: FORMATS.item,
    "minecraft:item": {
      description: { identifier: seedsId, menu_category: { category: "nature" } },
      components: {
        "minecraft:display_name": { value: `item.${seedsId}.name` },
        ...(seedsKey ? { "minecraft:icon": { textures: { default: seedsKey } } } : {}),
        "minecraft:max_stack_size": { value: 64 },
        "minecraft:block_placer": { block: id, use_on: c.placeableOn.length ? c.placeableOn : ["minecraft:farmland"] },
      },
    },
  });
  ctx.script.blocks.push({ id, component, input: false, crop: { stages, chance: clampInt(c.growthChance, 1, 100), boneMeal: c.boneMeal } });
  ctx.requires.push({ engine: "1.21.90", reason: `${c.displayName}: crops`, elementId: c.id });
}
