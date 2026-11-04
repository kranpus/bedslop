import { useEffect, useRef } from "react";
import * as Blockly from "blockly";
import { ACTIONS, CONDITIONS, isExpression, type ParamSpec } from "../model/logic";
import { EFFECTS, VANILLA_PARTICLES } from "../model/vanilla";
import { INFO, START_BLOCK, actionBlock, conditionBlock, parseWorkspace } from "../export/blocks";

/** Lists the dynamic dropdowns read from; kept up to date by the component. */
const lists = { variables: [] as string[], procedures: [] as string[], forms: [] as string[], structures: [] as string[], particles: [] as string[], enchantments: [] as string[], objectives: [] as string[], effects: [] as string[], overlays: [] as string[], args: [] as string[], known: new Set<string>() };

const GROUP_HUE: Record<string, number> = {
  "Chat & screen": 200, Entities: 0, Items: 30, World: 120, "Variables & logic": 330, Advanced: 260,
};

function dynamicOptions(get: () => string[], empty: string) {
  return function (this: Blockly.FieldDropdown): Blockly.MenuOption[] {
    const values = new Set(get());
    // Keep values that a saved workspace uses, even if renamed or deleted, so loading never fails.
    for (const k of lists.known) values.add(k);
    const current = this?.getValue?.();
    if (current) values.add(String(current));
    const opts: Blockly.MenuOption[] = [...values].filter(Boolean).map((v) => [get().includes(v) ? v : `${v} (missing)`, v]);
    return opts.length ? opts : [[empty, ""]];
  };
}

function fieldFor(p: ParamSpec): Blockly.Field {
  switch (p.kind) {
    case "bool": return new Blockly.FieldCheckbox(p.default ? "TRUE" : "FALSE");
    case "who": return new Blockly.FieldDropdown([["the player", "player"], ["the target", "target"]]);
    case "at": return new Blockly.FieldDropdown([["the player", "player"], ["the target", "target"], ["the block", "block"]]);
    case "select": return new Blockly.FieldDropdown((p.options ?? []).map((o) => [o.replace(/_/g, " "), o]));
    case "effect": return new Blockly.FieldDropdown(EFFECTS.map((e) => [e.replace(/_/g, " "), e]));
    case "variable": return new Blockly.FieldDropdown(dynamicOptions(() => lists.variables, "(create a variable first)"));
    case "procedure": return new Blockly.FieldDropdown(dynamicOptions(() => lists.procedures, "(no procedures)"));
    case "form": return new Blockly.FieldDropdown(dynamicOptions(() => lists.forms, "(no forms)"));
    case "structure": return new Blockly.FieldDropdown(dynamicOptions(() => lists.structures, "(no structures)"));
    case "hud": return new Blockly.FieldDropdown(dynamicOptions(() => lists.overlays, "(no overlays)"));
    case "custom_effect": return new Blockly.FieldDropdown(dynamicOptions(() => lists.effects, "(no custom effects)"));
    case "objective": return new Blockly.FieldDropdown(dynamicOptions(() => lists.objectives, "(add a scoreboard first)"));
    case "enchantment": return new Blockly.FieldDropdown(dynamicOptions(() => lists.enchantments, "(no enchantments)"));
    case "particle": return new Blockly.FieldDropdown(dynamicOptions(() => [...lists.particles, ...VANILLA_PARTICLES], "(no particles)"));
    default: return new Blockly.FieldTextInput(String(p.default ?? ""));
  }
}

