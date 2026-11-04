import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { potionLabel } from "../src/model/vanilla";

function project() {
  const p = createProject("Brew");
  p.namespace = "brw";
  const ruby = createElement("item", "ruby", "Ruby");
  const mix = createElement("recipe", "ruby_strength", "Ruby strength");
  Object.assign(mix, { recipeType: "brewing", brewMode: "mix", input: "minecraft:potion_type:awkward", reagent: "brw:ruby", result: "minecraft:potion_type:strong_strength" });
  const bottle = createElement("recipe", "ruby_splash", "Ruby splash");
  Object.assign(bottle, { recipeType: "brewing", brewMode: "container", input: "minecraft:potion", reagent: "brw:ruby", result: "minecraft:splash_potion" });
  p.elements.push(ruby, mix, bottle);
  return p;
}

describe("brewing recipes", () => {
  const { files, warnings } = generateAddon(project());
  const json = (n: string) => JSON.parse(files.get(`BP/recipes/${n}.json`) as string);

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("writes potion mixes and bottle changes like the vanilla ones", () => {
    expect(json("ruby_strength")).toEqual({
      format_version: "1.20.10",
      "minecraft:recipe_brewing_mix": {
        description: { identifier: "brw:ruby_strength" }, tags: ["brewing_stand"],
        input: "minecraft:potion_type:awkward", reagent: "brw:ruby", output: "minecraft:potion_type:strong_strength",
      },
    });
    expect(json("ruby_splash")["minecraft:recipe_brewing_container"]).toMatchObject({ input: "minecraft:potion", output: "minecraft:splash_potion" });
  });

  it("rejects custom potion results and missing ingredients", () => {
    const p = project();
    const mix = p.elements.find((e) => e.name === "ruby_strength");
    if (mix?.kind === "recipe") { mix.result = "brw:ruby_potion"; }
    const bottle = p.elements.find((e) => e.name === "ruby_splash");
    if (bottle?.kind === "recipe") bottle.reagent = "";
    const msgs = generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);
    expect(msgs.some((m) => m.includes(`"brw:ruby_potion" isn't one`))).toBe(true);
    expect(msgs.some((m) => m.includes("needs an ingredient"))).toBe(true);
  });

  it("names potions readably", () => {
    expect(potionLabel("minecraft:potion_type:long_nightvision")).toBe("Potion of night vision (long)");
    expect(potionLabel("minecraft:potion_type:strong_healing")).toBe("Potion of healing II");
    expect(potionLabel("minecraft:potion_type:awkward")).toBe("Awkward potion");
    expect(potionLabel("minecraft:lingering_potion")).toBe("Lingering potion");
  });
});
