import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { Project } from "../src/model/types";
import { typecheckScript } from "./typecheck";

function project(): Project {
  const p = createProject("Magic");
  p.namespace = "mag";
  const vampire = createElement("enchantment", "vampire", "Vampire");
  Object.assign(vampire, { maxLevel: 3, targets: ["sword", "axe"], effects: [
    { id: "a", when: "hit", type: "lifesteal", amount: 10, perLevel: 5 },
    { id: "b", when: "hit", type: "effect", effect: "wither", amount: 2, perLevel: 1, stronger: true },
    { id: "c", when: "hit", type: "procedure", procedure: "bite", amount: 0, perLevel: 0 },
  ] });
  const sight = createElement("enchantment", "ruby_sight", "Ruby Sight");
  Object.assign(sight, { maxLevel: 1, targets: ["helmet"], book: false, effects: [{ id: "d", when: "equipped", type: "self_effect", effect: "night_vision", amount: 0, perLevel: 0 }] });
  const miner = createElement("enchantment", "wisdom", "Wisdom");
  Object.assign(miner, { targets: ["pickaxe"], extraItems: ["mag:ruby_drill"], effects: [
    { id: "e", when: "break", type: "xp", amount: 1, perLevel: 1 },
    { id: "f", when: "hit", type: "damage", amount: 2, perLevel: 1 },
  ] });
  const bite = createElement("procedure", "bite", "Bite");
  bite.trigger = "manual";
  bite.actions = [{ id: "x", type: "message", params: { text: "Bite!", to: "player" }, chance: 100 }];
  const cmd = createElement("procedure", "bless", "Bless");
  cmd.trigger = "item_use";
  cmd.filter = "minecraft:stick";
  cmd.conditions = [{ id: "c1", type: "held_enchant", params: { enchantment: "vampire", level: 2 }, negate: true }];
  cmd.actions = [{ id: "y", type: "enchant_held", params: { enchantment: "vampire", level: 0 }, chance: 100 }];
  p.elements.push(vampire, sight, miner, bite, cmd);
  return p;
}

describe("custom enchantments", () => {
  const { files, warnings } = generateAddon(project());
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("makes an enchanted book for each enchantment that wants one", () => {
    const book = JSON.parse(files.get("BP/items/vampire_book.json") as string)["minecraft:item"];
    expect(book.components["minecraft:max_stack_size"]).toEqual({ value: 1 });
    expect(book.components["minecraft:glint"]).toEqual({ value: true });
    expect(book.description.menu_category.group).toBe("minecraft:itemGroup.name.enchantedBook");
    expect(files.has("BP/items/ruby_sight_book.json")).toBe(false);
    const atlas = JSON.parse(files.get("RP/textures/item_texture.json") as string).texture_data;
    expect(atlas.mag_enchanted_book).toEqual({ textures: "textures/items/book_enchanted" });
    expect(files.get("RP/texts/en_US.lang")).toContain("item.mag:vampire_book.name=Vampire Book");
  });

  it("writes the enchantment table with scaling effects and procedure hooks", () => {
    expect(js).toContain(`"vampire": { title: "Vampire", max: 3, targets: ["sword","axe"]`);
    expect(js).toContain(`{ when: "hit", type: "effect", amount: 2, per: 1, effect: "wither", stronger: true }`);
    expect(js).toContain(`run: (ctx) => proc_bite(ctx)`);
    expect(js).toContain(`items: ["mag:ruby_drill"]`);
    for (const hook of ["entityHurt", "itemReleaseUse", "playerBreakBlock", "system.runInterval", "ActionFormData"]) expect(js).toContain(hook);
  });

  it("generates a script that type-checks against @minecraft/server 2.1.0 and 2.11.0", () => {
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("only adds the parts that are used", () => {
    const p = createProject("Plain");
    const e = createElement("enchantment", "sharp", "Sharp");
    e.book = false;
    p.elements.push(e);
    const out = generateAddon(p).files.get("BP/scripts/main.js") as string;
    expect(out).toContain("entityHurt");
    expect(out).not.toContain("runInterval");
    expect(out).not.toContain("ActionFormData");
  });

  it("reports missing procedures, effects and enchantments", () => {
    const p = project();
    p.elements = p.elements.filter((e) => e.name !== "bite" && e.name !== "vampire");
    const sight = p.elements.find((e) => e.name === "ruby_sight");
    if (sight?.kind === "enchantment") sight.effects[0].effect = "";
    const msgs = generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);
    expect(msgs.some((m) => m.includes(`enchantment "vampire"`))).toBe(true);
    expect(msgs.some((m) => m.includes("no effect chosen"))).toBe(true);
    const js2 = generateAddon(p).files.get("BP/scripts/main.js") as string;
    expect(typecheckScript(js2)).toEqual([]);
  });
});
