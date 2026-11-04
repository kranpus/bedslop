import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { modelBounds } from "../src/export/content";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { Project } from "../src/model/types";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

function blocksProject(): Project {
  const p = createProject("Redstone Lab");
  p.namespace = "lab";
  p.scriptApi = "2.11.0";
  p.minEngine = [1, 26, 60];
  const tex = (name: string) => {
    p.textures.push({ id: name, name, kind: "block", width: 16, height: 16, dataUrl: PNG });
    return name;
  };

  const lever = createElement("block", "power_switch", "Power Switch");
  lever.textures.all = tex("switch_off");
  lever.redstonePower = 15;
  lever.redstoneMode = "toggle";
  lever.litWhenPowered = true;
  lever.litLevel = 7;
  lever.poweredTexture = tex("switch_on");
  lever.rotation = "facing";

  const source = createElement("block", "power_block", "Power Block");
  source.textures.all = tex("power");
  source.redstonePower = 9;

  const lamp = createElement("block", "ruby_lamp", "Ruby Lamp");
  lamp.textures.all = tex("lamp_off");
  lamp.redstoneInput = true;
  lamp.litWhenPowered = true;
  lamp.poweredTexture = tex("lamp_on");
  lamp.passesPower = true;

  const bench = createElement("block", "ruby_bench", "Ruby Workbench");
  bench.textures.all = tex("bench");
  bench.function = "crafting";
  bench.tableName = "Ruby Workbench";

  const chest = createElement("block", "ruby_chest", "Ruby Chest");
  chest.textures.all = tex("chest");
  chest.function = "storage";
  chest.slotCount = 54;
  chest.geometry = "custom";
  chest.collision = "model";
  chest.customGeometry = JSON.stringify({
    format_version: "1.12.0",
    "minecraft:geometry": [{ description: { identifier: "geometry.ruby_chest", texture_width: 64, texture_height: 64 }, bones: [
      { name: "body", pivot: [0, 0, 0], cubes: [{ origin: [-7, 0, -7], size: [14, 10, 14], uv: [0, 0] }, { origin: [-1, 7, -8], size: [2, 4, 1], uv: [0, 40] }] },
    ] }],
  });

  const ghost = createElement("block", "ghost_block", "Ghost Block");
  ghost.textures.all = tex("ghost");
  ghost.geometry = "custom";
  ghost.collision = "none";
  ghost.customGeometry = chest.customGeometry.replace("geometry.ruby_chest", "geometry.ghost");

  const recipe = createElement("recipe", "ruby_rod", "Ruby Rod");
  recipe.grid = ["minecraft:redstone", "", "", "minecraft:stick", "", "", "", "", ""];
  recipe.result = "minecraft:blaze_rod";
  recipe.stations = ["lab:ruby_bench"];

  const onPower = createElement("procedure", "lamp_on", "Lamp on");
  onPower.trigger = "redstone_on";
  onPower.filter = "lab:ruby_lamp";
  onPower.actions = [{ id: "a", type: "message", params: { text: "Lamp powered at {power}", to: "everyone" }, chance: 100 }];
  const anyOff = createElement("procedure", "any_off", "Any block off");
  anyOff.trigger = "redstone_off";
  anyOff.actions = [{ id: "b", type: "sound", params: { at: "block", sound: "random.click", volume: 1, pitch: 0.5 }, chance: 100 }];

  p.elements.push(lever, source, lamp, bench, chest, ghost, recipe, onPower, anyOff);
  return p;
}

