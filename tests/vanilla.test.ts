import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { parseLenientJson } from "../src/vanilla/json";
import { VANILLA_MOBS, mobFileUrls, soundsEntry, templateFields } from "../src/vanilla/templates";
import { PNG } from "./fixture";

// A small stand-in shaped like Mojang's files (comments, trailing commas), not a copy of one.
const behavior = `{
  "format_version": "1.21.0",
  "minecraft:entity": {
    "description": { "identifier": "minecraft:test_mob", "is_spawnable": true }, // spawnable
    "component_groups": { "baby": { "minecraft:is_baby": {} } },
    "components": {
      "minecraft:health": { "value": 20, "max": 20 },
      "minecraft:movement": { "value": 0.23 },
      "minecraft:attack": { "damage": 3 },
      "minecraft:collision_box": { "width": 0.6, "height": 1.9, }, // trailing comma
      "minecraft:type_family": { "family": ["test", "monster"] },
      "minecraft:loot": { "table": "loot_tables/entities/test_mob.json" }
    },
    "events": { "become_baby": { "add": { "component_groups": ["baby"] } } }
  }
}`;
const client = `{
  "format_version": "1.26.0",
  "minecraft:client_entity": { "description": {
    "identifier": "minecraft:test_mob",
    "materials": { "default": "zombie" },
    "textures": { "default": "textures/entity/zombie/zombie" },
    "geometry": { "default": "geometry.zombie" },
    "render_controllers": ["controller.render.zombie"],
    "spawn_egg": { "texture": "spawn_egg", "texture_index": 12 }
  } }
}`;
const sounds = `{ "entity_sounds": { "entities": { "test_mob": { "events": { "ambient": "mob.zombie.say" }, "volume": 1 } } } }`;

const make = () => {
  const p = createProject("Templates");
  p.namespace = "tmpl";
  const m = createElement("entity", "grave_walker", "Grave Walker");
  Object.assign(m, {
    model: "vanilla", vanillaBase: "minecraft:test_mob", vanillaBehavior: behavior, vanillaClient: client,
    vanillaSounds: soundsEntry(sounds, "minecraft:test_mob"), spawnEnabled: false, drops: [], families: [],
  }, templateFields(behavior, client));
  p.elements.push(m);
  return { p, m };
};

describe("lenient JSON", () => {
  it("handles comments, trailing commas and comment-like text inside strings", () => {
    expect(parseLenientJson(`{ "a": "http://x // not a comment", /* note */ "b": [1, 2,], }`)).toEqual({ a: "http://x // not a comment", b: [1, 2] });
  });
});

describe("vanilla mob templates", () => {
  it("indexes Minecraft's mobs with links to Mojang's own files", () => {
    expect(VANILLA_MOBS.length).toBeGreaterThan(80);
    const zombie = VANILLA_MOBS.find((m) => m.id === "minecraft:zombie")!;
    expect(mobFileUrls(zombie).behavior).toMatch(/^https:\/\/raw\.githubusercontent\.com\/Mojang\/bedrock-samples\/v[\d.]+\/behavior_pack\/entities\/zombie\.json$/);
    expect(zombie.rp).toBe("zombie.entity.json");
  });

  it("reads starting values from the template", () => {
    const { m } = make();
    expect(m).toMatchObject({ health: 20, speed: 0.23, attackDamage: 3, width: 0.6, height: 1.9 });
  });

  it("exports a renamed copy that keeps the original's behaviour, looks and sounds", () => {
    const { p, m } = make();
    m.health = 40;
    m.eggBase = "#112233";
    const { files, warnings } = generateAddon(p);
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    const bp = JSON.parse(files.get("BP/entities/grave_walker.json") as string)["minecraft:entity"];
    expect(bp.description).toMatchObject({ identifier: "tmpl:grave_walker", runtime_identifier: "minecraft:test_mob" });
    expect(bp.components["minecraft:health"]).toEqual({ value: 40, max: 40 });
    expect(bp.components["minecraft:loot"].table).toBe("loot_tables/entities/test_mob.json"); // original drops kept
    expect(bp.events.become_baby).toBeDefined();
    const cl = JSON.parse(files.get("RP/entity/grave_walker.entity.json") as string)["minecraft:client_entity"].description;
    expect(cl.identifier).toBe("tmpl:grave_walker");
    expect(cl.geometry.default).toBe("geometry.zombie"); // the game's own model
    expect(cl.spawn_egg).toEqual({ base_color: "#112233", overlay_color: m.eggOverlay });
    expect(JSON.parse(files.get("RP/sounds.json") as string).entity_sounds.entities["tmpl:grave_walker"].events.ambient).toBe("mob.zombie.say");
    expect(files.has("RP/models/entity/tmpl_grave_walker.geo.json")).toBe(false); // nothing of Mojang's copied
  });

  it("can reskin the mob and replace its drops", () => {
    const { p, m } = make();
    p.textures.push({ id: "skin", name: "grave_walker", kind: "entity", width: 64, height: 64, dataUrl: PNG });
    m.texture = "skin";
    m.drops = [{ item: "minecraft:bone", min: 1, max: 2, chance: 100 }];
    const { files } = generateAddon(p);
    const cl = JSON.parse(files.get("RP/entity/grave_walker.entity.json") as string)["minecraft:client_entity"].description;
    expect(cl.textures.default).toBe("textures/entity/tmpl_grave_walker");
    expect(JSON.parse(files.get("BP/entities/grave_walker.json") as string)["minecraft:entity"].components["minecraft:loot"].table).toBe("loot_tables/entities/tmpl_grave_walker.json");
  });

  it("reports a template whose files are missing", () => {
    const { p, m } = make();
    m.vanillaBehavior = "";
    expect(generateAddon(p).warnings.some((w) => w.level === "error" && w.message.includes("missing its behaviour or resource file"))).toBe(true);
  });
});
