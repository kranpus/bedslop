// Material Pack wizard and the example project. One material name + colour becomes a full content set.
import { generateTexture, hashSeed } from "../textures/procedural";
import { createElement, slugify, uid } from "./registry";
import type { ModElement, Project, TextureAsset, ToolType } from "./types";

export interface MaterialPackOptions {
  name: string; // "Ruby"
  color: string;
  form: "gem" | "ingot";
  strength: "stone" | "iron" | "diamond" | "netherite";
  ore: boolean;
  storageBlock: boolean;
  tools: boolean;
  armor: boolean;
}

const TIERS = {
  stone: { tier: "stone", durability: 131, speed: 4, damage: 3, armorMult: 10, ench: 5, protection: [1, 3, 2, 1], hardness: 3, minY: 0, maxY: 96, veins: 12 },
  iron: { tier: "iron", durability: 250, speed: 6, damage: 4, armorMult: 15, ench: 14, protection: [2, 6, 5, 2], hardness: 3, minY: -32, maxY: 64, veins: 10 },
  diamond: { tier: "diamond", durability: 1561, speed: 8, damage: 5, armorMult: 33, ench: 10, protection: [3, 8, 6, 3], hardness: 4.5, minY: -64, maxY: 16, veins: 5 },
  netherite: { tier: "netherite", durability: 2031, speed: 9, damage: 6, armorMult: 37, ench: 15, protection: [3, 8, 6, 3], hardness: 6, minY: -64, maxY: -16, veins: 3 },
} as const;

const TOOL_DAMAGE: Record<ToolType, number> = { sword: 3, axe: 5, pickaxe: 1, shovel: 1.5, hoe: 0 };

