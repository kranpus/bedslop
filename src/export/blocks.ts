// Turns a saved Blockly workspace (JSON) into Script API code. Pure: no Blockly needed at export.
import { actionSpec, conditionSpec, isExpression, type Gen } from "../model/logic";

export interface BlockJson {
  type: string;
  id?: string;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockJson; shadow?: BlockJson }>;
  next?: { block?: BlockJson };
  extraState?: Record<string, unknown>;
}
export interface WorkspaceJson {
  blocks?: { blocks?: BlockJson[] };
  variables?: { name: string; id: string }[];
}

export const START_BLOCK = "bc_start";
export const actionBlock = (t: string) => `bc_act_${t}`;
export const conditionBlock = (t: string) => `bc_cond_${t}`;

/** Read-only facts about the event, for "value" blocks. */
export const INFO: { value: string; label: string; code: string }[] = [
  { value: "player_name", label: "player's name", code: "BC.name(ctx.player)" },
  { value: "target_name", label: "target's name", code: "BC.name(ctx.target)" },
  { value: "target_type", label: "target's type id", code: `(ctx.target?.typeId ?? "")` },
  { value: "player_health", label: "player's health", code: `(ctx.player?.getComponent("minecraft:health")?.currentValue ?? 0)` },
  { value: "target_health", label: "target's health", code: `(ctx.target?.getComponent("minecraft:health")?.currentValue ?? 0)` },
  { value: "player_level", label: "player's XP level", code: "(ctx.player?.level ?? 0)" },
  { value: "player_x", label: "player's X", code: "Math.floor(BC.at(ctx, \"player\")?.x ?? 0)" },
  { value: "player_y", label: "player's Y", code: "Math.floor(BC.at(ctx, \"player\")?.y ?? 0)" },
  { value: "player_z", label: "player's Z", code: "Math.floor(BC.at(ctx, \"player\")?.z ?? 0)" },
  { value: "held_item", label: "item the player holds", code: `(BC.held(ctx.player) ?? "")` },
  { value: "time_of_day", label: "time of day (0-24000)", code: "world.getTimeOfDay()" },
  { value: "player_count", label: "players online", code: "world.getAllPlayers().length" },
];

const S = JSON.stringify;
const LOOP_LIMIT = 10000;

export interface BlocksResult {
  code: string;
  problems: string[];
  /** Number of blocks connected to the start block (0 = does nothing). */
  count: number;
}

export function parseWorkspace(json: string | undefined): WorkspaceJson {
  if (!json?.trim()) return {};
  try {
    return JSON.parse(json) as WorkspaceJson;
  } catch {
    return {};
  }
}

