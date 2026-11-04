// Curated vanilla Bedrock identifiers used for pickers and autocomplete.
// Free text is always allowed, so this list only needs the common cases.

const items = `
apple baked_potato beef bread carrot cooked_beef cooked_chicken cooked_porkchop cooked_mutton cooked_cod cooked_salmon
golden_apple golden_carrot melon_slice pumpkin_pie cookie sweet_berries glow_berries honey_bottle mushroom_stew bowl
stick string feather leather flint gunpowder bone bone_meal slime_ball ender_pearl blaze_rod blaze_powder ghast_tear
coal charcoal raw_iron raw_gold raw_copper iron_ingot gold_ingot copper_ingot netherite_ingot netherite_scrap
iron_nugget gold_nugget diamond emerald lapis_lazuli redstone quartz amethyst_shard glowstone_dust prismarine_shard
prismarine_crystals nether_star echo_shard paper book sugar sugar_cane wheat wheat_seeds egg milk_bucket bucket
water_bucket lava_bucket glass_bottle potion clay_ball brick nether_brick honeycomb ink_sac glow_ink_sac phantom_membrane
rabbit_hide scute turtle_scute armadillo_scute breeze_rod heavy_core
wooden_pickaxe stone_pickaxe iron_pickaxe golden_pickaxe diamond_pickaxe netherite_pickaxe
wooden_sword stone_sword iron_sword golden_sword diamond_sword netherite_sword
wooden_axe stone_axe iron_axe diamond_axe netherite_axe wooden_shovel iron_shovel diamond_shovel
iron_hoe diamond_hoe bow arrow crossbow trident shield fishing_rod flint_and_steel shears compass clock spyglass mace
iron_helmet iron_chestplate iron_leggings iron_boots diamond_helmet diamond_chestplate diamond_leggings diamond_boots
netherite_upgrade_smithing_template totem_of_undying elytra saddle name_tag lead firework_rocket
`;

const blocks = `
stone cobblestone deepslate cobbled_deepslate granite diorite andesite tuff calcite dirt grass_block podzol mycelium
coarse_dirt rooted_dirt mud moss_block sand red_sand gravel clay snow snow_block ice packed_ice blue_ice
oak_log spruce_log birch_log jungle_log acacia_log dark_oak_log mangrove_log cherry_log
oak_planks spruce_planks birch_planks jungle_planks acacia_planks dark_oak_planks mangrove_planks cherry_planks bamboo_planks
glass white_wool obsidian crying_obsidian bedrock netherrack basalt blackstone end_stone soul_sand soul_soil
iron_block gold_block diamond_block emerald_block lapis_block redstone_block coal_block copper_block netherite_block
iron_ore gold_ore diamond_ore coal_ore copper_ore emerald_ore lapis_ore redstone_ore
deepslate_iron_ore deepslate_gold_ore deepslate_diamond_ore deepslate_coal_ore nether_gold_ore quartz_ore ancient_debris
crafting_table furnace blast_furnace smoker chest barrel anvil enchanting_table bookshelf torch lantern glowstone
sea_lantern tnt hay_block pumpkin melon_block cactus bricks stone_bricks mossy_cobblestone sandstone red_sandstone
prismarine quartz_block purpur_block amethyst_block terracotta white_concrete
`;

const toIds = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => `minecraft:${x}`);

export const VANILLA_ITEMS = toIds(items);
export const VANILLA_BLOCKS = toIds(blocks);
export const VANILLA_ALL = Array.from(new Set([...VANILLA_ITEMS, ...VANILLA_BLOCKS])).sort();

export const VANILLA_ENTITIES = toIds(`
zombie skeleton creeper spider cave_spider enderman witch slime blaze ghast piglin hoglin wither_skeleton drowned husk stray
phantom pillager vindicator evoker ravager warden breeze bogged pig cow sheep chicken horse donkey wolf cat fox rabbit
llama goat bee turtle axolotl frog camel armadillo sniffer villager wandering_trader iron_golem snow_golem
lightning_bolt tnt xp_orb armor_stand boat minecart
`);

export const EFFECTS = [
  "speed", "slowness", "haste", "mining_fatigue", "strength", "instant_health", "instant_damage", "jump_boost",
  "nausea", "regeneration", "resistance", "fire_resistance", "water_breathing", "invisibility", "blindness",
  "night_vision", "hunger", "weakness", "poison", "wither", "health_boost", "absorption", "saturation",
  "levitation", "slow_falling", "conduit_power", "darkness", "bad_omen", "village_hero",
  "wind_charged", "weaving", "oozing", "infested",
];

