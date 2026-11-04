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
  const num = (n: number) => ({ shadow: { type: "math_number", fields: { NUM: n } } });
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
