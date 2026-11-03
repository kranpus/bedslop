import { actionSpec, conditionSpec } from "../model/logic";
import type { Action, CommandElement, Condition, ProcedureElement } from "../model/types";
import type { GenContext } from "./context";

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
  fmt(ctx, t) { return String(t).replace(/\\{player\\}/g, BC.name(ctx.player)).replace(/\\{target\\}/g, BC.name(ctx.target)); },
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

function conditionsCode(conditions: Condition[]): string {
  return conditions
    .map((c) => {
      const spec = conditionSpec(c.type);
      if (!spec) return "";
      const expr = spec.code(c.params);
      return `  if (${c.negate ? "" : "!"}(${expr})) return;\n`;
    })
    .join("");
}

function actionsCode(actions: Action[], label: string): string {
  return actions
    .map((a, i) => {
      const spec = actionSpec(a.type);
      if (!spec) return "";
      const body = spec.code(a.params).split("\n").map((l) => "    " + l).join("\n");
      const run = `  BC.run(${S(`${label} → step ${i + 1} (${spec.label})`)}, () => {\n${body}\n  });\n`;
      return a.chance < 100 ? `  if (Math.random() * 100 < ${Number(a.chance) || 0}) {\n${run.replace(/^/gm, "  ")}  }\n` : run;
    })
    .join("");
}

function fnName(prefix: string, name: string) {
  return `${prefix}_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function genProcedure(ctx: GenContext, p: ProcedureElement) {
  const fn = fnName("proc", p.name);
  if (!p.actions.length) ctx.warn(p, "has no actions yet, so it does nothing.");
  const filter = p.filter.trim();
  const f = filter ? S(filter) : "";
  const body = `function ${fn}(ctx) {\n${conditionsCode(p.conditions)}${actionsCode(p.actions, p.displayName)}}\n`;
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
    case "tick":
      hook = `system.runInterval(() => {\n  for (const player of world.getAllPlayers()) ${fn}(BC.ctxP(player));\n}, ${Math.max(1, Math.round(p.intervalTicks) || 20)});`;
      break;
  }
  ctx.script.sections.push(`// Procedure: ${p.displayName}\n${body}${hook}\n`);
  if (p.actions.some((a) => a.type === "give" || a.type === "drop_item")) ctx.script.imports.add("ItemStack");
}

const PERMISSION: Record<CommandElement["permission"], string> = {
  any: "Any", game_directors: "GameDirectors", admin: "Admin", host: "Host", owner: "Owner",
};

export function genCommands(ctx: GenContext, commands: CommandElement[]) {
  if (!commands.length) return;
  ctx.script.imports.add("CommandPermissionLevel").add("CustomCommandStatus");
  const fns: string[] = [];
  const regs: string[] = [];
  for (const c of commands) {
    const fn = fnName("cmd", c.name);
    if (!c.actions.length) ctx.warn(c, "has no actions yet, so it does nothing.");
    if (c.actions.some((a) => a.type === "give" || a.type === "drop_item")) ctx.script.imports.add("ItemStack");
    fns.push(`// Command: /${ctx.ns}:${c.name}\nfunction ${fn}(ctx) {\n${conditionsCode(c.conditions)}${actionsCode(c.actions, `/${c.name}`)}}\n`);
    regs.push(`  registry.registerCommand(
    { name: ${S(`${ctx.ns}:${c.name}`)}, description: ${S(c.description || c.displayName)}, permissionLevel: CommandPermissionLevel.${PERMISSION[c.permission]}, cheatsRequired: ${c.cheatsRequired} },
    (origin) => {
      const src = origin.sourceEntity ?? origin.initiator;
      const ctx = src?.typeId === "minecraft:player" ? BC.ctxP(src) : { dimension: src?.dimension ?? world.getDimension("overworld"), target: src, location: src?.location };
      system.run(() => ${fn}(ctx));
      return { status: CustomCommandStatus.Success };
    },
  );`);
  }
  ctx.script.sections.push(
    fns.join("\n") +
      `\nsystem.beforeEvents.startup.subscribe((ev) => {\n  const registry = ev.customCommandRegistry;\n${regs.join("\n")}\n});\n`,
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

/** Returns the main.js source, or null when the add-on needs no scripting. */
export function buildScript(ctx: GenContext): string | null {
  const extra = toolsAndFood(ctx);
  if (!ctx.script.sections.length && !extra) return null;
  const imports = Array.from(ctx.script.imports).sort().join(", ");
  return `// Generated by Bedrock Creator. Edits here are overwritten on the next export.
import { ${imports} } from "@minecraft/server";

const NAMESPACE = ${S(ctx.ns)};
${RUNTIME}
${extra}
${ctx.script.sections.join("\n")}`;
}
