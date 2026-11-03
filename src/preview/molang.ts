// A small Molang interpreter for previews: numbers, math.*, query.*/variable.*/temp.*, operators,
// ternaries, ?? and multi-statement expressions with assignments and return. Unknown names read as 0.

export interface MolangEnv {
  query: Record<string, number | ((...a: number[]) => number)>;
  variable: Record<string, number>;
  temp?: Record<string, number>;
}

type Node =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; ns: string; name: string }
  | { t: "call"; ns: string; name: string; args: Node[] }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "tern"; c: Node; a: Node; b: Node }
  | { t: "assign"; ns: string; name: string; v: Node }
  | { t: "ret"; v: Node }
  | { t: "seq"; list: Node[] };

const NS: Record<string, string> = { q: "query", query: "query", v: "variable", variable: "variable", t: "temp", temp: "temp", c: "context", context: "context", math: "math" };
const RAD = Math.PI / 180;
const MATH: Record<string, (...a: number[]) => number> = {
  sin: (x) => Math.sin(x * RAD), cos: (x) => Math.cos(x * RAD), asin: (x) => Math.asin(x) / RAD, acos: (x) => Math.acos(x) / RAD,
  atan: (x) => Math.atan(x) / RAD, atan2: (y, x) => Math.atan2(y, x) / RAD,
  abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  exp: Math.exp, ln: Math.log, pow: Math.pow, min: Math.min, max: Math.max, sign: Math.sign,
  mod: (a, b) => a % b, clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
  lerp: (a, b, t) => a + (b - a) * t, lerprotate: (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t,
  hermite_blend: (t) => 3 * t * t - 2 * t * t * t, die_roll: (n, lo, hi) => n * (lo + hi) / 2, die_roll_integer: (n, lo, hi) => Math.round(n * (lo + hi) / 2),
  random: (lo, hi) => lo + Math.random() * (hi - lo), random_integer: (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1)),
  min_angle: (a) => ((((a + 180) % 360) + 360) % 360) - 180,
};

function tokenize(src: string): string[] {
  const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?f?|\.\d+f?|'[^']*'|[A-Za-z_][\w.]*|==|!=|<=|>=|&&|\|\||\?\?|[-+*/()?:!<>=,;{}\[\]])/gy;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while (re.lastIndex < src.length && (m = re.exec(src))) out.push(m[1]);
  if (src.slice(re.lastIndex).trim()) throw new Error(`Unexpected "${src.slice(re.lastIndex).trim()[0]}"`);
  return out;
}

const PREC: Record<string, number> = { "??": 2, "||": 3, "&&": 4, "==": 5, "!=": 5, "<": 6, "<=": 6, ">": 6, ">=": 6, "+": 7, "-": 7, "*": 8, "/": 8 };

function parse(src: string): Node {
  const tk = tokenize(src.toLowerCase());
  let i = 0;
  const peek = () => tk[i];
  const next = () => tk[i++];
  const expect = (s: string) => { if (next() !== s) throw new Error(`Expected ${s}`); };

  const splitName = (id: string) => {
    const dot = id.indexOf(".");
    if (dot < 0) return { ns: "", name: id };
    const ns = NS[id.slice(0, dot)] ?? id.slice(0, dot);
    return { ns, name: id.slice(dot + 1) };
  };

  const primary = (): Node => {
    const tok = next();
    if (tok === undefined) throw new Error("Unexpected end");
    if (tok === "(") { const e = expr(0); expect(")"); return e; }
    if (tok === "{") { const s = statements("}"); expect("}"); return s; }
    if (tok === "-" || tok === "!") return { t: "un", op: tok, a: unary() };
    if (/^[\d.]/.test(tok)) return { t: "num", v: parseFloat(tok) };
    if (tok.startsWith("'")) return { t: "str", v: tok.slice(1, -1) };
    if (tok === "true") return { t: "num", v: 1 };
    if (tok === "false") return { t: "num", v: 0 };
    if (tok === "return") return { t: "ret", v: expr(0) };
    if (!/^[a-z_]/.test(tok)) throw new Error(`Unexpected "${tok}"`);
    const { ns, name } = splitName(tok);
    if (peek() === "(") {
      next();
      const args: Node[] = [];
      while (peek() !== ")") { args.push(expr(0)); if (peek() === ",") next(); else break; }
      expect(")");
      return { t: "call", ns, name, args };
    }
    if (peek() === "=" ) { next(); return { t: "assign", ns, name, v: expr(0) }; }
    return { t: "ref", ns, name };
  };
  const unary = (): Node => primary();
  const expr = (minPrec: number): Node => {
    let left = unary();
    for (;;) {
      const op = peek();
      if (op === "?" && minPrec <= 1) {
        next();
        const a = expr(1);
        if (peek() === ":") { next(); left = { t: "tern", c: left, a, b: expr(1) }; }
        else left = { t: "tern", c: left, a, b: { t: "num", v: 0 } };
        continue;
      }
      const p = PREC[op];
      if (p === undefined || p < minPrec) return left;
      next();
      left = { t: "bin", op, a: left, b: expr(p + 1) };
    }
  };
  const statements = (end?: string): Node => {
    const list: Node[] = [];
    while (i < tk.length && peek() !== end) {
      if (peek() === ";") { next(); continue; }
      list.push(expr(0));
    }
    return list.length === 1 ? list[0] : { t: "seq", list };
  };
  const tree = statements();
  if (i < tk.length) throw new Error(`Unexpected "${tk[i]}"`);
  return tree;
}