/** Generates the body of `function name(ctx) { … }` from the blocks attached to the start block. */
export function blocksToBody(json: string | undefined, label: string): BlocksResult {
  const ws = parseWorkspace(json);
  const problems: string[] = [];
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const v of ws.variables ?? []) {
    let n = `v_${v.name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    while (used.has(n)) n += "_";
    used.add(n);
    names.set(v.id, n);
  }
  let seq = 0;
  let count = 0;
  const local = (field: unknown) => {
    const id = typeof field === "object" && field ? (field as { id?: string }).id : String(field ?? "");
    const n = id ? names.get(id) : undefined;
    if (!n) problems.push("a variable block refers to a variable that no longer exists.");
    return n ?? "v_missing";
  };
  const ind = (code: string, depth: number) => code.split("\n").map((l) => (l ? "  ".repeat(depth) + l : l)).join("\n");

  const value = (input: { block?: BlockJson; shadow?: BlockJson } | undefined, fallback: string): string => {
    const b = input?.block ?? input?.shadow;
    return b ? expr(b) : fallback;
  };

  const gen = (b: BlockJson, specParams: { key: string; kind: string; default: string | number | boolean }[]): Gen => ({
    e: (k) => {
      const p = specParams.find((s) => s.key === k);
      const fallback = p?.kind === "number" ? String(Number(p.default) || 0) : S(String(p?.default ?? ""));
      return value(b.inputs?.[k], fallback);
    },
    f: (k) => {
      const raw = b.fields?.[k] as string | number | boolean | undefined;
      // Blockly checkboxes save "TRUE" / "FALSE".
      if (raw === "TRUE") return true;
      if (raw === "FALSE") return false;
      return raw ?? specParams.find((s) => s.key === k)?.default ?? "";
    },
  });

  function expr(b: BlockJson): string {
    count++;
    const F = b.fields ?? {};
    const v = (name: string, fallback = "0") => value(b.inputs?.[name], fallback);
    switch (b.type) {
      case "logic_boolean": return F.BOOL === "FALSE" ? "false" : "true";
      case "logic_compare": {
        const op = ({ EQ: "=", NEQ: "≠", LT: "<", LTE: "≤", GT: ">", GTE: "≥" } as Record<string, string>)[String(F.OP)] ?? "=";
        return `BC.compare(${v("A")}, ${S(op)}, ${v("B")})`;
      }
      case "logic_operation": return `(${v("A", "false")} ${F.OP === "OR" ? "||" : "&&"} ${v("B", "false")})`;
      case "logic_negate": return `!(${v("BOOL", "false")})`;
      case "logic_ternary": return `(${v("IF", "false")} ? ${v("THEN")} : ${v("ELSE")})`;
      case "math_number": return String(Number(F.NUM) || 0);
      case "math_arithmetic": {
        const a = `Number(${v("A")})`, c = `Number(${v("B")})`;
        switch (F.OP) {
          case "MINUS": return `(${a} - ${c})`;
          case "MULTIPLY": return `(${a} * ${c})`;
          case "DIVIDE": return `(${a} / ${c})`;
          case "POWER": return `Math.pow(${a}, ${c})`;
          default: return `(${a} + ${c})`;
        }
      }
      case "math_single": {
        const n = `Number(${v("NUM")})`;
        const m: Record<string, string> = { ROOT: `Math.sqrt(${n})`, ABS: `Math.abs(${n})`, NEG: `-(${n})`, LN: `Math.log(${n})`, LOG10: `Math.log10(${n})`, EXP: `Math.exp(${n})`, POW10: `Math.pow(10, ${n})` };
        return m[String(F.OP)] ?? n;
      }
      case "math_round": {
        const fn = ({ ROUNDUP: "ceil", ROUNDDOWN: "floor" } as Record<string, string>)[String(F.OP)] ?? "round";
        return `Math.${fn}(Number(${v("NUM")}))`;
      }
      case "math_modulo": return `(Number(${v("DIVIDEND")}) % Number(${v("DIVISOR", "1")}))`;
      case "math_random_int": return `BC.randInt(${v("FROM")}, ${v("TO", "100")})`;
      case "math_constrain": return `Math.min(Number(${v("HIGH", "100")}), Math.max(Number(${v("LOW")}), Number(${v("VALUE")})))`;
      case "text": return S(String(F.TEXT ?? ""));
      case "text_join": {
        const n = Number(b.extraState?.itemCount ?? 2);
        const parts = Array.from({ length: n }, (_, i) => `String(${v(`ADD${i}`, '""')})`);
        return parts.length ? `(${parts.join(" + ")})` : '""';
      }
      case "text_length": return `String(${v("VALUE", '""')}).length`;
      case "variables_get": return local(F.VAR);
      case "bc_var_get": return `BC.getVar(ctx, ${S(String(F.VAR ?? ""))}, ${S(String(F.WHO ?? "player"))})`;
      case "bc_info": return INFO.find((i) => i.value === F.WHAT)?.code ?? "0";
      case "bc_arg": return `(ctx.args?.[${S(String(F.NAME ?? ""))}] ?? "")`;
    }
    if (b.type.startsWith("bc_cond_")) {
      const spec = conditionSpec(b.type.slice(8));
      if (spec) return `(${spec.code(gen(b, spec.params))})`;
    }
    problems.push(`the "${b.type}" block isn't supported and counts as 0.`);
    return "0";
  }

  function stmts(b: BlockJson | undefined, depth: number): string {
    let out = "";
    for (let cur = b; cur; cur = cur.next?.block) out += stmt(cur, depth);
    return out;
  }

  function stmt(b: BlockJson, depth: number): string {
    count++;
    const F = b.fields ?? {};
    const v = (name: string, fallback = "0") => value(b.inputs?.[name], fallback);
    const body = (name: string) => stmts(b.inputs?.[name]?.block, depth + 1);
    const line = (code: string) => ind(code, depth) + "\n";
    switch (b.type) {
      case "controls_if": {
        const n = Number(b.extraState?.elseIfCount ?? 0);
        let out = line(`if (${v("IF0", "false")}) {`) + body("DO0");
        for (let i = 1; i <= n; i++) out += line(`} else if (${v(`IF${i}`, "false")}) {`) + body(`DO${i}`);
        if (b.extraState?.hasElse || b.inputs?.ELSE) out += line("} else {") + body("ELSE");
        return out + line("}");
      }
      case "controls_repeat_ext":
      case "controls_repeat": {
        const i = `i${++seq}`;
        const times = b.type === "controls_repeat" ? String(Number(F.TIMES) || 0) : `Number(${v("TIMES", "10")})`;
        return line(`for (let ${i} = 0; ${i} < Math.min(${LOOP_LIMIT}, ${times}); ${i}++) {`) + body("DO") + line("}");
      }
      case "controls_whileUntil": {
        const g = `guard${++seq}`;
        const cond = F.MODE === "UNTIL" ? `!(${v("BOOL", "false")})` : v("BOOL", "false");
        return line(`for (let ${g} = 0; ${cond} && ${g} < ${LOOP_LIMIT}; ${g}++) {`) + body("DO") + line("}");
      }
      case "controls_for": {
        const x = local(F.VAR), n = ++seq;
        return line(`{`) +
          line(`  const from${n} = Number(${v("FROM", "1")}), to${n} = Number(${v("TO", "10")}), by${n} = Math.abs(Number(${v("BY", "1")})) || 1;`) +
          line(`  for (let k${n} = 0, ${x} = from${n}; (from${n} <= to${n} ? ${x} <= to${n} : ${x} >= to${n}) && k${n} < ${LOOP_LIMIT}; k${n}++, ${x} += from${n} <= to${n} ? by${n} : -by${n}) {`) +
          stmts(b.inputs?.DO?.block, depth + 2) + line("  }") + line("}");
      }
      case "controls_flow_statements": return line(F.FLOW === "CONTINUE" ? "continue;" : "break;");
      case "variables_set": return line(`${local(F.VAR)} = ${v("VALUE")};`);
      case "math_change": {
        const x = local(F.VAR);
        return line(`${x} = (Number(${x}) || 0) + Number(${v("DELTA", "1")});`);
      }
      case "bc_wait":
        return line(`system.runTimeout(() => {`) + body("DO") + line(`}, Math.max(1, Math.round(Number(${v("TICKS", "20")}))));`);
      case "bc_each_player": {
        const n = ++seq;
        return line(`{`) + line(`  const outer${n} = ctx;`) +
          line(`  for (const each${n} of world.getAllPlayers()) {`) +
          line(`    const ctx = { ...outer${n}, player: each${n}, dimension: each${n}.dimension, location: each${n}.location };`) +
          stmts(b.inputs?.DO?.block, depth + 2) + line("  }") + line("}");
      }
      case "bc_stop": return line("return;");
    }
    if (b.type.startsWith("bc_act_")) {
      const spec = actionSpec(b.type.slice(7));
      if (spec) {
        const code = spec.code(gen(b, spec.params));
        return line(`BC.run(${S(`${label} → ${spec.label}`)}, () => {`) + ind(code, depth + 1) + "\n" + line("});");
      }
    }
    problems.push(`the "${b.type}" block isn't supported and was skipped.`);
    return "";
  }

  const start = ws.blocks?.blocks?.find((b) => b.type === START_BLOCK);
  if (!start) return { code: "", problems: ["the start block is missing, so nothing runs."], count: 0 };
  const decls = [...names.values()].map((n) => `  let ${n} = 0;\n`).join("");
  const code = stmts(start.next?.block, 1);
  return { code: decls + code, problems: [...new Set(problems)], count };
}

