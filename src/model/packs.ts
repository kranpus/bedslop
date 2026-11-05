// Material Pack wizard and the example project. One material name + colour becomes a full content set.
import { generateTexture, hashSeed } from "../textures/procedural";
import { createElement, slugify, uid } from "./registry";
import { rubyShrine } from "./exampleStructure";
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
  golem.attackStyle = "ranged";
  golem.projectile = "ruby_shard";
  golem.attackInterval = 2.5;
  golem.sounds = { hurt: "mob.irongolem.hit", death: "mob.irongolem.death", step: "mob.irongolem.walk" };

  const boar = createElement("entity", "ember_boar", "Ember Boar");
  boar.model = "quadruped";
  boar.texture = tex("ember_boar", "mob_quadruped", "#b5612f", "entity");
  boar.width = 0.9;
  boar.height = 0.9;
  boar.health = 12;
  boar.temptItems = ["minecraft:carrot", "minecraft:beetroot"];
  boar.drops = [{ item: "minecraft:porkchop", min: 1, max: 3, chance: 100 }];
  boar.breedItems = ["minecraft:carrot"];
  boar.rideable = true;
  boar.steerable = true;
  boar.seatHeight = 0.8;
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

  const bench = createElement("block", "ruby_workbench", "Ruby Workbench");
  bench.textures.all = tex("ruby_workbench", "planks", "#8f2a36", "block");
  bench.sound = "wood";
  bench.bestTool = "axe";
  bench.hardness = 2.5;
  bench.function = "crafting";
  bench.tableName = "Ruby Workbench";

  const wandRecipe = createElement("recipe", "ruby_wand_recipe", "Ruby Wand recipe");
  wandRecipe.stations = ["ruby:ruby_workbench"];
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
  zap.actions.push({ id: uid(), type: "spawn_particle", params: { particle: "ruby_sparkle", at: "player", height: 1.2 }, chance: 100 });
  const sparkle = createElement("particle", "ruby_sparkle", "Ruby sparkle");
  Object.assign(sparkle, { sprite: "spark", colorStart: "#ff9aa8", colorEnd: "#c4283c", count: 36, radius: 0.4, speedMin: 0.8, speedMax: 2, gravity: -0.5, spin: 120 });

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
    { id: uid(), type: "score_change", params: { objective: "rubies_mined", op: "add", value: 1, who: "player" }, chance: 100 },
  ];
  p.scoreboards = [{ id: uid(), name: "rubies_mined", title: "Rubies mined", show: "Sidebar", ascending: false }];

  const heal = createElement("command", "heal", "Heal command");
  heal.description = "Heals you fully";
  heal.permission = "game_directors";
  heal.actions = [
    { id: uid(), type: "heal", params: { who: "player", amount: 40 }, chance: 100 },
    { id: uid(), type: "message", params: { text: "§aYou feel restored, {player}.", to: "player" }, chance: 100 },
  ];

  // Phase 2 showcase: a variable, a block-based procedure, a form and a command with an argument.
  p.variables = [{ id: uid(), name: "rubies_mined", scope: "player", type: "number", initial: "0" }];
  const n = (v: number) => ({ shadow: { type: "math_number", fields: { NUM: v } } });
  const t = (v: string) => ({ shadow: { type: "text", fields: { TEXT: v } } });
  const counter = createElement("procedure", "ruby_counter", "Ruby counter (blocks)");
  counter.trigger = "block_break";
  counter.filter = "ruby:ruby_ore";
  counter.editor = "blocks";
  counter.blocks = JSON.stringify({
    blocks: { languageVersion: 0, blocks: [{
      type: "bc_start", id: "start", x: 24, y: 24,
      next: { block: {
        type: "bc_act_set_var", fields: { variable: "rubies_mined", op: "add", who: "player" }, inputs: { value: t("1") },
        next: { block: {
          type: "controls_if",
          inputs: {
            IF0: { block: { type: "logic_compare", fields: { OP: "EQ" }, inputs: {
              A: { block: { type: "math_modulo", inputs: { DIVIDEND: { block: { type: "bc_var_get", fields: { VAR: "rubies_mined", WHO: "player" } } }, DIVISOR: n(10) } } },
              B: n(0),
            } } },
            DO0: { block: {
              type: "bc_act_title", inputs: { text: t("{rubies_mined} rubies!"), subtitle: t("Keep digging, {player}") },
              next: { block: { type: "bc_act_sound", fields: { at: "player", sound: "random.levelup" }, inputs: { volume: n(1), pitch: n(1.2) } } },
            } },
          },
        } },
      } },
    }] },
    variables: [],
  });
  const shop = createElement("form", "ruby_shop", "Ruby shop");
  shop.title = "Ruby shop";
  shop.body = "You've mined {rubies_mined} rubies, {player}.";
  shop.buttons = [
    { id: uid(), text: "Ruby Berry ×3", icon: berry.texture, actions: [{ id: uid(), type: "give", params: { item: "ruby:ruby_berry", count: 3 }, chance: 100 }] },
    { id: uid(), text: "Ruby Wand (costs 20 mined)", icon: wand.texture, actions: [{ id: uid(), type: "run_procedure", params: { procedure: "buy_wand" }, chance: 100 }] },
  ];
  // A grid of tiles instead of Minecraft's list of buttons.
  shop.layout = { style: "grid", columns: 2, tileWidth: 96, tileHeight: 60, iconSize: 28, width: 225, height: 150, showBody: true, textColor: "#4c4c4c", titleColor: "#ffffff" };
  const buyWand = createElement("procedure", "buy_wand", "Buy wand");
  buyWand.trigger = "manual";
  buyWand.conditions = [{ id: uid(), type: "var_compare", params: { variable: "rubies_mined", op: "≥", value: "20", who: "player" }, negate: false }];
  buyWand.actions = [
    { id: uid(), type: "set_var", params: { variable: "rubies_mined", op: "subtract", value: "20", who: "player" }, chance: 100 },
    { id: uid(), type: "give", params: { item: "ruby:ruby_wand", count: 1 }, chance: 100 },
    { id: uid(), type: "message", params: { text: "§aEnjoy your wand! {rubies_mined} left.", to: "player" }, chance: 100 },
    { id: uid(), type: "show_overlay", params: { hud: "wand_bought", seconds: 3 }, chance: 100 },
  ];
  const shopCmd = createElement("command", "shop", "Shop command");
  shopCmd.description = "Opens the ruby shop";
  shopCmd.args = [{ id: uid(), name: "bonus", type: "integer", optional: true }];
  shopCmd.actions = [{ id: uid(), type: "show_form", params: { form: "ruby_shop" }, chance: 100 }];

  const benchRecipe = createElement("recipe", "ruby_workbench_recipe", "Ruby Workbench recipe");
  benchRecipe.grid = ["ruby:ruby", "ruby:ruby", "", "minecraft:oak_planks", "minecraft:oak_planks", "", "", "", ""];
  benchRecipe.result = "ruby:ruby_workbench";

  // Shapes, projectiles and crops.
  const brick = tex("ruby_bricks", "bricks", "#a8303f", "block");
  const slab = createElement("block", "ruby_brick_slab", "Ruby Brick Slab");
  slab.shape = "slab";
  slab.textures.all = brick;
  const stairs = createElement("block", "ruby_brick_stairs", "Ruby Brick Stairs");
  stairs.shape = "stairs";
  stairs.textures.all = brick;
  const wall = createElement("block", "ruby_brick_wall", "Ruby Brick Wall");
  wall.shape = "wall";
  wall.textures.all = brick;
  const shardTex = tex("ruby_shard", "orb", "#e0475c", "item");
  const shard = createElement("projectile", "ruby_shard", "Ruby Shard");
  shard.texture = shardTex;
  shard.damage = 3;
  shard.effects = [{ effect: "slowness", seconds: 3, amplifier: 0, chance: 100 }];
  const throwShard = createElement("item", "throwing_shard", "Throwing Shard");
  throwShard.texture = shardTex;
  throwShard.maxStack = 16;
  throwShard.use = "throw";
  throwShard.projectile = "ruby_shard";
  const bush = createElement("crop", "ruby_berry_crop", "Ruby Berry Crop");
  bush.stageTextures = [0, 1, 2, 3].map((i) => {
    const g = generateTexture("crop", "#d43d51", [8, 5, 3, 0][i]);
    const a: TextureAsset = { id: uid(), name: `ruby_berry_crop_stage_${i}`, kind: "block", width: g.width, height: g.height, dataUrl: g.dataUrl };
    textures.push(a);
    return a.id;
  });
  bush.seedsTexture = tex("ruby_berry_crop_seeds", "seeds", "#c9a25a", "item");
  bush.produce = "ruby:ruby_berry";

  // Custom enchantments with books the merchant sells.
  const vampire = createElement("enchantment", "vampire", "Vampire");
  Object.assign(vampire, { maxLevel: 3, targets: ["sword", "axe"], effects: [
    { id: uid(), when: "hit", type: "lifesteal", amount: 10, perLevel: 5 },
    { id: uid(), when: "hit", type: "effect", effect: "wither", amount: 1, perLevel: 1 },
  ] });
  const sight = createElement("enchantment", "ruby_sight", "Ruby Sight");
  Object.assign(sight, { maxLevel: 1, targets: ["helmet"], effects: [{ id: uid(), when: "equipped", type: "self_effect", effect: "night_vision", amount: 0, perLevel: 0 }] });

  // A HUD with a live counter, and an overlay the shop shows for a moment.
  const rubyIcon = pack.elements.find((e) => e.kind === "item" && e.name === "ruby");
  const stats = createElement("hud", "ruby_stats", "Ruby stats");
  stats.widgets = [
    { id: uid(), type: "image", anchor: "top_left", x: 4, y: 4, w: 12, h: 12, texture: rubyIcon && "texture" in rubyIcon ? rubyIcon.texture : "" },
    { id: uid(), type: "live", anchor: "top_left", x: 20, y: 6, w: 0, h: 0, text: "Rubies mined: {score:rubies_mined}", color: "#ff8a9a", scale: 1, shadow: true },
  ];
  const bought = createElement("hud", "wand_bought", "Wand bought");
  Object.assign(bought, { mode: "overlay", dim: true, widgets: [
    { id: uid(), type: "text", anchor: "center", x: 0, y: -10, w: 0, h: 0, text: "§lNew wand!", color: "#ff5a6e", scale: 3, shadow: true },
    { id: uid(), type: "text", anchor: "center", x: 0, y: 18, w: 0, h: 0, text: "Sneak and use it to zap", color: "#ffffff", scale: 1, shadow: true },
  ] });

  // A custom effect with a potion to drink.
  const rush = createElement("effect", "ruby_rush", "Ruby Rush");
  Object.assign(rush, { color: "c", maxLevel: 2, potionSeconds: 90, steps: [
    { id: uid(), type: "vanilla", effect: "speed", stronger: true, amount: 0, perLevel: 0 },
    { id: uid(), type: "vanilla", effect: "haste", stronger: true, amount: 0, perLevel: 0 },
    { id: uid(), type: "particles", particle: "ruby_sparkle", amount: 0, perLevel: 0 },
  ] });
  rush.potionTexture = tex("ruby_rush_potion", "potion", "#e0475c", "item");

  // Brewing: a ruby turns an awkward potion into Regeneration II.
  const brew = createElement("recipe", "ruby_regeneration", "Ruby regeneration brew");
  Object.assign(brew, { recipeType: "brewing", brewMode: "mix", input: "minecraft:potion_type:awkward", reagent: "ruby:ruby", result: "minecraft:potion_type:strong_regeneration" });

  // A lamp with a custom "lit" state that toggles on right-click.
  const lamp = createElement("block", "ruby_lamp", "Ruby Lamp");
  lamp.textures.all = tex("ruby_lamp_off", "glass", "#7a1f2b", "block");
  lamp.sound = "glass";
  lamp.hardness = 0.3;
  lamp.tags = ["ruby:ruby_blocks"];
  lamp.customStates = [{ name: "lit", type: "bool" }];
  lamp.stateRules = [{ id: uid(), when: [{ state: "lit", value: "true" }], light: 15, texture: tex("ruby_lamp_on", "storage", "#ff6b7d", "block") }];
  const lampClick = createElement("procedure", "ruby_lamp_click", "Ruby Lamp: switch");
  lampClick.trigger = "block_interact";
  lampClick.filter = "ruby:ruby_lamp";
  lampClick.actions = [
    { id: uid(), type: "cycle_block_state", params: { at: "block", state: "lit" }, chance: 100 },
    { id: uid(), type: "sound", params: { sound: "random.click", at: "block" }, chance: 100 },
  ];
  for (const e of [slab, stairs, wall]) e.tags = ["ruby:ruby_blocks"];

  // A structure with a loot chest that generates in plains and forests.
  const shrine = createElement("structure", "ruby_shrine", "Ruby Shrine");
  const bytes = rubyShrine(p.namespace);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  shrine.file = `data:application/octet-stream;base64,${btoa(bin)}`;
  shrine.fileName = "ruby_shrine.mcstructure";
  shrine.biomeTags = ["plains", "forest"];
  shrine.rarity = 60;
  shrine.sink = 1;
  shrine.loot = { [String((3 * 5 + 1) * 7 + 3)]: "ruby_shrine_loot" };
  const shrineLoot = createElement("loot", "ruby_shrine_loot", "Ruby Shrine loot");
  shrineLoot.lootType = "chests";
  shrineLoot.pools = [{ rollsMin: 2, rollsMax: 4, entries: [
    { item: "ruby:ruby", weight: 10, min: 1, max: 3 }, { item: "ruby:throwing_shard", weight: 8, min: 2, max: 6 },
    { item: "ruby:ruby_berry_crop_seeds", weight: 6, min: 1, max: 4 }, { item: "ruby:ruby_wand", weight: 1, min: 1, max: 1 },
  ] }];

  const merchant = createElement("entity", "ruby_merchant", "Ruby Merchant");
  merchant.texture = tex("ruby_merchant", "mob_humanoid", "#3f6b8f", "entity");
  merchant.spawnEnabled = false;
  merchant.eggBase = "#2b4a63";
  merchant.eggOverlay = "#c4283c";
  merchant.trades = [
    { wants: "minecraft:emerald", wantsCount: 3, gives: "ruby:ruby", givesCount: 1, maxUses: 12 },
    { wants: "ruby:ruby", wantsCount: 4, gives: "ruby:ruby_berry_crop_seeds", givesCount: 3, maxUses: 8 },
    { wants: "ruby:ruby", wantsCount: 8, wants2: "minecraft:stick", wants2Count: 1, gives: "ruby:ruby_wand", givesCount: 1, maxUses: 2 },
  ];

  merchant.trades!.push(
    { wants: "ruby:ruby", wantsCount: 12, wants2: "minecraft:book", wants2Count: 1, gives: "ruby:vampire_book", givesCount: 1, maxUses: 3 },
    { wants: "ruby:ruby", wantsCount: 8, gives: "ruby:ruby_sight_book", givesCount: 1, maxUses: 3 },
    { wants: "ruby:ruby", wantsCount: 3, wants2: "minecraft:glass_bottle", wants2Count: 1, gives: "ruby:ruby_rush_potion", givesCount: 1, maxUses: 6 },
  );

  // Achievements: a small tree, with a command to see them.
  const rubyTex = rubyIcon && "texture" in rubyIcon ? rubyIcon.texture : "";
  const firstRuby = createElement("achievement", "first_ruby", "Shiny!");
  Object.assign(firstRuby, { description: "Find your first ruby", icon: rubyTex, trigger: "obtain_item", target: "ruby:ruby", count: 1 });
  const deepMiner = createElement("achievement", "ruby_miner", "Ruby Miner");
  Object.assign(deepMiner, { description: "Mine 20 ruby ore", parent: "first_ruby", icon: rubyTex, frame: "goal", trigger: "break_block", target: "ruby:ruby_ore", count: 20, rewardXp: 50 });
  const golemSlayer = createElement("achievement", "golem_slayer", "Golem Slayer");
  Object.assign(golemSlayer, { description: "Defeat a Ruby Golem", parent: "first_ruby", icon: wand.texture, frame: "challenge", trigger: "kill_mob", target: "ruby:ruby_golem", count: 1, secret: true, rewardItem: "ruby:ruby_wand", rewardCount: 1 });
  const advCmd = createElement("command", "achievements", "Achievements command");
  advCmd.description = "Shows your ruby achievements";
  advCmd.actions = [{ id: uid(), type: "show_achievements", params: {}, chance: 100 }];

  p.elements = [...pack.elements, golem, boar, merchant, berry, rose, bench, benchRecipe, wand, wandRecipe, zap, welcome, bonus, heal, counter, shop, buyWand, shopCmd, slab, stairs, wall, shard, throwShard, bush, shrine, shrineLoot, sparkle, lamp, lampClick, brew, vampire, sight, rush, stats, bought, firstRuby, deepMiner, golemSlayer, advCmd];
  p.textures = textures;
  p.packIcon = textures.find((t) => t.name === "ruby")?.id ?? "";
  return p;
}
