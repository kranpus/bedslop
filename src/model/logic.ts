// Catalog of triggers, conditions and actions for procedures and commands.
// Each entry carries both the UI description and the JavaScript it compiles to.

import type { TriggerType } from "./types";

export type ParamKind =
  | "text" | "longtext" | "number" | "bool" | "item" | "block" | "entity" | "effect" | "sound"
  | "who" | "at" | "select";

export interface ParamSpec {
  key: string;
  label: string;
  kind: ParamKind;
  options?: string[];
  default: string | number | boolean;
}

type P = Record<string, string | number | boolean>;
const S = (v: unknown) => JSON.stringify(v ?? "");
const N = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface ActionSpec {
  type: string;
  label: string;
  group: "Chat & screen" | "Entities" | "Items" | "World" | "Advanced";
  params: ParamSpec[];
  /** Short sentence for the action list, e.g. "Give 3 × minecraft:diamond". */
  summary: (p: P) => string;
  code: (p: P) => string;
}

const who = (d: "player" | "target" = "player"): ParamSpec => ({ key: "who", label: "Who", kind: "who", default: d });
const at = (d: "player" | "target" | "block" = "player"): ParamSpec => ({ key: "at", label: "Where", kind: "at", default: d });

export const ACTIONS: ActionSpec[] = [
  {
    type: "message", label: "Send chat message", group: "Chat & screen",
    params: [
      { key: "text", label: "Message", kind: "text", default: "Hello {player}!" },
      { key: "to", label: "Send to", kind: "select", options: ["player", "everyone"], default: "player" },
    ],
    summary: (p) => `Say “${p.text}” to ${p.to}`,
    code: (p) => `BC.message(ctx, ${S(p.to)}, ${S(p.text)});`,
  },
  {
    type: "title", label: "Show title", group: "Chat & screen",
    params: [
      { key: "text", label: "Title", kind: "text", default: "Welcome!" },
      { key: "subtitle", label: "Subtitle", kind: "text", default: "" },
    ],
    summary: (p) => `Show title “${p.text}”`,
    code: (p) => `BC.title(ctx, ${S(p.text)}, ${S(p.subtitle)});`,
  },
  {
    type: "actionbar", label: "Show action bar text", group: "Chat & screen",
    params: [{ key: "text", label: "Text", kind: "text", default: "Something happened" }],
    summary: (p) => `Action bar “${p.text}”`,
    code: (p) => `ctx.player?.onScreenDisplay.setActionBar(BC.fmt(ctx, ${S(p.text)}));`,
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
    code: (p) => `BC.who(ctx, ${S(p.who)})?.addEffect(${S(p.effect)}, ${Math.round(N(p.seconds, 1) * 20)}, { amplifier: ${N(p.amplifier)}, showParticles: ${!!p.particles} });`,
  },
  {
    type: "clear_effects", label: "Clear all effects", group: "Entities",
    params: [who()],
    summary: (p) => `Clear effects from ${p.who}`,
    code: (p) => `BC.cmd(ctx, ${S(p.who)}, "effect @s clear");`,
  },
  {
    type: "heal", label: "Heal", group: "Entities",
    params: [who(), { key: "amount", label: "Health points", kind: "number", default: 4 }],
    summary: (p) => `Heal ${p.who} by ${p.amount}`,
    code: (p) => `BC.heal(ctx, ${S(p.who)}, ${N(p.amount)});`,
  },
  {
    type: "damage", label: "Damage", group: "Entities",
    params: [who("target"), { key: "amount", label: "Damage", kind: "number", default: 4 }],
    summary: (p) => `Deal ${p.amount} damage to ${p.who}`,
    code: (p) => `BC.who(ctx, ${S(p.who)})?.applyDamage(${N(p.amount)});`,
  },
  {
    type: "fire", label: "Set on fire", group: "Entities",
    params: [who("target"), { key: "seconds", label: "Seconds", kind: "number", default: 5 }],
    summary: (p) => `Set ${p.who} on fire for ${p.seconds}s`,
    code: (p) => `BC.who(ctx, ${S(p.who)})?.setOnFire(${N(p.seconds)}, true);`,
  },
  {
    type: "kill", label: "Kill", group: "Entities",
    params: [who("target")],
    summary: (p) => `Kill ${p.who}`,
    code: (p) => `BC.who(ctx, ${S(p.who)})?.kill();`,
  },
  {
    type: "launch", label: "Launch upwards", group: "Entities",
    params: [who(), { key: "power", label: "Strength", kind: "number", default: 1.2 }],
    summary: (p) => `Launch ${p.who} up (${p.power})`,
    code: (p) => `BC.who(ctx, ${S(p.who)})?.applyKnockback({ x: 0, z: 0 }, ${N(p.power, 1)});`,
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
    code: (p) => `BC.teleport(ctx, ${S(p.who)}, ${S(p.mode)}, ${N(p.x)}, ${N(p.y)}, ${N(p.z)});`,
  },
  {
    type: "add_tag", label: "Add tag", group: "Entities",
    params: [who(), { key: "tag", label: "Tag", kind: "text", default: "my_tag" }],
    summary: (p) => `Tag ${p.who} with “${p.tag}”`,
    code: (p) => `BC.who(ctx, ${S(p.who)})?.addTag(${S(p.tag)});`,
  },
  {
    type: "remove_tag", label: "Remove tag", group: "Entities",
    params: [who(), { key: "tag", label: "Tag", kind: "text", default: "my_tag" }],
    summary: (p) => `Remove tag “${p.tag}” from ${p.who}`,
    code: (p) => `BC.who(ctx, ${S(p.who)})?.removeTag(${S(p.tag)});`,
  },
  {
    type: "give", label: "Give item", group: "Items",
    params: [
      { key: "item", label: "Item", kind: "item", default: "minecraft:diamond" },
      { key: "count", label: "Count", kind: "number", default: 1 },
    ],
    summary: (p) => `Give ${p.count} × ${p.item}`,
    code: (p) => `BC.give(ctx, ${S(p.item)}, ${Math.max(1, Math.round(N(p.count, 1)))});`,
  },
  {
    type: "drop_item", label: "Drop item on the ground", group: "Items",
    params: [
      at("block"),
      { key: "item", label: "Item", kind: "item", default: "minecraft:emerald" },
      { key: "count", label: "Count", kind: "number", default: 1 },
    ],
    summary: (p) => `Drop ${p.count} × ${p.item} at ${p.at}`,
    code: (p) => `BC.dropItem(ctx, ${S(p.at)}, ${S(p.item)}, ${Math.max(1, Math.round(N(p.count, 1)))});`,
  },
  {
    type: "xp", label: "Give XP levels", group: "Items",
    params: [{ key: "levels", label: "Levels", kind: "number", default: 1 }],
    summary: (p) => `Give ${p.levels} XP levels`,
    code: (p) => `ctx.player?.addLevels(${Math.round(N(p.levels, 1))});`,
  },
  {
    type: "spawn", label: "Spawn entity", group: "World",
    params: [
      at("player"),
      { key: "entity", label: "Entity", kind: "entity", default: "minecraft:zombie" },
      { key: "count", label: "How many", kind: "number", default: 1 },
    ],
    summary: (p) => `Spawn ${p.count} × ${p.entity} at ${p.at}`,
    code: (p) => `BC.spawn(ctx, ${S(p.at)}, ${S(p.entity)}, ${Math.max(1, Math.round(N(p.count, 1)))});`,
  },
  {
    type: "lightning", label: "Strike lightning", group: "World",
    params: [at("target")],
    summary: (p) => `Lightning at ${p.at}`,
    code: (p) => `BC.spawn(ctx, ${S(p.at)}, "minecraft:lightning_bolt", 1);`,
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
    code: (p) => `BC.explode(ctx, ${S(p.at)}, ${N(p.power, 3)}, ${!!p.fire}, ${!!p.breaks});`,
  },
  {
    type: "set_block", label: "Place block", group: "World",
    params: [
      at("block"),
      { key: "block", label: "Block", kind: "block", default: "minecraft:gold_block" },
      { key: "dy", label: "Y offset", kind: "number", default: 0 },
    ],
    summary: (p) => `Place ${p.block} at ${p.at}${N(p.dy) ? ` (y${N(p.dy) > 0 ? "+" : ""}${p.dy})` : ""}`,
    code: (p) => `BC.setBlock(ctx, ${S(p.at)}, ${S(p.block)}, ${Math.round(N(p.dy))});`,
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
    code: (p) => `BC.sound(ctx, ${S(p.at)}, ${S(p.sound)}, ${N(p.volume, 1)}, ${N(p.pitch, 1)});`,
  },
  {
    type: "time", label: "Set time of day", group: "World",
    params: [{ key: "time", label: "Time", kind: "select", options: ["day", "noon", "sunset", "night", "midnight", "sunrise"], default: "day" }],
    summary: (p) => `Set time to ${p.time}`,
    code: (p) => `world.setTimeOfDay(${({ day: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000, sunrise: 23000 } as Record<string, number>)[String(p.time)] ?? 1000});`,
  },
  {
    type: "weather", label: "Set weather", group: "World",
    params: [{ key: "weather", label: "Weather", kind: "select", options: ["clear", "rain", "thunder"], default: "clear" }],
    summary: (p) => `Set weather to ${p.weather}`,
    code: (p) => `BC.cmd(ctx, "world", ${S(`weather ${p.weather}`)});`,
  },
  {
    type: "command", label: "Run command", group: "Advanced",
    params: [
      { key: "as", label: "Run as", kind: "select", options: ["player", "target", "world"], default: "player" },
      { key: "command", label: "Command (no /)", kind: "text", default: "say hi" },
    ],
    summary: (p) => `/${p.command}`,
    code: (p) => `BC.cmd(ctx, ${S(p.as)}, ${S(String(p.command).replace(/^\//, ""))});`,
  },
  {
    type: "script", label: "Custom JavaScript", group: "Advanced",
    params: [{ key: "code", label: "Code (ctx.player, ctx.target, ctx.dimension)", kind: "longtext", default: "// world, system and ctx are available\n" }],
    summary: () => "Custom JavaScript",
    code: (p) => String(p.code),
  },
];

