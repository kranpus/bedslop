import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { Project } from "../src/model/types";
import { PNG } from "./fixture";

function project(): Project {
  const p = createProject("Zoo");
  p.namespace = "zoo";
  for (const n of ["fox", "fox_red", "fox_snow"]) p.textures.push({ id: n, name: n, kind: "entity", width: 64, height: 64, dataUrl: PNG });

  const fox = createElement("entity", "fox", "Fox");
  fox.model = "quadruped";
  fox.texture = "fox";
  Object.assign(fox, {
    behavior: "neutral", tameItems: ["minecraft:sweet_berries"], tameChance: 50, breedItems: ["minecraft:chicken"], growMinutes: 10,
    variants: ["fox_red", "fox_snow"], sounds: { ambient: "yip", hurt: "mob.wolf.hurt", death: "mob.wolf.death" },
    drops: [{ item: "minecraft:leather", min: 0, max: 1, chance: 100 }],
  });
  const yip = createElement("sound", "yip", "Yip");
  yip.file = "data:audio/ogg;base64,T2dnUw==";

  const horse = createElement("entity", "mount", "Mount");
  Object.assign(horse, { model: "quadruped", texture: "fox", rideable: true, steerable: true, seatHeight: 1.1, tameItems: ["minecraft:apple"], rideNeedsTame: true });

  const bat = createElement("entity", "glowbat", "Glow Bat");
  Object.assign(bat, { texture: "fox", movement: "fly", behavior: "hostile", attackStyle: "ranged", projectile: "ember", attackInterval: 2, attackRange: 12 });
  const ember = createElement("projectile", "ember", "Ember");
  ember.texture = "fox";

  const fish = createElement("entity", "koi", "Koi");
  Object.assign(fish, { texture: "fox", movement: "swim", populationControl: "water_animal" });

  const trader = createElement("entity", "merchant", "Merchant");
  Object.assign(trader, { model: "humanoid", texture: "fox", trades: [
    { wants: "minecraft:emerald", wantsCount: 2, gives: "minecraft:golden_apple", givesCount: 1, maxUses: 4 },
    { wants: "minecraft:diamond", wantsCount: 1, wants2: "minecraft:book", wants2Count: 1, gives: "minecraft:enchanted_book", givesCount: 1, maxUses: 1 },
  ] });
  p.elements.push(fox, yip, horse, bat, ember, fish, trader);
  return p;
}

