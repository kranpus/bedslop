// Achievements (advancements). Bedrock has no custom achievements, so each player's earned ones and
// progress are stored on the player (dynamic properties) by script. Earning one shows a toast (JSON UI,
// see hud.ts), plays a sound, can tell the whole server, and hands out rewards.

import type { AchievementElement } from "../model/types";
import { fnName } from "../model/logic";
import type { GenContext } from "./context";
import { clampInt } from "./content";

const S = JSON.stringify;

/** Triggers that count events; the rest are checked every second. */
const COUNTED = new Set(["break_block", "place_block", "kill_mob", "use_item"]);
export const TOAST_HEAD: Record<AchievementElement["frame"], string> = {
  task: "§eAdvancement Made!", goal: "§eGoal Reached!", challenge: "§dChallenge Complete!",
};
const CHAT: Record<AchievementElement["frame"], [string, string]> = {
  task: ["has made the advancement", "a"], goal: ["has reached the goal", "a"], challenge: ["has completed the challenge", "5"],
};

export const achievementsOf = (ctx: GenContext) => ctx.project.elements.filter((e): e is AchievementElement => e.kind === "achievement");

/** Parents first, then their children, so the list reads like a tree. Returns [achievement, depth]. */
export function achievementTree(list: AchievementElement[]): [AchievementElement, number][] {
  const names = new Set(list.map((a) => a.name));
  const out: [AchievementElement, number][] = [];
  const seen = new Set<string>();
  const walk = (parent: string, depth: number) => {
    for (const a of list) {
      const p = a.parent && names.has(a.parent) && a.parent !== a.name ? a.parent : "";
      if (p !== parent || seen.has(a.name)) continue;
      seen.add(a.name);
      out.push([a, depth]);
      walk(a.name, depth + 1);
    }
  };
  walk("", 0);
  // Anything left is in a loop of parents: list it at the top level.
  for (const a of list) if (!seen.has(a.name)) { seen.add(a.name); out.push([a, 0]); }
  return out;
}

const fullId = (id: string) => (!id ? "" : id.includes(":") ? id : `minecraft:${id}`);

