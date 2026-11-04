// Mob extras: movement (walk/fly/swim), taming, breeding, riding, ranged attacks, trades, sounds and
// texture variants. Adds components, component groups and events to a generated entity.

import type { EntityElement } from "../model/types";
import type { GenContext } from "./context";
import { clampInt, round } from "./content";

export const VANILLA_PROJECTILES = ["minecraft:arrow", "minecraft:snowball", "minecraft:small_fireball", "minecraft:fireball", "minecraft:llama_spit", "minecraft:shulker_bullet"];

type Comps = Record<string, unknown>;
type Group = "bc:wild" | "bc:tamed" | "bc:adult" | "bc:baby";

export interface Extras {
  groups: Record<string, Comps>;
  events: Record<string, unknown>;
  /** Client entity: extra textures and our render controller, when the mob has variants. */
  textures: Record<string, string>;
  renderController?: string;
}

/** The sound id for a project Sound element name, or the vanilla id as given. */
function soundId(ctx: GenContext, ref: string): string {
  return ctx.project.elements.some((e) => e.kind === "sound" && e.name === ref) ? `${ctx.ns}.${ref}` : ref;
}

/** Moves a component out of the always-on list into a component group. */
function move(c: Comps, groups: Record<string, Comps>, key: string, group: Group) {
  if (!(key in c)) return;
  (groups[group] ??= {})[key] = c[key];
  delete c[key];
}

