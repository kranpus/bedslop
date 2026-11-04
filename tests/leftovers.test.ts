import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { typecheckScript } from "./typecheck";

describe("command argument types", () => {
  const p = createProject("Cmd");
  p.namespace = "cmd";
  const c = createElement("command", "kit", "Kit");
  c.args = [
    { id: "1", name: "mode", type: "enum", optional: false, options: ["Easy", "hard", "hard"] },
    { id: "2", name: "thing", type: "item", optional: false },
    { id: "3", name: "floor", type: "block", optional: true },
    { id: "4", name: "mob", type: "entity_type", optional: true },
  ];
  c.actions = [{ id: "a", type: "message", params: { text: "{mode} {thing} {floor} {mob}", to: "player" }, chance: 100 }];
  p.elements.push(c);
  const js = generateAddon(p).files.get("BP/scripts/main.js") as string;

  it("registers option lists as enums and passes ids for items, blocks and mob types", () => {
    expect(js).toContain(`registry.registerEnum("cmd:kit_mode", ["easy","hard"]);`);
    expect(js).toContain(`{ name: "cmd:kit_mode", type: CustomCommandParamType.Enum }`);
    expect(js).toContain(`{ name: "thing", type: CustomCommandParamType.ItemType }`);
    expect(js).toContain(`ctx.args["floor"] = floor.id;`);
    expect(js).toContain(`CustomCommandParamType.EntityType`);
  });

  it("type-checks", () => {
    expect(typecheckScript(js)).toEqual([]);
  });
});

describe("list blocks", () => {
  const txt = (t: string) => ({ shadow: { type: "text", fields: { TEXT: t } } });
  const get = (id: string) => ({ block: { type: "variables_get", fields: { VAR: { id } } } });
  const p = createProject("Lists");
  const proc = createElement("procedure", "roll", "Roll");
  proc.trigger = "item_use";
  proc.editor = "blocks";
  proc.blocks = JSON.stringify({
    variables: [{ name: "prizes", id: "l" }, { name: "prize", id: "x" }],
    blocks: { languageVersion: 0, blocks: [{ type: "bc_start", next: { block: {
      type: "variables_set", fields: { VAR: { id: "l" } }, inputs: { VALUE: { block: { type: "lists_create_with", extraState: { itemCount: 2 }, inputs: { ADD0: txt("minecraft:diamond"), ADD1: txt("minecraft:emerald") } } } },
      next: { block: {
        type: "lists_setIndex", fields: { MODE: "INSERT", WHERE: "LAST" }, inputs: { LIST: get("l"), TO: txt("minecraft:apple") },
        next: { block: {
          type: "lists_getIndex", fields: { MODE: "REMOVE", WHERE: "FIRST" }, inputs: { VALUE: get("l") },
          next: { block: {
            type: "controls_forEach", fields: { VAR: { id: "x" } }, inputs: { LIST: get("l"), DO: { block: {
              type: "bc_act_message", fields: { to: "player" }, inputs: { text: { block: { type: "text_join", extraState: { itemCount: 3 }, inputs: {
                ADD0: get("x"), ADD1: txt(" of "), ADD2: { block: { type: "lists_length", inputs: { VALUE: get("l") } } },
              } } } },
            } } },
            next: { block: { type: "bc_act_message", fields: { to: "player" }, inputs: { text: { block: { type: "lists_getIndex", fields: { MODE: "GET", WHERE: "RANDOM" }, inputs: { VALUE: get("l") } } } } } },
          } },
        } },
      } },
    } } }] },
  });
  p.elements.push(proc);
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;

  it("compiles every list block without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    for (const s of [`["minecraft:diamond", "minecraft:emerald"]`, `BC.listSet(`, `"INSERT", "LAST"`, `"REMOVE");`, `for (const each`, `BC.list(`, `"RANDOM", 1, "GET")`]) expect(js).toContain(s);
  });

  it("type-checks", () => {
    expect(typecheckScript(js)).toEqual([]);
  });
});

