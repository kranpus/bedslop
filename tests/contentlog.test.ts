import { describe, expect, it, vi } from "vitest";
import { generateAddon } from "../src/export/generate";
import { compareVersion } from "../src/export/context";
import { exampleProject } from "../src/model/packs";
import { createProject } from "../src/model/project";
import type { BlockElement } from "../src/model/types";
import { PNG } from "./fixture";

vi.mock("../src/textures/procedural", async (orig) => ({
  ...(await orig<typeof import("../src/textures/procedural")>()),
  generateTexture: () => ({ dataUrl: PNG, width: 16, height: 16 }),
}));

// Errors Minecraft's content log reported for the example with a storage block (1.26.60).
describe("content log errors from the game", () => {
  const p = exampleProject(createProject("Ruby"));
  p.scriptApi = "2.11.0";
  p.minEngine = [1, 26, 60];
  p.elements = p.elements.map((e) => (e.kind === "block" && (e.name === "ruby_block" || e.name === "ruby_workbench")
    ? { ...e, tags: e.name === "ruby_block" ? ["stone"] : e.tags, containerTitle: e.displayName, function: "storage", slotCount: 9, containerLayout: { enabled: true, slots: [], showTitle: true, titleX: 0, titleY: 0, titleColor: "#404040" } } as BlockElement
    : e));
  const { files, warnings } = generateAddon(p);
  const json = (f: string) => JSON.parse(files.get(f) as string);

  it("exports without errors", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("uses minecraft:tags (not tag: components) in block format 1.26.20+", () => {
    let checked = 0;
    for (const f of [...files.keys()].filter((k) => k.startsWith("BP/blocks/"))) {
      const doc = json(f);
      if (compareVersion(doc.format_version, "1.26.20") < 0) continue;
      checked++;
      const all = [doc["minecraft:block"].components, ...(doc["minecraft:block"].permutations ?? []).map((x: { components: object }) => x.components)];
      for (const c of all) expect(Object.keys(c).filter((k) => k.startsWith("tag:")), f).toEqual([]);
    }
    expect(checked).toBeGreaterThanOrEqual(2);
    const block = json("BP/blocks/ruby_block.json")["minecraft:block"].components;
    expect(block["minecraft:tags"]).toEqual(expect.arrayContaining(["stone", "minecraft:is_pickaxe_item_destructible"]));
    const bench = json("BP/blocks/ruby_workbench.json")["minecraft:block"].components;
    expect(Array.isArray(bench["minecraft:tags"])).toBe(true);
  });

  it("gives every crafting and stonecutter recipe unlock data", () => {
    let checked = 0;
    for (const f of [...files.keys()].filter((k) => k.startsWith("BP/recipes/"))) {
      const doc = json(f);
      const r = doc["minecraft:recipe_shaped"] ?? doc["minecraft:recipe_shapeless"];
      if (!r) continue;
      checked++;
      expect(r.unlock?.length, f).toBeGreaterThan(0);
    }
    expect(checked).toBeGreaterThan(10);
    expect(json("BP/recipes/ruby_pickaxe_recipe.json")["minecraft:recipe_shaped"].unlock).toEqual([{ item: "ruby:ruby" }, { item: "minecraft:stick" }]);
  });
});