export function materialPack(project: Project, o: MaterialPackOptions): { elements: ModElement[]; textures: TextureAsset[] } {
  const ns = project.namespace;
  const m = slugify(o.name);
  const t = TIERS[o.strength];
  const textures: TextureAsset[] = [];
  const elements: ModElement[] = [];
  const tex = (name: string, template: string, kind: TextureAsset["kind"], color = o.color) => {
    const g = generateTexture(template, color, hashSeed(name + color));
    const asset: TextureAsset = { id: uid(), name, kind, width: g.width, height: g.height, dataUrl: g.dataUrl };
    textures.push(asset);
    return asset.id;
  };
  const id = (n: string) => `${ns}:${n}`;

  const materialName = o.form === "gem" ? m : `${m}_ingot`;
  const material = createElement("item", materialName, o.form === "gem" ? o.name : `${o.name} Ingot`);
  material.texture = tex(materialName, o.form, "item");
  elements.push(material);

  if (o.ore) {
    const ore = createElement("block", `${m}_ore`, `${o.name} Ore`);
    ore.textures.all = tex(`${m}_ore`, "ore", "block");
    ore.hardness = t.hardness;
    ore.explosionResistance = 3;
    let dropItem = material.name;
    if (o.form === "ingot") {
      const raw = createElement("item", `raw_${m}`, `Raw ${o.name}`);
      raw.texture = tex(`raw_${m}`, "dust", "item");
      elements.push(raw);
      dropItem = raw.name;
    }
    const loot = createElement("loot", `${m}_ore_drops`, `${o.name} Ore Drops`);
    loot.lootType = "blocks";
    loot.pools = [{ rollsMin: 1, rollsMax: 1, entries: [{ item: id(dropItem), weight: 1, min: 1, max: o.form === "gem" ? 1 : 2 }] }];
    ore.drops = "loot";
    ore.lootTable = loot.id;
    const gen = createElement("ore", `${m}_ore_generation`, `${o.name} Ore Generation`);
    gen.block = id(ore.name);
    gen.minY = t.minY;
    gen.maxY = t.maxY;
    gen.veinsPerChunk = t.veins;
    gen.veinSize = o.strength === "netherite" ? 3 : 7;
    const smelt = createElement("recipe", `${m}_from_smelting`, `${o.name} from smelting`);
    smelt.recipeType = "furnace";
    smelt.input = o.form === "gem" ? id(ore.name) : id(dropItem);
    smelt.result = id(material.name);
    smelt.furnaceTags = ["furnace", "blast_furnace"];
    elements.push(ore, loot, gen, smelt);
  }

  if (o.storageBlock) {
    const block = createElement("block", `${m}_block`, `Block of ${o.name}`);
    block.textures.all = tex(`${m}_block`, "storage", "block");
    block.hardness = 5;
    block.sound = "metal";
    const pack = createElement("recipe", `${m}_block_recipe`, `Block of ${o.name} recipe`);
    pack.grid = Array(9).fill(id(material.name));
    pack.result = id(block.name);
    const unpack = createElement("recipe", `${material.name}_from_block`, `${material.displayName} from block`);
    unpack.recipeType = "shapeless";
    unpack.grid = [id(block.name), "", "", "", "", "", "", "", ""];
    unpack.result = id(material.name);
    unpack.count = 9;
    elements.push(block, pack, unpack);
  }

  if (o.tools) {
    const M = id(material.name), S = "minecraft:stick";
    const grids: Record<ToolType, string[]> = {
      pickaxe: [M, M, M, "", S, "", "", S, ""],
      axe: [M, M, "", M, S, "", "", S, ""],
      shovel: ["", M, "", "", S, "", "", S, ""],
      hoe: [M, M, "", "", S, "", "", S, ""],
      sword: ["", M, "", "", M, "", "", S, ""],
    };
    for (const type of ["pickaxe", "axe", "shovel", "hoe", "sword"] as ToolType[]) {
      const label = type[0].toUpperCase() + type.slice(1);
      const tool = createElement("tool", `${m}_${type}`, `${o.name} ${label}`);
      tool.toolType = type;
      tool.texture = tex(`${m}_${type}`, type, "item");
      tool.tier = t.tier;
      tool.durability = t.durability;
      tool.miningSpeed = t.speed;
      tool.attackDamage = Math.round(t.damage + TOOL_DAMAGE[type]);
      tool.enchantability = t.ench;
      tool.repairItem = M;
      const recipe = createElement("recipe", `${m}_${type}_recipe`, `${o.name} ${label} recipe`);
      recipe.grid = grids[type];
      recipe.result = id(tool.name);
      elements.push(tool, recipe);
    }
  }

  if (o.armor) {
    const armor = createElement("armor", `${m}_armor`, o.name);
    const M = id(material.name);
    (["helmet", "chestplate", "leggings", "boots"] as const).forEach((slot, i) => {
      armor.pieces[slot] = { enabled: true, texture: tex(`${m}_${slot}`, slot, "item"), protection: t.protection[i] };
    });
    armor.layer1 = tex(`${m}_layer_1`, "armor_layer_1", "armor");
    armor.layer2 = tex(`${m}_layer_2`, "armor_layer_2", "armor");
    armor.durabilityMultiplier = t.armorMult;
    armor.enchantability = t.ench;
    armor.repairItem = M;
    const grids = {
      helmet: [M, M, M, M, "", M, "", "", ""],
      chestplate: [M, "", M, M, M, M, M, M, M],
      leggings: [M, M, M, M, "", M, M, "", M],
      boots: ["", "", "", M, "", M, M, "", M],
    };
    elements.push(armor);
    for (const slot of Object.keys(grids) as (keyof typeof grids)[]) {
      const r = createElement("recipe", `${m}_${slot}_recipe`, `${o.name} ${slot} recipe`);
      r.grid = grids[slot];
      r.result = id(`${armor.name}_${slot}`);
      elements.push(r);
    }
  }

  return { elements, textures };
}

