// Damage types. Bedrock has a fixed list of damage causes, so a damage type deals damage through one of
// them and posts its own death message. For a lethal hit on a player, Minecraft's generic message
// ("died from magic") is switched off for that moment (the showDeathMessages rule) and ours is sent.

import type { DamageTypeElement } from "../model/types";
import { DAMAGE_CAUSES } from "../model/vanilla";
import type { GenContext } from "./context";

const S = JSON.stringify;

export function genDamageTypes(ctx: GenContext) {
  const list = ctx.project.elements.filter((e): e is DamageTypeElement => e.kind === "damage");
  if (!list.length) return;
  const causes = new Set(DAMAGE_CAUSES.map((c) => c.value));
  const defs = list.map((d) => {
    const cause = causes.has(d.cause) ? d.cause : "magic";
    if (!causes.has(d.cause)) ctx.warn(d, `uses the damage cause "${d.cause}", which isn't available. It uses magic instead.`);
    if (!d.deathMessage.trim()) ctx.warn(d, "has no death message, so Minecraft's own message shows.", "info");
    return `  ${S(d.name)}: { cause: ${S(cause)}, msg: ${S(d.deathMessage.trim())}, by: ${S(d.deathMessageBy.trim())}, scale: ${!!d.scaleWithDifficulty} }`;
  });
  ctx.script.imports.add("Difficulty");
  ctx.script.sections.push(`// ----- Damage types -----
/** name -> { cause, msg ({victim}), by ({victim}, {attacker}), scale with difficulty }. */
const BC_DMG = /** @type {Record<string, any>} */ ({
${defs.join(",\n")}
});
/** entity id -> [damage type, attacker, tick, whether death messages are on]. */
const BC_DMG_LAST = new Map();
/** Deals a custom damage type (attacker is optional). */
function bcDamage(e, type, amount, attacker) {
  const d = BC_DMG[type];
  if (!d || !e?.isValid) return;
  const player = e.typeId === "minecraft:player";
  let n = Number(amount) || 0;
  if (d.scale && player) {
    const diff = world.getDifficulty();
    n = diff === Difficulty.Peaceful ? 0 : diff === Difficulty.Easy ? Math.min(n / 2 + 1, n) : diff === Difficulty.Hard ? n * 1.5 : n;
  }
  if (n <= 0) return;
  let shown = false, hidden = false;
  try { shown = world.gameRules.showDeathMessages; } catch {}
  // A hit that could kill: hide Minecraft's message for this moment so only ours shows.
  if (player && d.msg && shown && (e.getComponent("minecraft:health")?.currentValue ?? 0) <= n) {
    try { world.gameRules.showDeathMessages = false; hidden = true; } catch {}
  }
  BC_DMG_LAST.set(e.id, [type, attacker, system.currentTick, shown]);
  try {
    e.applyDamage(n, attacker?.isValid ? { cause: d.cause, damagingEntity: attacker } : { cause: d.cause });
  } finally {
    if (hidden) system.run(() => { try { world.gameRules.showDeathMessages = true; } catch {} });
  }
}
world.afterEvents.entityDie.subscribe((ev) => {
  const e = ev.deadEntity, last = BC_DMG_LAST.get(e.id);
  BC_DMG_LAST.delete(e.id);
  if (!last || system.currentTick - last[2] > 1 || !last[3] || e.typeId !== "minecraft:player") return;
  const d = BC_DMG[last[0]], att = last[1];
  const text = att?.isValid && d.by ? d.by : d.msg;
  if (text) world.sendMessage(text.replace(/\\{victim\\}/g, BC.name(e)).replace(/\\{attacker\\}/g, BC.name(att)));
});
// Forget hits on mobs that survived.
system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, last] of BC_DMG_LAST) if (now - last[2] > 20) BC_DMG_LAST.delete(id);
}, 100);
`);
}