describe("more block shapes", () => {
  const p = createProject("Shapes");
  p.namespace = "shp";
  p.minEngine = [1, 21, 120]; // buttons and plates give a redstone signal
  for (const s of ["stairs", "fence_gate", "button", "pressure_plate", "fence"] as const) {
    const b = createElement("block", `oak_${s}`, s);
    b.shape = s;
    p.elements.push(b);
  }
  const { files, warnings } = generateAddon(p);
  const block = (n: string) => JSON.parse(files.get(`BP/blocks/${n}.json`) as string)["minecraft:block"];
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems and type-checks", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    expect(typecheckScript(js)).toEqual([]);
  });

  it("builds stairs from a half slab and four quarters", () => {
    const s = block("oak_stairs");
    expect(Object.keys(s.description.states)).toEqual(["shp:q_nw", "shp:q_ne", "shp:q_sw", "shp:q_se"]);
    const vis = s.components["minecraft:geometry"].bone_visibility;
    expect(vis.q_ne_high).toBe("!(q.block_state('minecraft:vertical_half') == 'top') && q.block_state('shp:q_ne')");
    expect(vis.q_ne_low).toBe("q.block_state('minecraft:vertical_half') == 'top' && q.block_state('shp:q_ne')");
    // East is negative x in Bedrock models.
    const geo = JSON.parse(files.get("RP/models/blocks/shp_oak_stairs.geo.json") as string)["minecraft:geometry"][0].bones;
    expect(geo.find((b: any) => b.name === "q_ne_high").cubes[0].origin).toEqual([-8, 8, -8]);
  });

  it("puts fence arms on the right sides (model x is mirrored)", () => {
    const geo = JSON.parse(files.get("RP/models/blocks/shp_oak_fence.geo.json") as string)["minecraft:geometry"][0].bones;
    expect(geo.find((b: any) => b.name === "west").cubes[0].origin[0]).toBeGreaterThan(0);
    expect(geo.find((b: any) => b.name === "east").cubes[0].origin[0]).toBe(-8);
  });

  it("makes gates open, buttons pulse and plates power while pressed", () => {
    expect(block("oak_fence_gate").permutations.at(-1)).toEqual({ condition: "q.block_state('shp:open')", components: { "minecraft:collision_box": false } });
    expect(block("oak_button").permutations.at(-1).components["minecraft:redstone_producer"]).toEqual({ power: 15 });
    expect(block("oak_pressure_plate").permutations[0].components["minecraft:redstone_producer"]).toEqual({ power: 15 });
    expect(JSON.parse(files.get("BP/blocks/oak_button.json") as string).format_version).toBe("1.21.120");
    for (const s of ["onStepOn(e)", "onStepOff(e)", "system.runTimeout(() => BC.run(", "bcStairsAround(e.block)", "BC_GATES"]) expect(js).toContain(s);
  });

  /** Runs the generated stair code on a fake world and returns each stair's quarters. */
  function corners(layout: Record<string, string>): Record<string, string> {
    const start = js.indexOf("// Stairs:"), end = js.indexOf("/** Fences, walls");
    const blocks = new Map<string, any>();
    const dimension = { getBlock: (l: { x: number; z: number }) => blocks.get(`${l.x},${l.z}`) };
    // layout: "x,z" -> cardinal_direction (the block's front; it climbs the other way)
    for (const [k, dir] of Object.entries(layout)) {
      const [x, z] = k.split(",").map(Number);
      blocks.set(k, { typeId: "shp:oak_stairs", states: { "minecraft:cardinal_direction": dir, "minecraft:vertical_half": "bottom" }, location: { x, y: 0, z } });
    }
    const wrap = (b: any) => b && Object.assign(b, { dimension, permutation: { states: b.states } });
    for (const b of blocks.values()) wrap(b);
    const run = new Function("bcGetState", "bcWith", "blocks", `${js.slice(start, end)}; for (const b of blocks.values()) bcUpdateStair(b);`);
    run((b: any, n: string) => b.states[n], (perm: any, n: string, v: unknown) => ({ states: { ...perm.states, [n]: v } }), new Map([...blocks].map(([k, b]) => [k, Object.defineProperty(b, "setPermutation", { value: (perm: any) => { b.states = perm.states; b.permutation = perm; } })])));
    return Object.fromEntries([...blocks].map(([k, b]) => [k, ["nw", "ne", "sw", "se"].filter((q) => b.states[`shp:q_${q}`]).join(" ")]));
  }

  it("joins stairs into corners like vanilla", () => {
    // A single stair facing south (climbing north): the north half is raised.
    expect(corners({ "0,0": "south" })["0,0"]).toBe("nw ne");
    // An L of two stairs: one climbing north, the one behind it climbing east -> outer corner on the first.
    const outer = corners({ "0,0": "south", "0,-1": "west" });
    expect(outer["0,0"]).toBe("ne");
    // Climbing north with a stair in front climbing east -> inner corner (north half + south-east).
    const inner = corners({ "0,0": "south", "0,1": "west" });
    expect(inner["0,0"]).toBe("nw ne se");
  });
});

describe("crop rules and crossbows", () => {
  const p = createProject("Farm");
  p.namespace = "frm";
  const crop = createElement("crop", "berries", "Berries");
  Object.assign(crop, { produce: "minecraft:sweet_berries", needsWater: true, needsSky: true, pickable: true, pickBackTo: 1 });
  const xbow = createElement("item", "ruby_crossbow", "Ruby Crossbow");
  Object.assign(xbow, { use: "crossbow", ammo: ["minecraft:arrow"], drawSeconds: 1.25 });
  p.elements.push(crop, xbow);
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;

  it("exports and type-checks", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    expect(typecheckScript(js)).toEqual([]);
  });

  it("only grows on wet farmland in enough light, and can be picked", () => {
    expect(js).toContain(`getState("moisturized_amount")`);
    expect(js).toContain("if (!BC.isDay()) return;");
    expect(js).toContain("getTopmostBlock(");
    expect(js).toContain(`new ItemStack("minecraft:sweet_berries", n)`);
    expect(js).toContain(`bcSetState(e.block, "frm:growth", 1);`);
  });

  it("makes crossbows that load first, then fire", () => {
    const c = JSON.parse(files.get("BP/items/ruby_crossbow.json") as string)["minecraft:item"].components;
    expect(c["minecraft:shooter"]).toMatchObject({ charge_on_draw: true, scale_power_by_draw_duration: false, max_draw_duration: 1.25 });
    expect(c["minecraft:use_animation"]).toBe("crossbow");
    expect(c["minecraft:enchantable"]).toEqual({ slot: "crossbow", value: 1 });
  });
});
