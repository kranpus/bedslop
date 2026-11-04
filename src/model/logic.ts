// Catalog of triggers, conditions and actions for procedures, commands and forms.
// Each entry carries both the UI description and the JavaScript it compiles to.

import type { TriggerType } from "./types";

export type ParamKind =
  | "text" | "longtext" | "number" | "bool" | "item" | "block" | "entity" | "effect" | "sound"
  | "who" | "at" | "select" | "variable" | "procedure" | "form" | "structure" | "particle" | "enchantment" | "objective";

export interface ParamSpec {
  key: string;
  label: string;
  kind: ParamKind;
  options?: string[];
  default: string | number | boolean;
}

/** Kinds that become expressions (and value sockets in the block editor). The rest are fixed fields. */
export const EXPRESSION_KINDS: ParamKind[] = ["text", "number"];
export const isExpression = (k: ParamKind) => EXPRESSION_KINDS.includes(k);

/**
 * Supplies code for a step's parameters.
 * e(key): a JavaScript expression (a literal in the simple editor; any expression in blocks).
 * f(key): the fixed value of a field (ids, dropdowns, toggles).
 */
export interface Gen {
  e(key: string): string;
  f(key: string): string | number | boolean;
}

type P = Record<string, string | number | boolean>;
const S = (v: unknown) => JSON.stringify(v ?? "");
const N = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Names of generated functions, shared with the script generator. */
export const fnName = (prefix: string, name: string) => `${prefix}_${String(name).replace(/[^a-zA-Z0-9_]/g, "_")}`;

/** Gen for literal parameter values (simple editor, forms). */
export function literalGen(params: P, specs: ParamSpec[]): Gen {
  const spec = (k: string) => specs.find((s) => s.key === k);
  const value = (k: string) => (params[k] ?? spec(k)?.default ?? "");
  return {
    e: (k) => (spec(k)?.kind === "number" ? String(N(value(k), N(spec(k)?.default))) : S(String(value(k)))),
    f: (k) => value(k),
  };
}

export interface ActionSpec {
  type: string;
  label: string;
  group: "Chat & screen" | "Entities" | "Items" | "World" | "Variables & logic" | "Advanced";
  params: ParamSpec[];
  /** Short sentence for the action list, e.g. "Give 3 × minecraft:diamond". */
  summary: (p: P) => string;
  code: (g: Gen) => string;
}

const who = (d: "player" | "target" = "player"): ParamSpec => ({ key: "who", label: "Who", kind: "who", default: d });
const at = (d: "player" | "target" | "block" = "player"): ParamSpec => ({ key: "at", label: "Where", kind: "at", default: d });
/** Whose score: the player, the target, or the shared "global" score. */
const scoreWho = (): ParamSpec => ({ key: "who", label: "Whose", kind: "select", options: ["player", "target", "global"], default: "player" });
const int = (expr: string, min = 1) => `Math.max(${min}, Math.round(${expr}))`;

