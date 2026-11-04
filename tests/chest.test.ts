import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

const cube = (origin: number[], size: number[]) => ({ origin, size, uv: [0, 0] });
/** A chest model like a Blockbench export: body, shut lid and raised lid. */
const MODEL = JSON.stringify({
  format_version: "1.12.0",
  "minecraft:geometry": [{
    description: { identifier: "geometry.pa_custom_chest", texture_width: 64, texture_height: 64 },
    bones: [
      { name: "body", pivot: [0, 0, 0], cubes: [cube([-7, 0, -7], [14, 10, 14])] },
      { name: "top_closed", pivot: [0, 9, 7], cubes: [cube([-7, 9, -7], [14, 5, 14])] },
      { name: "top_opened", pivot: [0, 9, 7], rotation: [-80, 0, 0], cubes: [cube([-7, 9, -7], [14, 5, 14])] },
    ],
  }],
});

describe("chests that open (like pa:custom_chest)", () => {
  const p = createProject("Chests");
  p.namespace = "pa";
  p.scriptApi = "2.11.0";
  p.minEngine = [1, 26, 60];
  p.textures.push({ id: "t", name: "pa_custom_chest", kind: "block", width: 16, height: 16, dataUrl: PNG });
  const chest = createElement("block", "custom_chest", "Custom Chest");
  chest.textures = { all: "t" };
  Object.assign(chest, {
    geometry: "custom", customGeometry: MODEL, rotation: "facing", renderMethod: "alpha_test", hardness: 2, explosionResistance: 30,
    lightDampening: 0, friction: 0.4, tags: ["wood"], function: "storage", slotCount: 9,
    lid: { enabled: true, closedParts: ["top_closed"], openParts: ["top_opened"], openSound: "random.chestopen", closeSound: "random.chestclosed" },
  });
  p.elements.push(chest);
  const { files, warnings } = generateAddon(p);
  const block = JSON.parse(files.get("BP/blocks/custom_chest.json") as string)["minecraft:block"];
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("matches the hand-made block: opened state, facing, lid parts and a 9-slot container", () => {
    expect(block.description.identifier).toBe("pa:custom_chest");
    expect(block.description.states["pa:opened"]).toEqual([false, true]);
    expect(block.description.traits["minecraft:placement_direction"]).toEqual({ enabled_states: ["minecraft:cardinal_direction"], y_rotation_offset: 180 });
    expect(block.components["minecraft:geometry"]).toEqual({
      identifier: "geometry.pa_custom_chest",
      bone_visibility: { top_closed: "!(q.block_state('pa:opened'))", top_opened: "!(!q.block_state('pa:opened'))" },
    });
    expect(block.components["minecraft:block_entity"].container.slot_count).toBe(9);
    const turns = block.permutations.filter((x: { components: object }) => "minecraft:transformation" in x.components);
    expect(turns).toHaveLength(4);
  });

  it("opens and closes the lid from container events, counting viewers", () => {
    expect(js).toContain(`const BC_LIDS = {"pa:custom_chest":["random.chestopen","random.chestclosed"]};`);
    expect(js).toContain(`const BC_LID_STATE = "pa:opened";`);
    expect(js).toContain("world.afterEvents.blockContainerOpened.subscribe(");
    expect(js).toContain("world.afterEvents.blockContainerClosed.subscribe(");
    expect(js).toContain("world.afterEvents.playerBreakBlock.subscribe(");
  });

  it("type-checks against @minecraft/server 2.11.0", () => {
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("warns about lid parts that aren't in the model", () => {
    const q = { ...p, elements: [{ ...chest, lid: { ...chest.lid!, openParts: ["lid_up"] } }] };
    expect(generateAddon(q).warnings.some((w) => w.message.includes(`"lid_up"`))).toBe(true);
  });
});
