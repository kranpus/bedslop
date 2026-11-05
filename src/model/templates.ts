// Templates gallery: ready-made combos of elements (with their textures, variables, scoreboards and game
// rules) to add to a project, and starter add-ons built from them.

import { generateTexture, hashSeed } from "../textures/procedural";
import { exampleProject } from "./packs";
import { createElement, uid } from "./registry";
import type { Action, GameRuleDef, GlobalVariable, ModElement, Project, ScoreboardDef, TextureAsset } from "./types";

export interface TemplateBundle {
  elements: ModElement[];
  textures: TextureAsset[];
  variables?: GlobalVariable[];
  scoreboards?: ScoreboardDef[];
  gameRules?: GameRuleDef[];
  /** The project is raised to at least this Script API / game version (some features need it). */
  needs?: { api: string; engine: [number, number, number] };
}

export interface ElementTemplate {
  id: string;
  title: string;
  blurb: string;
  glyph: string;
  color: string;
  tags: string[];
  /** What it adds, in words. */
  inside: string[];
  build(ns: string): TemplateBundle;
}

export interface StarterTemplate {
  id: string;
  title: string;
  blurb: string;
  glyph: string;
  color: string;
  inside: string[];
  build(p: Project): Project;
}

const act = (type: string, params: Action["params"], chance = 100): Action => ({ id: uid(), type, params, chance });

/** A generated texture asset (drawn from one of the pixel templates). */
function tex(textures: TextureAsset[], name: string, template: string, color: string, kind: TextureAsset["kind"]): string {
  const g = generateTexture(template, color, hashSeed(name));
  const t: TextureAsset = { id: uid(), name, kind, width: g.width, height: g.height, dataUrl: g.dataUrl };
  textures.push(t);
  return t.id;
}

