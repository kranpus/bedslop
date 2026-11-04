import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { emptyLibrary, importIntoLibrary, libraryMob, libraryMobIds } from "../src/vanilla/library";
import { templateFromLibrary } from "../src/vanilla/templates";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";

// Stand-in packs shaped like Minecraft's vanilla packs (not copies of them).
const bpEntity = (id: string, health = true) => JSON.stringify({ format_version: "1.21.0", "minecraft:entity": { description: { identifier: id }, components: health ? { "minecraft:health": { value: 12 }, "minecraft:movement": { value: 0.3 } } : {} } });
const client = (id: string, format: string, geo: string) => `{ "format_version": "${format}", // comment like Mojang's
  "minecraft:client_entity": { "description": { "identifier": "${id}", "textures": { "default": "textures/entity/thing/thing" }, "geometry": { "default": "${geo}" } } } }`;
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

async function packs() {
  const bp = new JSZip();
  bp.file("vanilla_bp/entities/thing.json", bpEntity("minecraft:thing"));
  bp.file("vanilla_bp/entities/arrow.json", bpEntity("minecraft:arrow", false));
  bp.file("vanilla_bp/loot_tables/entities/thing.json", "{}");
  const rp = new JSZip();
  rp.file("vanilla_rp/entity/thing.v1.0.entity.json", client("minecraft:thing", "1.8.0", "geometry.thing.old"));
  rp.file("vanilla_rp/entity/thing.entity.json", client("minecraft:thing", "1.10.0", "geometry.thing"));
  rp.file("vanilla_rp/models/entity/thing.geo.json", JSON.stringify({ format_version: "1.8.0", "geometry.thing": { texturewidth: 16, textureheight: 16, bones: [] } }));
  rp.file("vanilla_rp/sounds.json", JSON.stringify({ entity_sounds: { entities: { thing: { events: { ambient: "mob.thing.say" } } } } }));
  rp.file("vanilla_rp/textures/entity/thing/thing.png", PNG);
  rp.file("vanilla_rp/textures/entity/other/unused.png", PNG);
  return [
    { name: "Vanilla_Behavior_Pack.zip", data: await bp.generateAsync({ type: "uint8array" }) },
    { name: "Vanilla_Resource_Pack.zip", data: await rp.generateAsync({ type: "uint8array" }) },
  ];
}

describe("imported Minecraft packs", () => {
  it("collects behaviour, newest look, model, sounds and default texture per mob", async () => {
    const lib = emptyLibrary();
    const report = await importIntoLibrary(lib, await packs());
    expect(report.problems).toEqual([]);
    expect(libraryMobIds(lib)).toEqual(["minecraft:thing"]); // arrows have no health: not a mob
    const m = libraryMob(lib, "minecraft:thing")!;
    expect(m.client).toContain("geometry.thing\""); // newest client file, not v1.0
    expect(m.geometry).toContain("geometry.thing");
    expect(m.texture).toMatch(/^data:image\/png;base64,/);
    expect(m.sounds).toContain("mob.thing.say");
    expect(Object.keys(lib.textures)).toEqual(["textures/entity/thing/thing"]); // unused textures skipped
  });

  it("works when the packs are added one at a time, and explains missing ones", async () => {
    const [bp, rp] = await packs();
    const lib = emptyLibrary();
    await importIntoLibrary(lib, [bp]);
    expect(libraryMobIds(lib)).toEqual([]);
    await importIntoLibrary(lib, [rp]);
    expect(libraryMobIds(lib)).toEqual(["minecraft:thing"]);
    const bad = await importIntoLibrary(emptyLibrary(), [{ name: "notes.zip", data: await new JSZip().file("readme.txt", "hi").generateAsync({ type: "uint8array" }) }]);
    expect(bad.problems.join(" ")).toContain("No mob files were found");
  });

  it("makes a working template from the library", async () => {
    const lib = emptyLibrary();
    await importIntoLibrary(lib, await packs());
    const p = createProject("Lib");
    p.namespace = "lib";
    const m = createElement("entity", "my_thing", "My Thing");
    Object.assign(m, templateFromLibrary(lib, "minecraft:thing", libraryMob));
    p.elements.push(m);
    const { files, warnings } = generateAddon(p);
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    expect(m.health).toBe(12);
    expect(JSON.parse(files.get("RP/sounds.json") as string).entity_sounds.entities["lib:my_thing"]).toBeDefined();
  });
});