describe("mob extras", () => {
  const { files, warnings } = generateAddon(project());
  const ent = (n: string) => JSON.parse(files.get(`BP/entities/${n}.json`) as string)["minecraft:entity"];
  const client = (n: string) => JSON.parse(files.get(`RP/entity/${n}.entity.json`) as string)["minecraft:client_entity"].description;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("tames: wild mobs can be tamed, tamed ones follow, defend and sit", () => {
    const f = ent("fox");
    expect(f.component_groups["bc:wild"]["minecraft:tameable"]).toEqual({ probability: 0.5, tame_items: ["minecraft:sweet_berries"], tame_event: { event: "bc:on_tame", target: "self" } });
    expect(Object.keys(f.component_groups["bc:tamed"])).toEqual(expect.arrayContaining(["minecraft:is_tamed", "minecraft:behavior.follow_owner", "minecraft:behavior.owner_hurt_target", "minecraft:sittable"]));
    expect(f.events["bc:on_tame"]).toEqual({ remove: { component_groups: ["bc:wild"] }, add: { component_groups: ["bc:tamed"] } });
  });

  it("breeds: adults breed into babies that grow up and drop nothing", () => {
    const f = ent("fox");
    expect(f.component_groups["bc:adult"]["minecraft:breedable"].breeds_with).toEqual([{ mate_type: "zoo:fox", baby_type: "zoo:fox", breed_event: { event: "minecraft:entity_born", target: "baby" } }]);
    expect(f.component_groups["bc:baby"]["minecraft:ageable"].duration).toBe(600);
    expect(f.component_groups["bc:adult"]["minecraft:loot"]).toBeDefined();
    expect(f.components["minecraft:loot"]).toBeUndefined();
    expect(f.events["minecraft:entity_born"].sequence[0].add.component_groups).toEqual(["bc:baby", "bc:wild"]);
    expect(f.events["minecraft:ageable_grow_up"]).toBeDefined();
  });

  it("picks a random texture variant and renders it", () => {
    const f = ent("fox");
    const spawn = f.events["minecraft:entity_spawned"].sequence;
    expect(spawn[0].add.component_groups).toEqual(["bc:adult", "bc:wild"]);
    expect(spawn[1].randomize.map((r: any) => r.add.component_groups[0])).toEqual(["bc:variant_0", "bc:variant_1", "bc:variant_2"]);
    expect(f.component_groups["bc:variant_2"]).toEqual({ "minecraft:variant": { value: 2 } });
    const c = client("fox");
    expect(c.textures).toEqual({ default: "textures/entity/zoo_fox", variant_1: "textures/entity/zoo_fox_red", variant_2: "textures/entity/zoo_fox_snow" });
    expect(c.render_controllers).toEqual(["controller.render.zoo.fox"]);
    const rc = JSON.parse(files.get("RP/render_controllers/zoo_fox.render_controllers.json") as string).render_controllers["controller.render.zoo.fox"];
    expect(rc.arrays.textures["Array.skins"]).toEqual(["Texture.default", "Texture.variant_1", "Texture.variant_2"]);
    expect(rc.textures).toEqual(["Array.skins[query.variant]"]);
  });

  it("plays its own and vanilla sounds", () => {
    const sounds = JSON.parse(files.get("RP/sounds.json") as string).entity_sounds.entities["zoo:fox"];
    expect(sounds.events).toEqual({ ambient: "zoo.yip", hurt: "mob.wolf.hurt", death: "mob.wolf.death" });
    expect(ent("fox").components["minecraft:ambient_sound_interval"].event_name).toBe("ambient");
  });

  it("rides: steerable only once tamed", () => {
    const m = ent("mount");
    expect(m.components["minecraft:rideable"]).toBeUndefined();
    expect(m.component_groups["bc:tamed"]["minecraft:rideable"].seats).toEqual([{ position: [0, 1.1, 0] }]);
    expect(m.component_groups["bc:tamed"]["minecraft:input_ground_controlled"]).toEqual({});
    expect(m.component_groups["bc:tamed"]["minecraft:sittable"]).toBeUndefined();
  });

  it("flies and shoots its own projectile", () => {
    const b = ent("glowbat").components;
    expect(b["minecraft:navigation.hover"]).toBeDefined();
    expect(b["minecraft:navigation.walk"]).toBeUndefined();
    expect(b["minecraft:shooter"]).toEqual({ def: "zoo:ember" });
    expect(b["minecraft:behavior.ranged_attack"]).toMatchObject({ attack_radius: 12, attack_interval_min: 1.6, attack_interval_max: 2.4 });
    expect(b["minecraft:behavior.melee_attack"]).toBeUndefined();
  });

  it("swims and spawns underwater", () => {
    const k = ent("koi").components;
    expect(k["minecraft:navigation.generic"].can_swim).toBe(true);
    expect(k["minecraft:breathable"].breathes_water).toBe(true);
    const rule = JSON.parse(files.get("BP/spawn_rules/koi.json") as string)["minecraft:spawn_rules"].conditions[0];
    expect(rule["minecraft:spawns_underwater"]).toEqual({});
    expect(rule["minecraft:spawns_on_surface"]).toBeUndefined();
  });

  it("trades", () => {
    const t = ent("merchant").components;
    expect(t["minecraft:economy_trade_table"]).toMatchObject({ table: "trading/zoo_merchant_trades.json", new_screen: true });
    expect(t["minecraft:behavior.trade_with_player"]).toBeDefined();
    const table = JSON.parse(files.get("BP/trading/zoo_merchant_trades.json") as string);
    expect(table.tiers[0].trades[1]).toEqual({
      wants: [{ item: "minecraft:diamond", quantity: 1 }, { item: "minecraft:book", quantity: 1 }],
      gives: [{ item: "minecraft:enchanted_book", quantity: 1 }], max_uses: 1, reward_exp: false,
    });
  });

  it("leaves plain mobs unchanged", () => {
    const p = createProject("Plain");
    p.elements.push(createElement("entity", "plain", "Plain"));
    const e = JSON.parse(generateAddon(p).files.get("BP/entities/plain.json") as string)["minecraft:entity"];
    expect(e.component_groups).toEqual({});
    expect(e.events).toEqual({});
  });

  it("reports a missing projectile", () => {
    const p = project();
    p.elements = p.elements.filter((e) => e.name !== "ember");
    expect(generateAddon(p).warnings.some((w) => w.level === "error" && w.message.includes(`"ember"`))).toBe(true);
  });
});