export const ELEMENT_TEMPLATES: ElementTemplate[] = [
  {
    id: "lucky_block", title: "Lucky block", glyph: "?", color: "#c9a227", tags: ["block", "fun"],
    blurb: "A golden block that gives a random surprise when broken: diamonds, XP, a golden apple, zombies or a small explosion.",
    inside: ["Block: Lucky Block", "Procedure: Lucky block surprise", "Recipe: Lucky Block"],
    build(ns) {
      const textures: TextureAsset[] = [];
      const block = createElement("block", "lucky_block", "Lucky Block");
      block.textures = { all: tex(textures, "lucky_block", "storage", "#e8c33a", "block") };
      block.drops = "nothing";
      block.hardness = 0.5;
      const proc = createElement("procedure", "lucky_block_surprise", "Lucky block surprise");
      proc.trigger = "block_break";
      proc.filter = `${ns}:lucky_block`;
      proc.actions = [
        act("drop_item", { at: "block", item: "minecraft:diamond", count: 3 }, 25),
        act("xp", { levels: 5 }, 30),
        act("drop_item", { at: "block", item: "minecraft:golden_apple", count: 1 }, 20),
        act("spawn", { at: "block", entity: "minecraft:zombie", count: 2 }, 15),
        act("explosion", { at: "block", power: 2, fire: false, breaks: false }, 10),
        act("sound", { at: "block", sound: "random.levelup", volume: 1, pitch: 1.2 }),
      ];
      const recipe = createElement("recipe", "lucky_block_recipe", "Lucky Block");
      recipe.grid = ["minecraft:gold_ingot", "minecraft:gold_ingot", "minecraft:gold_ingot", "minecraft:gold_ingot", "minecraft:chest", "minecraft:gold_ingot", "minecraft:gold_ingot", "minecraft:gold_ingot", "minecraft:gold_ingot"];
      recipe.result = `${ns}:lucky_block`;
      return { elements: [block, proc, recipe], textures };
    },
  },
  {
    id: "leap_wand", title: "Leap wand", glyph: "↑", color: "#7a4fc4", tags: ["item", "magic"],
    blurb: "Right-click to leap into the air and float down gently. Has a short cooldown so it can't be spammed.",
    inside: ["Item: Leap Wand", "Procedure: Leap wand", "Recipe: Leap Wand"],
    build(ns) {
      const textures: TextureAsset[] = [];
      const wand = createElement("item", "leap_wand", "Leap Wand");
      wand.texture = tex(textures, "leap_wand", "sword", "#9b6be0", "item");
      wand.maxStack = 1;
      wand.handEquipped = true;
      wand.glint = true;
      const proc = createElement("procedure", "leap_wand_use", "Leap wand");
      proc.trigger = "item_use";
      proc.filter = `${ns}:leap_wand`;
      proc.actions = [
        act("launch", { who: "player", power: 1.4 }),
        act("effect", { who: "player", effect: "slow_falling", seconds: 4, amplifier: 0, particles: false }),
        act("sound", { at: "player", sound: "mob.enderdragon.flap", volume: 1, pitch: 1.4 }),
      ];
      const recipe = createElement("recipe", "leap_wand_recipe", "Leap Wand");
      recipe.grid = ["", "", "minecraft:feather", "", "minecraft:stick", "", "minecraft:stick", "", ""];
      recipe.result = `${ns}:leap_wand`;
      return { elements: [wand, proc, recipe], textures };
    },
  },
  {
    id: "mana", title: "Mana system", glyph: "✦", color: "#2f6fbf", tags: ["rpg", "hud"],
    blurb: "Each player gets mana that refills over time, a mana bar above the hotbar, and a staff that spends mana for a speed and jump boost.",
    inside: ["Variables: mana, max_mana (per player)", "HUD: Mana bar", "Procedure: Mana regeneration", "Item: Mana Staff + procedure"],
    build(ns) {
      const textures: TextureAsset[] = [];
      const variables: GlobalVariable[] = [
        { id: uid(), name: "mana", scope: "player", type: "number", initial: "20" },
        { id: uid(), name: "max_mana", scope: "player", type: "number", initial: "20" },
      ];
      const full = tex(textures, "mana_full", "orb", "#3d8bff", "item"), empty = tex(textures, "mana_empty", "orb", "#2a2f3a", "item");
      const hud = createElement("hud", "mana_bar", "Mana bar");
      hud.widgets = [
        { id: uid(), type: "bar", anchor: "bottom_middle", x: 0, y: -54, w: 90, h: 9, texture: full, emptyTexture: empty, source: "variable", sourceName: "mana", max: 20, maxSource: "variable", maxName: "max_mana", segments: 10 },
        { id: uid(), type: "live", anchor: "bottom_middle", x: 0, y: -64, w: 0, h: 0, text: "§bMana {mana}/{max_mana}", color: "#55ffff", scale: 1, shadow: true },
      ];
      const regen = createElement("procedure", "mana_regen", "Mana regeneration");
      regen.trigger = "tick";
      regen.intervalTicks = 40;
      regen.conditions = [{ id: uid(), type: "var_compare", params: { variable: "mana", op: "<", value: "20", who: "player" }, negate: false }];
      regen.actions = [act("set_var", { variable: "mana", op: "add", value: "1", who: "player" })];
      const staff = createElement("item", "mana_staff", "Mana Staff");
      staff.texture = tex(textures, "mana_staff", "sword", "#4aa3ff", "item");
      staff.maxStack = 1;
      staff.handEquipped = true;
      const cast = createElement("procedure", "mana_staff_cast", "Mana staff: boost");
      cast.trigger = "item_use";
      cast.filter = `${ns}:mana_staff`;
      cast.conditions = [{ id: uid(), type: "var_compare", params: { variable: "mana", op: "≥", value: "5", who: "player" }, negate: false }];
      cast.actions = [
        act("set_var", { variable: "mana", op: "subtract", value: "5", who: "player" }),
        act("effect", { who: "player", effect: "speed", seconds: 10, amplifier: 1, particles: true }),
        act("effect", { who: "player", effect: "jump_boost", seconds: 10, amplifier: 1, particles: true }),
        act("sound", { at: "player", sound: "beacon.power", volume: 1, pitch: 1.5 }),
      ];
      return { elements: [hud, regen, staff, cast], textures, variables };
    },
  },
  {
    id: "healing_potion", title: "Healing potion", glyph: "⚗", color: "#c43c6f", tags: ["effect", "rpg"],
    blurb: "A custom “Mending” effect that heals every second, with a drinkable potion and a timer on screen.",
    inside: ["Potion effect: Mending (with a potion item)", "Recipe: Potion of Mending"],
    build(ns) {
      const textures: TextureAsset[] = [];
      const fx = createElement("effect", "mending", "Mending");
      fx.color = "d";
      fx.maxLevel = 3;
      fx.steps = [{ id: uid(), type: "heal", amount: 1, perLevel: 1 }, { id: uid(), type: "particles", particle: "minecraft:heart_particle", amount: 0, perLevel: 0 }];
      fx.potion = true;
      fx.potionSeconds = 20;
      fx.potionTexture = tex(textures, "mending_potion", "potion", "#ff6fa3", "item");
      const recipe = createElement("recipe", "mending_potion_recipe", "Potion of Mending");
      recipe.recipeType = "shapeless";
      recipe.grid = ["minecraft:glass_bottle", "minecraft:glistering_melon_slice", "minecraft:sweet_berries", "", "", "", "", "", ""];
      recipe.result = `${ns}:mending_potion`;
      return { elements: [fx, recipe], textures };
    },
  },
  {
    id: "double_jump", title: "Double jump", glyph: "⇈", color: "#3d6b5a", tags: ["key binding", "movement"],
    blurb: "Tap jump twice quickly to jump again in mid-air. One-second cooldown.",
    inside: ["Key binding: Double jump"],
    build() {
      const key = createElement("keybind", "double_jump", "Double jump");
      Object.assign(key, { input: "double_jump", seconds: 0.35, cooldown: 1, actions: [
        act("launch", { who: "player", power: 0.9 }),
        act("sound", { at: "player", sound: "mob.chicken.plop", volume: 1, pitch: 1.5 }),
      ] });
      return { elements: [key], textures: [] };
    },
  },
  {
    id: "starter_kit", title: "Starter kit", glyph: "✚", color: "#5a8f3c", tags: ["players"],
    blurb: "New players get a welcome title and a small kit of tools and food the first time they join.",
    inside: ["Procedure: Starter kit (on join, once per player)"],
    build() {
      const proc = createElement("procedure", "starter_kit", "Starter kit");
      proc.trigger = "player_join";
      proc.conditions = [{ id: uid(), type: "has_tag", params: { who: "player", tag: "got_starter_kit" }, negate: true }];
      proc.actions = [
        act("give", { item: "minecraft:stone_sword", count: 1 }),
        act("give", { item: "minecraft:stone_pickaxe", count: 1 }),
        act("give", { item: "minecraft:bread", count: 8 }),
        act("give", { item: "minecraft:torch", count: 16 }),
        act("add_tag", { who: "player", tag: "got_starter_kit" }),
        act("title", { text: "Welcome, {player}!", subtitle: "Here's a starter kit" }),
      ];
      return { elements: [proc], textures: [] };
    },
  },
  {
    id: "kill_counter", title: "Kill counter", glyph: "☠", color: "#8f3a3a", tags: ["scoreboard", "minigame"],
    blurb: "A “Kills” scoreboard on the side of the screen that counts mobs and players each player defeats, plus a “First blood” achievement.",
    inside: ["Scoreboard: kills", "Procedure: Count kills", "Achievement: First blood"],
    build() {
      const scoreboards: ScoreboardDef[] = [{ id: uid(), name: "kills", title: "Kills", show: "Sidebar", ascending: false }];
      const proc = createElement("procedure", "count_kills", "Count kills");
      proc.trigger = "entity_die";
      proc.actions = [act("score_change", { objective: "kills", op: "add", value: 1, who: "player" })];
      const first = createElement("achievement", "first_blood", "First blood");
      Object.assign(first, { description: "Defeat your first mob", trigger: "kill_mob", target: "", count: 1, frame: "task" });
      return { elements: [proc, first], textures: [], scoreboards };
    },
  },
  {
    id: "storage_crate", title: "Storage crate", glyph: "▦", color: "#8a6a3a", tags: ["block", "storage"],
    blurb: "A wooden crate with 27 slots that plays chest sounds when opened and closed. Import a Blockbench model to animate its lid.",
    inside: ["Block: Crate (storage, opens like a chest)", "Recipe: Crate", "Needs Minecraft 1.26.60+ (the project is updated)"],
    build(ns) {
      const textures: TextureAsset[] = [];
      const crate = createElement("block", "crate", "Crate");
      crate.textures = { all: tex(textures, "crate", "planks", "#9c7a48", "block") };
      Object.assign(crate, { function: "storage", slotCount: 27, sound: "wood", bestTool: "axe", hardness: 2.5,
        lid: { enabled: true, closedParts: [], openParts: [], openSound: "random.chestopen", closeSound: "random.chestclosed" } });
      const recipe = createElement("recipe", "crate_recipe", "Crate");
      recipe.grid = ["minecraft:oak_planks", "minecraft:oak_slab", "minecraft:oak_planks", "minecraft:oak_slab", "", "minecraft:oak_slab", "minecraft:oak_planks", "minecraft:oak_slab", "minecraft:oak_planks"];
      recipe.result = `${ns}:crate`;
      return { elements: [crate, recipe], textures, needs: { api: "2.11.0", engine: [1, 26, 60] } };
    },
  },
  {
    id: "achievements", title: "Achievements set", glyph: "★", color: "#a07a1c", tags: ["achievements"],
    blurb: "Three classic achievements in a tree (wood, stone, diamonds) and sneak + 9 to see them.",
    inside: ["Achievements: Getting Wood, Stone Age, Diamonds!", "Key binding: Achievements list (sneak + 9)"],
    build() {
      const wood = createElement("achievement", "getting_wood", "Getting Wood");
      Object.assign(wood, { description: "Collect a log", trigger: "obtain_item", target: "minecraft:oak_log", count: 1 });
      const stone = createElement("achievement", "stone_age", "Stone Age");
      Object.assign(stone, { description: "Mine 10 stone", parent: "getting_wood", trigger: "break_block", target: "minecraft:stone", count: 10 });
      const diamonds = createElement("achievement", "diamonds", "Diamonds!");
      Object.assign(diamonds, { description: "Find a diamond", parent: "stone_age", frame: "goal", trigger: "obtain_item", target: "minecraft:diamond", count: 1, rewardXp: 30 });
      const key = createElement("keybind", "achievements_list", "Achievements list");
      Object.assign(key, { input: "sneak_slot", slot: 9, cooldown: 0, actions: [act("show_achievements", {})] });
      return { elements: [wood, stone, diamonds, key], textures: [] };
    },
  },
];

