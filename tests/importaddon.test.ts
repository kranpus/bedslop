import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { generateAddon } from "../src/export/generate";
import { applyImport, importAddon, looseJson } from "../src/import/addon";
import { exampleProject } from "../src/model/packs";
import { createProject } from "../src/model/project";
import type { BlockElement, FoodElement, ItemElement, LootElement, RecipeElement } from "../src/model/types";
import { PNG } from "./fixture";

/** Zips an export the way the app does (one folder per pack). */
async function zipOf(files: Map<string, string | Uint8Array>, nested = false): Promise<Uint8Array> {
  const zip = new JSZip();
  if (!nested) {
    for (const [path, content] of files) { const [side, ...rest] = path.split("/"); zip.file(`Ruby ${side}/${rest.join("/")}`, content); }
  } else {
    for (const side of ["BP", "RP"]) {
      const pack = new JSZip();
      for (const [path, content] of files) if (path.startsWith(side + "/")) pack.file(path.slice(3), content);
      zip.file(`ruby_${side}.mcpack`, await pack.generateAsync({ type: "uint8array" }));
    }
  }
  return zip.generateAsync({ type: "uint8array" });
}
// The example's textures are drawn on a canvas, which tests don't have.
vi.mock("../src/textures/procedural", async (orig) => ({
  ...(await orig<typeof import("../src/textures/procedural")>()),
  generateTexture: () => ({ dataUrl: PNG, width: 16, height: 16 }),
}));

const pngBytes = () => Uint8Array.from(atob(PNG.split(",")[1]), (c) => c.charCodeAt(0));

