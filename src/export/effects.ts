// Custom potion effects. Bedrock has no custom status effects, so each one is stored on the entity
// (a dynamic property: name -> [level, seconds left]) and run by a once-a-second script loop.

import type { CustomEffectElement, CustomEffectStep } from "../model/types";
import { fnName } from "../model/logic";
import type { GenContext } from "./context";
import { clampInt, itemBase, round } from "./content";

const S = JSON.stringify;

export function genCustomEffects(ctx: GenContext) {
  const list = ctx.project.elements.filter((e): e is CustomEffectElement => e.kind === "effect");
  if (!list.length) return;
  const potions: Record<string, [string, number, number]> = {};

  const defs = list.map((fx) => {
    if (!fx.steps.length) ctx.warn(fx, "doesn't do anything yet. Add something it does.");
    const steps = fx.steps.map((st) => stepLiteral(ctx, fx, st)).filter(Boolean);
    if (fx.potion) {
      const id = ctx.id(`${fx.name}_potion`);
      potions[id] = [fx.name, clampInt(fx.potionSeconds, 1, 100000), clampInt(fx.potionLevel, 1, Math.max(1, fx.maxLevel))];
      let key = ctx.itemKey(fx.potionTexture);
      if (!key) { key = `${ctx.ns}_potion_bottle`; ctx.itemAtlas[key] = { textures: "textures/items/potion_bottle_drinkable" }; }
      ctx.bp(`items/${fx.name}_potion.json`, itemBase(ctx, { name: `${fx.name}_potion`, displayName: `Potion of ${fx.displayName}` }, key, {
        "minecraft:max_stack_size": { value: 1 },
        "minecraft:food": { nutrition: 0, saturation_modifier: 0, can_always_eat: true, using_converts_to: "minecraft:glass_bottle" },
        "minecraft:use_animation": "drink",
        "minecraft:use_modifiers": { use_duration: 1.6, movement_modifier: 0.35 },
        "minecraft:glint": { value: true },
      }, "items", "minecraft:itemGroup.name.potion"));
    }
    return `  ${S(fx.name)}: { title: ${S(fx.displayName)}, color: ${S(/^[0-9a-f]$/.test(fx.color) ? fx.color : "d")}, max: ${clampInt(fx.maxLevel, 1, 10)}, timer: ${!!fx.showTimer}, milk: ${!!fx.milkCures}, steps: [${steps.join(", ")}] }`;
  });

  ctx.script.imports.add("EntityDamageCause");
  ctx.script.sections.push(`// ----- Custom potion effects -----
/** name -> { title, color, max, timer, milk, steps }. Step numbers: amount at level I, plus per for each level above. */
const BC_FX = {
${defs.join(",\n")}
};
/** Potion items: id -> [effect, seconds, level]. */
const BC_FX_POTIONS = ${S(potions)};
const BC_FX_KEY = "bc:effects";
/** Mobs (not players) that have custom effects, by entity id. */
const BC_FX_MOBS = new Set();
const bcRomanFx = (n) => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);
/** @returns {Record<string, number[]>} name -> [level, seconds left, seconds so far] */
function bcFxRead(e) {
  try { const raw = e?.getDynamicProperty(BC_FX_KEY); return raw ? JSON.parse(String(raw)) : {}; } catch { return {}; }
}
function bcFxWrite(e, map) {
  e.setDynamicProperty(BC_FX_KEY, Object.keys(map).length ? JSON.stringify(map) : undefined);
  if (e.typeId !== "minecraft:player") { if (Object.keys(map).length) BC_FX_MOBS.add(e.id); else BC_FX_MOBS.delete(e.id); }
}
function bcFxLevel(e, name) { try { return e?.isValid ? (bcFxRead(e)[name]?.[0] ?? 0) : 0; } catch { return 0; } }
function bcFxRun(e, name, kind, level) {
  for (const st of BC_FX[name]?.steps ?? []) if (st.type === kind && st.run) BC.run("effect " + name, () => st.run({ ...(e.typeId === "minecraft:player" ? BC.ctxP(e) : { target: e, dimension: e.dimension, location: e.location }), args: { level } }));
}
/** Gives an effect (a stronger or longer one replaces a weaker one). */
function bcFxGive(e, name, seconds, level) {
  const def = BC_FX[name];
  if (!e?.isValid || !def) return;
  const map = bcFxRead(e);
  const lv = Math.max(1, Math.min(def.max, Math.round(Number(level) || 1)));
  const old = map[name];
  map[name] = [Math.max(lv, old?.[0] ?? 0), Math.max(Math.round(Number(seconds) || 1), old?.[1] ?? 0)];
  bcFxWrite(e, map);
  if (!old) bcFxRun(e, name, "on_start", lv);
}
function bcFxRemove(e, name) {
  if (!e?.isValid) return;
  const map = bcFxRead(e);
  const old = map[name];
  if (!old) return;
  delete map[name];
  bcFxWrite(e, map);
  for (const st of BC_FX[name]?.steps ?? []) if (st.type === "vanilla") { try { e.removeEffect(st.effect); } catch {} }
  bcFxRun(e, name, "on_end", old[0]);
}
function bcFxTick(e) {
  const map = bcFxRead(e);
  const names = Object.keys(map);
  if (!names.length) return;
  for (const name of names) {
    const def = BC_FX[name];
    if (!def) { delete map[name]; continue; }
    const [level, left] = map[name];
    const elapsed = Math.max(0, (map[name][2] ?? 0) + 1);
    for (const st of def.steps) {
      const v = st.amount + st.per * (level - 1);
      BC.run("effect " + name, () => {
        if (st.type === "vanilla") e.addEffect(st.effect, st.effect === "night_vision" ? 400 : 40, { amplifier: st.stronger ? level - 1 : 0, showParticles: false });
        else if (st.type === "damage" && v > 0) e.applyDamage(v, { cause: EntityDamageCause.magic });
        else if (st.type === "heal" && v > 0) { const h = e.getComponent("minecraft:health"); if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + v)); }
        else if (st.type === "particles" && st.particle) e.dimension.spawnParticle(st.particle, { x: e.location.x, y: e.location.y + 1, z: e.location.z });
        else if (st.type === "procedure" && st.run && elapsed % Math.max(1, st.every) === 0) st.run({ ...(e.typeId === "minecraft:player" ? BC.ctxP(e) : { target: e, dimension: e.dimension, location: e.location }), args: { level } });
      });
    }
    if (left <= 1) {
      delete map[name];
      for (const st of def.steps) if (st.type === "vanilla") { try { e.removeEffect(st.effect); } catch {} }
      bcFxRun(e, name, "on_end", level);
    } else map[name] = [level, left - 1, elapsed];
  }
  if (!e.isValid) return;
  bcFxWrite(e, map);
  if (e.typeId === "minecraft:player") {
    const shown = Object.entries(map).filter(([n]) => BC_FX[n]?.timer);
    if (shown.length) e.onScreenDisplay.setActionBar(shown.map(([n, [lv, s]]) => "§" + BC_FX[n].color + BC_FX[n].title + (BC_FX[n].max > 1 ? " " + bcRomanFx(lv) : "") + " §7" + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")).join("   "));
  }
}
system.runInterval(() => {
  for (const p of world.getAllPlayers()) bcFxTick(p);
  for (const id of [...BC_FX_MOBS]) {
    const e = world.getEntity(id);
    if (e?.isValid) bcFxTick(e); else BC_FX_MOBS.delete(id);
  }
}, 20);
// After a reload, find mobs that still have effects.
world.afterEvents.worldLoad.subscribe(() => {
  for (const dim of ["overworld", "nether", "the_end"]) {
    try { for (const e of world.getDimension(dim).getEntities()) if (e.typeId !== "minecraft:player" && e.getDynamicProperty(BC_FX_KEY)) BC_FX_MOBS.add(e.id); } catch {}
  }
});
// Dying clears custom effects; milk cures the ones that allow it; potions give theirs.
world.afterEvents.entityDie.subscribe((ev) => { try { if (ev.deadEntity.getDynamicProperty(BC_FX_KEY)) bcFxWrite(ev.deadEntity, {}); } catch {} });
world.afterEvents.itemCompleteUse.subscribe((ev) => {
  const p = ev.source, id = ev.itemStack.typeId;
  if (id === "minecraft:milk_bucket") { for (const n of Object.keys(bcFxRead(p))) if (BC_FX[n]?.milk) bcFxRemove(p, n); return; }
  const potion = BC_FX_POTIONS[id];
  if (potion) bcFxGive(p, potion[0], potion[1], potion[2]);
});
`);
}