let defined = false;
function defineBlocks() {
  if (defined) return;
  defined = true;
  Blockly.Blocks[START_BLOCK] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("▶ When this runs");
      this.setNextStatement(true);
      this.setColour(65);
      this.setDeletable(false);
      this.setTooltip("Everything attached below runs, top to bottom.");
    },
  };
  for (const spec of ACTIONS) {
    Blockly.Blocks[actionBlock(spec.type)] = {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField(spec.label);
        for (const p of spec.params) {
          if (isExpression(p.kind)) this.appendValueInput(p.key).setAlign(Blockly.inputs.Align.RIGHT).appendField(p.label);
          else this.appendDummyInput().setAlign(Blockly.inputs.Align.RIGHT).appendField(p.label).appendField(fieldFor(p), p.key);
        }
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(GROUP_HUE[spec.group] ?? 200);
        this.setInputsInline(false);
      },
    };
  }
  for (const spec of CONDITIONS) {
    Blockly.Blocks[conditionBlock(spec.type)] = {
      init(this: Blockly.Block) {
        this.appendDummyInput().appendField(spec.label.toLowerCase());
        for (const p of spec.params) {
          if (isExpression(p.kind)) this.appendValueInput(p.key).appendField(p.label);
          else this.appendDummyInput().appendField(p.label).appendField(fieldFor(p), p.key);
        }
        this.setOutput(true, "Boolean");
        this.setColour(210);
        this.setInputsInline(true);
      },
    };
  }
  Blockly.Blocks.bc_var_get = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("variable").appendField(new Blockly.FieldDropdown(dynamicOptions(() => lists.variables, "(create a variable first)")), "VAR")
        .appendField("of").appendField(new Blockly.FieldDropdown([["the player", "player"], ["the target", "target"]]), "WHO");
      this.setOutput(true);
      this.setColour(330);
      this.setTooltip("A global variable. World variables ignore “of”.");
    },
  };
  Blockly.Blocks.bc_score_get = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("score").appendField(new Blockly.FieldDropdown(dynamicOptions(() => lists.objectives, "(add a scoreboard first)")), "OBJ")
        .appendField("of").appendField(new Blockly.FieldDropdown([["the player", "player"], ["the target", "target"], ["global", "global"]]), "WHO");
      this.setOutput(true, "Number");
      this.setColour(330);
      this.setTooltip("A scoreboard score (0 if there isn't one yet).");
    },
  };
  Blockly.Blocks.bc_info = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(new Blockly.FieldDropdown(INFO.map((i) => [i.label, i.value])), "WHAT");
      this.setOutput(true);
      this.setColour(160);
    },
  };
  Blockly.Blocks.bc_arg = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("argument").appendField(new Blockly.FieldDropdown(dynamicOptions(() => lists.args, "(add arguments first)")), "NAME");
      this.setOutput(true);
      this.setColour(160);
      this.setTooltip("A value typed after the command, or a value from a form.");
    },
  };
  Blockly.Blocks.bc_wait = {
    init(this: Blockly.Block) {
      this.appendValueInput("TICKS").setCheck("Number").appendField("after");
      this.appendDummyInput().appendField("ticks (20 = 1 second), do");
      this.appendStatementInput("DO");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
      this.setTooltip("Waits, then runs the blocks inside. Blocks after this one run straight away.");
    },
  };
  Blockly.Blocks.bc_each_player = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("for each player online, as “the player”");
      this.appendStatementInput("DO");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(120);
    },
  };
  Blockly.Blocks.bc_stop = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField("stop here");
      this.setPreviousStatement(true);
      this.setColour(120);
    },
  };
}

const num = (n: number) => ({ shadow: { type: "math_number", fields: { NUM: n } } });
const txt = (t: string) => ({ shadow: { type: "text", fields: { TEXT: t } } });

function withShadows(type: string, params: ParamSpec[]) {
  const inputs: Record<string, unknown> = {};
  for (const p of params) if (isExpression(p.kind)) inputs[p.key] = p.kind === "number" ? num(Number(p.default) || 0) : txt(String(p.default ?? ""));
  return { kind: "block", type, inputs };
}