/** Builds a workspace from the simple editor's steps, so switching to blocks keeps your work. */
export function simpleToWorkspace(
  conditions: { type: string; params: Record<string, string | number | boolean>; negate: boolean }[],
  actions: { type: string; params: Record<string, string | number | boolean>; chance: number }[],
): string {
  let n = 0;
  const id = () => `b${++n}`;
  const paramBlocks = (specParams: { key: string; kind: Parameters<typeof isExpression>[0] }[], params: Record<string, string | number | boolean>) => {
    const fields: Record<string, unknown> = {};
    const inputs: Record<string, { shadow: BlockJson }> = {};
    for (const p of specParams) {
      const val = params[p.key];
      if (isExpression(p.kind)) {
        inputs[p.key] = { shadow: p.kind === "number" ? { type: "math_number", id: id(), fields: { NUM: Number(val) || 0 } } : { type: "text", id: id(), fields: { TEXT: String(val ?? "") } } };
      } else if (val !== undefined) fields[p.key] = p.kind === "bool" ? (val ? "TRUE" : "FALSE") : val;
    }
    return { fields, inputs };
  };
  const condBlock = (c: (typeof conditions)[number]): BlockJson | null => {
    const spec = conditionSpec(c.type);
    if (!spec) return null;
    const b: BlockJson = { type: conditionBlock(c.type), id: id(), ...paramBlocks(spec.params, c.params) };
    return c.negate ? { type: "logic_negate", id: id(), inputs: { BOOL: { block: b } } } : b;
  };
  const chain = (blocks: BlockJson[]): BlockJson | undefined => {
    for (let i = blocks.length - 2; i >= 0; i--) blocks[i].next = { block: blocks[i + 1] };
    return blocks[0];
  };
  const steps: BlockJson[] = actions.flatMap((a) => {
    const spec = actionSpec(a.type);
    if (!spec) return [];
    const b: BlockJson = { type: actionBlock(a.type), id: id(), ...paramBlocks(spec.params, a.params) };
    if (a.chance >= 100) return [b];
    const chance: BlockJson = { type: conditionBlock("chance"), id: id(), inputs: { percent: { shadow: { type: "math_number", id: id(), fields: { NUM: a.chance } } } } };
    return [{ type: "controls_if", id: id(), inputs: { IF0: { block: chance }, DO0: { block: b } } }];
  });
  let body = chain(steps);
  const conds = conditions.map(condBlock).filter((x): x is BlockJson => !!x);
  if (conds.length) {
    const all = conds.reduce((acc, c) => ({ type: "logic_operation", id: id(), fields: { OP: "AND" }, inputs: { A: { block: acc }, B: { block: c } } }));
    body = { type: "controls_if", id: id(), inputs: { IF0: { block: all }, ...(body ? { DO0: { block: body } } : {}) } };
  }
  const start: BlockJson = { type: START_BLOCK, id: "start", ...(body ? { next: { block: body } } : {}) };
  return JSON.stringify({ blocks: { languageVersion: 0, blocks: [{ ...start, x: 24, y: 24 }] }, variables: [] });
}