/** One step as a JS object literal (procedures become function calls). */
function stepLiteral(ctx: GenContext, fx: CustomEffectElement, st: CustomEffectStep): string {
  if (st.type === "vanilla" && !st.effect) { ctx.warn(fx, "keeps a Minecraft effect on, but none is chosen.", "error"); return ""; }
  if (st.type === "particles" && !st.particle) { ctx.warn(fx, "shows particles, but none are chosen.", "error"); return ""; }
  let run = "";
  if (st.type === "procedure" || st.type === "on_start" || st.type === "on_end") {
    if (!st.procedure) { ctx.warn(fx, "runs a procedure, but none is chosen.", "error"); return ""; }
    run = `, run: (ctx) => ${fnName("proc", st.procedure)}(ctx)`;
  }
  const particle = st.particle ? (st.particle.includes(":") ? st.particle : ctx.id(st.particle)) : "";
  return `{ type: ${S(st.type)}, amount: ${round(Number(st.amount) || 0)}, per: ${round(Number(st.perLevel) || 0)}${st.effect ? `, effect: ${S(st.effect)}` : ""}${st.stronger ? ", stronger: true" : ""}${particle ? `, particle: ${S(particle)}` : ""}${st.type === "procedure" ? `, every: ${clampInt(st.every ?? 5, 1, 3600)}` : ""}${run} }`;
}