describe("importing add-ons", () => {
  it("reads JSON with comments and trailing commas", () => {
    expect(looseJson(`{ // note\n "a": [1, 2,], /* x */ "b": "http://x" , }`)).toEqual({ a: [1, 2], b: "http://x" });
  });

  it("round-trips the example add-on", async () => {
    const original = exampleProject(createProject("Ruby"));
    const { files } = generateAddon(original);
    const r = await importAddon(await zipOf(files as Map<string, string | Uint8Array>));
    expect(r.namespace).toBe("ruby");
    expect(r.report.packs).toHaveLength(2);
    const blocks = r.elements.filter((e): e is BlockElement => e.kind === "block");
    const ore = blocks.find((b) => b.name === "ruby_ore")!;
    expect(ore.displayName).toBe("Ruby Ore");
    expect(ore.textures.all).toBeTruthy();
    expect(r.textures.find((t) => t.id === ore.textures.all)!.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(ore.drops).toBe("loot");
    expect(r.elements.find((e) => e.id === ore.lootTable)?.kind).toBe("loot");
    const lamp = blocks.find((b) => b.name === "ruby_lamp")!;
    expect(lamp.customStates).toEqual([{ name: "lit", type: "bool" }]);
    expect(r.report.notes.some((n) => n.includes("ruby:ruby_lamp") && n.includes("permutation"))).toBe(true);
    const wand = r.elements.find((e): e is ItemElement => e.kind === "item" && e.name === "ruby_wand")!;
    expect(wand.displayName).toBe("Ruby Wand");
    expect(wand.texture).toBeTruthy();
    const pick = r.elements.find((e) => e.kind === "tool" && e.name === "ruby_pickaxe");
    expect(pick).toMatchObject({ toolType: "pickaxe", tier: "diamond", repairItem: "ruby:ruby" });
    expect(r.elements.find((e) => e.kind === "tool" && e.name === "ruby_sword")).toMatchObject({ toolType: "sword" });
    expect(r.report.notes.filter((n) => n.startsWith("Block ruby:ruby_brick_slab:"))).toHaveLength(1);
    const berry = r.elements.find((e): e is FoodElement => e.kind === "food" && e.name === "ruby_berry")!;
    expect(berry.nutrition).toBeGreaterThan(0);
    const recipes = r.elements.filter((e): e is RecipeElement => e.kind === "recipe");
    expect(recipes.some((x) => x.recipeType === "shaped" && x.result === "ruby:ruby_pickaxe" && x.grid.filter(Boolean).length === 5)).toBe(true);
    expect(recipes.some((x) => x.recipeType === "furnace" && x.input === "ruby:ruby_ore")).toBe(true);
    expect(recipes.some((x) => x.recipeType === "brewing" && x.input === "minecraft:potion_type:awkward")).toBe(true);
    const loot = r.elements.filter((e): e is LootElement => e.kind === "loot");
    expect(loot.some((l) => l.pools[0]?.entries.some((e) => e.item === "ruby:ruby"))).toBe(true);
    expect(r.elements.some((e) => e.kind === "structure")).toBe(true);
    expect(r.report.skipped.some((s) => s.includes("mob"))).toBe(true);
    expect(r.report.skipped.some((s) => s.includes("Scripts"))).toBe(true);
    // The imported project exports again.
    const again = generateAddon(applyImport(createProject("x"), r));
    expect(again.files.has("BP/blocks/ruby_ore.json")).toBe(true);
  });

  it("opens an .mcaddon holding .mcpack files", async () => {
    const { files } = generateAddon(exampleProject(createProject("Ruby")));
    const r = await importAddon(await zipOf(files as Map<string, string | Uint8Array>, true));
    expect(r.report.packs).toHaveLength(2);
    expect(r.elements.some((e) => e.kind === "block" && e.name === "ruby_ore")).toBe(true);
  });

  it("imports a hand-made chest block with a model, facing and a 9-slot container", async () => {
    const zip = new JSZip();
    zip.file("BP/manifest.json", JSON.stringify({ format_version: 2, header: { name: "Chests BP", uuid: "a", version: [1, 0, 0] }, modules: [{ type: "data", uuid: "b", version: [1, 0, 0] }] }));
    zip.file("RP/manifest.json", JSON.stringify({ format_version: 2, header: { name: "Chests RP", uuid: "c", version: [1, 0, 0] }, modules: [{ type: "resources", uuid: "d", version: [1, 0, 0] }] }));
    zip.file("BP/blocks/pa_custom_chest.json", `{
      "format_version": "1.26.20",
      "minecraft:block": {
        "description": { "identifier": "pa:custom_chest", "menu_category": { "category": "items", "group": "minecraft:itemGroup.name.chest" },
          "states": { "custom_chest:opened": [false, true] },
          "traits": { "minecraft:placement_direction": { "enabled_states": ["minecraft:cardinal_direction"], "y_rotation_offset": 180 } } },
        "components": {
          "minecraft:geometry": { "identifier": "geometry.pa_custom_chest", "bone_visibility": { "top_closed": "!q.block_state('custom_chest:opened')" } },
          "minecraft:material_instances": { "*": { "texture": "pa_custom_chest", "render_method": "alpha_test" } },
          "minecraft:destructible_by_mining": { "seconds_to_destroy": 2.0 },
          "minecraft:destructible_by_explosion": { "explosion_resistance": 30.0 },
          "minecraft:light_dampening": 0, "minecraft:friction": 0.4, "minecraft:map_color": "#FFFFFF",
          "minecraft:block_entity": { "container": { "slot_count": 9 } },
          "minecraft:tags": ["wood"],
        },
        "permutations": [{ "condition": "query.block_state('minecraft:cardinal_direction') == 'south'", "components": { "minecraft:transformation": { "rotation": [0, 180, 0] } } }]
      }
    }`);
    zip.file("RP/textures/terrain_texture.json", JSON.stringify({ texture_data: { pa_custom_chest: { textures: "textures/blocks/pa_custom_chest" } } }));
    zip.file("RP/textures/blocks/pa_custom_chest.png", pngBytes());
    zip.file("RP/models/blocks/chest.geo.json", JSON.stringify({ format_version: "1.12.0", "minecraft:geometry": [{ description: { identifier: "geometry.pa_custom_chest" }, bones: [{ name: "top_closed" }] }] }));
    zip.file("RP/texts/en_US.lang", "tile.pa:custom_chest.name=Custom Chest\n");
    zip.file("BP/functions/pa_custom_chest.mcfunction", "give @s pa:custom_chest\n");
    zip.file("BP/scripts/chests_trigger.js", "// lid script");
    const r = await importAddon(await zip.generateAsync({ type: "uint8array" }));
    expect(r.namespace).toBe("pa");
    const chest = r.elements.find((e): e is BlockElement => e.kind === "block")!;
    expect(chest).toMatchObject({ name: "custom_chest", displayName: "Custom Chest", rotation: "facing", geometry: "custom", function: "storage", slotCount: 9, hardness: 2, explosionResistance: 30, friction: 0.4, renderMethod: "alpha_test", category: "items" });
    expect(chest.customStates).toEqual([{ name: "opened", type: "bool" }]);
    expect(JSON.parse(chest.customGeometry)["minecraft:geometry"][0].description.identifier).toBe("geometry.pa_custom_chest");
    expect(r.textures).toHaveLength(1);
    expect(chest.textures.all).toBe(r.textures[0].id);
    expect(r.report.notes.some((n) => n.includes("visibility"))).toBe(true);
    expect(r.report.notes.some((n) => n.includes("permutation"))).toBe(false);
    expect(r.elements.find((e) => e.kind === "function")).toMatchObject({ name: "pa_custom_chest", body: "give @s pa:custom_chest\n" });
    expect(r.report.skipped.some((s) => s.includes("Scripts"))).toBe(true);
  });

  it("explains a file with no packs", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "hi");
    await expect(importAddon(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(/No behavior or resource pack/);
  });
});
