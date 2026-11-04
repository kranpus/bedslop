import { actionSpec, conditionSpec, fnName, literalGen } from "../model/logic";
import type { Action, CommandElement, Condition, ProcedureElement } from "../model/types";
import type { GenContext } from "./context";
import { blocksToBody } from "./blocks";

const S = JSON.stringify;

/** Helper library included at the top of scripts/main.js. Kept small and dependency free. */
export const RUNTIME = `const BC = {
  who(ctx, w) { return w === "target" ? ctx.target : ctx.player; },
  dim(ctx) { return ctx.dimension ?? ctx.player?.dimension ?? world.getDimension("overworld"); },
  at(ctx, a) {
    if (a === "block") return ctx.block ?? ctx.location;
    const e = BC.who(ctx, a);
    try { if (e?.isValid) return e.location; } catch {}
    return ctx.location ?? ctx.block;
  },
  center(l) { return { x: l.x + 0.5, y: l.y, z: l.z + 0.5 }; },
  ctxP(p) { return { player: p, dimension: p.dimension, location: p.location }; },
  name(e) {
    if (!e) return "";
    if (e.typeId === "minecraft:player") return e.name;
    return e.nameTag || e.typeId.split(":").pop().replace(/_/g, " ");
  },
  fmt(ctx, t) {
    return String(t ?? "").replace(/\\{(\\w+)(?::([\\w.-]+))?\\}/g, (m, k, sub) => {
      if (sub) return k === "score" ? String(BC.getScore(ctx, sub, "player")) : m;
      if (k === "player") return BC.name(ctx.player);
      if (k === "target") return BC.name(ctx.target);
      if (ctx.args && k in ctx.args) return String(ctx.args[k]);
      if (k in BC_VARS) return String(BC.getVar(ctx, k, "player"));
      return m;
    });
  },
  key(name) { return NAMESPACE + ":" + name; },
  holder(ctx, name, who) { const d = BC_VARS[name]; return d && (d[0] === "world" ? world : BC.who(ctx, who)); },
  getVar(ctx, name, who) {
    const d = BC_VARS[name];
    if (!d) return 0;
    let v;
    try { v = BC.holder(ctx, name, who)?.getDynamicProperty(BC.key(name)); } catch {}
    return v === undefined ? d[2] : v;
  },
  setVar(ctx, name, who, op, value) {
    const d = BC_VARS[name];
    const h = BC.holder(ctx, name, who);
    if (!d || !h) return;
    const cur = BC.getVar(ctx, name, who);
    let next;
    if (d[1] === "number") {
      const n = Number(value) || 0, c = Number(cur) || 0;
      next = op === "add" ? c + n : op === "subtract" ? c - n : op === "multiply" ? c * n : op === "divide" ? (n ? c / n : c) : n;
    } else if (d[1] === "boolean") {
      next = op === "toggle" ? !cur : value === true || value === 1 || value === "true";
    } else {
      next = op === "add" ? String(cur) + String(value) : String(value ?? "");
    }
    h.setDynamicProperty(BC.key(name), next);
  },
  compare(a, op, b) {
    const na = Number(a), nb = Number(b);
    const num = a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb);
    const x = num ? na : String(a), y = num ? nb : String(b);
    switch (op) {
      case "≠": return x !== y;
      case "<": return x < y;
      case "≤": return x <= y;
      case ">": return x > y;
      case "≥": return x >= y;
      default: return x === y;
    }
  },
  randInt(a, b) { const lo = Math.ceil(Math.min(Number(a), Number(b))), hi = Math.floor(Math.max(Number(a), Number(b))); return lo + Math.floor(Math.random() * (hi - lo + 1)); },
  /** Scoreboards. "global" scores belong to a fake player named "global", like /scoreboard. */
  objective(name) {
    const sb = world.scoreboard;
    return sb.getObjective(name) ?? sb.addObjective(name, BC_SCORES[name]?.[0] ?? name);
  },
  scoreHolder(ctx, who) { return who === "global" ? "global" : BC.who(ctx, who); },
  getScore(ctx, name, who) {
    try { const h = BC.scoreHolder(ctx, who); return (h && BC.objective(name).getScore(h)) ?? 0; } catch { return 0; }
  },
  setScore(ctx, name, who, op, value) {
    const h = BC.scoreHolder(ctx, who);
    if (!h) return;
    const o = BC.objective(name), n = Math.round(Number(value) || 0);
    if (op === "set") o.setScore(h, n);
    else o.addScore(h, op === "subtract" ? -n : n);
  },
  resetScore(ctx, name, who) { const h = BC.scoreHolder(ctx, who); if (h) BC.objective(name).removeParticipant(h); },
  showScore(name, slot, ascending) {
    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId[/** @type {"Sidebar"} */ (slot)] ?? DisplaySlotId.Sidebar,
      { objective: BC.objective(name), sortOrder: ascending ? ObjectiveSortOrder.Ascending : ObjectiveSortOrder.Descending });
  },
  hideScore(slot) { world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId[/** @type {"Sidebar"} */ (slot)] ?? DisplaySlotId.Sidebar); },
  /** Lists in the block editor. Positions start at 1. */
  list(x) { return Array.isArray(x) ? x : []; },
  listPos(l, where, at) {
    if (where === "FIRST") return 0;
    if (where === "LAST") return l.length - 1;
    if (where === "RANDOM") return Math.floor(Math.random() * l.length);
    const n = Math.round(Number(at) || 1);
    return where === "FROM_END" ? l.length - n : n - 1;
  },
  listGet(x, where, at, mode) {
    const l = BC.list(x);
    const i = BC.listPos(l, where, at);
    if (i < 0 || i >= l.length) return undefined;
    return mode === "GET" ? l[i] : l.splice(i, 1)[0];
  },
  listSet(x, mode, where, at, value) {
    const l = BC.list(x);
    if (mode === "INSERT") { l.splice(Math.max(0, Math.min(l.length, where === "LAST" ? l.length : BC.listPos(l, where, at))), 0, value); return; }
    const i = BC.listPos(l, where, at);
    if (i >= 0 && i < l.length) l[i] = value;
  },
  /** The block at a place in the context (procedure blocks are positions). */
  blockAt(ctx, a) {
    const l = BC.at(ctx, a);
    if (!l) return undefined;
    try { return BC.dim(ctx).getBlock({ x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }); } catch { return undefined; }
  },
  stateKey(name) { return String(name).includes(":") ? String(name) : NAMESPACE + ":" + name; },
  getState(ctx, a, name) {
    const b = BC.blockAt(ctx, a);
    return b ? b.permutation.getState(/** @type {any} */ (BC.stateKey(name))) : undefined;
  },
  setState(ctx, a, name, value) {
    const b = BC.blockAt(ctx, a);
    if (!b) return;
    const key = BC.stateKey(name);
    const cur = b.permutation.getState(/** @type {any} */ (key));
    if (cur === undefined) return;
    const v = typeof cur === "boolean" ? value === true || String(value) === "true" || String(value) === "1"
      : typeof cur === "number" ? Number(value) : String(value);
    try { b.setPermutation(b.permutation.withState(/** @type {any} */ (key), /** @type {any} */ (v))); } catch { /* not a valid value */ }
  },
  cycleState(ctx, a, name) {
    const b = BC.blockAt(ctx, a);
    if (!b) return;
    const key = BC.stateKey(name);
    const cur = b.permutation.getState(/** @type {any} */ (key));
    const values = BlockStates.get(key)?.validValues;
    if (cur === undefined || !values?.length) return;
    const next = values[(values.indexOf(cur) + 1) % values.length];
    b.setPermutation(b.permutation.withState(/** @type {any} */ (key), /** @type {any} */ (next)));
  },
  heldStack(p) {
    if (!p || p.typeId !== "minecraft:player") return undefined;
    return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex);
  },
  held(p) {
    if (!p || p.typeId !== "minecraft:player") return undefined;
    return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId;
  },
  isDay() { const t = world.getTimeOfDay(); return t < 12500 || t > 23500; },
  message(ctx, to, t) {
    const text = BC.fmt(ctx, t);
    if (to === "everyone") world.sendMessage(text); else ctx.player?.sendMessage(text);
  },
  title(ctx, t, sub) {
    ctx.player?.onScreenDisplay.setTitle(BC.fmt(ctx, t), { subtitle: BC.fmt(ctx, sub), fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
  },
  cmd(ctx, as, command) {
    command = String(command).replace(/^\\s*\\//, "");
    const e = as === "world" ? undefined : BC.who(ctx, as);
    if (e) return e.runCommand(command);
    const l = BC.at(ctx, "block");
    const dim = BC.dim(ctx);
    return l ? dim.runCommand(\`execute positioned \${l.x} \${l.y} \${l.z} run \${command}\`) : dim.runCommand(command);
  },
  heal(ctx, w, n) {
    const h = BC.who(ctx, w)?.getComponent("minecraft:health");
    if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + n));
  },
  teleport(ctx, w, mode, x, y, z) {
    const e = BC.who(ctx, w);
    if (!e) return;
    const l = e.location;
    e.teleport(mode === "relative" ? { x: l.x + x, y: l.y + y, z: l.z + z } : { x, y, z });
  },
  give(ctx, item, n) {
    const inv = ctx.player?.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    const left = inv.addItem(new ItemStack(item, n));
    if (left) ctx.player.dimension.spawnItem(left, ctx.player.location);
  },
  dropItem(ctx, a, item, n) { const l = BC.at(ctx, a); if (l) BC.dim(ctx).spawnItem(new ItemStack(item, n), l); },
  spawn(ctx, a, id, n) { const l = BC.at(ctx, a); if (l) for (let i = 0; i < n; i++) BC.dim(ctx).spawnEntity(id, l); },
  particle(ctx, name, a, height) {
    const l = BC.at(ctx, a);
    if (!l) return;
    const id = name.includes(":") ? name : NAMESPACE + ":" + name;
    const block = a === "block" && ctx.block;
    BC.dim(ctx).spawnParticle(id, { x: l.x + (block ? 0.5 : 0), y: l.y + Number(height || 0), z: l.z + (block ? 0.5 : 0) });
  },
  /** Places one of this add-on's structures; "centered" puts its middle (not its corner) on the spot. */
  structure(ctx, name, a, degrees, centered) {
    const l = BC.at(ctx, a);
    if (!l) return;
    const id = name.includes(":") ? name : NAMESPACE + ":" + name;
    const rotation = /** @type {any} */ ({ 90: "Rotate90", 180: "Rotate180", 270: "Rotate270" }[degrees] ?? "None");
    const p = { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
    if (centered) {
      const s = world.structureManager.get(id)?.size;
      if (s) {
        const turned = degrees === 90 || degrees === 270;
        p.x -= Math.floor((turned ? s.z : s.x) / 2);
        p.z -= Math.floor((turned ? s.x : s.z) / 2);
      }
    }
    world.structureManager.place(id, BC.dim(ctx), p, { rotation });
  },
  explode(ctx, a, power, fire, breaks) { const l = BC.at(ctx, a); if (l) BC.dim(ctx).createExplosion(l, power, { causesFire: fire, breaksBlocks: breaks }); },
  setBlock(ctx, a, id, dy) {
    const l = BC.at(ctx, a);
    if (!l) return;
    BC.dim(ctx).getBlock({ x: Math.floor(l.x), y: Math.floor(l.y) + dy, z: Math.floor(l.z) })?.setType(id);
  },
  sound(ctx, a, id, volume, pitch) { const l = BC.at(ctx, a); if (l) BC.dim(ctx).playSound(id, l, { volume, pitch }); },
  run(name, fn) {
    try { fn(); } catch (err) { console.warn(\`[\${NAMESPACE}] \${name} failed: \${err}\`); }
  },
};
`;