/** A small but complete example add-on, so a new user can see every part working. */
export function exampleProject(p: Project): Project {
  p.name = "Ruby Expansion";
  p.namespace = "ruby";
  p.description = "Rubies, ruby gear, a golem guardian and a magic wand.";
  const pack = materialPack(p, { name: "Ruby", color: "#c4283c", form: "gem", strength: "diamond", ore: true, storageBlock: true, tools: true, armor: true });
  const textures = [...pack.textures];
  const tex = (name: string, template: string, color: string, kind: TextureAsset["kind"]) => {
    const g = generateTexture(template, color, hashSeed(name));
    const a: TextureAsset = { id: uid(), name, kind, width: g.width, height: g.height, dataUrl: g.dataUrl };
    textures.push(a);
    return a.id;
  };

  const golem = createElement("entity", "ruby_golem", "Ruby Golem");
  golem.texture = tex("ruby_golem", "mob_humanoid", "#9c2a3a", "entity");
  golem.behavior = "hostile";
  golem.health = 40;
  golem.attackDamage = 6;
  golem.populationControl = "monster";
  golem.spawnBiomeTags = ["monster"];
  golem.lightMin = 0;
  golem.lightMax = 7;
  golem.spawnWeight = 20;
  golem.herdMax = 2;
  golem.eggBase = "#5a1720";
  golem.eggOverlay = "#e24b5e";
  golem.drops = [{ item: "ruby:ruby", min: 0, max: 2, chance: 60 }];

  const boar = createElement("entity", "ember_boar", "Ember Boar");
  boar.model = "quadruped";
  boar.texture = tex("ember_boar", "mob_quadruped", "#b5612f", "entity");
  boar.width = 0.9;
  boar.height = 0.9;
  boar.health = 12;
  boar.temptItems = ["minecraft:carrot", "minecraft:beetroot"];
  boar.drops = [{ item: "minecraft:porkchop", min: 1, max: 3, chance: 100 }];
  boar.eggBase = "#6e3a1d";
  boar.eggOverlay = "#f2a65a";

  const berry = createElement("food", "ruby_berry", "Ruby Berry");
  berry.texture = tex("ruby_berry", "fruit", "#d43d51", "item");
  berry.nutrition = 3;
  berry.saturation = 0.4;
  berry.canAlwaysEat = true;
  berry.effects = [{ effect: "regeneration", seconds: 4, amplifier: 0, chance: 100 }];

  const rose = createElement("plant", "ruby_rose", "Ruby Rose");
  rose.texture = tex("ruby_rose", "flower", "#d62f47", "block");

  const wand = createElement("item", "ruby_wand", "Ruby Wand");
  wand.texture = tex("ruby_wand", "sword", "#e0566a", "item");
  wand.maxStack = 1;
  wand.handEquipped = true;
  wand.glint = true;

  const wandRecipe = createElement("recipe", "ruby_wand_recipe", "Ruby Wand recipe");
  wandRecipe.grid = ["", "", "ruby:ruby", "", "minecraft:blaze_rod", "", "minecraft:blaze_rod", "", ""];
  wandRecipe.result = "ruby:ruby_wand";

  const zap = createElement("procedure", "wand_zap", "Wand: zap");
  zap.trigger = "item_use";
  zap.filter = "ruby:ruby_wand";
  zap.actions = [
    { id: uid(), type: "lightning", params: { at: "player" }, chance: 100 },
    { id: uid(), type: "effect", params: { who: "player", effect: "fire_resistance", seconds: 5, amplifier: 0, particles: false }, chance: 100 },
    { id: uid(), type: "actionbar", params: { text: "Zap!" }, chance: 100 },
  ];
  zap.conditions = [{ id: uid(), type: "sneaking", params: {}, negate: false }];

  const welcome = createElement("procedure", "welcome", "Welcome message");
  welcome.trigger = "player_join";
  welcome.actions = [
    { id: uid(), type: "title", params: { text: "Ruby Expansion", subtitle: "Mine deep for rubies, {player}" }, chance: 100 },
  ];

  const bonus = createElement("procedure", "lucky_ore", "Lucky ore bonus");
  bonus.trigger = "block_break";
  bonus.filter = "ruby:ruby_ore";
  bonus.actions = [
    { id: uid(), type: "drop_item", params: { at: "block", item: "minecraft:emerald", count: 1 }, chance: 10 },
    { id: uid(), type: "sound", params: { at: "block", sound: "random.orb", volume: 1, pitch: 1.4 }, chance: 100 },
  ];

  const heal = createElement("command", "heal", "Heal command");
  heal.description = "Heals you fully";
  heal.permission = "game_directors";
  heal.actions = [
    { id: uid(), type: "heal", params: { who: "player", amount: 40 }, chance: 100 },
    { id: uid(), type: "message", params: { text: "§aYou feel restored, {player}.", to: "player" }, chance: 100 },
  ];

  p.elements = [...pack.elements, golem, boar, berry, rose, wand, wandRecipe, zap, welcome, bonus, heal];
  p.textures = textures;
  p.packIcon = textures.find((t) => t.name === "ruby")?.id ?? "";
  return p;
}