class Return { constructor(readonly v: number) {} }

function evaluate(n: Node, env: MolangEnv): number {
  switch (n.t) {
    case "num": return n.v;
    case "str": return 0;
    case "ref": {
      if (n.ns === "math") return n.name === "pi" ? Math.PI : 0;
      const bag = n.ns === "query" ? env.query : n.ns === "variable" ? env.variable : n.ns === "temp" ? (env.temp ??= {}) : undefined;
      const v = bag?.[n.name];
      return typeof v === "function" ? v() : typeof v === "number" ? v : 0;
    }
    case "call": {
      const args = n.args.map((a) => evaluate(a, env));
      if (n.ns === "math") return MATH[n.name]?.(...args) ?? 0;
      const f = n.ns === "query" ? env.query[n.name] : undefined;
      return typeof f === "function" ? f(...args) : typeof f === "number" ? f : 0;
    }
    case "un": { const a = evaluate(n.a, env); return n.op === "-" ? -a : a ? 0 : 1; }
    case "bin": {
      if (n.op === "&&") return evaluate(n.a, env) && evaluate(n.b, env) ? 1 : 0;
      if (n.op === "||") return evaluate(n.a, env) || evaluate(n.b, env) ? 1 : 0;
      if (n.op === "??") { const a = evaluate(n.a, env); return a || evaluate(n.b, env); }
      const a = evaluate(n.a, env), b = evaluate(n.b, env);
      switch (n.op) {
        case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": return b === 0 ? 0 : a / b;
        case "==": return a === b ? 1 : 0; case "!=": return a !== b ? 1 : 0;
        case "<": return a < b ? 1 : 0; case "<=": return a <= b ? 1 : 0; case ">": return a > b ? 1 : 0; case ">=": return a >= b ? 1 : 0;
      }
      return 0;
    }
    case "tern": return evaluate(n.c, env) ? evaluate(n.a, env) : evaluate(n.b, env);
    case "assign": {
      const v = evaluate(n.v, env);
      if (n.ns === "variable") env.variable[n.name] = v;
      else if (n.ns === "temp") (env.temp ??= {})[n.name] = v;
      return v;
    }
    case "ret": throw new Return(evaluate(n.v, env));
    case "seq": {
      // Multi-statement Molang evaluates to 0 unless it returns.
      for (const s of n.list) evaluate(s, env);
      return 0;
    }
  }
}

const cache = new Map<string, Node | Error>();

/** Evaluates a Molang value. Numbers pass through; bad expressions read as 0 and are reported once. */
export function molang(value: unknown, env: MolangEnv, onError?: (msg: string) => void): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value !== "string" || !value.trim()) return 0;
  let tree = cache.get(value);
  if (!tree) {
    try { tree = parse(value); } catch (e) { tree = e instanceof Error ? e : new Error(String(e)); onError?.(`${tree.message} in "${value}"`); }
    cache.set(value, tree);
  }
  if (tree instanceof Error) return 0;
  try {
    const v = evaluate(tree, env);
    return Number.isFinite(v) ? v : 0;
  } catch (r) {
    if (r instanceof Return) return r.v;
    return 0;
  }
}