/** Biome tags usable in spawn rules and feature rules. */
export const BIOME_TAGS = [
  "animal", "monster", "overworld", "plains", "forest", "birch", "roofed", "taiga", "cold", "frozen", "desert",
  "jungle", "savanna", "swamp", "mesa", "extreme_hills", "ocean", "deep", "river", "beach", "mushroom_island",
  "lush_caves", "nether", "the_end",
];

/** Sound sets accepted by the "sound" field in RP/blocks.json. */
export const BLOCK_SOUNDS = [
  "stone", "wood", "grass", "gravel", "sand", "metal", "glass", "cloth", "snow", "deepslate", "deepslate_bricks",
  "copper", "amethyst_block", "netherite", "nether_brick", "netherrack", "basalt", "bone_block", "calcite",
  "tuff", "mud", "moss_block", "cherry_wood", "bamboo_wood", "slime", "honey_block", "lantern", "chain", "coral",
  "sweet_berry_bush", "vines", "azalea", "sculk", "ladder", "anvil",
];

export const VANILLA_SOUNDS = [
  "random.levelup", "random.orb", "random.pop", "random.explode", "random.anvil_land", "random.break",
  "random.click", "random.chestopen", "random.door_open", "random.toast", "random.totem", "mob.zombie.say",
  "mob.enderdragon.growl", "mob.endermen.portal", "ambient.weather.thunder", "note.pling", "note.bell",
  "note.harp", "beacon.activate", "fire.ignite", "dig.stone",
];

export const MENU_CATEGORIES = ["construction", "equipment", "items", "nature", "none"] as const;

/** Vanilla particle effects that can be spawned by id (from Mojang's resource pack). */
export const VANILLA_PARTICLES = [
  "minecraft:heart_particle", "minecraft:villager_happy", "minecraft:villager_angry", "minecraft:note_particle",
  "minecraft:basic_flame_particle", "minecraft:blue_flame_particle", "minecraft:basic_smoke_particle", "minecraft:campfire_smoke_particle",
  "minecraft:critical_hit_emitter", "minecraft:magic_critical_hit_emitter", "minecraft:endrod", "minecraft:totem_particle",
  "minecraft:portal_reverse_particle", "minecraft:soul_particle", "minecraft:snowflake_particle", "minecraft:electric_spark_particle",
  "minecraft:glow_particle", "minecraft:enchanting_table_particle", "minecraft:lava_particle", "minecraft:cherry_leaves_particle",
  "minecraft:basic_bubble_particle", "minecraft:large_explosion", "minecraft:huge_explosion_emitter", "minecraft:sonic_explosion",
  "minecraft:wind_explosion_emitter",
];

/** Vanilla mob sounds (checked against Mojang's sound_definitions.json). */
export const VANILLA_MOB_SOUNDS = (
  "mob.wolf.bark mob.wolf.hurt mob.wolf.death mob.wolf.step mob.cow.say mob.cow.hurt mob.cow.step mob.pig.say mob.pig.death mob.pig.step " +
  "mob.zombie.say mob.zombie.hurt mob.zombie.death mob.zombie.step mob.skeleton.say mob.skeleton.hurt mob.skeleton.death mob.skeleton.step " +
  "mob.cat.meow mob.cat.hit mob.chicken.say mob.chicken.hurt mob.chicken.step mob.sheep.say mob.sheep.step mob.villager.idle mob.villager.hit " +
  "mob.villager.death mob.bat.idle mob.bat.hurt mob.bat.death mob.blaze.breathe mob.blaze.hit mob.blaze.death mob.ghast.moan mob.ghast.scream " +
  "mob.ghast.death mob.slime.small mob.spider.say mob.spider.death mob.spider.step mob.horse.idle mob.horse.hit mob.horse.death mob.fox.ambient " +
  "mob.fox.hurt mob.fox.death mob.bee.aggressive mob.allay.idle mob.parrot.idle mob.fish.hurt mob.fish.flop mob.irongolem.hit " +
  "mob.irongolem.death mob.irongolem.walk mob.endermen.idle mob.endermen.hit mob.endermen.death mob.creeper.say mob.creeper.death " +
  "mob.wither.ambient mob.camel.ambient mob.frog.ambient mob.goat.ambient"
).split(" ");