export function applyExtras(ctx: GenContext, e: EntityElement, id: string, c: Comps): Extras {
  const groups: Record<string, Comps> = {};
  const events: Record<string, unknown> = {};
  const add = (g: Group, comps: Comps) => Object.assign((groups[g] ??= {}), comps);
  const attacker = e.behavior !== "passive";

  // ----- Movement -----
  const movement = e.movement ?? "walk";
  if (movement === "fly") {
    for (const k of ["minecraft:movement.basic", "minecraft:jump.static", "minecraft:navigation.walk", "minecraft:behavior.random_stroll", "minecraft:behavior.float"]) delete c[k];
    Object.assign(c, {
      "minecraft:movement.hover": {},
      "minecraft:navigation.hover": { can_path_over_water: true, can_sink: false, can_pass_doors: false, can_path_from_air: true, avoid_water: true, avoid_damage_blocks: true, avoid_sun: false },
      "minecraft:can_fly": {},
      "minecraft:flying_speed": { value: round(e.speed * 0.6) },
      "minecraft:behavior.random_hover": { priority: 6, xz_dist: 8, y_dist: 8, y_offset: -1, interval: 1, hover_height: [1, 4] },
      "minecraft:damage_sensor": { triggers: [{ cause: "fall", deals_damage: false }] },
    });
  } else if (movement === "swim") {
    for (const k of ["minecraft:movement.basic", "minecraft:jump.static", "minecraft:navigation.walk", "minecraft:behavior.random_stroll", "minecraft:behavior.float"]) delete c[k];
    Object.assign(c, {
      "minecraft:movement.sway": { sway_amplitude: 0 },
      "minecraft:underwater_movement": { value: round(e.speed) },
      "minecraft:navigation.generic": { is_amphibious: false, can_path_over_water: false, can_swim: true, can_walk: false, can_breach: false, can_sink: false },
      "minecraft:breathable": { total_supply: 15, suffocate_time: 0, breathes_air: false, breathes_water: true },
      "minecraft:physics": { has_gravity: false },
      "minecraft:behavior.random_swim": { priority: 3, speed_multiplier: 1, xz_dist: 16, y_dist: 4, interval: 0 },
      "minecraft:behavior.swim_idle": { priority: 5 },
    });
  }

  // ----- Ranged attacks -----
  if (attacker && e.attackStyle === "ranged") {
    const ref = e.projectile || "minecraft:arrow";
    const own = ctx.project.elements.find((x) => x.kind === "projectile" && x.name === ref);
    if (!own && !ref.includes(":")) ctx.warn(e, `shoots the projectile "${ref}", which doesn't exist (renamed or deleted?).`, "error");
    delete c["minecraft:behavior.melee_attack"];
    const interval = Math.max(0.25, Number(e.attackInterval) || 2);
    c["minecraft:shooter"] = { def: own ? ctx.id(own.name) : ref };
    c["minecraft:behavior.ranged_attack"] = {
      priority: 2, attack_interval_min: round(interval * 0.8), attack_interval_max: round(interval * 1.2),
      attack_radius: round(Math.max(2, Number(e.attackRange) || 15)), speed_multiplier: 1,
    };
  }

  // ----- Taming -----
  const tameItems = (e.tameItems ?? []).filter(Boolean);
  const tameable = tameItems.length > 0;
  if (tameable) {
    // Wild mobs attack players and despawn; tamed ones don't.
    move(c, groups, "minecraft:behavior.nearest_attackable_target", "bc:wild");
    move(c, groups, "minecraft:despawn", "bc:wild");
    add("bc:wild", {
      "minecraft:tameable": { probability: round(Math.max(1, Math.min(100, e.tameChance ?? 33)) / 100), tame_items: tameItems, tame_event: { event: "bc:on_tame", target: "self" } },
    });
    add("bc:tamed", {
      "minecraft:is_tamed": {},
      "minecraft:behavior.follow_owner": { priority: 4, speed_multiplier: 1, start_distance: 10, stop_distance: 2 },
    });
    if (attacker) add("bc:tamed", { "minecraft:behavior.owner_hurt_by_target": { priority: 1 }, "minecraft:behavior.owner_hurt_target": { priority: 2 } });
    if ((e.canSit ?? true) && !e.rideable && movement === "walk") add("bc:tamed", { "minecraft:sittable": {}, "minecraft:behavior.stay_while_sitting": { priority: 3 } });
    events["bc:on_tame"] = { remove: { component_groups: ["bc:wild"] }, add: { component_groups: ["bc:tamed"] } };
  }

  // ----- Breeding -----
  const breedItems = (e.breedItems ?? []).filter(Boolean);
  const breeding = breedItems.length > 0;
  if (breeding) {
    add("bc:adult", {
      "minecraft:breedable": {
        require_tame: tameable && !!e.breedNeedsTame,
        breed_items: breedItems,
        breeds_with: [{ mate_type: id, baby_type: id, breed_event: { event: "minecraft:entity_born", target: "baby" } }],
      },
      "minecraft:behavior.breed": { priority: 3, speed_multiplier: 1 },
    });
    add("bc:baby", {
      "minecraft:is_baby": {},
      "minecraft:scale": { value: round((e.scale || 1) * 0.5) },
      "minecraft:ageable": { duration: Math.round(Math.max(0.1, e.growMinutes ?? 20) * 60), feed_items: breedItems, grow_up: { event: "minecraft:ageable_grow_up", target: "self" } },
      "minecraft:behavior.follow_parent": { priority: 5, speed_multiplier: 1.1 },
    });
    events["minecraft:ageable_grow_up"] = { remove: { component_groups: ["bc:baby"] }, add: { component_groups: ["bc:adult"] } };
    // Babies don't drop loot or give XP, like vanilla.
    move(c, groups, "minecraft:loot", "bc:adult");
  }

  // ----- Riding -----
  if (e.rideable) {
    const seat = round(Math.max(0, e.seatHeight ?? Math.max(0.5, e.height * 0.85)));
    const ride: Comps = {
      "minecraft:rideable": { seat_count: 1, family_types: ["player"], interact_text: "action.interact.mount", seats: [{ position: [0, seat, 0] }] },
    };
    if (e.steerable ?? true) {
      if (movement === "walk") ride["minecraft:input_ground_controlled"] = {};
      else ctx.warn(e, `is set to be steered, but riders can only steer walking mobs. It will ${movement} around with them instead.`, "info");
    }
    if (tameable && e.rideNeedsTame) add("bc:tamed", ride);
    else if (breeding) add("bc:adult", ride);
    else Object.assign(c, ride);
  }

  // ----- Trades -----
  const trades = (e.trades ?? []).filter((t) => t.wants && t.gives);
  if (trades.length) {
    const table = `trading/${ctx.ns}_${e.name}_trades.json`;
    const item = (name: string, n: number) => ({ item: name, quantity: clampInt(n, 1, 64) });
    ctx.bp(table, {
      tiers: [{
        total_exp_required: 0,
        trades: trades.map((t) => ({
          wants: [item(t.wants, t.wantsCount), ...(t.wants2 ? [item(t.wants2, t.wants2Count ?? 1)] : [])],
          gives: [item(t.gives, t.givesCount)],
          max_uses: clampInt(t.maxUses, 1, 1000),
          reward_exp: false,
        })),
      }],
    });
    Object.assign(c, {
      "minecraft:economy_trade_table": { display_name: `entity.${id}.name`, table, new_screen: true, persist_trades: true },
      "minecraft:behavior.trade_with_player": { priority: 1 },
      "minecraft:trade_resupply": {},
    });
    if (attacker) ctx.warn(e, "trades but also attacks. Players may struggle to trade with it; consider making it passive.", "info");
  }

  // ----- Sounds -----
  const snd = e.sounds ?? {};
  const soundEvents: Record<string, string> = {};
  for (const k of ["ambient", "hurt", "death", "step"] as const) if (snd[k]) soundEvents[k] = soundId(ctx, snd[k]!);
  if (Object.keys(soundEvents).length) {
    ctx.entitySounds[id] = { volume: 1, pitch: [0.9, 1.1], events: soundEvents };
    if (soundEvents.ambient) c["minecraft:ambient_sound_interval"] = { value: 8, range: 16, event_name: "ambient" };
  }

  // ----- Texture variants -----
  const textures: Record<string, string> = {};
  let renderController: string | undefined;
  const variants = (e.variants ?? []).filter(Boolean);
  const variantGroups: string[] = [];
  if (variants.length) {
    const names = ["default"];
    variants.forEach((tex, i) => {
      const path = ctx.writeTexture(tex, "entity");
      if (!path) return;
      textures[`variant_${i + 1}`] = path;
      names.push(`variant_${i + 1}`);
    });
    names.forEach((_, i) => { groups[`bc:variant_${i}`] = { "minecraft:variant": { value: i } }; variantGroups.push(`bc:variant_${i}`); });
    renderController = `controller.render.${ctx.ns}.${e.name}`;
    ctx.rp(`render_controllers/${ctx.ns}_${e.name}.render_controllers.json`, {
      format_version: "1.8.0",
      render_controllers: {
        [renderController]: {
          arrays: { textures: { "Array.skins": names.map((n) => `Texture.${n}`) } },
          geometry: "Geometry.default",
          materials: [{ "*": "Material.default" }],
          textures: ["Array.skins[query.variant]"],
        },
      },
    });
  }

  // ----- Spawn and birth events -----
  const startGroups = [...(breeding ? ["bc:adult"] : []), ...(tameable ? ["bc:wild"] : [])];
  const pickVariant = variantGroups.length ? [{ randomize: variantGroups.map((g) => ({ weight: 1, add: { component_groups: [g] } })) }] : [];
  const spawned = [...(startGroups.length ? [{ add: { component_groups: startGroups } }] : []), ...pickVariant];
  if (spawned.length) events["minecraft:entity_spawned"] = { sequence: spawned };
  if (breeding) events["minecraft:entity_born"] = { sequence: [{ add: { component_groups: ["bc:baby", ...(tameable ? ["bc:wild"] : [])] } }, ...pickVariant] };

  return { groups, events, textures, renderController };
}
