import { describe, expect, it, vi } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { BlockShape, Project } from "../src/model/types";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

const SHAPES: BlockShape[] = ["slab", "stairs", "carpet", "trapdoor", "door", "fence", "wall", "pane"];

function project(): Project {
  const p = createProject("Builder");
  p.namespace = "bld";
  const tex = (name: string) => {
    p.textures.push({ id: name, name, kind: "block", width: 16, height: 16, dataUrl: PNG });
    return name;
  };
  for (const shape of SHAPES) {
    const b = createElement("block", `oak_${shape}`, `Oak ${shape}`);
    b.shape = shape;
    b.textures.all = tex(`oak_${shape}`);
    if (shape === "door") { b.textures.bottom = tex("door_bottom"); b.textures.top = tex("door_top"); }
    p.elements.push(b);
  }

  const snowball = createElement("projectile", "ruby_shard", "Ruby Shard");
  snowball.texture = tex("shard");
  snowball.fireSeconds = 3;
  snowball.effects = [{ effect: "slowness", seconds: 4, amplifier: 1, chance: 100 }];
  const arrow = createElement("projectile", "ruby_arrow_entity", "Ruby Arrow");
  arrow.look = "arrow";
  arrow.onHit = "stick";
  arrow.speed = 1.1;
  arrow.gravity = 0.05;
  arrow.damage = 6;

  const throwItem = createElement("item", "shard_item", "Throwing Shard");
  throwItem.use = "throw";
  throwItem.projectile = "ruby_shard";
  const ammo = createElement("item", "ruby_arrow", "Ruby Arrow");
  ammo.use = "ammo";
  ammo.projectile = "ruby_arrow_entity";
  const bow = createElement("item", "ruby_bow", "Ruby Bow");
  bow.use = "bow";
  bow.ammo = ["bld:ruby_arrow", "minecraft:arrow"];
  bow.drawSeconds = 0.8;
  bow.durability = 500;

  const crop = createElement("crop", "ruby_berry_bush", "Ruby Berry Bush");
  crop.stageTextures = [tex("c0"), tex("c1"), tex("c2")];
  crop.seedsTexture = tex("seeds");
  crop.produce = "minecraft:sweet_berries";

  const hit = createElement("procedure", "shard_hit", "Shard hit");
  hit.trigger = "projectile_hit_entity";
  hit.filter = "bld:ruby_shard";
  hit.actions = [{ id: "a", type: "message", params: { text: "Hit {target}!", to: "player" }, chance: 100 }];
  const land = createElement("procedure", "arrow_land", "Arrow lands");
  land.trigger = "projectile_hit_block";
  land.actions = [{ id: "b", type: "lightning", params: { at: "block" }, chance: 100 }];

  p.elements.push(snowball, arrow, throwItem, ammo, bow, crop, hit, land);
  return p;
}