/** Vanilla item tags that mean something to the game or are widely used by recipes. */
export const COMMON_ITEM_TAGS = [
  "minecraft:planks", "minecraft:logs", "minecraft:wool", "minecraft:coals", "minecraft:arrow", "minecraft:is_food", "minecraft:is_meat",
  "minecraft:is_fish", "minecraft:is_tool", "minecraft:is_sword", "minecraft:is_pickaxe", "minecraft:is_axe", "minecraft:is_shovel", "minecraft:is_hoe",
  "minecraft:is_armor", "minecraft:trim_materials", "minecraft:transform_materials", "minecraft:stone_tool_materials",
  "minecraft:stone_crafting_materials", "minecraft:wooden_slabs", "minecraft:sand", "minecraft:boats",
];

/** Vanilla block tags (tools, crops and terrain checks use these). */
export const COMMON_BLOCK_TAGS = [
  "stone", "wood", "metal", "dirt", "sand", "gravel", "grass", "log", "plant", "minecraft:crop",
  "minecraft:is_pickaxe_item_destructible", "minecraft:is_axe_item_destructible", "minecraft:is_shovel_item_destructible",
  "minecraft:is_hoe_item_destructible", "minecraft:stone_tier_destructible", "minecraft:iron_tier_destructible", "minecraft:diamond_tier_destructible",
];

/** Vanilla disc sound slots a custom disc can play through (Bedrock's stable record component only accepts these). */
export const DISC_SLOTS = [
  "record.13", "record.11", "record.ward", "record.wait", "record.mall", "record.stal", "record.strad", "record.mellohi", "record.far",
  "record.chirp", "record.blocks", "record.cat", "record.5", "record.relic", "record.otherside", "record.pigstep", "record.creator",
  "record.precipice", "record.creator_music_box", "record.tears", "record.lava_chicken", "record.bounce",
];

/** Potion types brewing recipes can use (from Mojang's vanilla brewing recipes). Bedrock has no custom potion types. */
export const POTION_TYPES = (
  "water mundane long_mundane thick awkward nightvision long_nightvision invisibility long_invisibility leaping long_leaping strong_leaping " +
  "fire_resistance long_fire_resistance swiftness long_swiftness strong_swiftness slowness long_slowness strong_slowness water_breathing " +
  "long_water_breathing healing strong_healing harming strong_harming poison long_poison strong_poison regeneration long_regeneration " +
  "strong_regeneration strength long_strength strong_strength weakness long_weakness turtle_master long_turtle_master strong_turtle_master " +
  "slow_falling long_slow_falling wind_charged weaving oozing infested"
).split(" ").map((t) => `minecraft:potion_type:${t}`);

export const POTION_CONTAINERS = ["minecraft:potion", "minecraft:splash_potion", "minecraft:lingering_potion"];

/** "minecraft:potion_type:long_nightvision" -> "Night vision (long)". */
export function potionLabel(id: string): string {
  if (POTION_CONTAINERS.includes(id)) return { "minecraft:potion": "Potion", "minecraft:splash_potion": "Splash potion", "minecraft:lingering_potion": "Lingering potion" }[id]!;
  let t = id.replace("minecraft:potion_type:", "");
  let suffix = "";
  if (t.startsWith("long_")) { t = t.slice(5); suffix = " (long)"; }
  if (t.startsWith("strong_")) { t = t.slice(7); suffix = " II"; }
  const name = t === "nightvision" ? "night vision" : t.replace(/_/g, " ");
  const base = name.charAt(0).toUpperCase() + name.slice(1);
  return ["water", "mundane", "thick", "awkward"].includes(t) ? `${base} potion${suffix}` : `Potion of ${name}${suffix}`;
}

/** Common vanilla creative inventory groups (minecraft:itemGroup.name.*). */
export const VANILLA_GROUPS = (
  "planks walls fence fenceGate stairs door trapdoor glass glassPane slab stoneBrick sandstone wool woolCarpet concrete concretePowder " +
  "stainedClay ore stone log wood leaves sapling seed crop grass flower dye mushroom mobEgg coral sculk " +
  "helmet chestplate leggings boots sword axe pickaxe shovel hoe arrow cookedFood miscFood potion splashPotion lingeringPotion " +
  "bed candles anvil chest shulkerBox record sign hanging_sign skull enchantedBook boat chestboat rail minecart buttons pressurePlate " +
  "lantern smithing_templates potterySherds"
).split(" ").map((g) => `minecraft:itemGroup.name.${g}`);