export const ACTIONS: ActionSpec[] = [
  {
    type: "message", label: "Send chat message", group: "Chat & screen",
    params: [
      { key: "text", label: "Message", kind: "text", default: "Hello {player}!" },
      { key: "to", label: "Send to", kind: "select", options: ["player", "everyone"], default: "player" },
    ],
    summary: (p) => `Say “${p.text}” to ${p.to}`,
    code: (g) => `BC.message(ctx, ${S(g.f("to"))}, ${g.e("text")});`,
  },
  {
    type: "title", label: "Show title", group: "Chat & screen",
    params: [
      { key: "text", label: "Title", kind: "text", default: "Welcome!" },
      { key: "subtitle", label: "Subtitle", kind: "text", default: "" },
    ],
    summary: (p) => `Show title “${p.text}”`,
    code: (g) => `BC.title(ctx, ${g.e("text")}, ${g.e("subtitle")});`,
  },
  {
    type: "actionbar", label: "Show action bar text", group: "Chat & screen",
    params: [{ key: "text", label: "Text", kind: "text", default: "Something happened" }],
    summary: (p) => `Action bar “${p.text}”`,
    code: (g) => `ctx.player?.onScreenDisplay.setActionBar(BC.fmt(ctx, ${g.e("text")}));`,
  },
  {
    type: "show_form", label: "Show form", group: "Chat & screen",
    params: [{ key: "form", label: "Form", kind: "form", default: "" }],
    summary: (p) => `Show form ${p.form || "(none)"}`,
    code: (g) => (g.f("form") ? `${fnName("form", String(g.f("form")))}(ctx);` : "// No form selected"),
  },
  {
    type: "effect", label: "Apply potion effect", group: "Entities",
    params: [
      who(),
      { key: "effect", label: "Effect", kind: "effect", default: "speed" },
      { key: "seconds", label: "Seconds", kind: "number", default: 10 },
      { key: "amplifier", label: "Level (0 = I)", kind: "number", default: 0 },
      { key: "particles", label: "Show particles", kind: "bool", default: true },
    ],
    summary: (p) => `Give ${p.who} ${p.effect} ${N(p.amplifier) + 1} for ${p.seconds}s`,
    code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.addEffect(${S(g.f("effect"))}, ${int(`(${g.e("seconds")}) * 20`)}, { amplifier: ${int(g.e("amplifier"), 0)}, showParticles: ${!!g.f("particles")} });`,
  },
  {
    type: "clear_effects", label: "Clear all effects", group: "Entities",
    params: [who()],
    summary: (p) => `Clear effects from ${p.who}`,
    code: (g) => `BC.cmd(ctx, ${S(g.f("who"))}, "effect @s clear");`,
  },
  {
    type: "heal", label: "Heal", group: "Entities",
    params: [who(), { key: "amount", label: "Health points", kind: "number", default: 4 }],
    summary: (p) => `Heal ${p.who} by ${p.amount}`,
    code: (g) => `BC.heal(ctx, ${S(g.f("who"))}, ${g.e("amount")});`,
  },
  {
    type: "damage", label: "Damage", group: "Entities",
    params: [who("target"), { key: "amount", label: "Damage", kind: "number", default: 4 }],
    summary: (p) => `Deal ${p.amount} damage to ${p.who}`,
    code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.applyDamage(${g.e("amount")});`,
  },
  {
    type: "fire", label: "Set on fire", group: "Entities",
    params: [who("target"), { key: "seconds", label: "Seconds", kind: "number", default: 5 }],
    summary: (p) => `Set ${p.who} on fire for ${p.seconds}s`,
    code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.setOnFire(${g.e("seconds")}, true);`,
  },
  {
    type: "kill", label: "Kill", group: "Entities",
    params: [who("target")],
    summary: (p) => `Kill ${p.who}`,
    code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.kill();`,
  },
  {
    type: "launch", label: "Launch upwards", group: "Entities",
    params: [who(), { key: "power", label: "Strength", kind: "number", default: 1.2 }],
    summary: (p) => `Launch ${p.who} up (${p.power})`,
    code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.applyKnockback({ x: 0, z: 0 }, ${g.e("power")});`,
  },
  {
    type: "teleport", label: "Teleport", group: "Entities",
    params: [
      who(),
      { key: "mode", label: "Mode", kind: "select", options: ["relative", "absolute"], default: "relative" },
      { key: "x", label: "X", kind: "number", default: 0 },
      { key: "y", label: "Y", kind: "number", default: 10 },
      { key: "z", label: "Z", kind: "number", default: 0 },
    ],
    summary: (p) => `Teleport ${p.who} ${p.mode === "relative" ? "by" : "to"} ${p.x} ${p.y} ${p.z}`,
    code: (g) => `BC.teleport(ctx, ${S(g.f("who"))}, ${S(g.f("mode"))}, ${g.e("x")}, ${g.e("y")}, ${g.e("z")});`,
  },
  {
    type: "add_tag", label: "Add tag", group: "Entities",
    params: [who(), { key: "tag", label: "Tag", kind: "text", default: "my_tag" }],
    summary: (p) => `Tag ${p.who} with “${p.tag}”`,
    code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.addTag(String(${g.e("tag")}));`,
  },
  {
    type: "remove_tag", label: "Remove tag", group: "Entities",
    params: [who(), { key: "tag", label: "Tag", kind: "text", default: "my_tag" }],
    summary: (p) => `Remove tag “${p.tag}” from ${p.who}`,
    code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.removeTag(String(${g.e("tag")}));`,
  },
  {
    type: "give", label: "Give item", group: "Items",
    params: [
      { key: "item", label: "Item", kind: "item", default: "minecraft:diamond" },
      { key: "count", label: "Count", kind: "number", default: 1 },
    ],
    summary: (p) => `Give ${p.count} × ${p.item}`,
    code: (g) => `BC.give(ctx, ${S(g.f("item"))}, ${int(g.e("count"))});`,
  },
  {
    type: "drop_item", label: "Drop item on the ground", group: "Items",
    params: [
      at("block"),
      { key: "item", label: "Item", kind: "item", default: "minecraft:emerald" },
      { key: "count", label: "Count", kind: "number", default: 1 },
    ],
    summary: (p) => `Drop ${p.count} × ${p.item} at ${p.at}`,
    code: (g) => `BC.dropItem(ctx, ${S(g.f("at"))}, ${S(g.f("item"))}, ${int(g.e("count"))});`,
  },
  {
    type: "xp", label: "Give XP levels", group: "Items",
    params: [{ key: "levels", label: "Levels", kind: "number", default: 1 }],
    summary: (p) => `Give ${p.levels} XP levels`,
    code: (g) => `ctx.player?.addLevels(Math.round(${g.e("levels")}));`,
  },
  {
    type: "spawn", label: "Spawn entity", group: "World",
    params: [
      at("player"),
      { key: "entity", label: "Entity", kind: "entity", default: "minecraft:zombie" },
      { key: "count", label: "How many", kind: "number", default: 1 },
    ],
    summary: (p) => `Spawn ${p.count} × ${p.entity} at ${p.at}`,
    code: (g) => `BC.spawn(ctx, ${S(g.f("at"))}, ${S(g.f("entity"))}, ${int(g.e("count"))});`,
  },
  {
    type: "lightning", label: "Strike lightning", group: "World",
    params: [at("target")],
    summary: (p) => `Lightning at ${p.at}`,
    code: (g) => `BC.spawn(ctx, ${S(g.f("at"))}, "minecraft:lightning_bolt", 1);`,
  },
  {
    type: "explosion", label: "Create explosion", group: "World",
    params: [
      at("block"),
      { key: "power", label: "Power", kind: "number", default: 3 },
      { key: "fire", label: "Causes fire", kind: "bool", default: false },
      { key: "breaks", label: "Breaks blocks", kind: "bool", default: true },
    ],
    summary: (p) => `Explosion (${p.power}) at ${p.at}`,
    code: (g) => `BC.explode(ctx, ${S(g.f("at"))}, ${g.e("power")}, ${!!g.f("fire")}, ${!!g.f("breaks")});`,
  },
  {
    type: "enchant_held", label: "Enchant held item", group: "Items",
    params: [
      { key: "enchantment", label: "Enchantment", kind: "enchantment", default: "" },
      { key: "level", label: "Level (0 = one more)", kind: "number", default: 1 },
    ],
    summary: (p) => `Enchant held item with ${p.enchantment || "(none)"} ${Number(p.level) > 0 ? p.level : "+1"}`,
    code: (g) => (g.f("enchantment") ? `bcEnchantHeld(ctx, ${S(g.f("enchantment"))}, ${g.e("level")});` : "// No enchantment selected"),
  },
  {
    type: "set_block_state", label: "Set block state", group: "World",
    params: [
      at("block"),
      { key: "state", label: "State", kind: "text", default: "lit" },
      { key: "value", label: "Value", kind: "text", default: "true" },
    ],
    summary: (p) => `Set ${p.state} = ${p.value}`,
    code: (g) => `BC.setState(ctx, ${S(g.f("at"))}, String(${g.e("state")}), ${g.e("value")});`,
  },
  {
    type: "cycle_block_state", label: "Cycle block state", group: "World",
    params: [at("block"), { key: "state", label: "State", kind: "text", default: "stage" }],
    summary: (p) => `Next ${p.state}`,
    code: (g) => `BC.cycleState(ctx, ${S(g.f("at"))}, String(${g.e("state")}));`,
  },
  {
    type: "spawn_particle", label: "Spawn particles", group: "World",
    params: [
      { key: "particle", label: "Particle effect", kind: "particle", default: "" },
      at("player"),
      { key: "height", label: "Height above", kind: "number", default: 1 },
    ],
    summary: (p) => `Particles ${p.particle || "(none)"} at ${p.at}`,
    code: (g) => (g.f("particle")
      ? `BC.particle(ctx, ${S(g.f("particle"))}, ${S(g.f("at"))}, ${g.e("height")});`
      : "// No particle effect selected"),
  },
  {
    type: "place_structure", label: "Place structure", group: "World",
    params: [
      { key: "structure", label: "Structure", kind: "structure", default: "" },
      at("player"),
      { key: "rotation", label: "Rotation", kind: "select", options: ["0", "90", "180", "270"], default: "0" },
      { key: "centered", label: "Centred on the spot", kind: "bool", default: true },
    ],
    summary: (p) => `Place structure ${p.structure || "(none)"} at ${p.at}`,
    code: (g) => (g.f("structure")
      ? `BC.structure(ctx, ${S(g.f("structure"))}, ${S(g.f("at"))}, ${N(g.f("rotation"))}, ${!!g.f("centered")});`
      : "// No structure selected"),
  },
  {
    type: "set_block", label: "Place block", group: "World",
    params: [
      at("block"),
      { key: "block", label: "Block", kind: "block", default: "minecraft:gold_block" },
      { key: "dy", label: "Y offset", kind: "number", default: 0 },
    ],
    summary: (p) => `Place ${p.block} at ${p.at}${N(p.dy) ? ` (y${N(p.dy) > 0 ? "+" : ""}${p.dy})` : ""}`,
    code: (g) => `BC.setBlock(ctx, ${S(g.f("at"))}, ${S(g.f("block"))}, Math.round(${g.e("dy")}));`,
  },
  {
    type: "sound", label: "Play sound", group: "World",
    params: [
      at("player"),
      { key: "sound", label: "Sound", kind: "sound", default: "random.levelup" },
      { key: "volume", label: "Volume", kind: "number", default: 1 },
      { key: "pitch", label: "Pitch", kind: "number", default: 1 },
    ],
    summary: (p) => `Play ${p.sound}`,
    code: (g) => `BC.sound(ctx, ${S(g.f("at"))}, ${S(g.f("sound"))}, ${g.e("volume")}, ${g.e("pitch")});`,
  },
  {
    type: "time", label: "Set time of day", group: "World",
    params: [{ key: "time", label: "Time", kind: "select", options: ["day", "noon", "sunset", "night", "midnight", "sunrise"], default: "day" }],
    summary: (p) => `Set time to ${p.time}`,
    code: (g) => `world.setTimeOfDay(${({ day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 } as Record<string, number>)[String(g.f("time"))] ?? 1000});`,
  },
  {
    type: "weather", label: "Set weather", group: "World",
    params: [{ key: "weather", label: "Weather", kind: "select", options: ["clear", "rain", "thunder"], default: "clear" }],
    summary: (p) => `Set weather to ${p.weather}`,
    code: (g) => `BC.cmd(ctx, "world", ${S(`weather ${g.f("weather")}`)});`,
  },
  {
    type: "set_var", label: "Change a variable", group: "Variables & logic",
    params: [
      { key: "variable", label: "Variable", kind: "variable", default: "" },
      { key: "op", label: "How", kind: "select", options: ["set", "add", "subtract", "multiply", "divide", "toggle"], default: "set" },
      { key: "value", label: "Value", kind: "text", default: "1" },
      { key: "who", label: "Whose (player variables)", kind: "who", default: "player" },
    ],
    summary: (p) => `${p.op === "set" ? "Set" : String(p.op)[0].toUpperCase() + String(p.op).slice(1)} ${p.variable || "(variable)"} ${p.op === "set" ? "to" : p.op === "toggle" ? "" : "by"} ${p.op === "toggle" ? "" : p.value}`,
    code: (g) => (g.f("variable") ? `BC.setVar(ctx, ${S(g.f("variable"))}, ${S(g.f("who"))}, ${S(g.f("op"))}, ${g.e("value")});` : "// No variable selected"),
  },
  {
    type: "score_change", label: "Change score", group: "Variables & logic",
    params: [
      { key: "objective", label: "Scoreboard", kind: "objective", default: "" },
      { key: "op", label: "How", kind: "select", options: ["set", "add", "subtract"], default: "add" },
      { key: "value", label: "Value", kind: "number", default: 1 },
      scoreWho(),
    ],
    summary: (p) => `${p.op === "set" ? "Set" : String(p.op)[0].toUpperCase() + String(p.op).slice(1)} ${p.who === "global" ? "global" : p.who + "'s"} ${p.objective || "(scoreboard)"} ${p.op === "set" ? "to" : "by"} ${p.value}`,
    code: (g) => (g.f("objective") ? `BC.setScore(ctx, ${S(g.f("objective"))}, ${S(g.f("who"))}, ${S(g.f("op"))}, ${g.e("value")});` : "// No scoreboard selected"),
  },
  {
    type: "score_reset", label: "Reset score", group: "Variables & logic",
    params: [{ key: "objective", label: "Scoreboard", kind: "objective", default: "" }, scoreWho()],
    summary: (p) => `Reset ${p.who === "global" ? "global" : p.who + "'s"} ${p.objective || "(scoreboard)"}`,
    code: (g) => (g.f("objective") ? `BC.resetScore(ctx, ${S(g.f("objective"))}, ${S(g.f("who"))});` : "// No scoreboard selected"),
  },
  {
    type: "score_show", label: "Show scoreboard", group: "Chat & screen",
    params: [
      { key: "objective", label: "Scoreboard", kind: "objective", default: "" },
      { key: "slot", label: "Where", kind: "select", options: ["Sidebar", "List", "BelowName"], default: "Sidebar" },
      { key: "order", label: "Order", kind: "select", options: ["highest first", "lowest first"], default: "highest first" },
    ],
    summary: (p) => `Show ${p.objective || "(scoreboard)"} in the ${String(p.slot).toLowerCase()}`,
    code: (g) => (g.f("objective") ? `BC.showScore(${S(g.f("objective"))}, ${S(g.f("slot"))}, ${g.f("order") === "lowest first"});` : "// No scoreboard selected"),
  },
  {
    type: "score_hide", label: "Hide scoreboard", group: "Chat & screen",
    params: [{ key: "slot", label: "From", kind: "select", options: ["Sidebar", "List", "BelowName"], default: "Sidebar" }],
    summary: (p) => `Hide the ${String(p.slot).toLowerCase()} scoreboard`,
    code: (g) => `BC.hideScore(${S(g.f("slot"))});`,
  },
  {
    type: "run_procedure", label: "Run another procedure", group: "Variables & logic",
    params: [{ key: "procedure", label: "Procedure", kind: "procedure", default: "" }],
    summary: (p) => `Run ${p.procedure || "(procedure)"}`,
    code: (g) => (g.f("procedure") ? `${fnName("proc", String(g.f("procedure")))}(ctx);` : "// No procedure selected"),
  },
  {
    type: "command", label: "Run command", group: "Advanced",
    params: [
      { key: "as", label: "Run as", kind: "select", options: ["player", "target", "world"], default: "player" },
      { key: "command", label: "Command (no /)", kind: "text", default: "say hi" },
    ],
    summary: (p) => `/${p.command}`,
    code: (g) => `BC.cmd(ctx, ${S(g.f("as"))}, BC.fmt(ctx, ${g.e("command")}));`,
  },
  {
    type: "script", label: "Custom JavaScript", group: "Advanced",
    params: [{ key: "code", label: "Code (ctx.player, ctx.target, ctx.dimension)", kind: "longtext", default: "// world, system and ctx are available\n" }],
    summary: () => "Custom JavaScript",
    code: (g) => String(g.f("code")),
  },
];

export interface ConditionSpec {
  type: string;
  label: string;
  params: ParamSpec[];
  summary: (p: P) => string;
  code: (g: Gen) => string;
}

export const CONDITIONS: ConditionSpec[] = [
  {
    type: "chance", label: "Random chance", params: [{ key: "percent", label: "Chance %", kind: "number", default: 50 }],
    summary: (p) => `${p.percent}% chance`, code: (g) => `Math.random() * 100 < (${g.e("percent")})`,
  },
  {
    type: "sneaking", label: "Player is sneaking", params: [],
    summary: () => "player is sneaking", code: () => `ctx.player?.isSneaking === true`,
  },
  {
    type: "holding", label: "Player is holding item", params: [{ key: "item", label: "Item", kind: "item", default: "minecraft:stick" }],
    summary: (p) => `player holds ${p.item}`, code: (g) => `BC.held(ctx.player) === ${S(g.f("item"))}`,
  },
  {
    type: "held_enchant", label: "Held item has enchantment",
    params: [{ key: "enchantment", label: "Enchantment", kind: "enchantment", default: "" }, { key: "level", label: "At least level", kind: "number", default: 1 }],
    summary: (p) => `held item has ${p.enchantment || "(none)"} ≥ ${p.level}`,
    code: (g) => `bcEnchantLevel(BC.heldStack(ctx.player), ${S(g.f("enchantment"))}) >= (${g.e("level")})`,
  },
  {
    type: "holding_tag", label: "Player is holding an item tagged", params: [{ key: "tag", label: "Item tag", kind: "text", default: "minecraft:is_sword" }],
    summary: (p) => `held item has tag ${p.tag}`, code: (g) => `BC.heldStack(ctx.player)?.hasTag(String(${g.e("tag")})) === true`,
  },
  {
    type: "block_has_tag", label: "Block has tag", params: [{ key: "tag", label: "Block tag", kind: "text", default: "minecraft:stone" }],
    summary: (p) => `block has tag ${p.tag}`, code: (g) => `BC.blockAt(ctx, "block")?.hasTag(String(${g.e("tag")})) === true`,
  },
  {
    type: "block_state_is", label: "Block state is",
    params: [{ key: "state", label: "State", kind: "text", default: "lit" }, { key: "value", label: "Value", kind: "text", default: "true" }],
    summary: (p) => `${p.state} is ${p.value}`, code: (g) => `String(BC.getState(ctx, "block", String(${g.e("state")}))) === String(${g.e("value")})`,
  },
  {
    type: "has_tag", label: "Has tag", params: [who(), { key: "tag", label: "Tag", kind: "text", default: "my_tag" }],
    summary: (p) => `${p.who} has tag “${p.tag}”`, code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.hasTag(String(${g.e("tag")})) === true`,
  },
  {
    type: "target_is", label: "Target is entity type", params: [{ key: "entity", label: "Entity", kind: "entity", default: "minecraft:zombie" }],
    summary: (p) => `target is ${p.entity}`, code: (g) => `ctx.target?.typeId === ${S(g.f("entity"))}`,
  },
  {
    type: "health_below", label: "Health is below", params: [who(), { key: "value", label: "Health", kind: "number", default: 6 }],
    summary: (p) => `${p.who} health < ${p.value}`,
    code: (g) => `(BC.who(ctx, ${S(g.f("who"))})?.getComponent("minecraft:health")?.currentValue ?? 0) < (${g.e("value")})`,
  },
  {
    type: "in_water", label: "Is in water", params: [who()],
    summary: (p) => `${p.who} is in water`, code: (g) => `BC.who(ctx, ${S(g.f("who"))})?.isInWater === true`,
  },
  {
    type: "dimension", label: "In dimension",
    params: [{ key: "dimension", label: "Dimension", kind: "select", options: ["overworld", "nether", "the_end"], default: "overworld" }],
    summary: (p) => `in the ${p.dimension}`, code: (g) => `BC.dim(ctx).id === ${S(`minecraft:${g.f("dimension")}`)}`,
  },
  {
    type: "daytime", label: "It is daytime", params: [],
    summary: () => "it is daytime", code: () => `BC.isDay()`,
  },
  {
    type: "y_above", label: "Height is above", params: [who(), { key: "y", label: "Y level", kind: "number", default: 64 }],
    summary: (p) => `${p.who} is above y=${p.y}`, code: (g) => `(BC.at(ctx, ${S(g.f("who"))})?.y ?? 0) > (${g.e("y")})`,
  },
  {
    type: "var_compare", label: "Variable compares to",
    params: [
      { key: "variable", label: "Variable", kind: "variable", default: "" },
      { key: "op", label: "Is", kind: "select", options: ["=", "≠", "<", "≤", ">", "≥"], default: "≥" },
      { key: "value", label: "Value", kind: "text", default: "1" },
      { key: "who", label: "Whose (player variables)", kind: "who", default: "player" },
    ],
    summary: (p) => `${p.variable || "(variable)"} ${p.op} ${p.value}`,
    code: (g) => `BC.compare(BC.getVar(ctx, ${S(g.f("variable"))}, ${S(g.f("who"))}), ${S(g.f("op"))}, ${g.e("value")})`,
  },
  {
    type: "score_compare", label: "Score compares to",
    params: [
      { key: "objective", label: "Scoreboard", kind: "objective", default: "" },
      { key: "op", label: "Is", kind: "select", options: ["=", "≠", "<", "≤", ">", "≥"], default: "≥" },
      { key: "value", label: "Value", kind: "number", default: 10 },
      scoreWho(),
    ],
    summary: (p) => `${p.who === "global" ? "global" : p.who + "'s"} ${p.objective || "(scoreboard)"} ${p.op} ${p.value}`,
    code: (g) => `BC.compare(BC.getScore(ctx, ${S(g.f("objective"))}, ${S(g.f("who"))}), ${S(g.f("op"))}, ${g.e("value")})`,
  },
];

