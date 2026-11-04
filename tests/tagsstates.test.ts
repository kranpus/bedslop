import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { Project } from "../src/model/types";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

function project(): Project {
  const p = createProject("Lamps");
  p.namespace = "lmp";
  for (const n of ["lamp_off", "lamp_red", "lamp_blue"]) p.textures.push({ id: n, name: n, kind: "block", width: 16, height: 16, dataUrl: PNG });

  const lamp = createElement("block", "lamp", "Lamp");
  lamp.textures.all = "lamp_off";
  lamp.tags = ["lmp:lights", "#minecraft:stone", "lmp:lights"];
  lamp.customStates = [
    { name: "lit", type: "bool" },
    { name: "colour", type: "enum", options: ["Red", "blue"] },
    { name: "level", type: "int", min: 0, max: 3 },
  ];
  lamp.stateRules = [
    { id: "a", when: [{ state: "lit", value: "true" }], light: 15 },
    { id: "b", when: [{ state: "lit", value: "true" }, { state: "colour", value: "red" }], texture: "lamp_red", mapColor: "#ff0000" },
    { id: "c", when: [{ state: "level", value: "3" }], noCollision: true, hardness: 0.5, friction: 0.98 },
  ];

  const plank = createElement("item", "ruby_plank", "Ruby Plank");
  plank.tags = ["minecraft:planks"];
  const sword = createElement("tool", "ruby_blade", "Ruby Blade");
  sword.toolType = "sword";
  sword.tags = ["lmp:magic"];
  const pie = createElement("food", "pie", "Pie");
  pie.tags = ["lmp:sweets"];

  const recipe = createElement("recipe", "stick_from_planks", "Sticks");
  recipe.grid = ["#minecraft:planks", "", "", "#minecraft:planks", "", "", "", "", ""];
  recipe.result = "minecraft:stick";

  const proc = createElement("procedure", "toggle_lamp", "Toggle lamp");
  proc.trigger = "block_interact";
  proc.filter = "lmp:lamp";
  proc.conditions = [
    { id: "c1", type: "block_has_tag", params: { tag: "lmp:lights" }, negate: false },
    { id: "c2", type: "holding_tag", params: { tag: "lmp:magic" }, negate: true },
    { id: "c3", type: "block_state_is", params: { state: "lit", value: "false" }, negate: false },
  ];
  proc.actions = [
    { id: "a1", type: "set_block_state", params: { at: "block", state: "lit", value: "true" }, chance: 100 },
    { id: "a2", type: "cycle_block_state", params: { at: "block", state: "colour" }, chance: 100 },
  ];
  p.elements.push(lamp, plank, sword, pie, recipe, proc);
  return p;
}

describe("tags", () => {
  const { files, warnings } = generateAddon(project());
  const item = (n: string) => JSON.parse(files.get(`BP/items/${n}.json`) as string)["minecraft:item"].components["minecraft:tags"].tags;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });
  it("tags blocks (cleaned and de-duplicated) and every kind of item", () => {
    const c = JSON.parse(files.get("BP/blocks/lamp.json") as string)["minecraft:block"].components;
    expect(c["tag:lmp:lights"]).toEqual({});
    expect(c["tag:minecraft:stone"]).toEqual({});
    expect(item("ruby_plank")).toEqual(["minecraft:planks"]);
    expect(item("ruby_blade")).toEqual(expect.arrayContaining(["minecraft:is_sword", "lmp:magic"]));
    expect(item("pie")).toEqual(["minecraft:is_food", "lmp:sweets"]);
  });
  it("accepts #tags as recipe ingredients", () => {
    const r = JSON.parse(files.get("BP/recipes/stick_from_planks.json") as string)["minecraft:recipe_shaped"];
    expect(r.key.A).toEqual({ tag: "minecraft:planks" });
  });
});

describe("custom block states", () => {
  const { files } = generateAddon(project());
  const block = JSON.parse(files.get("BP/blocks/lamp.json") as string)["minecraft:block"];

  it("declares the states with their values", () => {
    expect(block.description.states).toEqual({ "lmp:lit": [false, true], "lmp:colour": ["red", "blue"], "lmp:level": [0, 1, 2, 3] });
  });
  it("turns rules into permutations", () => {
    const perms = block.permutations;
    expect(perms[0]).toEqual({ condition: "q.block_state('lmp:lit')", components: { "minecraft:light_emission": 15 } });
    expect(perms[1].condition).toBe("q.block_state('lmp:lit') && q.block_state('lmp:colour') == 'red'");
    expect(perms[1].components["minecraft:material_instances"]["*"].texture).toBe("lmp_lamp_red");
    expect(perms[2]).toEqual({ condition: "q.block_state('lmp:level') == 3", components: {
      "minecraft:destructible_by_mining": { seconds_to_destroy: 0.5 }, "minecraft:collision_box": false, "minecraft:friction": 0.9,
    } });
  });
  it("sets, cycles and tests states and tags from procedures with a script that type-checks", () => {
    const js = files.get("BP/scripts/main.js") as string;
    for (const s of [`BC.setState(ctx, "block", String("lit"), "true")`, `BC.cycleState(ctx, "block", String("colour"))`, `BC.blockAt(ctx, "block")?.hasTag(String("lmp:lights"))`, `BC.heldStack(ctx.player)?.hasTag`, `BC.getState(ctx, "block", String("lit"))`]) {
      expect(js).toContain(s);
    }
    expect(typecheckScript(js)).toEqual([]);
  });
  it("reports bad names, clashes and rules on unknown values", () => {
    const p = project();
    const lamp = p.elements.find((e) => e.kind === "block")!;
    if (lamp.kind !== "block") return;
    lamp.redstoneMode = "toggle";
    lamp.redstonePower = 15;
    lamp.customStates = [{ name: "Bad Name", type: "bool" }, { name: "on", type: "bool" }, { name: "colour", type: "enum", options: ["red", "blue"] }];
    lamp.stateRules = [{ id: "x", when: [{ state: "colour", value: "green" }], light: 3 }];
    const msgs = generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);
    expect(msgs.some((m) => m.includes(`"Bad Name"`))).toBe(true);
    expect(msgs.some((m) => m.includes(`"on" is already used`))).toBe(true);
    expect(msgs.some((m) => m.includes("colour = green"))).toBe(true);
  });
});
