import type { ElementKind, ElementOf, ModElement } from "./types";

export const uid = () => crypto.randomUUID();

export interface KindInfo {
  kind: ElementKind;
  label: string;
  /** One-line description for the "New element" dialog. */
  blurb: string;
  group: "Content" | "World" | "Logic" | "Assets";
  /** Short glyph drawn in the element icon. */
  glyph: string;
  color: string;
}

export const KINDS: KindInfo[] = [
  { kind: "block", label: "Block", blurb: "Solid, glowing, slippery or rotatable blocks with per-face textures.", group: "Content", glyph: "B", color: "#8a6a4a" },
  { kind: "plant", label: "Plant", blurb: "Flowers and grasses with a cross model that can spawn in the world.", group: "Content", glyph: "P", color: "#4f8a3a" },
  { kind: "item", label: "Item", blurb: "Materials, gems and any simple item. Can also be furnace fuel.", group: "Content", glyph: "I", color: "#3b77a8" },
  { kind: "tool", label: "Tool", blurb: "Pickaxes, axes, shovels, hoes and swords with tiers and durability.", group: "Content", glyph: "T", color: "#6b5aa6" },
  { kind: "armor", label: "Armor", blurb: "A full armor set: icons, worn textures, protection and repair item.", group: "Content", glyph: "A", color: "#5d6b78" },
  { kind: "food", label: "Food", blurb: "Edible items with hunger, saturation and potion effects on eating.", group: "Content", glyph: "F", color: "#b5612f" },
  { kind: "entity", label: "Mob", blurb: "Living entities with a model, AI behaviour, drops, spawn egg and spawning.", group: "Content", glyph: "M", color: "#a0413b" },
  { kind: "projectile", label: "Projectile", blurb: "Something thrown or shot: damage, knockback, fire, effects. Use it from a throwable item or as bow ammo.", group: "Content", glyph: "➶", color: "#7a5a2a" },
  { kind: "crop", label: "Crop", blurb: "Plant seeds on farmland, watch it grow in stages, harvest the produce. Bone meal works too.", group: "Content", glyph: "C", color: "#6a8a2a" },
  { kind: "disc", label: "Music disc", blurb: "Your own song on a disc that plays in jukeboxes.", group: "Content", glyph: "♫", color: "#3d3d5c" },
  { kind: "enchantment", label: "Enchantment", blurb: "Your own enchantment: extra damage, life steal, fire, effects while worn, and more. Comes with an enchanted book.", group: "Content", glyph: "✧", color: "#5b3f9c" },
  { kind: "effect", label: "Potion effect", blurb: "Your own status effect with a timer: Minecraft effects, damage or healing over time, particles and procedures. Optional potion to drink.", group: "Content", glyph: "⚗", color: "#2f6f8f" },
  { kind: "recipe", label: "Recipe", blurb: "Crafting table (shaped or shapeless), furnace, stonecutter or smithing.", group: "Content", glyph: "R", color: "#8c7a2c" },
  { kind: "loot", label: "Loot table", blurb: "Weighted drops for blocks, mobs and chests.", group: "Content", glyph: "L", color: "#9a6b1f" },
  { kind: "ore", label: "Ore generation", blurb: "Place veins of any block underground in the Overworld, Nether or End.", group: "World", glyph: "O", color: "#5c6470" },
  { kind: "structure", label: "Structure", blurb: "Import a .mcstructure built in game: generate it in the world, fill its chests with loot, or place it from a procedure.", group: "World", glyph: "⌂", color: "#6b5a44" },
  { kind: "particle", label: "Particle effect", blurb: "Design sparkles, smoke, bursts and trails with a live preview, then spawn them from procedures or /particle.", group: "World", glyph: "✦", color: "#8a5aa8" },
  { kind: "procedure", label: "Procedure", blurb: "When something happens, do something: no coding needed.", group: "Logic", glyph: "▶", color: "#2f7d6d" },
  { kind: "command", label: "Command", blurb: "A custom slash command, e.g. /myaddon:heal, that runs actions.", group: "Logic", glyph: "/", color: "#2c6a8c" },
  { kind: "function", label: "Function", blurb: "A .mcfunction file of vanilla commands, optionally run every tick.", group: "Logic", glyph: "ƒ", color: "#46607a" },
  { kind: "form", label: "Form (GUI)", blurb: "A menu of buttons, an input form or a yes/no dialog that runs actions.", group: "Logic", glyph: "▤", color: "#3c6e8f" },
  { kind: "hud", label: "HUD / screen", blurb: "Design what's on screen: images, text, live values and bars on the HUD, or overlays that procedures show and hide (JSON UI).", group: "Logic", glyph: "▣", color: "#4a5a8a" },
  { kind: "sound", label: "Sound", blurb: "Import an .ogg sound to play from procedures and commands.", group: "Assets", glyph: "♪", color: "#7a4f86" },
];