export interface ConditionSpec {
  type: string;
  label: string;
  params: ParamSpec[];
  summary: (p: P) => string;
  code: (p: P) => string;
}

export const CONDITIONS: ConditionSpec[] = [
  {
    type: "chance", label: "Random chance", params: [{ key: "percent", label: "Chance %", kind: "number", default: 50 }],
    summary: (p) => `${p.percent}% chance`, code: (p) => `Math.random() * 100 < ${N(p.percent, 50)}`,
  },
  {
    type: "sneaking", label: "Player is sneaking", params: [],
    summary: () => "player is sneaking", code: () => `ctx.player?.isSneaking === true`,
  },
  {
    type: "holding", label: "Player is holding item", params: [{ key: "item", label: "Item", kind: "item", default: "minecraft:stick" }],
    summary: (p) => `player holds ${p.item}`, code: (p) => `BC.held(ctx.player) === ${S(p.item)}`,
  },
  {
    type: "has_tag", label: "Has tag", params: [who(), { key: "tag", label: "Tag", kind: "text", default: "my_tag" }],
    summary: (p) => `${p.who} has tag “${p.tag}”`, code: (p) => `BC.who(ctx, ${S(p.who)})?.hasTag(${S(p.tag)}) === true`,
  },
  {
    type: "target_is", label: "Target is entity type", params: [{ key: "entity", label: "Entity", kind: "entity", default: "minecraft:zombie" }],
    summary: (p) => `target is ${p.entity}`, code: (p) => `ctx.target?.typeId === ${S(p.entity)}`,
  },
  {
    type: "health_below", label: "Health is below", params: [who(), { key: "value", label: "Health", kind: "number", default: 6 }],
    summary: (p) => `${p.who} health < ${p.value}`,
    code: (p) => `(BC.who(ctx, ${S(p.who)})?.getComponent("minecraft:health")?.currentValue ?? 0) < ${N(p.value)}`,
  },
  {
    type: "in_water", label: "Is in water", params: [who()],
    summary: (p) => `${p.who} is in water`, code: (p) => `BC.who(ctx, ${S(p.who)})?.isInWater === true`,
  },
  {
    type: "dimension", label: "In dimension",
    params: [{ key: "dimension", label: "Dimension", kind: "select", options: ["overworld", "nether", "the_end"], default: "overworld" }],
    summary: (p) => `in the ${p.dimension}`, code: (p) => `BC.dim(ctx).id === ${S(`minecraft:${p.dimension}`)}`,
  },
  {
    type: "daytime", label: "It is daytime", params: [],
    summary: () => "it is daytime", code: () => `BC.isDay()`,
  },
  {
    type: "y_above", label: "Height is above", params: [who(), { key: "y", label: "Y level", kind: "number", default: 64 }],
    summary: (p) => `${p.who} is above y=${p.y}`, code: (p) => `(BC.at(ctx, ${S(p.who)})?.y ?? 0) > ${N(p.y)}`,
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
];

export const actionSpec = (t: string) => ACTIONS.find((a) => a.type === t);
export const conditionSpec = (t: string) => CONDITIONS.find((c) => c.type === t);
export const triggerSpec = (t: string) => TRIGGERS.find((x) => x.type === t)!;

export function defaultParams(specs: ParamSpec[]): P {
  return Object.fromEntries(specs.map((s) => [s.key, s.default]));
}