describe("block functions and redstone", () => {
  const { files, warnings } = generateAddon(blocksProject());
  const block = (name: string) => JSON.parse(files.get(`BP/blocks/${name}.json`) as string);

  it("exports without problems on a 1.26.60 project", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("makes a lever-style switch that powers redstone and lights up when on", () => {
    const b = block("power_switch");
    expect(b.format_version).toBe("1.21.120");
    const desc = b["minecraft:block"].description;
    expect(desc.states).toEqual({ "lab:on": [false, true] });
    expect(b["minecraft:block"].components["lab:power_switch_logic"]).toEqual({});
    const on = b["minecraft:block"].permutations.find((p: { condition: string }) => p.condition === "q.block_state('lab:on')");
    expect(on.components["minecraft:redstone_producer"]).toEqual({ power: 15 });
    expect(on.components["minecraft:light_emission"]).toBe(7);
    expect(on.components["minecraft:material_instances"]["*"].texture).toBe("lab_switch_on");
    // Rotation permutations are kept alongside the "on" permutation.
    expect(b["minecraft:block"].permutations).toHaveLength(5);
  });

  it("makes constant power sources and redstone-reactive lamps", () => {
    expect(block("power_block")["minecraft:block"].components["minecraft:redstone_producer"]).toEqual({ power: 9 });
    const lamp = block("ruby_lamp");
    expect(lamp.format_version).toBe("1.26.0");
    expect(lamp["minecraft:block"].components["minecraft:redstone_consumer"]).toEqual({ min_power: 0, propagates_power: true });
  });

  it("makes crafting stations and recipes that only work there", () => {
    expect(block("ruby_bench")["minecraft:block"].components["minecraft:crafting_table"]).toEqual({ crafting_tags: ["lab:ruby_bench"], table_name: "Ruby Workbench" });
    const r = JSON.parse(files.get("BP/recipes/ruby_rod.json") as string)["minecraft:recipe_shaped"];
    expect(r.tags).toEqual(["lab:ruby_bench"]);
  });

  it("makes storage blocks with a native container and a fitted hitbox", () => {
    const c = block("ruby_chest");
    expect(c.format_version).toBe("1.26.20");
    expect(c["minecraft:block"].components["minecraft:block_entity"]).toEqual({ container: { slot_count: 54, title: "Ruby Chest" } });
    expect(c["minecraft:block"].components["minecraft:collision_box"]).toEqual({ origin: [-7, 0, -8], size: [14, 11, 15] });
    expect(block("ghost_block")["minecraft:block"].components["minecraft:collision_box"]).toBe(false);
  });

  it("generates block scripts that type-check against @minecraft/server 2.11.0", () => {
    const js = files.get("BP/scripts/main.js") as string;
    expect(js).toContain('registry.registerCustomComponent("lab:power_switch_logic"');
    expect(js).toContain("onRedstoneUpdate(e)");
    expect(js).toContain('const BC_REDSTONE = [{ run: proc_lamp_on, on: true, block: "lab:ruby_lamp" }, { run: proc_any_off, on: false, block: "" }];');
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });
});

describe("version requirements", () => {
  it("explains when the project targets a game version that's too old", () => {
    const p = blocksProject();
    p.scriptApi = "2.1.0";
    p.minEngine = [1, 21, 100];
    const msgs = generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);
    expect(msgs.some((m) => m.includes("storage blocks need Minecraft 1.26.60"))).toBe(true);
    expect(msgs.some((m) => m.includes("redstone input need Minecraft 1.26.0"))).toBe(true);
  });

  it("warns about redstone procedures with nothing to listen to", () => {
    const p = blocksProject();
    p.elements = p.elements.filter((e) => e.name !== "ruby_lamp");
    const msgs = generateAddon(p).warnings.map((w) => w.message);
    expect(msgs.some((m) => m.includes("listens for redstone on lab:ruby_lamp"))).toBe(true);
  });
});

describe("modelBounds", () => {
  it("clamps to the block and gives flat models some thickness", () => {
    const flat = JSON.stringify({ "minecraft:geometry": [{ bones: [{ cubes: [{ origin: [-8, 0, 0], size: [16, 16, 0] }] }] }] });
    expect(modelBounds(flat)).toEqual({ origin: [-8, 0, -0.5], size: [16, 16, 1] });
    const big = JSON.stringify({ "minecraft:geometry": [{ bones: [{ cubes: [{ origin: [-12, -4, -8], size: [24, 30, 16] }] }] }] });
    expect(modelBounds(big)).toEqual({ origin: [-8, 0, -8], size: [16, 16, 16] });
  });
});