export function conditionsCode(conditions: Condition[], depth = 1): string {
  const pad = "  ".repeat(depth);
  return conditions
    .map((c) => {
      const spec = conditionSpec(c.type);
      if (!spec) return "";
      const expr = spec.code(literalGen(c.params, spec.params));
      return `${pad}if (${c.negate ? "" : "!"}(${expr})) return;\n`;
    })
    .join("");
}

/** Code for a list of simple-editor steps, each guarded so one failure doesn't stop the rest. */
export function actionsBody(actions: Action[], label: string, depth = 1): string {
  const pad = "  ".repeat(depth);
  return actions
    .map((a, i) => {
      const spec = actionSpec(a.type);
      if (!spec) return "";
      const body = spec.code(literalGen(a.params, spec.params)).split("\n").map((l) => pad + "  " + l).join("\n");
      const run = `${pad}BC.run(${S(`${label} → step ${i + 1} (${spec.label})`)}, () => {\n${body}\n${pad}});\n`;
      return a.chance < 100 ? `${pad}if (Math.random() * 100 < ${Number(a.chance) || 0}) {\n${run.replace(/^/gm, "  ")}${pad}}\n` : run;
    })
    .join("");
}

const actionsCode = (actions: Action[], label: string) => actionsBody(actions, label, 1);