describe("block shapes, projectiles and crops", () => {
  const { files, warnings } = generateAddon(project());
  const json = (f: string) => JSON.parse(files.get(f) as string);
  const block = (n: string) => json(`BP/blocks/${n}.json`)["minecraft:block"];

  it("exports without problems on the default 1.21.100 project", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("gives every shape its own model and hitbox", () => {
    for (const shape of SHAPES) {
      const b = block(`oak_${shape}`);
      const geo = b.components["minecraft:geometry"];
      expect(typeof geo === "string" ? geo : geo.identifier).toBe(`geometry.bld.oak_${shape}`);
      expect(files.has(`RP/models/blocks/bld_oak_${shape}.geo.json`)).toBe(true);
      expect(b.components["minecraft:collision_box"]).toBeDefined();
    }
    expect(block("oak_carpet").components["minecraft:collision_box"]).toEqual({ origin: [-8, 0, -8], size: [16, 1, 16] });
    expect(block("oak_stairs").components["minecraft:collision_box"].size).toEqual([16, 8, 16]); // walk up without jumping
  });

  it("makes slabs stack into double slabs that drop two", () => {
    const s = block("oak_slab");
    expect(s.description.traits["minecraft:placement_position"].enabled_states).toEqual(["minecraft:vertical_half"]);
    const dbl = s.permutations.find((p: any) => p.condition === "q.block_state('bld:double')");
    expect(dbl.components["minecraft:geometry"]).toBe("minecraft:geometry.full_block");
    expect(json("BP/loot_tables/blocks/bld_oak_slab_double.json").pools[0].entries[0].functions[0].count).toBe(2);
  });

  it("makes doors two blocks tall with open/closed models and top/bottom textures", () => {
    const d = block("oak_door");
    expect(d.description.states).toEqual({ "bld:open": [false, true], "bld:upper": [false, true] });
    expect(d.components["minecraft:geometry"].bone_visibility).toEqual({ closed: "!q.block_state('bld:open')", open: "q.block_state('bld:open')" });
    expect(d.components["minecraft:material_instances"]["*"].texture).toBe("bld_door_bottom");
    const upper = d.permutations.filter((p: any) => p.condition === "q.block_state('bld:upper')");
    expect(upper.some((p: any) => p.components["minecraft:material_instances"]?.["*"].texture === "bld_door_top")).toBe(true);
    expect(upper.some((p: any) => p.components["minecraft:loot"] === "loot_tables/empty.json")).toBe(true);
  });

  it("makes fences, walls and panes with connection states", () => {
    const f = block("oak_fence");
    expect(Object.keys(f.description.states)).toEqual(["bld:north", "bld:south", "bld:east", "bld:west"]);
    expect(f.components["minecraft:geometry"].bone_visibility.north).toBe("q.block_state('bld:north')");
  });

  it("makes projectiles with damage, fire, effects and the right look", () => {
    const shard = json("BP/entities/ruby_shard.json")["minecraft:entity"].components["minecraft:projectile"];
    expect(shard.on_hit.impact_damage).toMatchObject({ damage: { min: 4, max: 4 }, knockback: true, catch_fire: true });
    expect(shard.on_hit.mob_effect.effects[0]).toEqual({ effect: "slowness", amplifier: 1, durationeasy: 80, durationnormal: 80, durationhard: 80 });
    expect(shard.on_hit.remove_on_hit).toEqual({});
    const shardClient = json("RP/entity/ruby_shard.entity.json")["minecraft:client_entity"].description;
    expect(shardClient.geometry.default).toBe("geometry.item_sprite");
    const arrow = json("BP/entities/ruby_arrow_entity.json")["minecraft:entity"].components["minecraft:projectile"];
    expect(arrow.on_hit.stick_in_ground).toBeDefined();
    expect(json("RP/entity/ruby_arrow_entity.entity.json")["minecraft:client_entity"].description.geometry.default).toBe("geometry.arrow");
  });

  it("makes throwable items, ammo and bows", () => {
    const comps = (n: string) => json(`BP/items/${n}.json`)["minecraft:item"].components;
    expect(comps("shard_item")["minecraft:projectile"]).toEqual({ projectile_entity: "bld:ruby_shard" });
    expect(comps("shard_item")["minecraft:throwable"]).toBeDefined();
    expect(comps("ruby_arrow")["minecraft:projectile"].projectile_entity).toBe("bld:ruby_arrow_entity");
    const bow = comps("ruby_bow");
    expect(bow["minecraft:shooter"].ammunition.map((a: any) => a.item)).toEqual(["bld:ruby_arrow", "minecraft:arrow"]);
    expect(bow["minecraft:use_animation"]).toBe("bow");
    expect(bow["minecraft:durability"]).toEqual({ max_durability: 500 });
  });

  it("makes crops that grow in stages and plant from seeds", () => {
    const c = block("ruby_berry_bush");
    expect(c.description.states).toEqual({ "bld:growth": [0, 1, 2] });
    expect(c.permutations[2].components["minecraft:loot"]).toBe("loot_tables/blocks/bld_ruby_berry_bush_grown.json");
    const seeds = json("BP/items/ruby_berry_bush_seeds.json")["minecraft:item"].components;
    expect(seeds["minecraft:block_placer"]).toEqual({ block: "bld:ruby_berry_bush", use_on: ["minecraft:farmland"] });
    expect(json("BP/loot_tables/blocks/bld_ruby_berry_bush_grown.json").pools[0].entries[0].name).toBe("minecraft:sweet_berries");
  });

  it("generates scripts that type-check against @minecraft/server 2.1.0", () => {
    const js = files.get("BP/scripts/main.js") as string;
    for (const s of ["bcTakeHeld", "bcConnectAround", "onRandomTick(e)", "projectileHitEntity", "projectileHitBlock", "crop_growth_emitter"]) expect(js).toContain(s);
    expect(typecheckScript(js)).toEqual([]);
  });
});

describe("ranged item problems", () => {
  it("reports items that throw a projectile that doesn't exist", () => {
    const p = project();
    p.elements = p.elements.filter((e) => e.name !== "ruby_shard");
    const msgs = generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);
    expect(msgs.some((m) => m.includes("Throwing Shard") && m.includes("projectile"))).toBe(true);
  });
});

// The sample's textures are drawn on a canvas, which tests don't have.
vi.mock("../src/textures/procedural", async (orig) => ({
  ...(await orig<typeof import("../src/textures/procedural")>()),
  generateTexture: () => ({ dataUrl: PNG, width: 16, height: 16 }),
}));

describe("example project", () => {
  it("exports the Ruby Expansion sample without errors", async () => {
    const { exampleProject } = await import("../src/model/packs");
    const { files, warnings } = generateAddon(exampleProject(createProject("Example")));
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    expect(files.has("BP/blocks/ruby_brick_slab.json")).toBe(true);
    expect(files.has("BP/entities/ruby_shard.json")).toBe(true);
    expect(files.has("BP/items/ruby_berry_crop_seeds.json")).toBe(true);
    const { parseStructure } = await import("../src/export/structure");
    const shrine = parseStructure(files.get("BP/structures/ruby/ruby_shrine.mcstructure") as Uint8Array);
    expect(shrine.containers.map((c) => c.loot)).toEqual(["loot_tables/chests/ruby_ruby_shrine_loot.json"]);
    expect(shrine.counts[0][0]).toBe("minecraft:stone_bricks");
    expect(typecheckScript(files.get("BP/scripts/main.js") as string)).toEqual([]);
  });
});
