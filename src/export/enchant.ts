// Custom enchantments. Bedrock has none, so they're stored on the item (a dynamic property plus a lore line)
// and their effects run from script events: hits, block breaks, bow shots and a once-a-second check of
// what each player wears and holds.

import type { EnchantEffect, EnchantmentElement } from "../model/types";
import { fnName } from "../model/logic";
import type { GenContext } from "./context";
import { clampInt, itemBase, round } from "./content";

const S = JSON.stringify;

/** Fills the scripted part for all enchantments (called once, after every element is generated). */
export function genEnchantments(ctx: GenContext) {
  const list = ctx.project.elements.filter((e): e is EnchantmentElement => e.kind === "enchantment");
  if (!list.length) return;
  const ownBows = ctx.project.elements.filter((e) => e.kind === "item" && (e.use === "bow" || e.use === "crossbow")).map((e) => ctx.id(e.name));
  const books: Record<string, string> = {};

  const defs = list.map((en) => {
    if (!en.targets.length && !en.extraItems.length) ctx.warn(en, "doesn't fit any items yet. Pick what it goes on.", "error");
    if (!en.effects.length) ctx.warn(en, "doesn't do anything yet. Add an effect.");
    const effects = en.effects.map((fx) => effectLiteral(ctx, en, fx)).filter(Boolean);
    if (en.book) {
      const bookId = ctx.id(`${en.name}_book`);
      books[bookId] = en.name;
      let key = ctx.itemKey(en.bookTexture);
      if (!key) {
        key = `${ctx.ns}_enchanted_book`;
        ctx.itemAtlas[key] = { textures: "textures/items/book_enchanted" };
      }
      const book = itemBase(ctx, { name: `${en.name}_book`, displayName: `${en.displayName} Book` }, key, {
        "minecraft:max_stack_size": { value: 1 },
        "minecraft:glint": { value: true },
        "minecraft:rarity": { value: "uncommon" },
      }, "items", "minecraft:itemGroup.name.enchantedBook");
      ctx.bp(`items/${en.name}_book.json`, book);
    }
    return `  ${S(en.name)}: { title: ${S(en.displayName)}, max: ${clampInt(en.maxLevel, 1, 10)}, targets: ${S(en.targets)}, items: ${S(en.extraItems.filter(Boolean))}, effects: [${effects.join(", ")}] }`;
  });

  const all = list.flatMap((e) => e.effects);
  const has = (when: EnchantEffect["when"]) => all.some((fx) => fx.when === when);
  ctx.script.imports.add("EntityDamageCause").add("EquipmentSlot");
  if (Object.keys(books).length) ctx.script.uiImports.add("ActionFormData");

  ctx.script.sections.push(`// ----- Custom enchantments -----
/** name -> { title, max, targets, items, effects }. Effects scale: amount at level 1, plus per for each level above. */
const BC_ENCH = {
${defs.join(",\n")}
};
const BC_ENCH_BOOKS = ${S(books)};
const BC_OWN_BOWS = ${S(ownBows)};
const BC_ENCH_KEY = "bc:enchants";
/** Bow enchantments of each player's last shot, for when the arrow lands. */
const BC_SHOTS = new Map();
let bcEnchBusy = false;
const bcRoman = (n) => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);
/** @param {ItemStack | undefined} stack @returns {Record<string, number>} */
function bcEnchants(stack) {
  if (!stack || stack.isStackable) return {};
  try { const raw = stack.getDynamicProperty(BC_ENCH_KEY); return raw ? JSON.parse(String(raw)) : {}; } catch { return {}; }
}
/** @param {ItemStack | undefined} stack */
function bcEnchantLevel(stack, name) { return bcEnchants(stack)[name] ?? 0; }
/** @param {ItemStack} stack */
function bcFits(stack, name) {
  const def = BC_ENCH[name];
  if (!def || stack.isStackable) return false;
  const id = stack.typeId;
  if (def.items.includes(id)) return true;
  return def.targets.some((t) =>
    t === "any" ? true
    : t === "bow" ? ["minecraft:bow", "minecraft:crossbow"].includes(id) || BC_OWN_BOWS.includes(id)
    : ["helmet", "chestplate", "leggings", "boots"].includes(t) ? id.endsWith("_" + t)
    : stack.hasTag("minecraft:is_" + t));
}
/** @param {ItemStack} stack @param {Record<string, number>} map */
function bcWriteEnchants(stack, map) {
  stack.setDynamicProperty(BC_ENCH_KEY, JSON.stringify(map));
  const titles = Object.values(BC_ENCH).map((d) => "§r§7" + d.title + " ");
  const keep = stack.getLore().filter((l) => !titles.some((t) => l.startsWith(t)));
  stack.setLore([...Object.entries(map).map(([n, lv]) => "§r§7" + (BC_ENCH[n]?.title ?? n) + " " + bcRoman(lv)), ...keep]);
}
/** Adds an enchantment (level 0 = one more than now). Returns "" or the reason it can't. @param {ItemStack | undefined} stack */
function bcEnchant(stack, name, level) {
  const def = BC_ENCH[name];
  if (!def) return "That enchantment doesn't exist.";
  if (!stack) return "Hold an item first.";
  if (stack.isStackable) return "Only single items like tools, weapons and armour can be enchanted.";
  if (!bcFits(stack, name)) return def.title + " doesn't go on this item.";
  const map = bcEnchants(stack);
  const now = map[name] ?? 0;
  if (Number(level) <= 0 && now >= def.max) return def.title + " is already at its highest level.";
  map[name] = Math.min(def.max, Math.max(1, Math.round(Number(level) > 0 ? Number(level) : now + 1)));
  bcWriteEnchants(stack, map);
  return "";
}
function bcEnchantHeld(ctx, name, level) {
  const p = ctx.player;
  const inv = p?.getComponent("minecraft:inventory")?.container;
  if (!p || !inv) return;
  const stack = inv.getItem(p.selectedSlotIndex);
  const err = bcEnchant(stack, name, level);
  if (err) return p.sendMessage("§c" + err);
  inv.setItem(p.selectedSlotIndex, stack);
}
const bcValue = (fx, level) => fx.amount + fx.per * (level - 1);
function bcHit(fx, level, p, t, damage) {
  const v = bcValue(fx, level);
  if (fx.type === "damage") {
    bcEnchBusy = true;
    try { t.applyDamage(v, { cause: EntityDamageCause.entityAttack, damagingEntity: p }); } finally { bcEnchBusy = false; }
  } else if (fx.type === "fire") t.setOnFire(v, true);
  else if (fx.type === "effect") t.addEffect(fx.effect, Math.max(1, Math.round(v * 20)), { amplifier: fx.stronger ? level - 1 : 0 });
  else if (fx.type === "lifesteal") {
    const h = p.getComponent("minecraft:health");
    if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + damage * v / 100));
  } else if (fx.type === "lightning") { if (Math.random() * 100 < v) t.dimension.spawnEntity("minecraft:lightning_bolt", t.location); }
  else if (fx.run) fx.run({ ...BC.ctxP(p), target: t, location: t.location, args: { level } });
}
world.afterEvents.entityHurt.subscribe((ev) => {
  if (bcEnchBusy) return;
  const p = ev.damageSource.damagingEntity, t = ev.hurtEntity;
  if (!p || p.typeId !== "minecraft:player" || !t.isValid) return;
  let ench = {};
  if (ev.damageSource.damagingProjectile) {
    const shot = BC_SHOTS.get(p.id);
    if (shot && system.currentTick - shot.tick < 200) ench = shot.ench;
  } else ench = bcEnchants(BC.heldStack(p));
  for (const [name, level] of Object.entries(ench)) {
    for (const fx of BC_ENCH[name]?.effects ?? []) if (fx.when === "hit") BC.run("enchantment " + name, () => bcHit(fx, level, p, t, ev.damage));
  }
});
world.afterEvents.itemReleaseUse.subscribe((ev) => {
  const ench = bcEnchants(ev.itemStack);
  if (Object.keys(ench).length) BC_SHOTS.set(ev.source.id, { tick: system.currentTick, ench });
});
${has("break") ? `world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const p = ev.player;
  const where = BC.center(ev.block.location);
  for (const [name, level] of Object.entries(bcEnchants(ev.itemStackBeforeBreak))) {
    for (const fx of BC_ENCH[name]?.effects ?? []) {
      if (fx.when !== "break") continue;
      BC.run("enchantment " + name, () => {
        const v = bcValue(fx, level);
        if (fx.type === "xp") for (let i = 0; i < Math.round(v); i++) ev.dimension.spawnEntity("minecraft:xp_orb", where);
        else if (fx.type === "self_effect") p.addEffect(fx.effect, Math.max(1, Math.round(v * 20)), { amplifier: fx.stronger ? level - 1 : 0 });
        else if (fx.run) fx.run({ ...BC.ctxP(p), dimension: ev.dimension, block: where, args: { level } });
      });
    }
  }
});
` : ""}${has("equipped") ? `// Worn and held enchantments: refresh their effects every second.
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const eq = p.getComponent("minecraft:equippable");
    if (!eq) continue;
    for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Mainhand, EquipmentSlot.Offhand]) {
      for (const [name, level] of Object.entries(bcEnchants(eq.getEquipment(slot)))) {
        for (const fx of BC_ENCH[name]?.effects ?? []) {
          if (fx.when !== "equipped" || fx.type !== "self_effect") continue;
          // Night vision flickers in its last 10 seconds, so keep it topped up further.
          BC.run("enchantment " + name, () => p.addEffect(fx.effect, fx.effect === "night_vision" ? 400 : 60, { amplifier: fx.stronger ? level - 1 : 0, showParticles: false }));
        }
      }
    }
  }
}, 20);
` : ""}${Object.keys(books).length ? `// Enchanted books: use one to pick an item to enchant.
world.afterEvents.itemUse.subscribe((ev) => {
  const name = BC_ENCH_BOOKS[ev.itemStack.typeId];
  if (!name) return;
  const p = ev.source, def = BC_ENCH[name];
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv || !def) return;
  const slots = [];
  for (let i = 0; i < inv.size; i++) {
    const s = inv.getItem(i);
    if (s && bcFits(s, name) && bcEnchantLevel(s, name) < def.max) slots.push(i);
  }
  if (!slots.length) return p.sendMessage("§7Nothing in your inventory can take " + def.title + ".");
  const form = new ActionFormData().title(def.title).body("Choose an item to enchant.");
  for (const i of slots) {
    const s = inv.getItem(i);
    const lv = bcEnchantLevel(s, name);
    form.button((s?.nameTag ?? s?.typeId.replace(/^minecraft:/, "").replace(/_/g, " ") ?? "?") + (lv ? " (" + bcRoman(lv) + " → " + bcRoman(lv + 1) + ")" : ""));
  }
  form.show(p).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    const slot = slots[r.selection], stack = inv.getItem(slot);
    const err = bcEnchant(stack, name, 0);
    if (err) return p.sendMessage("§c" + err);
    inv.setItem(slot, stack);
    const book = inv.getItem(p.selectedSlotIndex);
    if (book?.typeId === ev.itemStack.typeId) inv.setItem(p.selectedSlotIndex, undefined);
    p.playSound("random.anvil_use");
  }).catch(() => {});
});
` : ""}`);
}