export function genProcedure(ctx: GenContext, p: ProcedureElement) {
  const fn = fnName("proc", p.name);
  const filter = p.filter.trim();
  const f = filter ? S(filter) : "";
  const body = `function ${fn}(ctx) {\n${logicBody(ctx, p, p.displayName)}}\n`;
  let hook = "";
  switch (p.trigger) {
    case "player_join":
    case "player_respawn":
      hook = `world.afterEvents.playerSpawn.subscribe((ev) => {\n  if (${p.trigger === "player_join" ? "!" : ""}ev.initialSpawn) return;\n  ${fn}(BC.ctxP(ev.player));\n});`;
      break;
    case "item_use":
      hook = `world.afterEvents.itemUse.subscribe((ev) => {\n${f ? `  if (ev.itemStack?.typeId !== ${f}) return;\n` : ""}  ${fn}(BC.ctxP(ev.source));\n});`;
      break;
    case "item_eat":
      hook = `world.afterEvents.itemCompleteUse.subscribe((ev) => {\n${f ? `  if (ev.itemStack?.typeId !== ${f}) return;\n` : ""}  ${fn}(BC.ctxP(ev.source));\n});`;
      break;
    case "item_hit":
    case "entity_hit":
      hook = `world.afterEvents.entityHitEntity.subscribe((ev) => {\n  const p = ev.damagingEntity;\n  if (p?.typeId !== "minecraft:player") return;\n${
        f ? (p.trigger === "item_hit" ? `  if (BC.held(p) !== ${f}) return;\n` : `  if (ev.hitEntity?.typeId !== ${f}) return;\n`) : ""
      }  ${fn}({ ...BC.ctxP(p), target: ev.hitEntity });\n});`;
      break;
    case "block_break":
      hook = `world.afterEvents.playerBreakBlock.subscribe((ev) => {\n${f ? `  if (ev.brokenBlockPermutation.type.id !== ${f}) return;\n` : ""}  ${fn}({ ...BC.ctxP(ev.player), dimension: ev.dimension, block: BC.center(ev.block.location) });\n});`;
      break;
    case "block_place":
      hook = `world.afterEvents.playerPlaceBlock.subscribe((ev) => {\n${f ? `  if (ev.block.typeId !== ${f}) return;\n` : ""}  ${fn}({ ...BC.ctxP(ev.player), dimension: ev.dimension, block: BC.center(ev.block.location) });\n});`;
      break;
    case "block_interact":
      hook = `world.afterEvents.playerInteractWithBlock.subscribe((ev) => {\n  if (!ev.isFirstEvent) return;\n${f ? `  if (ev.block.typeId !== ${f}) return;\n` : ""}  ${fn}({ ...BC.ctxP(ev.player), block: BC.center(ev.block.location) });\n});`;
      break;
    case "entity_hurt":
      hook = `world.afterEvents.entityHurt.subscribe((ev) => {\n  const t = ev.hurtEntity;\n${f ? `  if (t.typeId !== ${f}) return;\n` : ""}  const a = ev.damageSource.damagingEntity;\n  ${fn}({ player: a?.typeId === "minecraft:player" ? a : undefined, target: t, dimension: t.dimension, location: t.location });\n});`;
      break;
    case "entity_die":
      hook = `world.afterEvents.entityDie.subscribe((ev) => {\n  const t = ev.deadEntity;\n${f ? `  if (t.typeId !== ${f}) return;\n` : ""}  let location, dimension;\n  try { location = t.location; dimension = t.dimension; } catch {}\n  const a = ev.damageSource.damagingEntity;\n  ${fn}({ player: a?.typeId === "minecraft:player" ? a : undefined, target: t, dimension, location, block: location });\n});`;
      break;
    case "manual":
      hook = "";
      break;
    case "projectile_hit_entity":
    case "projectile_hit_block": {
      const entity = p.trigger === "projectile_hit_entity";
      hook = `world.afterEvents.${entity ? "projectileHitEntity" : "projectileHitBlock"}.subscribe((ev) => {
  let type;
  try { type = ev.projectile.typeId; } catch {}
${f ? `  if (type !== ${f}) return;\n` : ""}  const src = ev.source;
  const hit = ${entity ? "ev.getEntityHit()?.entity" : "undefined"};
  const where = ${entity ? "ev.location" : "BC.center(ev.getBlockHit().block.location)"};
  ${fn}({ player: src?.typeId === "minecraft:player" ? src : undefined, target: hit, dimension: ev.dimension, location: where, block: where });
});`;
      break;
    }
    case "redstone_on":
    case "redstone_off":
      // Started from the block's custom component (see genBlockScripts).
      ctx.script.redstone.push([fn, p.trigger === "redstone_on", filter]);
      hook = "";
      break;
    case "tick":
      hook = `system.runInterval(() => {\n  for (const player of world.getAllPlayers()) ${fn}(BC.ctxP(player));\n}, ${Math.max(1, Math.round(p.intervalTicks) || 20)});`;
      break;
  }
  ctx.script.sections.push(`// Procedure: ${p.displayName}\n${body}${hook}\n`);
}