export function genAchievements(ctx: GenContext) {
  const list = achievementsOf(ctx);
  if (!list.length) return;
  const names = new Set(list.map((a) => a.name));
  const vars = new Set((ctx.project.variables ?? []).map((v) => v.name));
  const scores = new Set((ctx.project.scoreboards ?? []).map((o) => o.name));
  const procs = new Set(ctx.project.elements.filter((e) => e.kind === "procedure").map((e) => e.name));

  const defs = achievementTree(list).map(([a, depth]) => {
    if (a.parent && !names.has(a.parent)) ctx.warn(a, `comes after "${a.parent}", which doesn't exist. It's shown at the top of the list.`);
    const target = a.trigger === "variable" || a.trigger === "score" || a.trigger === "dimension" ? a.target : fullId(a.target);
    if ((a.trigger === "obtain_item" || a.trigger === "dimension") && !a.target) ctx.warn(a, "can't be earned: choose what to get or where to go.", "error");
    if ((a.trigger === "variable" || a.trigger === "score") && !a.target) ctx.warn(a, `can't be earned: choose a ${a.trigger === "score" ? "scoreboard" : "variable"}.`, "error");
    else if (a.trigger === "variable" && !vars.has(a.target)) ctx.warn(a, `checks the variable "${a.target}", which doesn't exist.`, "error");
    else if (a.trigger === "score" && !scores.has(a.target)) ctx.warn(a, `checks the scoreboard "${a.target}", which doesn't exist.`, "error");
    if (a.rewardProcedure && !procs.has(a.rewardProcedure)) ctx.warn(a, `runs the procedure "${a.rewardProcedure}", which doesn't exist.`, "error");
    const icon = a.icon ? ctx.writeTexture(a.icon, "ui") : "";
    if (a.icon && !icon) ctx.warn(a, "has an icon that no longer exists.");
    const run = a.rewardProcedure && procs.has(a.rewardProcedure) ? `, run: (ctx) => ${fnName("proc", a.rewardProcedure)}(ctx)` : "";
    return `  ${S(a.name)}: { title: ${S(a.displayName)}, desc: ${S(a.description)}, frame: ${S(a.frame)}, depth: ${depth}, secret: ${!!a.secret}, ` +
      `trigger: ${S(a.trigger)}, target: ${S(target)}, count: ${a.trigger === "manual" ? 1 : clampInt(a.count, 1, 1_000_000)}, icon: ${S(icon)}, ` +
      `xp: ${clampInt(a.rewardXp, 0, 100000)}, item: ${S(fullId(a.rewardItem))}, n: ${clampInt(a.rewardCount, 1, 6400)}, announce: ${!!a.announce}${run} }`;
  });

  const used = new Set<string>(list.map((a) => a.trigger));
  const counted = (trigger: string, player: string, id: string) => used.has(trigger)
    ? `  for (const [name, a] of Object.entries(BC_ADV)) if (a.trigger === ${S(trigger)} && (!a.target || a.target === ${id})) bcAdvAdd(${player}, name, 1);\n` : "";
  const hooks: string[] = [];
  if (used.has("break_block")) hooks.push(`world.afterEvents.playerBreakBlock.subscribe((ev) => {\n${counted("break_block", "ev.player", "ev.brokenBlockPermutation.type.id")}});`);
  if (used.has("place_block")) hooks.push(`world.afterEvents.playerPlaceBlock.subscribe((ev) => {\n${counted("place_block", "ev.player", "ev.block.typeId")}});`);
  if (used.has("use_item")) hooks.push(`world.afterEvents.itemUse.subscribe((ev) => {\n${counted("use_item", "ev.source", "ev.itemStack.typeId")}});`);
  if (used.has("kill_mob")) hooks.push(`world.afterEvents.entityDie.subscribe((ev) => {\n  const p = ev.damageSource.damagingEntity;\n  if (p?.typeId !== "minecraft:player") return;\n${counted("kill_mob", "p", "ev.deadEntity.typeId")}});`);
  const polled = [...used].some((t) => t !== "manual" && !COUNTED.has(t));

  ctx.script.uiImports.add("ActionFormData");
  ctx.script.sections.push(`// ----- Achievements -----
/** name -> { title, desc, frame, depth, secret, trigger, target, count, icon, xp, item, n, announce, run } (parents before children). */
const BC_ADV = /** @type {Record<string, any>} */ ({
${defs.join(",\n")}
});
const BC_ADV_DONE = "bc:adv_done", BC_ADV_PROG = "bc:adv_prog";
const BC_ADV_HEAD = ${S(TOAST_HEAD)};
const BC_ADV_CHAT = ${S(CHAT)};
/** Toasts waiting per player: [name, text], and when the one on screen goes away. */
const BC_ADV_TOASTS = new Map();
/** @returns {Record<string, number>} */
function bcAdvRead(p, key) {
  try { const raw = p?.getDynamicProperty(key); return raw ? JSON.parse(String(raw)) : {}; } catch { return {}; }
}
function bcAdvHas(p, name) { return !!bcAdvRead(p, BC_ADV_DONE)[name]; }
/** Gives an achievement once: toast, sound, chat message and rewards. */
function bcAdvGrant(p, name) {
  const a = BC_ADV[name];
  if (!a || !p?.isValid || p.typeId !== "minecraft:player") return;
  const done = bcAdvRead(p, BC_ADV_DONE);
  if (done[name]) return;
  done[name] = 1;
  p.setDynamicProperty(BC_ADV_DONE, JSON.stringify(done));
  const t = BC_ADV_TOASTS.get(p.id) ?? { queue: [], until: 0 };
  t.queue.push([name, BC_ADV_HEAD[a.frame] + "\\n§f" + a.title]);
  BC_ADV_TOASTS.set(p.id, t);
  BC.run("achievement " + name, () => p.playSound(a.frame === "challenge" ? "random.levelup" : "random.toast"));
  if (a.announce) {
    const [said, color] = BC_ADV_CHAT[a.frame];
    world.sendMessage(p.name + " " + said + " §" + color + "[" + a.title + "]");
  }
  const ctx = BC.ctxP(p);
  if (a.xp > 0) BC.run("achievement " + name, () => p.addExperience(a.xp));
  if (a.item) BC.run("achievement " + name, () => BC.give(ctx, a.item, a.n));
  if (a.run) BC.run("achievement " + name, () => a.run(ctx));
}
/** Takes an achievement and its progress away. */
function bcAdvRevoke(p, name) {
  if (!p?.isValid || p.typeId !== "minecraft:player") return;
  const done = bcAdvRead(p, BC_ADV_DONE), prog = bcAdvRead(p, BC_ADV_PROG);
  delete done[name]; delete prog[name];
  p.setDynamicProperty(BC_ADV_DONE, JSON.stringify(done));
  p.setDynamicProperty(BC_ADV_PROG, JSON.stringify(prog));
}
/** Counts towards an achievement (blocks broken, mobs defeated...). */
function bcAdvAdd(p, name, n) {
  if (!p?.isValid || bcAdvHas(p, name)) return;
  const prog = bcAdvRead(p, BC_ADV_PROG);
  prog[name] = (prog[name] ?? 0) + n;
  if (prog[name] >= BC_ADV[name].count) { delete prog[name]; bcAdvGrant(p, name); }
  p.setDynamicProperty(BC_ADV_PROG, JSON.stringify(prog));
}
/** How far a player is: [now, needed]. */
function bcAdvProgress(p, name) {
  const a = BC_ADV[name];
  if (bcAdvHas(p, name)) return [a.count, a.count];
  if (a.trigger === "obtain_item") return [Math.min(a.count, bcAdvCount(p, a.target)), a.count];
  if (a.trigger === "variable") return [Math.min(a.count, Number(BC.getVar(BC.ctxP(p), a.target, "player")) || 0), a.count];
  if (a.trigger === "score") return [Math.min(a.count, BC.getScore(BC.ctxP(p), a.target, "player")), a.count];
  return [bcAdvRead(p, BC_ADV_PROG)[name] ?? 0, a.count];
}
function bcAdvCount(p, id) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  let n = 0;
  if (inv) for (let i = 0; i < inv.size; i++) { const s = inv.getItem(i); if (s?.typeId === id) n += s.amount; }
  return n;
}
/** The player's achievements as a menu: earned ones ticked, secret ones hidden until earned. */
function bcAdvList(p) {
  if (!p?.isValid || p.typeId !== "minecraft:player") return;
  const names = Object.keys(BC_ADV);
  const got = names.filter((n) => bcAdvHas(p, n)).length;
  const form = new ActionFormData().title("Achievements").body(got + " of " + names.length + " earned");
  for (const n of names) {
    const a = BC_ADV[n], has = bcAdvHas(p, n);
    const pad = "  ".repeat(a.depth);
    const text = a.secret && !has ? pad + "§8??? (secret)" : pad + (has ? "§2✔ " : "§8") + a.title + (!has && a.count > 1 ? " §7" + bcAdvProgress(p, n).join("/") : "");
    if (a.icon && (has || !a.secret)) form.button(text, a.icon); else form.button(text);
  }
  form.show(/** @type {any} */ (p)).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    const n = names[r.selection], a = BC_ADV[n], has = bcAdvHas(p, n);
    if (a.secret && !has) return bcAdvList(p);
    const [now, need] = bcAdvProgress(p, n);
    new ActionFormData().title(a.title)
      .body((has ? "§2Earned!§r\\n\\n" : need > 1 ? "Progress: " + now + "/" + need + "\\n\\n" : "") + a.desc)
      .button("Back").show(/** @type {any} */ (p)).then(() => bcAdvList(p)).catch(() => {});
  }).catch(() => {});
}
${hooks.join("\n")}
let bcAdvTicks = 0;
system.runInterval(() => {
  const tick = system.currentTick, second = ++bcAdvTicks % 4 === 0;
  for (const p of world.getAllPlayers()) {
${polled ? `    // Once a second: items held, variables, scores and dimensions.
    if (second) {
      for (const [name, a] of Object.entries(BC_ADV)) {
        if (a.trigger === "manual" || !["obtain_item", "variable", "score", "dimension"].includes(a.trigger) || bcAdvHas(p, name)) continue;
        if (a.trigger === "dimension" ? p.dimension.id === a.target : bcAdvProgress(p, name)[0] >= a.count) bcAdvGrant(p, name);
      }
    }
` : ""}    // Toasts: one at a time, five seconds each.
    const t = BC_ADV_TOASTS.get(p.id);
    if (!t || tick < t.until) continue;
    const next = t.queue.shift();
    if (next) { t.until = tick + 100; bcHudPut(p, "bc:${ctx.ns}:adv:", next[0]); bcHudPut(p, "bc:${ctx.ns}:advt:", next[1]); }
    else { bcHudPut(p, "bc:${ctx.ns}:adv:", ""); bcHudPut(p, "bc:${ctx.ns}:advt:", ""); BC_ADV_TOASTS.delete(p.id); }
  }
}, 5);
world.afterEvents.playerLeave.subscribe((ev) => BC_ADV_TOASTS.delete(ev.playerId));
`);
}