function toolbox(isCommand: boolean): Blockly.utils.toolbox.ToolboxDefinition {
  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  return {
    kind: "categoryToolbox",
    contents: [
      ...groups.map((g) => ({
        kind: "category", name: g, colour: String(GROUP_HUE[g] ?? 200),
        contents: ACTIONS.filter((a) => a.group === g).map((a) => withShadows(actionBlock(a.type), a.params)),
      })),
      { kind: "sep" },
      { kind: "category", name: "Conditions", colour: "210", contents: CONDITIONS.map((c) => withShadows(conditionBlock(c.type), c.params)) },
      {
        kind: "category", name: "Logic", colour: "%{BKY_LOGIC_HUE}",
        contents: [
          { kind: "block", type: "controls_if" },
          { kind: "block", type: "controls_if", extraState: { hasElse: true } },
          { kind: "block", type: "logic_compare" },
          { kind: "block", type: "logic_operation" },
          { kind: "block", type: "logic_negate" },
          { kind: "block", type: "logic_boolean" },
          { kind: "block", type: "logic_ternary" },
        ],
      },
      {
        kind: "category", name: "Loops & time", colour: "120",
        contents: [
          { kind: "block", type: "controls_repeat_ext", inputs: { TIMES: num(10) } },
          { kind: "block", type: "controls_whileUntil" },
          { kind: "block", type: "controls_for", inputs: { FROM: num(1), TO: num(10), BY: num(1) } },
          { kind: "block", type: "controls_flow_statements" },
          { kind: "block", type: "bc_wait", inputs: { TICKS: num(20) } },
          { kind: "block", type: "bc_each_player" },
          { kind: "block", type: "bc_stop" },
        ],
      },
      {
        kind: "category", name: "Math", colour: "%{BKY_MATH_HUE}",
        contents: [
          { kind: "block", type: "math_number" },
          { kind: "block", type: "math_arithmetic", inputs: { A: num(1), B: num(1) } },
          { kind: "block", type: "math_random_int", inputs: { FROM: num(1), TO: num(100) } },
          { kind: "block", type: "math_round", inputs: { NUM: num(3.1) } },
          { kind: "block", type: "math_modulo", inputs: { DIVIDEND: num(64), DIVISOR: num(10) } },
          { kind: "block", type: "math_single", inputs: { NUM: num(9) } },
          { kind: "block", type: "math_constrain", inputs: { VALUE: num(50), LOW: num(1), HIGH: num(100) } },
        ],
      },
      {
        kind: "category", name: "Text", colour: "%{BKY_TEXTS_HUE}",
        contents: [
          { kind: "block", type: "text" },
          { kind: "block", type: "text_join" },
          { kind: "block", type: "text_length", inputs: { VALUE: txt("abc") } },
        ],
      },
      {
        kind: "category", name: "Lists", colour: "%{BKY_LISTS_HUE}",
        contents: [
          { kind: "block", type: "lists_create_with" },
          { kind: "block", type: "lists_create_empty" },
          { kind: "block", type: "lists_repeat", inputs: { NUM: num(3) } },
          { kind: "block", type: "lists_length" },
          { kind: "block", type: "lists_isEmpty" },
          { kind: "block", type: "lists_indexOf" },
          { kind: "block", type: "lists_getIndex" },
          { kind: "block", type: "lists_setIndex" },
          { kind: "block", type: "lists_getSublist" },
          { kind: "block", type: "controls_forEach" },
        ],
      },
      {
        kind: "category", name: "Values", colour: "160",
        contents: [
          { kind: "block", type: "bc_info" },
          { kind: "block", type: "bc_var_get" },
          { kind: "block", type: "bc_score_get" },
          ...(isCommand ? [{ kind: "block", type: "bc_arg" }] : []),
        ],
      },
      { kind: "category", name: "Local variables", colour: "%{BKY_VARIABLES_HUE}", custom: "VARIABLE" },
    ],
  } as Blockly.utils.toolbox.ToolboxDefinition;
}

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function BlocklyEditor({ value, onChange, variables, procedures, forms, structures = [], particles = [], enchantments = [], objectives = [], effects = [], overlays = [], args, isCommand, resetKey }: {
  value: string;
  onChange: (json: string) => void;
  variables: string[];
  procedures: string[];
  forms: string[];
  structures?: string[];
  particles?: string[];
  enchantments?: string[];
  objectives?: string[];
  effects?: string[];
  overlays?: string[];
  args: string[];
  isCommand?: boolean;
  /** Changing this reloads the workspace from `value` (e.g. a different element). */
  resetKey: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  Object.assign(lists, { variables, procedures, forms, structures, particles, enchantments, objectives, effects, overlays, args });

  useEffect(() => {
    defineBlocks();
    // Remember names a saved workspace uses so dropdowns accept them while loading.
    lists.known = new Set((value.match(/"(?:variable|procedure|form|structure|particle|enchantment|objective|effect|hud|VAR|NAME|OBJ)":"([^"]*)"/g) ?? []).map((m) => m.split(":")[1].replace(/"/g, "")));
    const theme = Blockly.Theme.defineTheme(`bc-${Date.now()}`, {
      name: "bc",
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: cssVar("--surface", "#fbfcf8"),
        toolboxBackgroundColour: cssVar("--surface-2", "#f2f4ec"),
        toolboxForegroundColour: cssVar("--ink", "#1c231b"),
        flyoutBackgroundColour: cssVar("--surface-2", "#f2f4ec"),
        flyoutForegroundColour: cssVar("--ink", "#1c231b"),
        flyoutOpacity: 0.97,
        scrollbarColour: cssVar("--line-strong", "#b9c0ad"),
        insertionMarkerColour: cssVar("--accent", "#3b7728"),
      },
      fontStyle: { family: "IBM Plex Sans, system-ui, sans-serif", size: 11 },
    });
    const w = Blockly.inject(host.current!, {
      toolbox: toolbox(!!isCommand),
      theme,
      trashcan: false,
      sounds: false,
      zoom: { controls: false, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.4 },
      move: { scrollbars: true, drag: true, wheel: false },
      grid: { spacing: 24, length: 2, colour: cssVar("--line", "#d4d9ca"), snap: true },
      renderer: "zelos",
    });
    ws.current = w;
    const data = parseWorkspace(value);
    try {
      if (data.blocks) Blockly.serialization.workspaces.load(data as object, w);
    } catch (e) {
      console.warn("Couldn't load blocks", e);
    }
    if (!w.getBlocksByType(START_BLOCK, false).length) {
      const start = w.newBlock(START_BLOCK);
      start.initSvg();
      start.render();
      start.moveBy(24, 24);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent || w.isDragging()) return;
      clearTimeout(timer);
      timer = setTimeout(() => changeRef.current(JSON.stringify(Blockly.serialization.workspaces.save(w))), 250);
    };
    w.addChangeListener(listener);
    const ro = new ResizeObserver(() => Blockly.svgResize(w));
    ro.observe(host.current!);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      w.dispose();
      ws.current = null;
    };
    // Reload only when switching to another element.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return <div className="blockly-host" ref={host} />;
}
