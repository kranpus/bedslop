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
  { mcreator: "Plant", bedrock: "Block with cross geometry + scatter feature", status: "done", phase: 1, notes: "Flowers/grass with placement filter and natural generation. Crops with growth stages come in phase 2." },
  { mcreator: "Item", bedrock: "BP item (1.21 format)", status: "done", phase: 1, notes: "Stack size, glint, fuel, hand-equipped, tags, creative category." },
  { mcreator: "Tool", bedrock: "Item with digger, damage, durability", status: "done", phase: 1, notes: "Durability loss on use is handled by an auto-generated script." },
  { mcreator: "Armor", bedrock: "Wearable items + attachables", status: "done", phase: 1, notes: "Icons, worn layer textures, protection, enchantability, repair item." },
  { mcreator: "Food (item property)", bedrock: "minecraft:food + script effects", status: "done", phase: 1, notes: "Nutrition, saturation, eat/drink, leftover item, effects with chance." },
  { mcreator: "Living entity", bedrock: "BP entity + client entity + spawn rules", status: "done", phase: 1, notes: "Humanoid/quadruped presets or Blockbench model, AI presets, drops, spawn egg, natural spawning." },
  { mcreator: "Recipe", bedrock: "Shaped, shapeless, furnace, stonecutter, smithing", status: "done", phase: 1, notes: "Brewing recipes come in phase 2." },
  { mcreator: "Loot table", bedrock: "BP loot_tables", status: "done", phase: 1, notes: "Pools, weights, counts." },
  { mcreator: "Feature (ore)", bedrock: "ore_feature + feature_rules", status: "done", phase: 1, notes: "Vein size, frequency, height range, dimension." },
  { mcreator: "Procedure", bedrock: "Script API (@minecraft/server)", status: "partial", phase: 1, notes: "Trigger/condition/action builder now; full Blockly editor with variables in phase 2." },
  { mcreator: "Command", bedrock: "CustomCommandRegistry (API 2.1+)", status: "partial", phase: 1, notes: "No-argument commands now; typed arguments in phase 2." },
  { mcreator: "Function", bedrock: ".mcfunction + tick.json", status: "done", phase: 1, notes: "" },
  { mcreator: "Sound", bedrock: "sound_definitions.json", status: "done", phase: 1, notes: "Mob ambient/hurt/death sounds in phase 2." },
  { mcreator: "Texture maker / editor", bedrock: "Built-in pixel editor + generators", status: "done", phase: 1, notes: "Templates for ores, gems, ingots, tools, armor and mobs." },
  { mcreator: "Ore/tool/armor packs", bedrock: "Material Pack wizard", status: "done", phase: 1, notes: "One name + colour creates ore, item, block, tools, armor, recipes and generation." },
  // Phase 2
  { mcreator: "Procedure (Blockly)", bedrock: "Blockly -> Script API", status: "planned", phase: 2, notes: "Visual blocks, global/player variables via dynamic properties, loops, math, text." },
  { mcreator: "GUI", bedrock: "@minecraft/server-ui forms", status: "planned", phase: 2, notes: "Action, modal and message forms. Slot-based container GUIs need JSON UI (phase 3)." },
  { mcreator: "Projectile / ranged item", bedrock: "Projectile entity + shooter/throwable", status: "planned", phase: 2, notes: "" },
  { mcreator: "Structure", bedrock: ".mcstructure + structure features / jigsaw", status: "planned", phase: 2, notes: "Import structures exported from a Structure Block." },
  { mcreator: "Particle", bedrock: "RP particle JSON", status: "planned", phase: 2, notes: "Visual particle designer." },
  { mcreator: "Plant (crops)", bedrock: "Block states + random tick script", status: "planned", phase: 2, notes: "" },
  { mcreator: "Block (stairs, slabs, doors, fences)", bedrock: "Geometry presets + states + scripts", status: "planned", phase: 2, notes: "" },
  { mcreator: "Entity (tame, breed, ride, fly, trade)", bedrock: "Component groups + events", status: "planned", phase: 2, notes: "" },
  { mcreator: "Villager trades", bedrock: "Trade tables on custom traders", status: "planned", phase: 2, notes: "Vanilla villagers can't be edited, custom trader mobs can." },
  { mcreator: "Music disc", bedrock: "jukebox_playable + jukebox songs", status: "planned", phase: 2, notes: "" },
  { mcreator: "Tags", bedrock: "Item/block tags", status: "partial", phase: 2, notes: "Item tags work now; tag editor in phase 2." },
  { mcreator: "Localization", bedrock: "texts/*.lang", status: "partial", phase: 2, notes: "en_US is generated; multi-language editor in phase 2." },
  { mcreator: "3D model import / preview", bedrock: "Blockbench .geo.json", status: "partial", phase: 2, notes: "Import works now; 3D preview in phase 2." },
  { mcreator: "Creative tab", bedrock: "menu_category groups", status: "partial", phase: 2, notes: "Vanilla categories and groups only; Bedrock has no custom tabs." },
  // Phase 3: Bedrock gaps covered by scripting
  { mcreator: "Enchantment", bedrock: "Script-simulated", status: "workaround", phase: 3, notes: "No data-driven enchantments; simulate with lore + dynamic properties + events." },
  { mcreator: "Potion effect", bedrock: "Script-simulated", status: "workaround", phase: 3, notes: "No custom effects; simulate with timed scripts and HUD text." },
  { mcreator: "Achievement / advancement", bedrock: "Script-simulated", status: "workaround", phase: 3, notes: "Track with dynamic properties, announce with titles/toasts." },
  { mcreator: "Overlay", bedrock: "JSON UI / title + actionbar", status: "workaround", phase: 3, notes: "Simple overlays via actionbar/title; full HUD via JSON UI." },
  { mcreator: "Key binding", bedrock: "Input API / sneak + item combos", status: "workaround", phase: 3, notes: "No custom key bindings on Bedrock." },
  { mcreator: "Game rule", bedrock: "Vanilla game rules only", status: "workaround", phase: 3, notes: "Can set vanilla rules from scripts; custom rules as world dynamic properties." },
  { mcreator: "Biome", bedrock: "Data-driven biomes (limited)", status: "workaround", phase: 3, notes: "Custom biome support on Bedrock is limited/experimental." },
  { mcreator: "Damage type", bedrock: "Vanilla damage causes", status: "workaround", phase: 3, notes: "applyDamage with a vanilla cause." },
  // Not possible
  { mcreator: "Dimension", bedrock: "Not supported", status: "impossible", phase: 0, notes: "Bedrock add-ons cannot add dimensions." },
  { mcreator: "Fluid", bedrock: "Not supported", status: "impossible", phase: 0, notes: "No custom fluids on Bedrock." },
  { mcreator: "Painting", bedrock: "Not supported", status: "impossible", phase: 0, notes: "" },
  { mcreator: "Banner pattern", bedrock: "Not supported", status: "impossible", phase: 0, notes: "" },
  { mcreator: "Attribute", bedrock: "Not supported", status: "impossible", phase: 0, notes: "" },
  { mcreator: "Java code / mixins", bedrock: "Not applicable", status: "impossible", phase: 0, notes: "Bedrock uses JSON + JavaScript instead." },
];