/** Element names, variables, scoreboards and rules a template would clash with get a suffix. */
export function applyTemplate(p: Project, b: TemplateBundle): { project: Project; renamed: Record<string, string> } {
  const taken = new Set(p.elements.map((e) => e.name));
  const renamed: Record<string, string> = {};
  const free = (name: string, used: Set<string>) => { let n = name, i = 2; while (used.has(n)) n = `${name}_${i++}`; return n; };
  for (const e of b.elements) if (taken.has(e.name)) { renamed[e.name] = free(e.name, taken); taken.add(renamed[e.name]); }
  const vars = new Set((p.variables ?? []).map((v) => v.name));
  const boards = new Set((p.scoreboards ?? []).map((s) => s.name));
  const rules = new Set((p.gameRules ?? []).map((r) => r.name));
  // Existing variables, scoreboards and rules with the same name are shared, not duplicated.
  const variables = (b.variables ?? []).filter((v) => !vars.has(v.name));
  const scoreboards = (b.scoreboards ?? []).filter((s) => !boards.has(s.name));
  const gameRules = (b.gameRules ?? []).filter((r) => !rules.has(r.name));
  // Rename inside the template's own elements: exact names, "ns:name" ids and derived ids ("ns:name_potion"...).
  let els = b.elements;
  if (Object.keys(renamed).length) {
    const ns = p.namespace;
    const SUFFIXES = ["", "_potion", "_book", "_seeds", "_helmet", "_chestplate", "_leggings", "_boots", "_spawn_egg"];
    const map = new Map<string, string>();
    for (const [from, to] of Object.entries(renamed)) {
      map.set(from, to);
      for (const sfx of SUFFIXES) map.set(`${ns}:${from}${sfx}`, `${ns}:${to}${sfx}`);
    }
    const walk = (v: unknown): unknown => {
      if (typeof v === "string") return map.get(v) ?? v;
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" ? x : walk(x)]));
      return v;
    };
    els = (walk(els) as ModElement[]).map((e) => {
      const n = /_(\d+)$/.exec(e.name);
      return Object.values(renamed).includes(e.name) && n ? { ...e, displayName: `${e.displayName} ${n[1]}` } : e;
    });
  }
  const older = (a: number[], b: number[]) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
  const bump = b.needs && older(p.minEngine, b.needs.engine) ? { scriptApi: b.needs.api, minEngine: [...b.needs.engine] as [number, number, number] } : {};
  return {
    project: {
      ...p,
      ...bump,
      elements: [...p.elements, ...els],
      textures: [...p.textures, ...b.textures],
      variables: [...(p.variables ?? []), ...variables],
      scoreboards: [...(p.scoreboards ?? []), ...scoreboards],
      gameRules: [...(p.gameRules ?? []), ...gameRules],
    },
    renamed,
  };
}