/** Function body for a procedure or command, from either editor. */
function logicBody(ctx: GenContext, el: ProcedureElement | CommandElement, label: string): string {
  if (el.editor === "blocks") {
    const r = blocksToBody(el.blocks, label);
    for (const p of r.problems) ctx.warn(el, p);
    if (r.count === 0 && !r.problems.length) ctx.warn(el, "has no blocks under the start block yet, so it does nothing.");
    return r.code;
  }
  if (!el.actions.length) ctx.warn(el, "has no actions yet, so it does nothing.");
  return conditionsCode(el.conditions) + actionsCode(el.actions, label);
}

const PERMISSION: Record<CommandElement["permission"], string> = {
  any: "Any", game_directors: "GameDirectors", admin: "Admin", host: "Host", owner: "Owner",
};

export function genCommands(ctx: GenContext, commands: CommandElement[]) {
  if (!commands.length) return;
  ctx.script.imports.add("CommandPermissionLevel").add("CustomCommandStatus");
  const fns: string[] = [];
  const regs: string[] = [];
  const ARG_TYPE: Record<string, string> = {
    integer: "Integer", float: "Float", string: "String", boolean: "Boolean", player: "PlayerSelector",
    item: "ItemType", block: "BlockType", entity_type: "EntityType", enum: "Enum",
  };
  const enums: string[] = [];
  for (const c of commands) {
    const fn = fnName("cmd", c.name);
    fns.push(`// Command: /${ctx.ns}:${c.name}\nfunction ${fn}(ctx) {\n${logicBody(ctx, c, `/${c.name}`)}}\n`);
    // Required arguments must come before optional ones.
    const args = [...(c.args ?? [])].filter((a) => a.name.trim()).sort((a, b) => Number(a.optional) - Number(b.optional));
    if (args.length) ctx.script.imports.add("CustomCommandParamType");
    // Option lists are registered as enums; the parameter is named after its enum.
    const enumName = (a: (typeof args)[number]) => `${ctx.ns}:${c.name}_${a.name}`;
    for (const a of args) {
      if (a.type !== "enum") continue;
      const opts = Array.from(new Set((a.options ?? []).map((o) => o.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_")).filter(Boolean)));
      if (!opts.length) ctx.warn(c, `argument "${a.name}" is a list of options but has none.`, "error");
      enums.push(`  registry.registerEnum(${S(enumName(a))}, ${S(opts.length ? opts : ["none"])});`);
    }
    const param = (a: (typeof args)[number]) => `{ name: ${S(a.type === "enum" ? enumName(a) : a.name)}, type: CustomCommandParamType.${ARG_TYPE[a.type]} }`;
    const mandatory = args.filter((a) => !a.optional), optional = args.filter((a) => a.optional);
    const argNames = args.map((a) => a.name.replace(/[^a-zA-Z0-9_]/g, "_"));
    const collect = args.map((a, i) => a.type === "player"
      ? `      if (${argNames[i]}?.length) { ctx.target = ${argNames[i]}[0]; ctx.args[${S(a.name)}] = ${argNames[i]}[0].name; }\n`
      : ["item", "block", "entity_type"].includes(a.type)
        ? `      if (${argNames[i]} !== undefined) ctx.args[${S(a.name)}] = ${argNames[i]}.id;\n`
        : `      if (${argNames[i]} !== undefined) ctx.args[${S(a.name)}] = ${argNames[i]};\n`).join("");
    regs.push(`  registry.registerCommand(
    {
      name: ${S(`${ctx.ns}:${c.name}`)},
      description: ${S(c.description || c.displayName)},
      permissionLevel: CommandPermissionLevel.${PERMISSION[c.permission]},
      cheatsRequired: ${c.cheatsRequired},${mandatory.length ? `\n      mandatoryParameters: [${mandatory.map(param).join(", ")}],` : ""}${optional.length ? `\n      optionalParameters: [${optional.map(param).join(", ")}],` : ""}
    },
    (origin${argNames.map((n) => `, ${n}`).join("")}) => {
      const src = origin.sourceEntity ?? origin.initiator;
      const ctx = src?.typeId === "minecraft:player" ? BC.ctxP(src) : { dimension: src?.dimension ?? world.getDimension("overworld"), target: src, location: src?.location };
      ctx.args = {};
${collect}      system.run(() => ${fn}(ctx));
      return { status: CustomCommandStatus.Success };
    },
  );`);
  }
  ctx.script.sections.push(
    fns.join("\n") +
      `\nsystem.beforeEvents.startup.subscribe((ev) => {\n  const registry = ev.customCommandRegistry;\n${enums.length ? enums.join("\n") + "\n" : ""}${regs.join("\n")}\n});\n`,
  );
}

function toolsAndFood(ctx: GenContext): string {
  let out = "";
  const tools = ctx.script.tools;
  if (Object.keys(tools).length) {
    out += `// Tool durability: custom tools lose durability when mining and attacking.
const BC_TOOLS = ${S(tools)};
function bcWearTool(player, cost) {
  if (String(player.getGameMode()).toLowerCase() === "creative") return;
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const slot = player.selectedSlotIndex;
  const item = inv.getItem(slot);
  const dur = item?.getComponent("minecraft:durability");
  if (!dur) return;
  const unbreaking = item.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
  if (unbreaking > 0 && Math.random() > 1 / (unbreaking + 1)) return;
  if (dur.damage + cost >= dur.maxDurability) {
    inv.setItem(slot, undefined);
    player.dimension.playSound("random.break", player.location);
    return;
  }
  dur.damage += cost;
  inv.setItem(slot, item);
}
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const cost = BC_TOOLS[ev.itemStackBeforeBreak?.typeId];
  if (cost) BC.run("tool durability", () => bcWearTool(ev.player, cost[0]));
});
world.afterEvents.entityHitEntity.subscribe((ev) => {
  const p = ev.damagingEntity;
  if (p?.typeId !== "minecraft:player") return;
  const cost = BC_TOOLS[BC.held(p)];
  if (cost) BC.run("tool durability", () => bcWearTool(p, cost[1]));
});
`;
  }
  const foods = ctx.script.foods;
  if (Object.keys(foods).length) {
    out += `// Food effects: [effect, ticks, amplifier, chance %]
const BC_FOOD = ${S(foods)};
world.afterEvents.itemCompleteUse.subscribe((ev) => {
  const effects = BC_FOOD[ev.itemStack?.typeId];
  if (!effects) return;
  for (const [effect, ticks, amplifier, chance] of effects) {
    if (Math.random() * 100 < chance) BC.run("food effect", () => ev.source.addEffect(effect, ticks, { amplifier }));
  }
});
`;
  }
  return out;
}

/** Lever toggles, lamp lighting and redstone-triggered procedures, via block custom components. */
export function genBlockScripts(ctx: GenContext) {
  const { blocks, redstone } = ctx.script;
  const inputs = new Set(blocks.filter((b) => b.input).map((b) => b.id));
  for (const [fn, , filter] of redstone) {
    const proc = ctx.project.elements.find((e) => e.kind === "procedure" && fnName("proc", e.name) === fn);
    if (filter && !inputs.has(filter)) ctx.warn(proc, `listens for redstone on ${filter}, but that block doesn't react to redstone. Turn on “Reacts to redstone” in the block's Redstone settings.`, "error");
    else if (!filter && !inputs.size) ctx.warn(proc, "listens for redstone, but no block reacts to redstone yet. Turn on “Reacts to redstone” on a block.", "error");
  }
  if (!blocks.length) return;
  const regs = blocks.map((b) => {
    const handlers: string[] = [];
    const ns = ctx.ns;
    const label = (what: string) => S(`${b.id}: ${what}`);
    if (b.shape === "slab") handlers.push(`    onPlayerInteract(e) {
      BC.run(${label("double slab")}, () => {
        // Using the same slab on a single slab makes it a double slab.
        if (!e.player || bcGetState(e.block, ${S(`${ns}:double`)})) return;
        if (!bcTakeHeld(e.player, ${S(b.id)})) return;
        bcSetState(e.block, ${S(`${ns}:double`)}, true);
        e.dimension.playSound("dig.stone", e.block.location);
      });
    },`);
    if (b.shape === "trapdoor") handlers.push(`    onPlayerInteract(e) {
      BC.run(${label("open/close")}, () => {
        const open = bcGetState(e.block, ${S(`${ns}:open`)}) !== true;
        bcSetState(e.block, ${S(`${ns}:open`)}, open);
        e.dimension.playSound(open ? "random.door_open" : "random.door_close", e.block.location);
      });
    },`);
    if (b.shape === "door") handlers.push(`    onPlace(e) {
      BC.run(${label("place top half")}, () => {
        if (bcGetState(e.block, ${S(`${ns}:upper`)})) return;
        const up = e.block.above();
        if (!up || !up.isAir) {
          // No room for the top half: pop the door back out as an item.
          e.dimension.runCommand(\`setblock \${e.block.location.x} \${e.block.location.y} \${e.block.location.z} air destroy\`);
          return;
        }
        up.setPermutation(bcWith(e.block.permutation, ${S(`${ns}:upper`)}, true));
      });
    },
    onPlayerBreak(e) {
      BC.run(${label("break other half")}, () => {
        const upper = e.brokenBlockPermutation.getState(/** @type {any} */ (${S(`${ns}:upper`)})) === true;
        const other = upper ? e.block.below() : e.block.above();
        if (other?.typeId !== ${S(b.id)}) return;
        const l = other.location;
        // Breaking the top half still drops the door (from the bottom half).
        e.dimension.runCommand(\`setblock \${l.x} \${l.y} \${l.z} air\${upper ? " destroy" : ""}\`);
      });
    },
    onPlayerInteract(e) {
      BC.run(${label("open/close")}, () => {
        const open = bcGetState(e.block, ${S(`${ns}:open`)}) !== true;
        const upper = bcGetState(e.block, ${S(`${ns}:upper`)}) === true;
        bcSetState(e.block, ${S(`${ns}:open`)}, open);
        const other = upper ? e.block.below() : e.block.above();
        if (other?.typeId === ${S(b.id)}) bcSetState(other, ${S(`${ns}:open`)}, open);
        e.dimension.playSound(open ? "random.door_open" : "random.door_close", e.block.location);
      });
    },`);
    if (b.particle) handlers.push(`    onTick(e) {
      BC.run(${label("particles")}, () => e.dimension.spawnParticle(${S(b.particle)}, { x: e.block.location.x + 0.5, y: e.block.location.y + 0.8, z: e.block.location.z + 0.5 }));
    },`);
    if (b.shape === "stairs") handlers.push(`    onPlace(e) { BC.run(${label("stair shape")}, () => bcStairsAround(e.block)); },
    onPlayerBreak(e) { BC.run(${label("stair shape")}, () => bcStairsAround(e.block)); },`);
    if (b.shape === "button") handlers.push(`    onPlayerInteract(e) {
      BC.run(${label("press")}, () => {
        if (bcGetState(e.block, ${S(`${ns}:pressed`)})) return;
        bcSetState(e.block, ${S(`${ns}:pressed`)}, true);
        e.dimension.playSound("random.click", e.block.location, { pitch: 0.6 });
        const l = e.block.location, dim = e.dimension;
        // Pops back out after a second, like a stone button.
        system.runTimeout(() => BC.run(${label("release")}, () => {
          const b = dim.getBlock(l);
          if (b?.typeId !== ${S(b.id)}) return;
          bcSetState(b, ${S(`${ns}:pressed`)}, false);
          dim.playSound("random.click", l, { pitch: 0.5 });
        }), 20);
      });
    },`);
    if (b.shape === "plate") handlers.push(`    onStepOn(e) {
      BC.run(${label("press")}, () => {
        if (bcGetState(e.block, ${S(`${ns}:pressed`)})) return;
        bcSetState(e.block, ${S(`${ns}:pressed`)}, true);
        e.dimension.playSound("random.click", e.block.location, { pitch: 0.8 });
      });
    },
    onStepOff(e) {
      BC.run(${label("release")}, () => {
        bcSetState(e.block, ${S(`${ns}:pressed`)}, false);
        e.dimension.playSound("random.click", e.block.location, { pitch: 0.7 });
      });
    },`);
    if (b.shape === "connect") handlers.push(`    onPlace(e) { BC.run(${label("connect")}, () => bcConnectAround(e.block, true)); },
    onPlayerBreak(e) { BC.run(${label("disconnect")}, () => bcConnectAround(e.block, false)); },`);
    if (b.crop) {
      const c = b.crop, last = c.stages - 1, growth = S(`${ns}:growth`);
      handlers.push(`    onRandomTick(e) {
      BC.run(${label("grow")}, () => {
        const stage = Number(bcGetState(e.block, ${growth}) ?? 0);
        if (stage >= ${last} || Math.random() * 100 >= ${c.chance}) return;${c.needsWater ? `
        // Needs wet farmland underneath.
        const below = e.block.below();
        if (below?.typeId !== "minecraft:farmland" || Number(below.permutation.getState("moisturized_amount") ?? 0) <= 0) return;` : ""}${c.needsSky ? `
        // Needs daylight: daytime, with nothing but air above it.
        if (!BC.isDay()) return;
        const topY = e.dimension.getTopmostBlock({ x: e.block.location.x, z: e.block.location.z })?.location.y ?? e.block.location.y;
        if (topY > e.block.location.y) return;` : ""}
        bcSetState(e.block, ${growth}, stage + 1);
      });
    },${c.boneMeal || c.pick ? `
    onPlayerInteract(e) {
      BC.run(${label("use")}, () => {
        if (!e.player) return;
        const stage = Number(bcGetState(e.block, ${growth}) ?? 0);${c.boneMeal ? `
        if (stage < ${last} && bcTakeHeld(e.player, "minecraft:bone_meal")) {
          bcSetState(e.block, ${growth}, Math.min(${last}, stage + BC.randInt(2, 5)));
          e.dimension.spawnParticle("minecraft:crop_growth_emitter", BC.center(e.block.location));
          return;
        }` : ""}${c.pick ? `
        // Picking: drop the produce and go back to an earlier stage, like sweet berries.
        if (stage < ${last}) return;
        const n = BC.randInt(${Math.max(1, c.pick.min)}, ${Math.max(1, c.pick.max)});
        e.dimension.spawnItem(new ItemStack(${S(c.pick.item)}, n), BC.center(e.block.location));
        bcSetState(e.block, ${growth}, ${c.pick.back});
        e.dimension.playSound("block.sweet_berry_bush.pick", e.block.location);` : ""}
      });
    },` : ""}`);
    }
    if (b.toggleState) handlers.push(`    onPlayerInteract(e) {
      BC.run(${S(`${b.id}: switch`)}, () => {
        const block = e.block;
        const on = bcGetState(block, ${S(b.toggleState)}) !== true;
        bcSetState(block, ${S(b.toggleState)}, on);
        e.dimension.playSound("random.click", block.location, { pitch: on ? 0.6 : 0.5 });
      });
    },`);
    if (b.input) handlers.push(`    onRedstoneUpdate(e) {
      BC.run(${S(`${b.id}: redstone`)}, () => bcRedstone(e, ${S(b.id)}, ${b.litState ? S(b.litState) : "undefined"}));
    },`);
    return `  registry.registerCustomComponent(${S(b.component)}, {\n${handlers.join("\n")}\n  });`;
  });
  ctx.script.sections.push(`// Custom block behaviour
/** Procedures started by redstone: when powered (on: true) or unpowered, on one block or "" for any. */
const BC_REDSTONE = [${redstone.map(([fn, on, f]) => `{ run: ${fn}, on: ${on}, block: ${S(f)} }`).join(", ")}];
// Custom block states (like "ns:on") aren't in the built-in state list, so they're passed through untyped.
function bcGetState(block, name) { return block.permutation.getState(/** @type {any} */ (name)); }
function bcWith(permutation, name, value) { return permutation.withState(/** @type {any} */ (name), value); }
function bcSetState(block, name, value) { block.setPermutation(bcWith(block.permutation, name, value)); }
/** If the player holds the given item, uses one up (not in creative). Returns whether they held it. */
function bcTakeHeld(player, typeId) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const slot = player.selectedSlotIndex;
  const item = inv?.getItem(slot);
  if (!inv || item?.typeId !== typeId) return false;
  if (String(player.getGameMode()).toLowerCase() === "creative") return true;
  if (item.amount > 1) { item.amount -= 1; inv.setItem(slot, item); } else inv.setItem(slot, undefined);
  return true;
}
${blocks.some((b) => b.shape === "stairs") ? `// Stairs: like vanilla, they form inner and outer corners with the stairs around them.
const BC_STAIRS = new Set(${S(blocks.filter((b) => b.shape === "stairs").map((b) => b.id))});
const BC_STEP = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const BC_OPP = { north: "south", south: "north", east: "west", west: "east" };
const BC_CCW = { north: "west", west: "south", south: "east", east: "north" };
const BC_CW = { north: "east", east: "south", south: "west", west: "north" };
function bcNext(b, dir) {
  if (!b) return undefined;
  const [dx, dz] = BC_STEP[dir];
  try { return b.dimension.getBlock({ x: b.location.x + dx, y: b.location.y, z: b.location.z + dz }); } catch { return undefined; }
}
/** A stair's climbing direction (its high side) and half, or null for other blocks. */
function bcStair(b) {
  if (!b || !BC_STAIRS.has(b.typeId)) return null;
  return { up: BC_OPP[String(bcGetState(b, "minecraft:cardinal_direction"))] ?? "south", half: bcGetState(b, "minecraft:vertical_half") };
}
const bcAxis = (d) => (d === "north" || d === "south" ? "z" : "x");
const bcQuarter = (a, b) => [a, b].find((d) => d === "north" || d === "south")[0] + [a, b].find((d) => d === "east" || d === "west")[0];
function bcStairShape(b, me) {
  const free = (dir) => { const o = bcStair(bcNext(b, dir)); return !o || o.up !== me.up || o.half !== me.half; };
  const back = bcStair(bcNext(b, me.up));
  if (back && back.half === me.half && bcAxis(back.up) !== bcAxis(me.up) && free(BC_OPP[back.up])) return back.up === BC_CCW[me.up] ? "outer_left" : "outer_right";
  const front = bcStair(bcNext(b, BC_OPP[me.up]));
  if (front && front.half === me.half && bcAxis(front.up) !== bcAxis(me.up) && free(front.up)) return front.up === BC_CCW[me.up] ? "inner_left" : "inner_right";
  return "straight";
}
function bcUpdateStair(b) {
  const me = bcStair(b);
  if (!b || !me) return;
  const F = me.up, L = BC_CCW[F], R = BC_CW[F], B = BC_OPP[F];
  const shape = bcStairShape(b, me);
  const q = shape === "outer_left" ? [bcQuarter(F, L)] : shape === "outer_right" ? [bcQuarter(F, R)]
    : [bcQuarter(F, L), bcQuarter(F, R), ...(shape === "inner_left" ? [bcQuarter(B, L)] : shape === "inner_right" ? [bcQuarter(B, R)] : [])];
  let p = b.permutation;
  for (const k of ["nw", "ne", "sw", "se"]) p = bcWith(p, ${S(ctx.ns)} + ":q_" + k, q.includes(k));
  b.setPermutation(p);
}
function bcStairsAround(b) {
  bcUpdateStair(b);
  for (const d of ["north", "south", "east", "west"]) bcUpdateStair(bcNext(b, d));
}
` : ""}/** Fences, walls and panes: which of our blocks connect, and in which group. */
const BC_CONNECT = ${S(Object.fromEntries(blocks.filter((b) => b.shape === "connect").map((b) => [b.id, b.group])))};
// Blocks that aren't solid enough to connect to (plants, decorations, partial blocks).
const BC_NOT_SOLID = /(flower|grass|fern|sapling|torch|button|sign|carpet|rail|slab|stairs|door|lever|pressure_plate|banner|bed|snow_layer|bush|vine|ladder|lantern|chain|candle|flower_pot|head|skull|cake|mushroom|sugar_cane|wheat|carrots|potatoes|beetroot|kelp|seagrass|coral_fan|redstone_wire|repeater|comparator|tripwire|web|scaffolding|fence_gate|azalea|dripleaf|roots|sprouts)/;
const BC_GATES = new Set(${S(ctx.project.elements.filter((e) => e.kind === "block" && e.shape === "fence_gate").map((e) => ctx.id(e.name)))});
const BC_SHAPED = new Set(${S(blocks.filter((b) => b.shape && b.shape !== "connect").map((b) => b.id))});
function bcConnects(n, group) {
  if (!n || n.isAir || n.isLiquid) return false;
  const id = n.typeId;
  if (id in BC_CONNECT) return BC_CONNECT[id] === group;
  if (group === "fence" && id.includes("fence")) return true; // fences and fence gates
  if (group === "fence" && BC_GATES.has(id)) return true;
  if (group === "wall" && id.endsWith("_wall")) return true;
  if (group === "pane" && (id.includes("pane") || id === "minecraft:iron_bars")) return true;
  return !BC_SHAPED.has(id) && !BC_NOT_SOLID.test(id) && !id.includes("fence") && !id.includes("pane");
}
function bcUpdateConnections(block) {
  const group = BC_CONNECT[block?.typeId];
  if (!group) return;
  let perm = block.permutation;
  for (const [dir, n] of [["north", block.north()], ["south", block.south()], ["east", block.east()], ["west", block.west()]]) {
    perm = bcWith(perm, NAMESPACE + ":" + dir, bcConnects(n, group));
  }
  block.setPermutation(perm);
}
function bcConnectAround(block, self) {
  if (self) bcUpdateConnections(block);
  for (const n of [block.north(), block.south(), block.east(), block.west()]) if (n && n.typeId in BC_CONNECT) bcUpdateConnections(n);
}
function bcRedstone(e, id, litState) {
  const on = e.powerLevel > 0, was = e.previousPowerLevel > 0;
  const block = e.block;
  if (litState && bcGetState(block, litState) !== on) bcSetState(block, litState, on);
  if (on === was) return;
  const l = block.location;
  const ctx = { dimension: e.dimension, location: { x: l.x + 0.5, y: l.y, z: l.z + 0.5 }, block: { x: l.x + 0.5, y: l.y, z: l.z + 0.5 }, args: { power: e.powerLevel } };
  for (const r of BC_REDSTONE) if (r.on === on && (!r.block || r.block === id)) BC.run("redstone procedure", () => r.run(ctx));
}
system.beforeEvents.startup.subscribe((ev) => {
  const registry = ev.blockComponentRegistry;
${regs.join("\n")}
});
${blocks.some((b) => b.shape === "connect") ? `// Any block placed or broken next to a fence/wall/pane updates its connections.
world.afterEvents.playerPlaceBlock.subscribe((ev) => BC.run("connections", () => bcConnectAround(ev.block, false)));
world.afterEvents.playerBreakBlock.subscribe((ev) => BC.run("connections", () => bcConnectAround(ev.block, false)));
` : ""}`);
}

/** Returns the main.js source, or null when the add-on needs no scripting. */
export function buildScript(ctx: GenContext): string | null {
  const extra = toolsAndFood(ctx);
  if (!ctx.script.sections.length && !extra) return null;
  let sections = ctx.script.sections.join("\n");
  // Steps can run procedures and show forms by name: make sure each one exists.
  const defined = new Set([...sections.matchAll(/^function ((?:proc|form)_\w+)\(/gm)].map((m) => m[1]));
  const stubs: string[] = [];
  for (const m of new Set([...sections.matchAll(/\b((?:proc|form)_\w+)\(ctx/g)].map((m) => m[1]))) {
    if (defined.has(m)) continue;
    const [kind, ...rest] = m.split("_");
    ctx.warn(undefined, `A step uses the ${kind === "proc" ? "procedure" : "form"} "${rest.join("_")}", which doesn't exist (renamed or deleted?). That step does nothing.`, "error");
    stubs.push(`function ${m}(ctx) {}`);
  }
  if (stubs.length) sections += "\n// Missing references\n" + stubs.join("\n") + "\n";
  const structures = new Set(ctx.project.elements.filter((e) => e.kind === "structure").map((e) => e.name));
  // Custom effect steps need the effects script, which only exists when the project has effects.
  const fxNames = new Set(ctx.project.elements.filter((e) => e.kind === "effect").map((e) => e.name));
  for (const m of new Set([...sections.matchAll(/bcFx(?:Give|Remove|Level)\(BC\.who\(ctx, "[^"]*"\), "([^"]*)"/g)].map((m) => m[1]))) {
    if (!fxNames.has(m)) ctx.warn(undefined, `A step uses the custom effect "${m}", which doesn't exist (renamed or deleted?).`, "error");
  }
  if (!fxNames.size && /bcFx(Give|Remove|Level)\(/.test(sections)) {
    sections += "\n// Missing references\nfunction bcFxGive(e, name, seconds, level) {}\nfunction bcFxRemove(e, name) {}\nfunction bcFxLevel(e, name) { return 0; }\n";
  }
  // Enchantment steps need the enchantment script, which only exists when the project has enchantments.
  const enchantments = new Set(ctx.project.elements.filter((e) => e.kind === "enchantment").map((e) => e.name));
  for (const m of new Set([...sections.matchAll(/bcEnchant(?:Held\(ctx|Level\(BC\.heldStack\(ctx\.player\)), "([^"]*)"/g)].map((m) => m[1]))) {
    if (!enchantments.has(m)) ctx.warn(undefined, `A step uses the enchantment "${m}", which doesn't exist (renamed or deleted?).`, "error");
  }
  if (!enchantments.size && /bcEnchant(Held|Level)\(/.test(sections)) {
    sections += "\n// Missing references\nfunction bcEnchantHeld(ctx, name, level) {}\nfunction bcEnchantLevel(stack, name) { return 0; }\n";
  }
  const particles = new Set(ctx.project.elements.filter((e) => e.kind === "particle").map((e) => e.name));
  for (const m of new Set([...sections.matchAll(/BC\.particle\(ctx, "([^"]+)"/g)].map((m) => m[1]))) {
    if (!m.includes(":") && !particles.has(m)) ctx.warn(undefined, `A step spawns the particle effect "${m}", which doesn't exist (renamed or deleted?).`, "error");
  }
  for (const m of new Set([...sections.matchAll(/BC\.structure\(ctx, "([^"]+)"/g)].map((m) => m[1]))) {
    if (!m.includes(":") && !structures.has(m)) ctx.warn(undefined, `A step places the structure "${m}", which doesn't exist (renamed or deleted?).`, "error");
  }
  const vars = Object.fromEntries((ctx.project.variables ?? []).filter((v) => v.name).map((v) => [
    v.name, [v.scope, v.type, v.type === "number" ? Number(v.initial) || 0 : v.type === "boolean" ? v.initial === "true" : v.initial],
  ]));
  const scores = Object.fromEntries((ctx.project.scoreboards ?? []).filter((b) => /^[A-Za-z0-9_.-]+$/.test(b.name)).map((b) => [b.name, [b.title || b.name, b.show, b.ascending]]));
  for (const b of ctx.project.scoreboards ?? []) if (!/^[A-Za-z0-9_.-]+$/.test(b.name)) ctx.warn(undefined, `The scoreboard "${b.name}" needs a name of letters, digits, _ . or - only.`, "error");
  const imports = Array.from(ctx.script.imports).sort().join(", ");
  const ui = Array.from(ctx.script.uiImports).sort();
  return `// Generated by Bedrock Creator. Edits here are overwritten on the next export.
import { ${imports} } from "@minecraft/server";
${ui.length ? `import { ${ui.join(", ")} } from "@minecraft/server-ui";\n` : ""}
const NAMESPACE = ${S(ctx.ns)};
/** Global variables: name -> [scope, type, starting value]. Saved as dynamic properties. */
const BC_VARS = ${S(vars)};
/** Scoreboards: objective -> [title, where it shows, lowest first]. */
const BC_SCORES = ${S(scores)};${Object.keys(scores).length ? `
// Create the scoreboards and put them on screen when the world loads.
world.afterEvents.worldLoad.subscribe(() => {
  for (const [name, [, slot, asc]] of Object.entries(BC_SCORES)) BC.run("scoreboard " + name, () => { BC.objective(name); if (slot !== "none") BC.showScore(name, slot, asc); });
});` : ""}
${RUNTIME}
${extra}
${sections}`;
}
