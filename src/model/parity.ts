// MCreator feature -> Bedrock parity matrix. This drives the in-app Roadmap page and mirrors DEVPLAN.md.

export type ParityStatus = "done" | "partial" | "planned" | "workaround" | "impossible";

export interface ParityRow {
  mcreator: string;
  bedrock: string;
  status: ParityStatus;
  phase: number;
  notes: string;
}

export const PARITY: ParityRow[] = [
  // Phase 1: core content
  { mcreator: "Block", bedrock: "BP block + material_instances", status: "done", phase: 1, notes: "Per-face textures, light, friction, hardness, rotation (facing/axis), custom Blockbench geometry, drops." },
  { mcreator: "Block (custom model)", bedrock: "Blockbench geometry + fitted hitbox", status: "done", phase: 2, notes: ".bbmodel or .geo.json import with texture, 3D preview, hitbox: fit to model, full block or none." },
  { mcreator: "Block (crafting table / GUI)", bedrock: "minecraft:crafting_table", status: "done", phase: 2, notes: "Custom crafting stations; recipes choose where they can be crafted." },
  { mcreator: "Block (inventory / tile entity)", bedrock: "minecraft:block_entity container", status: "done", phase: 2, notes: "Storage blocks with 1-54 slots and a chest screen, an optional screen background, and lids that open and close (model parts + sounds) while players look inside. Needs Minecraft 1.26.60+." },
  { mcreator: "Block (redstone)", bedrock: "redstone_producer / redstone_consumer", status: "done", phase: 2, notes: "Constant or lever-style output, input that lights blocks up and starts procedures. Needs Minecraft 1.26.0+." },
  { mcreator: "Living entity (from vanilla)", bedrock: "Vanilla template + runtime_identifier", status: "done", phase: 2, notes: "Any of 89 vanilla mobs as a starting point, downloaded from Mojang's bedrock-samples; optional reskin." },
  { mcreator: "Plant", bedrock: "Block with cross geometry + scatter feature", status: "done", phase: 1, notes: "Flowers/grass with placement filter and natural generation. Crops are their own element." },
  { mcreator: "Item", bedrock: "BP item (1.21 format)", status: "done", phase: 1, notes: "Stack size, glint, fuel, hand-equipped, tags, creative category." },
  { mcreator: "Tool", bedrock: "Item with digger, damage, durability", status: "done", phase: 1, notes: "Durability loss on use is handled by an auto-generated script." },
  { mcreator: "Armor", bedrock: "Wearable items + attachables", status: "done", phase: 1, notes: "Icons, worn layer textures, protection, enchantability, repair item." },
  { mcreator: "Food (item property)", bedrock: "minecraft:food + script effects", status: "done", phase: 1, notes: "Nutrition, saturation, eat/drink, leftover item, effects with chance." },
  { mcreator: "Living entity", bedrock: "BP entity + client entity + spawn rules", status: "done", phase: 1, notes: "Humanoid/quadruped presets or Blockbench model, AI presets, drops, spawn egg, natural spawning." },
  { mcreator: "Recipe", bedrock: "Shaped, shapeless, furnace, stonecutter, smithing", status: "done", phase: 1, notes: "#tag ingredients and custom crafting stations too." },
  { mcreator: "Brewing recipe", bedrock: "recipe_brewing_mix / recipe_brewing_container", status: "done", phase: 2, notes: "Vanilla potion types and bottles with any ingredient. Bedrock has no custom potion types." },
  { mcreator: "Loot table", bedrock: "BP loot_tables", status: "done", phase: 1, notes: "Pools, weights, counts." },
  { mcreator: "Feature (ore)", bedrock: "ore_feature + feature_rules", status: "done", phase: 1, notes: "Vein size, frequency, height range, dimension." },
  { mcreator: "Procedure", bedrock: "Script API (@minecraft/server)", status: "done", phase: 1, notes: "Simple steps or Blockly blocks; 13 triggers including “run manually”." },
  { mcreator: "Command", bedrock: "CustomCommandRegistry (API 2.1+)", status: "done", phase: 1, notes: "Permission levels and typed arguments (number, text, true/false, player)." },
  { mcreator: "Function", bedrock: ".mcfunction + tick.json", status: "done", phase: 1, notes: "" },
  { mcreator: "Sound", bedrock: "sound_definitions.json", status: "done", phase: 1, notes: "Mob ambient/hurt/death sounds in phase 2." },
  { mcreator: "Texture maker / editor", bedrock: "Built-in pixel editor + generators", status: "done", phase: 1, notes: "Templates for ores, gems, ingots, tools, armor and mobs." },
  { mcreator: "Ore/tool/armor packs", bedrock: "Material Pack wizard", status: "done", phase: 1, notes: "One name + colour creates ore, item, block, tools, armor, recipes and generation." },
  // Phase 2
  { mcreator: "Procedure (Blockly)", bedrock: "Blockly -> Script API", status: "done", phase: 2, notes: "Every step and condition as a block, plus if/else, loops, math, text, waits, for each player, local and global variables." },
  { mcreator: "Global variables", bedrock: "Dynamic properties", status: "done", phase: 2, notes: "World or per-player; number, text or true/false; usable in text as {name}." },
  { mcreator: "GUI", bedrock: "@minecraft/server-ui forms + container blocks", status: "done", phase: 2, notes: "Button menus with icons, input forms and yes/no dialogs; chest-style slot screens through storage blocks (1-54 slots). Menus can be a grid of tiles with their own size and background, and storage blocks can have their own screen background (JSON UI). Slot positions themselves are fixed by Minecraft." },
  { mcreator: "Projectile / ranged item", bedrock: "Projectile entity + shooter/throwable", status: "done", phase: 2, notes: "Sprite, arrow or Blockbench look; damage, fire, effects, stick or vanish; throwables, bows and ammo; on-hit procedure triggers." },
  { mcreator: "Structure", bedrock: ".mcstructure + structure_template_feature", status: "done", phase: 2, notes: "Import from a Structure Block, 3D preview, loot tables per chest, natural generation (surface/underground, biomes, rarity, ground rules), \"Place structure\" step. Jigsaw (multi-piece) structures wait until Bedrock makes them stable." },
  { mcreator: "Particle", bedrock: "RP particle JSON", status: "done", phase: 2, notes: "Designer with live preview, sprites or own texture, colour/size over life, burst or stream, physics and collisions; Spawn particles step." },
  { mcreator: "Plant (crops)", bedrock: "Block states + random tick script", status: "done", phase: 2, notes: "2-8 stages, bone meal, seeds item, young/grown drops." },
  { mcreator: "Block (stairs, slabs, doors, fences)", bedrock: "Geometry presets + states + scripts", status: "done", phase: 2, notes: "Slab, stairs, carpet, trapdoor, door, fence, wall, pane. Stair corners and fence gates not yet." },
  { mcreator: "Entity (tame, breed, ride, fly, trade)", bedrock: "Component groups + events", status: "done", phase: 2, notes: "Fly/swim, ranged attacks, taming, breeding, riding, trades, sounds and texture variants on preset and Blockbench mobs." },
  { mcreator: "Villager trades", bedrock: "Trade tables on custom traders", status: "done", phase: 2, notes: "Any custom mob can trade. Vanilla villagers' trades can't be edited." },
  { mcreator: "Music disc", bedrock: "minecraft:record + sound definition", status: "done", phase: 2, notes: "Own .ogg songs; each plays through a vanilla disc sound slot, as stable Bedrock requires." },
  { mcreator: "Tags", bedrock: "Item/block tags", status: "done", phase: 2, notes: "Tags on all your items and blocks, Tags tab, #tag recipe ingredients, tag conditions. Vanilla items can't be tagged in Bedrock." },
  { mcreator: "Block states / properties", bedrock: "Block states + permutations", status: "done", phase: 2, notes: "On/off, number and list states; rules change texture, light, hardness, friction, map colour, collision; set/cycle steps." },
  { mcreator: "Localization", bedrock: "texts/*.lang", status: "done", phase: 2, notes: "Languages tab for 28 languages with progress and .lang download/upload; English fallback." },
  { mcreator: "3D model import / preview", bedrock: "Blockbench .bbmodel / .geo.json", status: "done", phase: 2, notes: "Mobs (animated), blocks and shapes, items as in the hand, armour on a player, structures and particles." },
  { mcreator: "Creative tab", bedrock: "Item catalog groups", status: "done", phase: 2, notes: "Your own collapsible groups with icons inside the four creative tabs (1.21.60+). Whole new tabs don't exist in Bedrock." },
  // Phase 3: Bedrock gaps covered by scripting
  { mcreator: "Enchantment", bedrock: "Script-simulated", status: "done", phase: 3, notes: "Run by script: stored on the item with a tooltip line; hit, break and worn effects; enchanted books. Not in the enchanting table or anvil." },
  { mcreator: "Potion effect", bedrock: "Script-simulated", status: "done", phase: 3, notes: "Run by script, listed with timers on the left of the screen: Minecraft effect bundles, damage/heal over time, particles, procedures, milk cure, potion items." },
  { mcreator: "Achievement / advancement", bedrock: "Script-simulated + JSON UI toast", status: "done", phase: 3, notes: "Tracked per player by script: item, block, mob, item-use, variable, score and dimension triggers or procedures; toast with icon, chat message, rewards, and an achievements list menu. Not the vanilla advancements screen." },
  { mcreator: "Overlay", bedrock: "JSON UI (hud_screen) + script titles", status: "done", phase: 3, notes: "Visual editor: images, text, live values and bars on the HUD, or overlays shown and hidden by procedures." },
  { mcreator: "Key binding", bedrock: "Script input events (combos)", status: "done", phase: 3, notes: "No new keys on Bedrock, so bindings are combos: double-tap jump/sneak, hold sneak, sneak + jump/use/hotbar number, left-click (2.11+). Optional held item and cooldown." },
  { mcreator: "Scoreboard procedures", bedrock: "world.scoreboard", status: "done", phase: 3, notes: "Objectives on the Variables tab; change/reset/show/hide steps, score checks and blocks, {score:name} text." },
  { mcreator: "Game rule", bedrock: "World dynamic properties + world.gameRules", status: "done", phase: 3, notes: "Your own on/off and number rules (Variables tab) with a /<namespace>:gamerule command; set/check steps also cover Minecraft's rules. Not shown in vanilla /gamerule or world settings." },
  { mcreator: "Biome", bedrock: "BP biome (replace_biomes) + RP client_biome", status: "done", phase: 3, notes: "Takes over part of chosen Minecraft biomes: own ground blocks, weather, colours, sky, fog, plant style, spawning and tags. Can't be placed by climate. Needs 1.21.110+." },
  { mcreator: "Damage type", bedrock: "Vanilla damage causes", status: "workaround", phase: 3, notes: "applyDamage with a vanilla cause." },
  // Not possible
  { mcreator: "Dimension", bedrock: "Not supported", status: "impossible", phase: 0, notes: "Bedrock add-ons cannot add dimensions." },
  { mcreator: "Fluid", bedrock: "Not supported", status: "impossible", phase: 0, notes: "No custom fluids on Bedrock." },
  { mcreator: "Painting", bedrock: "Not supported", status: "impossible", phase: 0, notes: "" },
  { mcreator: "Banner pattern", bedrock: "Not supported", status: "impossible", phase: 0, notes: "" },
  { mcreator: "Attribute", bedrock: "Not supported", status: "impossible", phase: 0, notes: "" },
  { mcreator: "Java code / mixins", bedrock: "Not applicable", status: "impossible", phase: 0, notes: "Bedrock uses JSON + JavaScript instead." },
];
