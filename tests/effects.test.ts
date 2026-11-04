import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { typecheckScript } from "./typecheck";

describe("custom potion effects", () => {
  const p = createProject("Brews");
  p.namespace = "brw";
  const rush = createElement("effect", "ruby_rush", "Ruby Rush");
  Object.assign(rush, { color: "c", maxLevel: 3, steps: [
    { id: "1", type: "vanilla", effect: "speed", stronger: true, amount: 0, perLevel: 0 },
    { id: "2", type: "heal", amount: 1, perLevel: 0.5 },
    { id: "3", type: "particles", particle: "minecraft:heart_particle", amount: 0, perLevel: 0 },
    { id: "4", type: "procedure", procedure: "tick", every: 3, amount: 0, perLevel: 0 },
    { id: "5", type: "on_end", procedure: "tick", amount: 0, perLevel: 0 },
  ] });
  const bleed = createElement("effect", "bleed", "Bleeding");
  Object.assign(bleed, { potion: false, milkCures: false, showTimer: false, steps: [{ id: "6", type: "damage", amount: 1, perLevel: 1 }] });
  const tick = createElement("procedure", "tick", "Tick");
  tick.trigger = "manual";
  const hit = createElement("procedure", "cut", "Cut");
  hit.trigger = "entity_hit";
  hit.conditions = [{ id: "c", type: "has_custom_effect", params: { who: "target", effect: "bleed" }, negate: true }];
  hit.actions = [
    { id: "a", type: "give_custom_effect", params: { who: "target", effect: "bleed", seconds: 5, level: 2 }, chance: 100 },
    { id: "b", type: "remove_custom_effect", params: { who: "player", effect: "ruby_rush" }, chance: 100 },
  ];
  p.elements.push(rush, bleed, tick, hit);
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("writes the effect table and a drinkable potion", () => {
    expect(js).toContain(`"ruby_rush": { title: "Ruby Rush", color: "c", max: 3, timer: true, left: true, milk: true, steps: [`);
    expect(js).toContain(`{ type: "procedure", amount: 0, per: 0, every: 3, run: (ctx) => proc_tick(ctx) }`);
    expect(js).toContain(`const BC_FX_POTIONS = {"brw:ruby_rush_potion":["ruby_rush",60,1]};`);
    const potion = JSON.parse(files.get("BP/items/ruby_rush_potion.json") as string)["minecraft:item"].components;
    expect(potion["minecraft:food"]).toMatchObject({ can_always_eat: true, using_converts_to: "minecraft:glass_bottle" });
    expect(potion["minecraft:use_animation"]).toBe("drink");
    expect(files.has("BP/items/bleed_potion.json")).toBe(false);
  });

  it("gives, removes and checks effects from procedures", () => {
    expect(js).toContain(`bcFxGive(BC.who(ctx, "target"), "bleed", 5, 2);`);
    expect(js).toContain(`bcFxRemove(BC.who(ctx, "player"), "ruby_rush");`);
    expect(js).toContain(`bcFxLevel(BC.who(ctx, "target"), "bleed") > 0`);
  });

  it("type-checks against @minecraft/server 2.1.0 and 2.11.0", () => {
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("reports missing effects and procedures, and still type-checks without effects", () => {
    const q = { ...p, elements: p.elements.filter((e) => e.kind !== "effect" && e.name !== "tick") };
    const out = generateAddon(q);
    expect(out.warnings.some((w) => w.level === "error" && w.message.includes(`custom effect "bleed"`))).toBe(true);
    expect(typecheckScript(out.files.get("BP/scripts/main.js") as string)).toEqual([]);
  });
});