export const kindInfo = (k: ElementKind) => KINDS.find((x) => x.kind === k)!;

const armorPiece = (protection: number) => ({ enabled: true, texture: "", protection });

export function createElement<K extends ElementKind>(kind: K, name: string, displayName: string): ElementOf<K> {
  const base = { id: uid(), kind, name, displayName, createdAt: Date.now() };
  const map: { [P in ElementKind]: () => ElementOf<P> } = {
    block: () => ({
      ...base, kind: "block", textureMode: "all", textures: {}, renderMethod: "opaque", hardness: 1.5,
      explosionResistance: 6, lightEmission: 0, lightDampening: 15, friction: 0.4, sound: "stone",
      category: "construction", group: "", drops: "self", lootTable: "", flammable: false, mapColor: "#7f7f7f",
      rotation: "none", geometry: "full", customGeometry: "", bestTool: "pickaxe",
    }),
    plant: () => ({
      ...base, kind: "plant", texture: "", lightEmission: 0, hardness: 0,
      placeableOn: ["minecraft:grass_block", "minecraft:dirt", "minecraft:podzol", "minecraft:moss_block"],
      sound: "grass", generate: true, generateTries: 4,
    }),
    item: () => ({
      ...base, kind: "item", texture: "", maxStack: 64, glint: false, handEquipped: false, fuelSeconds: 0,
      category: "items", group: "", tags: [],
    }),
    tool: () => ({
      ...base, kind: "tool", toolType: "pickaxe", texture: "", tier: "iron", attackDamage: 4, durability: 250,
      miningSpeed: 6, enchantability: 14, repairItem: "minecraft:iron_ingot", glint: false,
    }),
    armor: () => ({
      ...base, kind: "armor",
      pieces: { helmet: armorPiece(2), chestplate: armorPiece(6), leggings: armorPiece(5), boots: armorPiece(2) },
      layer1: "", layer2: "", durabilityMultiplier: 15, enchantability: 9, repairItem: "minecraft:iron_ingot",
    }),
    food: () => ({
      ...base, kind: "food", texture: "", nutrition: 4, saturation: 0.6, canAlwaysEat: false, useDuration: 1.6,
      animation: "eat", convertsTo: "", effects: [], maxStack: 64, glint: false,
    }),
    entity: () => ({
      ...base, kind: "entity", model: "humanoid", customGeometry: "", customAnimations: "", texture: "",
      health: 20, speed: 0.25, attackDamage: 3, behavior: "passive", width: 0.6, height: 1.9, scale: 1,
      eggBase: "#3f6b39", eggOverlay: "#d8c27a", spawnEnabled: true, spawnBiomeTags: ["animal"], spawnWeight: 8,
      herdMin: 1, herdMax: 3, spawnSurface: true, lightMin: 7, lightMax: 15, populationControl: "animal",
      drops: [], xp: 3, fireImmune: false, burnsInDaylight: false, canSwim: true, knockbackResistance: 0,
      temptItems: [], families: [],
    }),
    recipe: () => ({
      ...base, kind: "recipe", recipeType: "shaped", grid: Array(9).fill(""), input: "",
      furnaceTags: ["furnace"], smithingTemplate: "minecraft:netherite_upgrade_smithing_template",
      smithingBase: "", smithingAddition: "", result: "", count: 1,
    }),
    loot: () => ({
      ...base, kind: "loot", lootType: "entities",
      pools: [{ rollsMin: 1, rollsMax: 1, entries: [{ item: "", weight: 1, min: 1, max: 1 }] }],
    }),
    ore: () => ({
      ...base, kind: "ore", block: "", replaces: ["minecraft:stone", "minecraft:deepslate", "minecraft:granite", "minecraft:diorite", "minecraft:andesite", "minecraft:tuff"],
      veinSize: 8, veinsPerChunk: 8, minY: -60, maxY: 32, dimension: "overworld",
    }),
    procedure: () => ({
      ...base, kind: "procedure", trigger: "item_use", filter: "", intervalTicks: 20, conditions: [], actions: [],
    }),
    command: () => ({
      ...base, kind: "command", description: "A custom command", permission: "any", cheatsRequired: false,
      conditions: [], actions: [],
    }),
    function: () => ({
      ...base, kind: "function", body: "# Commands run in order, one per line\nsay Hello from my add-on!\n", runEveryTick: false,
    }),
    sound: () => ({
      ...base, kind: "sound", file: "", fileName: "", category: "neutral", volume: 1, pitch: 1,
    }),
    projectile: () => ({
      ...base, kind: "projectile", look: "sprite", texture: "", customGeometry: "", damage: 4, knockback: true,
      fireSeconds: 0, effects: [], speed: 1.5, gravity: 0.03, onHit: "remove", hitSound: "", size: 0.25,
    }),
    crop: () => ({
      ...base, kind: "crop", stageTextures: ["", "", "", ""], look: "crop", growthChance: 33, boneMeal: true,
      produce: "", produceMin: 1, produceMax: 3, seedsTexture: "", seedsMax: 2, placeableOn: ["minecraft:farmland"],
    }),
    hud: () => ({
      ...base, kind: "hud", mode: "hud", dim: false,
      widgets: [{ id: uid(), type: "live", anchor: "top_right", x: -6, y: 6, w: 0, h: 0, text: "Coins: {coins}", color: "#ffd84a", scale: 1, shadow: true }],
    }),
    effect: () => ({
      ...base, kind: "effect", color: "d", maxLevel: 2, showTimer: true, milkCures: true,
      steps: [{ id: uid(), type: "vanilla", effect: "speed", stronger: true, amount: 0, perLevel: 0 }],
      potion: true, potionTexture: "", potionSeconds: 60, potionLevel: 1,
    }),
    enchantment: () => ({
      ...base, kind: "enchantment", maxLevel: 3, targets: ["sword"], extraItems: [], book: true, bookTexture: "",
      effects: [{ id: uid(), when: "hit", type: "damage", amount: 2, perLevel: 1 }],
    }),
    disc: () => ({
      ...base, kind: "disc", file: "", fileName: "", duration: 0, replaces: "", texture: "", comparator: 1, volume: 100,
    }),
    particle: () => ({
      ...base, kind: "particle", sprite: "spark", texture: "", colorStart: "#ffe680", colorEnd: "#ff6a3d", alphaStart: 100, alphaEnd: 0,
      sizeStart: 0.25, sizeEnd: 0.05, blend: "blend", lit: false, mode: "burst", count: 24, rate: 20, duration: 1,
      shape: "sphere", radius: 0.2, surfaceOnly: false, direction: "outwards", spread: 0.3, speedMin: 1, speedMax: 3,
      lifetimeMin: 0.6, lifetimeMax: 1.2, gravity: 2, drag: 1.5, collide: "none", bounce: 0.4, spin: 0,
    }),
    structure: () => ({
      ...base, kind: "structure", file: "", fileName: "", loot: {}, generate: true, dimension: "overworld", placement: "surface",
      biomeTags: [], rarity: 40, sink: 0, minY: -40, maxY: 40, facing: "random", adjustmentRadius: 4, grounded: true, unburied: true,
      canReplace: [],
    }),
    form: () => ({
      ...base, kind: "form", formType: "menu", title: displayName, body: "Choose an option",
      buttons: [{ id: uid(), text: "Option 1", icon: "", actions: [] }],
      fields: [], submitText: "Done", submitActions: [],
      yesText: "Yes", noText: "No", yesActions: [], noActions: [],
    }),
  };
  return map[kind]() as ElementOf<K>;
}

/** All in-game identifiers an element registers (armor registers four). */
export function identifiersOf(el: ModElement, ns: string): string[] {
  switch (el.kind) {
    case "block": case "plant": case "item": case "tool": case "food": case "entity": case "projectile": case "disc":
      return [`${ns}:${el.name}`];
    case "crop":
      return [`${ns}:${el.name}`, `${ns}:${el.name}_seeds`];
    case "enchantment":
      return el.book ? [`${ns}:${el.name}_book`] : [];
    case "effect":
      return el.potion ? [`${ns}:${el.name}_potion`] : [];
    case "armor":
      return (Object.keys(el.pieces) as (keyof typeof el.pieces)[])
        .filter((s) => el.pieces[s].enabled)
        .map((s) => `${ns}:${el.name}_${s}`);
    default:
      return [];
  }
}

/** Turns "Ruby Ore" into "ruby_ore". */
export function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "_$1") || "element";
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