export interface TriggerSpec {
  type: TriggerType;
  label: string;
  /** What the filter field matches, if any. */
  filter: null | { kind: "item" | "block" | "entity"; label: string };
  /** Which context slots are filled for actions. */
  has: { target: boolean; block: boolean };
  help: string;
}

export const TRIGGERS: TriggerSpec[] = [
  { type: "item_use", label: "Player uses (right-clicks) an item", filter: { kind: "item", label: "Item" }, has: { target: false, block: false }, help: "Fires when a player uses the item in the air." },
  { type: "item_eat", label: "Player finishes eating/drinking", filter: { kind: "item", label: "Item" }, has: { target: false, block: false }, help: "Fires after a food or potion is consumed." },
  { type: "item_hit", label: "Player hits an entity with an item", filter: { kind: "item", label: "Held item" }, has: { target: true, block: false }, help: "Target is the entity that was hit." },
  { type: "block_break", label: "Player breaks a block", filter: { kind: "block", label: "Block" }, has: { target: false, block: true }, help: "Block location is where the block was." },
  { type: "block_place", label: "Player places a block", filter: { kind: "block", label: "Block" }, has: { target: false, block: true }, help: "" },
  { type: "block_interact", label: "Player right-clicks a block", filter: { kind: "block", label: "Block" }, has: { target: false, block: true }, help: "" },
  { type: "entity_hit", label: "Player attacks an entity", filter: { kind: "entity", label: "Entity type" }, has: { target: true, block: false }, help: "Target is the attacked entity." },
  { type: "entity_hurt", label: "An entity gets hurt", filter: { kind: "entity", label: "Entity type" }, has: { target: true, block: false }, help: "Target is the hurt entity; player is the attacker if it was a player." },
  { type: "entity_die", label: "An entity dies", filter: { kind: "entity", label: "Entity type" }, has: { target: true, block: false }, help: "Target is the dead entity; player is the killer if it was a player." },
  { type: "player_join", label: "Player joins the world", filter: null, has: { target: false, block: false }, help: "" },
  { type: "player_respawn", label: "Player respawns", filter: null, has: { target: false, block: false }, help: "" },
  { type: "tick", label: "Every few ticks (for each player)", filter: null, has: { target: false, block: false }, help: "20 ticks = 1 second." },
  { type: "redstone_on", label: "A block receives redstone power", filter: { kind: "block", label: "Block" }, has: { target: false, block: true }, help: "Works on your blocks with “Reacts to redstone” turned on. {power} is the signal strength." },
  { type: "redstone_off", label: "A block loses redstone power", filter: { kind: "block", label: "Block" }, has: { target: false, block: true }, help: "Works on your blocks with “Reacts to redstone” turned on." },
  { type: "projectile_hit_entity", label: "A projectile hits an entity", filter: { kind: "entity", label: "Projectile" }, has: { target: true, block: true }, help: "Target is the entity hit; player is whoever threw or shot it." },
  { type: "projectile_hit_block", label: "A projectile hits a block", filter: { kind: "entity", label: "Projectile" }, has: { target: false, block: true }, help: "Block location is where it hit; player is whoever threw or shot it." },
  { type: "manual", label: "Only when run by another procedure, command or form", filter: null, has: { target: true, block: true }, help: "Use the “Run another procedure” step to start it. It sees the same player and target as whatever ran it." },
];

export const actionSpec = (t: string) => ACTIONS.find((a) => a.type === t);
export const conditionSpec = (t: string) => CONDITIONS.find((c) => c.type === t);
export const triggerSpec = (t: string) => TRIGGERS.find((x) => x.type === t)!;

export function defaultParams(specs: ParamSpec[]): P {
  return Object.fromEntries(specs.map((s) => [s.key, s.default]));
}
