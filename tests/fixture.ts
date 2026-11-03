import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { Project, TextureAsset } from "../src/model/types";

// 1x1 transparent PNG, enough for packaging tests.
export const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function fixtureProject(): Project {
  const p = createProject("Test Addon", "Tester");
  p.namespace = "test";
  const tex = (name: string, kind: TextureAsset["kind"]): string => {
    const t: TextureAsset = { id: `tex_${name}`, name, kind, width: 16, height: 16, dataUrl: PNG };
    p.textures.push(t);
    return t.id;
  };

  const block = createElement("block", "ruby_block", "Block of Ruby");
  block.textures.all = tex("ruby_block", "block");
  block.rotation = "facing";
  block.lightEmission = 7;

  const ore = createElement("block", "ruby_ore", "Ruby Ore");
  ore.textures.all = tex("ruby_ore", "block");
  ore.drops = "loot";

  const loot = createElement("loot", "ruby_ore_drops", "Ruby Ore Drops");
  loot.lootType = "blocks";
  loot.pools[0].entries[0] = { item: "test:ruby", weight: 1, min: 1, max: 2 };
  ore.lootTable = loot.id;

  const plant = createElement("plant", "blue_rose", "Blue Rose");
  plant.texture = tex("blue_rose", "block");

  const item = createElement("item", "ruby", "Ruby");
  item.texture = tex("ruby", "item");

  const tool = createElement("tool", "ruby_pickaxe", "Ruby Pickaxe");
  tool.texture = tex("ruby_pickaxe", "item");
  tool.repairItem = "test:ruby";

  const armor = createElement("armor", "ruby", "Ruby");
  for (const s of ["helmet", "chestplate", "leggings", "boots"] as const) armor.pieces[s].texture = tex(`ruby_${s}`, "item");
  armor.layer1 = tex("ruby_layer_1", "armor");
  armor.layer2 = tex("ruby_layer_2", "armor");
  armor.name = "ruby_armor";

  const food = createElement("food", "ruby_apple", "Ruby Apple");
  food.texture = tex("ruby_apple", "item");
  food.effects = [{ effect: "regeneration", seconds: 5, amplifier: 1, chance: 100 }];

  const mob = createElement("entity", "ruby_golem", "Ruby Golem");
  mob.texture = tex("ruby_golem", "entity");
  mob.behavior = "hostile";
  mob.populationControl = "monster";
  mob.spawnBiomeTags = ["monster", "plains"];
  mob.drops = [{ item: "test:ruby", min: 0, max: 2, chance: 50 }];

  const pig = createElement("entity", "ruby_pig", "Ruby Pig");
  pig.model = "quadruped";
  pig.texture = tex("ruby_pig", "entity");
  pig.temptItems = ["minecraft:carrot"];

  const shaped = createElement("recipe", "ruby_pickaxe_recipe", "Ruby Pickaxe Recipe");
  shaped.grid = ["test:ruby", "test:ruby", "test:ruby", "", "minecraft:stick", "", "", "minecraft:stick", ""];
  shaped.result = "test:ruby_pickaxe";

  const shapeless = createElement("recipe", "ruby_from_block", "Ruby from block");
  shapeless.recipeType = "shapeless";
  shapeless.grid = ["test:ruby_block", "", "", "", "", "", "", "", ""];
  shapeless.result = "test:ruby";
  shapeless.count = 9;

  const smelt = createElement("recipe", "smelt_ruby_ore", "Smelt Ruby Ore");
  smelt.recipeType = "furnace";
  smelt.input = "test:ruby_ore";
  smelt.result = "test:ruby";
  smelt.furnaceTags = ["furnace", "blast_furnace"];

  const gen = createElement("ore", "ruby_ore_gen", "Ruby Ore Generation");
  gen.block = "test:ruby_ore";

  const proc = createElement("procedure", "magic_wand", "Magic wand");
  proc.trigger = "item_use";
  proc.filter = "test:ruby";
  proc.conditions = [{ id: "c1", type: "sneaking", params: {}, negate: false }];
  proc.actions = [
    { id: "a1", type: "message", params: { text: "Zap, {player}!", to: "player" }, chance: 100 },
    { id: "a2", type: "lightning", params: { at: "player" }, chance: 25 },
    { id: "a3", type: "give", params: { item: "minecraft:diamond", count: 1 }, chance: 100 },
    { id: "a4", type: "effect", params: { who: "player", effect: "speed", seconds: 5, amplifier: 1, particles: true }, chance: 100 },
  ];

  const breakProc = createElement("procedure", "ore_break", "Ore break bonus");
  breakProc.trigger = "block_break";
  breakProc.filter = "test:ruby_ore";
  breakProc.actions = [
    { id: "b1", type: "drop_item", params: { at: "block", item: "minecraft:emerald", count: 1 }, chance: 10 },
    { id: "b2", type: "explosion", params: { at: "block", power: 2, fire: false, breaks: false }, chance: 100 },
    { id: "b3", type: "set_block", params: { at: "block", block: "minecraft:gold_block", dy: 0 }, chance: 100 },
  ];

  const hurtProc = createElement("procedure", "golem_hurt", "Golem hurt");
  hurtProc.trigger = "entity_die";
  hurtProc.filter = "test:ruby_golem";
  hurtProc.actions = [
    { id: "h1", type: "title", params: { text: "Victory", subtitle: "{target} defeated" }, chance: 100 },
    { id: "h2", type: "sound", params: { at: "target", sound: "random.levelup", volume: 1, pitch: 1 }, chance: 100 },
    { id: "h3", type: "heal", params: { who: "player", amount: 4 }, chance: 100 },
    { id: "h4", type: "teleport", params: { who: "player", mode: "relative", x: 0, y: 1, z: 0 }, chance: 100 },
    { id: "h5", type: "command", params: { as: "world", command: "/say a golem fell" }, chance: 100 },
    { id: "h6", type: "time", params: { time: "night" }, chance: 100 },
    { id: "h7", type: "launch", params: { who: "player", power: 1 }, chance: 100 },
    { id: "h8", type: "spawn", params: { at: "target", entity: "minecraft:zombie", count: 2 }, chance: 100 },
  ];

  const tick = createElement("procedure", "night_vision", "Night vision underground");
  tick.trigger = "tick";
  tick.intervalTicks = 40;
  tick.conditions = [
    { id: "t1", type: "y_above", params: { who: "player", y: 30 }, negate: true },
    { id: "t2", type: "holding", params: { item: "test:ruby" }, negate: false },
    { id: "t3", type: "health_below", params: { who: "player", value: 10 }, negate: false },
    { id: "t4", type: "daytime", params: {}, negate: true },
    { id: "t5", type: "dimension", params: { dimension: "overworld" }, negate: false },
  ];
  tick.actions = [{ id: "t6", type: "actionbar", params: { text: "Ruby glows" }, chance: 100 }];

  const cmd = createElement("command", "heal", "Heal command");
  cmd.actions = [
    { id: "c1", type: "heal", params: { who: "player", amount: 20 }, chance: 100 },
    { id: "c2", type: "message", params: { text: "Healed!", to: "player" }, chance: 100 },
  ];

  const fn = createElement("function", "welcome", "Welcome");
  fn.runEveryTick = true;
  fn.body = "/say hi\neffect @a speed 1 0 true";

  p.elements.push(block, ore, loot, plant, item, tool, armor, food, mob, pig, shaped, shapeless, smelt, gen, proc, breakProc, hurtProc, tick, cmd, fn);
  return p;
}