/** One effect as a JS object literal (procedures become a function call). */
function effectLiteral(ctx: GenContext, en: EnchantmentElement, fx: EnchantEffect): string {
  const valid: Record<EnchantEffect["when"], EnchantEffect["type"][]> = {
    hit: ["damage", "fire", "effect", "lifesteal", "lightning", "procedure"],
    break: ["xp", "self_effect", "procedure"],
    equipped: ["self_effect"],
  };
  if (!valid[fx.when].includes(fx.type)) { ctx.warn(en, `has an effect that can't happen ${fx.when === "hit" ? "on hit" : fx.when === "break" ? "when breaking blocks" : "while equipped"}. It was skipped.`); return ""; }
  if ((fx.type === "effect" || fx.type === "self_effect") && !fx.effect) { ctx.warn(en, "has a potion effect step with no effect chosen.", "error"); return ""; }
  let run = "";
  if (fx.type === "procedure") {
    if (!fx.procedure) { ctx.warn(en, "has a “run procedure” effect with no procedure chosen.", "error"); return ""; }
    run = `, run: (ctx) => ${fnName("proc", fx.procedure)}(ctx)`;
  }
  return `{ when: ${S(fx.when)}, type: ${S(fx.type)}, amount: ${round(Number(fx.amount) || 0)}, per: ${round(Number(fx.perLevel) || 0)}${fx.effect ? `, effect: ${S(fx.effect)}` : ""}${fx.stronger ? ", stronger: true" : ""}${run} }`;
}
