import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { parseLenientJson, parseLenientJsonWithNote } from "../src/vanilla/json";
import { VANILLA_MOBS, mobFileUrls, readTemplateFiles, soundsEntry, templateFields } from "../src/vanilla/templates";
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
    expect(generateAddon(p).warnings.some((w) => w.level === "error" && w.message.includes("has no template files yet"))).toBe(true);
  });
});

describe("squashed and mismatched template files", () => {
  // Like a file whose lines were joined: the // comment would swallow the rest of the line.
  const squashed = `{ "minecraft:entity": { "description": { "identifier": "minecraft:test_mob" }, "components": { "minecraft:health": { "value": 10 } }, // a note without quotes "events": { "grow": { "add": {} } } } }`;
  const clientFor = (id: string) => JSON.stringify({ format_version: "1.10.0", "minecraft:client_entity": { description: { identifier: id } } });

  it("recovers a file whose comments were squashed onto one line", () => {
    const r = parseLenientJsonWithNote(squashed);
    expect(r.repaired).toBe(true);
    expect((r.value as any)["minecraft:entity"].events.grow).toBeDefined();
    expect(parseLenientJsonWithNote(behavior).repaired).toBe(false);
  });

  it("accepts the two files in either order and notes the repair", () => {
    const t = readTemplateFiles([{ name: "test.entity.json", text: clientFor("minecraft:test_mob") }, { name: "test.json", text: squashed }]);
    expect(t.base).toBe("minecraft:test_mob");
    expect(JSON.parse(t.behavior)["minecraft:entity"].events.grow).toBeDefined();
    expect(t.notes.join(" ")).toContain("squashed onto one line");
  });

  it("explains files for different mobs, or files that aren't mob files", () => {
    expect(() => readTemplateFiles([{ name: "a.json", text: behavior }, { name: "b.entity.json", text: clientFor("minecraft:cat") }])).toThrow(/different mobs/);
    expect(() => readTemplateFiles([{ name: "x.json", text: "{}" }])).toThrow(/isn't a mob file/);
    expect(() => readTemplateFiles([{ name: "a.json", text: behavior }])).toThrow(/resource file is missing/);
  });

  it("points breeding, offspring and spawned babies at the copy", () => {
    const { p, m } = make();
    const b = parseLenientJson(m.vanillaBehavior!) as any;
    b["minecraft:entity"].components["minecraft:breedable"] = { breeds_with: { "minecraft:test_mob": {} } };
    b["minecraft:entity"].components["minecraft:offspring"] = { offspring_pairs: { "minecraft:test_mob": "minecraft:test_mob" } };
    b["minecraft:entity"].component_groups.baby["minecraft:spawn_entity"] = { entities: { spawn_entity: "minecraft:test_mob", spawn_event: "minecraft:entity_born" } };
    m.vanillaBehavior = JSON.stringify(b);
    const out = JSON.parse(generateAddon(p).files.get("BP/entities/grave_walker.json") as string)["minecraft:entity"];
    expect(out.components["minecraft:breedable"].breeds_with).toEqual({ "tmpl:grave_walker": {} });
    expect(out.components["minecraft:offspring"].offspring_pairs).toEqual({ "tmpl:grave_walker": "tmpl:grave_walker" });
    expect(out.component_groups.baby["minecraft:spawn_entity"].entities).toEqual({ spawn_entity: "tmpl:grave_walker", spawn_event: "minecraft:entity_born" });
    expect(out.description.runtime_identifier).toBe("minecraft:test_mob");
  });
});