const withTemplates = (p: Project, ids: string[]) =>
  ids.reduce((acc, id) => applyTemplate(acc, ELEMENT_TEMPLATES.find((t) => t.id === id)!.build(acc.namespace)).project, p);

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank", title: "Blank add-on", glyph: "+", color: "#5c6470", inside: ["Nothing yet: start from scratch"],
    blurb: "An empty project with your name and namespace.",
    build: (p) => p,
  },
  {
    id: "ruby", title: "Ruby Expansion", glyph: "◆", color: "#c4283c",
    blurb: "The full example: ruby ore, tools and armour, two mobs, a wand, a shop, HUD, achievements, custom effects and more.",
    inside: ["60+ elements covering almost every feature"],
    build: (p) => exampleProject(p),
  },
  {
    id: "rpg", title: "RPG starter", glyph: "⚔", color: "#2f6fbf",
    blurb: "Mana with a HUD bar, a mana staff, a healing potion, double jump, a starter kit and achievements.",
    inside: ["Mana system", "Healing potion", "Double jump", "Starter kit", "Achievements set"],
    build: (p) => ({ ...withTemplates({ ...p, name: "RPG Adventure", namespace: "rpg" }, ["mana", "healing_potion", "double_jump", "starter_kit", "achievements"]), description: "Mana, potions, double jump and achievements." }),
  },
  {
    id: "minigame", title: "Minigame starter", glyph: "⚑", color: "#8f3a3a",
    blurb: "A kill counter on the sidebar, a starter kit, double jump and a game rule to pause scoring between rounds.",
    inside: ["Kill counter", "Starter kit", "Double jump", "Game rule: scoring"],
    build: (p) => {
      const q = withTemplates({ ...p, name: "Minigame", namespace: "mg" }, ["kill_counter", "starter_kit", "double_jump"]);
      const rule: GameRuleDef = { id: uid(), name: "scoring", type: "bool", initial: "true", description: "Kills count on the scoreboard (turn off between rounds)" };
      const elements = q.elements.map((e) => (e.kind === "procedure" && e.name === "count_kills"
        ? { ...e, conditions: [...e.conditions, { id: uid(), type: "gamerule_is", params: { rule: "scoring", op: "=", value: "true" }, negate: false }] }
        : e));
      return { ...q, elements, gameRules: [...(q.gameRules ?? []), rule], description: "Scores, kits and quick movement for minigames." };
    },
  },
  {
    id: "survival", title: "Survival Plus", glyph: "☘", color: "#5a8f3c",
    blurb: "Small survival extras: lucky blocks, storage crates, a leap wand and healing potions.",
    inside: ["Lucky block", "Storage crate", "Leap wand", "Healing potion"],
    build: (p) => ({ ...withTemplates({ ...p, name: "Survival Plus", namespace: "survplus" }, ["lucky_block", "storage_crate", "leap_wand", "healing_potion"]), description: "Lucky blocks, crates, a leap wand and healing potions." }),
  },
];
