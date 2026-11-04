// Core data model for a Bedrock Creator workspace.
// Everything here is plain JSON so a project can be saved, exported and re-imported as-is.

export type ElementKind =
  | "hud"
  | "effect"
  | "enchantment"
  | "disc"
  | "particle"
  | "structure"
  | "block"
  | "plant"
  | "item"
  | "tool"
  | "armor"
  | "food"
  | "entity"
  | "recipe"
  | "loot"
  | "ore"
  | "procedure"
  | "command"
  | "function"
  | "sound"
  | "form"
  | "projectile"
  | "crop";

export type MenuCategory = "construction" | "equipment" | "items" | "nature" | "none";

export interface BaseElement {
  id: string;
  kind: ElementKind;
  /** Identifier part after the namespace, e.g. "ruby_ore". */
  name: string;
  /** Human readable name shown in game. */
  displayName: string;
  createdAt: number;
}

export interface TextureAsset {
  id: string;
  /** File name without extension, used for atlas keys. */
  name: string;
  kind: "block" | "item" | "entity" | "armor" | "other";
  width: number;
  height: number;
  /** PNG data URL. */
  dataUrl: string;
}

export type BlockTextureMode = "all" | "pillar" | "six";
export type BlockFace = "all" | "top" | "bottom" | "side" | "north" | "south" | "east" | "west";

export type BlockShape = "cube" | "slab" | "stairs" | "carpet" | "trapdoor" | "door" | "fence" | "wall" | "pane" | "fence_gate" | "button" | "pressure_plate";

/** A state you add to a block, e.g. "lit" (on/off), "stage" (0-3) or "colour" (red/green/blue). */
export interface CustomBlockState {
  name: string;
  type: "bool" | "int" | "enum";
  min?: number;
  max?: number;
  options?: string[];
}

/** When the block's states match, change how it looks or behaves. */
export interface BlockStateRule {
  id: string;
  /** All must match. Values are written as text: "true", "2", "red". */
  when: { state: string; value: string }[];
  texture?: string;
  light?: number;
  mapColor?: string;
  hardness?: number;
  noCollision?: boolean;
  friction?: number;
  /** Custom models only: parts (bones) to hide. */
  hideBones?: string[];
}

/** A storage block that opens and closes like a chest. */
export interface ChestLid {
  enabled: boolean;
  /** Custom models: parts shown only while closed / only while open. */
  closedParts: string[];
  openParts: string[];
  /** Sounds when the first player opens it and the last one closes it ("" = silent). */
  openSound: string;
  closeSound: string;
}

export interface BlockElement extends BaseElement {
  kind: "block";
  /** Tags other add-ons, recipes and procedures can test for (e.g. "minecraft:stone"). */
  tags?: string[];
  customStates?: CustomBlockState[];
  stateRules?: BlockStateRule[];
  /** Storage blocks: background image for the container screen (JSON UI). */
  containerBackground?: string;
  /** Gives off this particle effect (own effect name or a vanilla id) every particleEvery seconds. */
  particle?: string;
  particleEvery?: number;
  textureMode: BlockTextureMode;
  textures: Partial<Record<BlockFace, string>>;
  renderMethod: "opaque" | "alpha_test" | "blend";
  /** Seconds to break by hand. */
  hardness: number;
  explosionResistance: number;
  lightEmission: number;
  lightDampening: number;
  friction: number;
  sound: string;
  category: MenuCategory;
  group: string;
  drops: "self" | "nothing" | "loot";
  lootTable: string; // id of a loot element
  flammable: boolean;
  mapColor: string;
  rotation: "none" | "facing" | "axis";
  geometry: "full" | "custom";
  customGeometry: string;
  bestTool: "none" | "pickaxe" | "axe" | "shovel" | "hoe";
  /** Built-in shape. Missing = "cube" (or the custom model when geometry is "custom"). */
  shape?: BlockShape;
  /** Hitbox for custom models: whole block, fitted to the model, or none (walk through). */
  collision?: "full" | "model" | "none";
  /** What the block does when used. */
  function?: "none" | "crafting" | "storage";
  /** Crafting station: recipes tagged with any of these can be made here. */
  craftingTags?: string[];
  tableName?: string;
  /** Storage: number of slots (1-54) and the title shown on its screen. */
  slotCount?: number;
  containerTitle?: string;
  /** Storage: animate like a chest while someone has it open (an "opened" state, model parts and sounds). */
  lid?: ChestLid;
  /** Redstone output power 0-15 (0 = none). */
  redstonePower?: number;
  /** "always": constant signal; "toggle": right-click switches it on and off, like a lever. */
  redstoneMode?: "always" | "toggle";
  /** Reacts to incoming redstone (onRedstoneUpdate). */
  redstoneInput?: boolean;
  /** Lights up while powered (input) or switched on (toggle), like a redstone lamp. */
  litWhenPowered?: boolean;
  litLevel?: number;
  /** Texture used while on/powered, "" = unchanged. */
  poweredTexture?: string;
  /** Lets a redstone signal pass through to the next block. */
  passesPower?: boolean;
}

export interface PlantElement extends BaseElement {
  /** Extra tags (recipes, procedures and other add-ons can test for them). */
  tags?: string[];
  kind: "plant";
  texture: string;
  lightEmission: number;
  placeableOn: string[];
  sound: string;
  hardness: number;
  generate: boolean;
  generateTries: number;
}

export interface ItemElement extends BaseElement {
  kind: "item";
  /** What using the item does: throw a projectile (like a snowball), shoot ammo (like a bow), or be ammo. */
  use?: "none" | "throw" | "bow" | "crossbow" | "ammo";
  /** Projectile element name thrown/fired by this item (throw, ammo). */
  projectile?: string;
  /** Bow: item ids it can fire (ammo items, e.g. minecraft:arrow). */
  ammo?: string[];
  /** Bow: seconds to fully draw. */
  drawSeconds?: number;
  /** Uses before it breaks (bows); 0 = unbreakable. */
  durability?: number;
  texture: string;
  maxStack: number;
  glint: boolean;
  handEquipped: boolean;
  fuelSeconds: number;
  category: MenuCategory;
  group: string;
  tags: string[];
}

export type ToolType = "pickaxe" | "axe" | "shovel" | "hoe" | "sword";
export type ToolTier = "wooden" | "stone" | "iron" | "golden" | "diamond" | "netherite";

export interface ToolElement extends BaseElement {
  /** Extra tags (recipes, procedures and other add-ons can test for them). */
  tags?: string[];
  kind: "tool";
  toolType: ToolType;
  texture: string;
  tier: ToolTier;
  attackDamage: number;
  durability: number;
  miningSpeed: number;
  enchantability: number;
  repairItem: string;
  glint: boolean;
}

export type ArmorSlot = "helmet" | "chestplate" | "leggings" | "boots";

export interface ArmorPiece {
  enabled: boolean;
  texture: string;
  protection: number;
}

export interface ArmorElement extends BaseElement {
  /** Extra tags (recipes, procedures and other add-ons can test for them). */
  tags?: string[];
  kind: "armor";
  pieces: Record<ArmorSlot, ArmorPiece>;
  /** 64x32 texture for helmet, chestplate, boots. */
  layer1: string;
  /** 64x32 texture for leggings. */
  layer2: string;
  /** Vanilla style multiplier: iron = 15, diamond = 33, netherite = 37. */
  durabilityMultiplier: number;
  enchantability: number;
  repairItem: string;
}

export interface EffectEntry {
  effect: string;
  seconds: number;
  amplifier: number;
  chance: number; // 0-100
}

export interface FoodElement extends BaseElement {
  /** Extra tags (recipes, procedures and other add-ons can test for them). */
  tags?: string[];
  kind: "food";
  texture: string;
  nutrition: number;
  saturation: number;
  canAlwaysEat: boolean;
  useDuration: number;
  animation: "eat" | "drink";
  convertsTo: string;
  effects: EffectEntry[];
  maxStack: number;
  glint: boolean;
}

export interface DropEntry {
  item: string;
  min: number;
  max: number;
  chance: number; // 0-100
}

export type AnimWhen = "always" | "moving" | "idle" | "attacking" | "hurt" | "in_water" | "on_fire" | "dying" | "custom" | "never";

/** "What plays when" for one animation on a custom mob. */
export interface AnimationSlot {
  id: string;
  /** Full animation id from the imported file, or "@auto_walk" / "@auto_look" for generated ones. */
  animation: string;
  when: AnimWhen;
  /** Molang condition, used when `when` is "custom". */
  condition: string;
  mode: "loop" | "once";
  speed: number;
  /** Advance the animation by distance walked, so feet don't slide. */
  matchMovement: boolean;
}

export type RigRole = "head" | "rightArm" | "leftArm" | "rightLeg" | "leftLeg";

/** Which bones the generated walk/look animations move. Missing role = detect by name, "" = none. */
export interface AutoRig {
  bones: Partial<Record<RigRole, string>>;
  swing: number; // degrees
  reverse: boolean;
}

export interface TradeEntry {
  wants: string;
  wantsCount: number;
  /** Optional second item the trader wants. */
  wants2?: string;
  wants2Count?: number;
  gives: string;
  givesCount: number;
  /** Times the trade can be used before the trader restocks. */
  maxUses: number;
  /** Trader level (1-5) that unlocks it. Trading earns the trader experience, like villagers. */
  level?: number;
}

export interface EntityElement extends BaseElement {
  kind: "entity";
  model: "humanoid" | "quadruped" | "custom" | "vanilla";
  /** Vanilla template: the original mob, e.g. "minecraft:zombie". */
  vanillaBase?: string;
  /** Vanilla template: the mob's behaviour file and resource (client) file, as downloaded. */
  vanillaBehavior?: string;
  vanillaClient?: string;
  /** Vanilla template: its entry from the game's sounds.json (JSON). */
  vanillaSounds?: string;
  /** Vanilla template: model file and texture URL, for the preview only (not exported). */
  vanillaGeometry?: string;
  vanillaTexture?: string;
  customGeometry: string;
  customAnimations: string;
  /** How the custom model was added: converted from a .bbmodel, or Blockbench's exported files used as-is. */
  modelSource?: "bbmodel" | "files";
  /** Animation controllers file exported from Blockbench, used as-is. */
  customControllers?: string;
  animationMode?: "auto" | "manual";
  animationSlots?: AnimationSlot[];
  autoRig?: AutoRig;
  texture: string;
  health: number;
  speed: number;
  attackDamage: number;
  behavior: "passive" | "neutral" | "hostile";
  width: number;
  height: number;
  scale: number;
  eggBase: string;
  eggOverlay: string;
  spawnEnabled: boolean;
  spawnBiomeTags: string[];
  spawnWeight: number;
  herdMin: number;
  herdMax: number;
  spawnSurface: boolean;
  lightMin: number;
  lightMax: number;
  populationControl: "animal" | "monster" | "water_animal" | "ambient";
  drops: DropEntry[];
  xp: number;
  fireImmune: boolean;
  burnsInDaylight: boolean;
  canSwim: boolean;
  knockbackResistance: number;
  temptItems: string[];
  families: string[];
  // ----- Extras (presets and Blockbench models; vanilla templates keep their own behaviour) -----
  /** How it gets around. */
  movement?: "walk" | "fly" | "swim";
  /** Items that tame it (empty = can't be tamed) and the chance per item, 0-100. */
  tameItems?: string[];
  tameChance?: number;
  /** Tamed mobs sit and stay when their owner taps them. */
  canSit?: boolean;
  /** Items that make two of them breed (empty = no breeding). */
  breedItems?: string[];
  /** Minutes for a baby to grow up. */
  growMinutes?: number;
  breedNeedsTame?: boolean;
  rideable?: boolean;
  rideNeedsTame?: boolean;
  /** The rider steers it (like a horse); otherwise it wanders with them on. */
  steerable?: boolean;
  /** Seat height in blocks. */
  seatHeight?: number;
  /** Has to be saddled (with a saddle) before it can be ridden. */
  needsSaddle?: boolean;
  /** Steered by holding this item, like a pig with a carrot on a stick (empty = the rider steers directly). */
  steerItem?: string;
  /** Carries a chest you can open while riding (slots, 0 = none). */
  chestSlots?: number;
  attackStyle?: "melee" | "ranged";
  /** Projectile element name, or a vanilla id such as minecraft:arrow. */
  projectile?: string;
  /** Seconds between shots. */
  attackInterval?: number;
  /** How far it shoots from, in blocks. */
  attackRange?: number;
  trades?: TradeEntry[];
  /** Sound per event: a Sound element name or a vanilla sound id. */
  sounds?: { ambient?: string; hurt?: string; death?: string; step?: string };
  /** Extra textures, one picked at random when it spawns (the main texture is one of the choices). */
  variants?: string[];
}

export type RecipeType = "shaped" | "shapeless" | "furnace" | "stonecutter" | "smithing" | "brewing";

export interface RecipeElement extends BaseElement {
  kind: "recipe";
  recipeType: RecipeType;
  /** Brewing: "mix" turns one potion type into another; "container" changes the bottle (e.g. splash). Uses input, reagent and result. */
  brewMode?: "mix" | "container";
  reagent?: string;
  grid: string[]; // 9 slots, item ids or ""
  input: string; // furnace / stonecutter input
  furnaceTags: string[];
  smithingTemplate: string;
  smithingBase: string;
  smithingAddition: string;
  result: string;
  count: number;
  /** Where shaped/shapeless recipes can be crafted: "crafting_table" and/or custom station tags. */
  stations?: string[];
}

export interface LootEntry {
  item: string;
  weight: number;
  min: number;
  max: number;
}

export interface LootPool {
  rollsMin: number;
  rollsMax: number;
  entries: LootEntry[];
}

export interface LootElement extends BaseElement {
  kind: "loot";
  lootType: "blocks" | "entities" | "chests" | "gameplay";
  pools: LootPool[];
}

export interface OreElement extends BaseElement {
  kind: "ore";
  block: string;
  replaces: string[];
  veinSize: number;
  veinsPerChunk: number;
  minY: number;
  maxY: number;
  dimension: "overworld" | "nether" | "the_end";
}

export type Who = "player" | "target";
export type At = "player" | "target" | "block";

export interface Action {
  id: string;
  type: string;
  params: Record<string, string | number | boolean>;
  chance: number; // 0-100, 100 = always
}

export interface Condition {
  id: string;
  type: string;
  params: Record<string, string | number | boolean>;
  negate: boolean;
}

export type TriggerType =
  | "player_join"
  | "player_respawn"
  | "item_use"
  | "item_eat"
  | "item_hit"
  | "block_break"
  | "block_place"
  | "block_interact"
  | "entity_hit"
  | "entity_hurt"
  | "entity_die"
  | "tick"
  | "manual"
  | "redstone_on"
  | "redstone_off"
  | "projectile_hit_entity"
  | "projectile_hit_block";

export interface ProcedureElement extends BaseElement {
  kind: "procedure";
  trigger: TriggerType;
  filter: string;
  intervalTicks: number;
  conditions: Condition[];
  actions: Action[];
  /** Which editor the procedure uses. Missing = "simple". */
  editor?: "simple" | "blocks";
  /** Blockly workspace JSON (blocks editor). */
  blocks?: string;
}

export type CommandArgType = "integer" | "float" | "string" | "boolean" | "player" | "item" | "block" | "entity_type" | "enum";

export interface CommandArg {
  id: string;
  name: string;
  type: CommandArgType;
  optional: boolean;
  /** Choices for "enum" arguments (lower case, no spaces). */
  options?: string[];
}

export interface CommandElement extends BaseElement {
  kind: "command";
  description: string;
  permission: "any" | "game_directors" | "admin" | "host" | "owner";
  cheatsRequired: boolean;
  conditions: Condition[];
  actions: Action[];
  args?: CommandArg[];
  editor?: "simple" | "blocks";
  blocks?: string;
}

export interface FunctionElement extends BaseElement {
  kind: "function";
  body: string;
  runEveryTick: boolean;
}

export interface SoundElement extends BaseElement {
  kind: "sound";
  /** OGG data URL. */
  file: string;
  fileName: string;
  category: "ambient" | "block" | "hostile" | "music" | "neutral" | "player" | "record" | "weather" | "ui";
  volume: number;
  pitch: number;
}

export interface FormButton {
  id: string;
  text: string;
  /** Texture id for the button icon, "" for none. */
  icon: string;
  actions: Action[];
}

export interface FormField {
  id: string;
  kind: "text" | "slider" | "dropdown" | "toggle" | "label";
  /** Name used in text as {key}, and in blocks as a form value. */
  key: string;
  label: string;
  placeholder: string;
  min: number;
  max: number;
  step: number;
  options: string[];
  defaultValue: string;
  /** Global variable that receives the value, "" for none. */
  variable: string;
}

export interface FormElement extends BaseElement {
  kind: "form";
  formType: "menu" | "input" | "confirm";
  title: string;
  body: string;
  buttons: FormButton[];
  fields: FormField[];
  submitText: string;
  submitActions: Action[];
  yesText: string;
  noText: string;
  yesActions: Action[];
  noActions: Action[];
  /** Menus only: a custom look made with JSON UI. */
  layout?: FormLayout;
}

/** A custom look for a menu form. */
export interface FormLayout {
  /** default: Minecraft's list; grid: buttons as tiles (icon above text). */
  style: "default" | "grid";
  columns: number;
  tileWidth: number;
  tileHeight: number;
  iconSize: number;
  /** Form size in UI pixels. */
  width: number;
  height: number;
  /** Own background image instead of Minecraft's dialog frame. */
  background?: string;
  titleColor?: string;
  textColor?: string;
  showBody: boolean;
}

/** A value saved in the world (or on each player) that procedures can read and change. */
export interface GlobalVariable {
  id: string;
  name: string;
  scope: "world" | "player";
  type: "number" | "text" | "boolean";
  initial: string;
}

export interface ProjectileElement extends BaseElement {
  kind: "projectile";
  /** sprite: flat image that faces the camera (snowball); arrow: Minecraft's arrow shape; custom: Blockbench model. */
  look: "sprite" | "arrow" | "custom";
  texture: string;
  customGeometry: string;
  damage: number;
  knockback: boolean;
  /** Seconds the target burns, 0 = no fire. */
  fireSeconds: number;
  effects: EffectEntry[];
  /** Blocks per tick. Snowball 1.5, arrow 1.1 (bows multiply it). */
  speed: number;
  /** Downward pull per tick. Snowball 0.03, arrow 0.05. */
  gravity: number;
  /** What happens when it hits something. */
  onHit: "remove" | "stick";
  hitSound: string;
  size: number;
}

export interface CropElement extends BaseElement {
  /** Extra tags (recipes, procedures and other add-ons can test for them). */
  tags?: string[];
  kind: "crop";
  /** One texture per growth stage (2-8), youngest first. */
  stageTextures: string[];
  look: "cross" | "crop";
  /** Chance per random tick to grow one stage (vanilla wheat is roughly 1 in 3 when hydrated). */
  growthChance: number;
  boneMeal: boolean;
  produce: string;
  produceMin: number;
  produceMax: number;
  seedsTexture: string;
  seedsMax: number;
  placeableOn: string[];
  /** Only grows on wet (watered) farmland. */
  needsWater?: boolean;
  /** Only grows in daytime under open sky (scripts can't read light levels on stable Minecraft). */
  needsSky?: boolean;
  /** Right-click when grown to pick the produce; it goes back to stage pickBackTo (like sweet berries). */
  pickable?: boolean;
  pickBackTo?: number;
}

export interface StructureElement extends BaseElement {
  kind: "structure";
  /** The imported .mcstructure as a data URL. */
  file: string;
  fileName: string;
  /** Loot table per container, keyed by its block index in the structure. A loot element name, or a vanilla "loot_tables/…json" path. */
  loot: Record<string, string>;
  generate: boolean;
  dimension: "overworld" | "nether" | "the_end";
  /** surface: on the ground; underground: anywhere between minY and maxY. */
  placement: "surface" | "underground";
  /** Only in biomes with any of these tags. Empty = anywhere in the dimension. */
  biomeTags: string[];
  /** Roughly one structure per this many chunks. */
  rarity: number;
  /** How many blocks the structure sinks into the ground (surface only). */
  sink: number;
  minY: number;
  maxY: number;
  facing: "random" | "north" | "south" | "east" | "west";
  /** How far (0-16 blocks) it may shift to find a valid spot. */
  adjustmentRadius: number;
  grounded: boolean;
  unburied: boolean;
  /** Blocks the structure may overlap. Empty = no check. */
  canReplace: string[];
}

export interface ParticleElement extends BaseElement {
  kind: "particle";
  /** A built-in white sprite (tinted by the colours below) or "custom" to use `texture`. */
  sprite: "dot" | "circle" | "spark" | "star" | "heart" | "square" | "ring" | "puff" | "custom";
  texture: string;
  /** Own texture only: frames side by side, played over each particle's life (1 = not animated). */
  frames?: number;
  colorStart: string;
  colorEnd: string;
  /** Opacity 0-100 at birth and at death. */
  alphaStart: number;
  alphaEnd: number;
  /** Width in blocks at birth and at death. */
  sizeStart: number;
  sizeEnd: number;
  /** alpha: crisp cut-out; blend: smooth transparency. */
  blend: "alpha" | "blend";
  /** Darker in shadow (off = glows). */
  lit: boolean;
  /** burst: all at once; stream: steadily for `duration` seconds. */
  mode: "burst" | "stream";
  count: number;
  rate: number;
  duration: number;
  shape: "sphere" | "box" | "disc";
  /** Sphere/disc radius, or half the box width, in blocks. 0 = from a single point. */
  radius: number;
  surfaceOnly: boolean;
  direction: "outwards" | "up" | "inwards";
  /** Sideways spread for "up", 0-1. */
  spread: number;
  speedMin: number;
  speedMax: number;
  lifetimeMin: number;
  lifetimeMax: number;
  /** Blocks/s² pulling down (negative rises). */
  gravity: number;
  /** Air resistance, 0 = none. */
  drag: number;
  collide: "none" | "bounce" | "vanish";
  bounce: number;
  /** Max spin in degrees per second, 0 = none. */
  spin: number;
}

export interface DiscElement extends BaseElement {
  kind: "disc";
  /** The song, as an .ogg data URL. */
  file: string;
  fileName: string;
  /** Length in seconds (jukeboxes and hoppers use it to know when the song ends). */
  duration: number;
  /** The vanilla disc sound this disc plays through, e.g. "record.13". That vanilla disc plays this song too. */
  replaces: string;
  texture: string;
  /** Comparator signal from a jukebox playing it, 1-15. */
  comparator: number;
  /** 0-100. */
  volume: number;
}

export type EnchantTarget = "sword" | "axe" | "pickaxe" | "shovel" | "hoe" | "bow" | "helmet" | "chestplate" | "leggings" | "boots" | "any";

/** One thing an enchantment does. Values scale: amount at level 1, plus perLevel for each level above. */
export interface EnchantEffect {
  id: string;
  /** hit: when the item hits a mob; break: when it breaks a block; equipped: all the time while worn or held. */
  when: "hit" | "break" | "equipped";
  type: "damage" | "fire" | "effect" | "lifesteal" | "lightning" | "xp" | "self_effect" | "procedure";
  amount: number;
  perLevel: number;
  /** Potion effect id for effect / self_effect. */
  effect?: string;
  /** Higher enchantment levels give a stronger effect (amplifier). */
  stronger?: boolean;
  /** Procedure name for "procedure". */
  procedure?: string;
}

export interface EnchantmentElement extends BaseElement {
  kind: "enchantment";
  maxLevel: number;
  targets: EnchantTarget[];
  /** Extra items it fits, by id. */
  extraItems: string[];
  effects: EnchantEffect[];
  /** Enchantments it can't share an item with (by name). */
  conflicts?: string[];
  /** Adds an enchanted book item that applies it. */
  book: boolean;
  bookTexture: string;
}

export interface ScoreboardDef {
  id: string;
  /** Objective id used by /scoreboard, e.g. "kills". */
  name: string;
  /** Title shown on screen. */
  title: string;
  /** Where it shows when the world loads. */
  show: "none" | "Sidebar" | "List" | "BelowName";
  ascending: boolean;
}

export interface CreativeGroup {
  id: string;
  /** Shown in the creative inventory. */
  title: string;
  category: "construction" | "nature" | "equipment" | "items";
  /** Item or block id shown on the collapsed group. Empty = its first member. */
  icon: string;
  /** Element ids in the group, in order. */
  members: string[];
}

/** Something a custom effect does while active. Numbers: amount at level I, plus perLevel for each level above. */
export interface CustomEffectStep {
  id: string;
  /** vanilla: keep a Minecraft effect on; damage/heal: every second; particles: every second; procedure: every `every` seconds; on_start/on_end: once. */
  type: "vanilla" | "damage" | "heal" | "particles" | "procedure" | "on_start" | "on_end";
  amount: number;
  perLevel: number;
  effect?: string;
  stronger?: boolean;
  particle?: string;
  procedure?: string;
  every?: number;
}

export interface CustomEffectElement extends BaseElement {
  kind: "effect";
  /** Minecraft colour code letter for the on-screen timer (e.g. "d" pink, "a" green, "c" red). */
  color: string;
  maxLevel: number;
  showTimer: boolean;
  /** Where the timer shows: a list on the left of the screen (default), or above the hotbar. */
  timerPlace?: "left" | "actionbar";
  milkCures: boolean;
  steps: CustomEffectStep[];
  /** Adds a drinkable potion item that gives this effect. */
  potion: boolean;
  potionTexture: string;
  potionSeconds: number;
  potionLevel: number;
}

export type HudAnchor = "top_left" | "top_middle" | "top_right" | "left_middle" | "center" | "right_middle" | "bottom_left" | "bottom_middle" | "bottom_right";

/** One piece of a HUD or overlay, placed relative to an anchor (in UI pixels). */
export interface HudWidget {
  id: string;
  /** image: a texture; text: fixed words; live: text with {variables}, {score:name} or {player} that updates; bar: fills from a value. */
  type: "image" | "text" | "live" | "bar";
  anchor: HudAnchor;
  x: number;
  y: number;
  /** Size of images and bars. */
  w: number;
  h: number;
  texture?: string;
  /** Bar: the empty part of each segment (optional). */
  emptyTexture?: string;
  text?: string;
  color?: string;
  scale?: number;
  shadow?: boolean;
  /** Bar: what it shows. */
  source?: "variable" | "score";
  sourceName?: string;
  /** Bar: the value that fills it completely. */
  max?: number;
  segments?: number;
}

export interface HudElement extends BaseElement {
  kind: "hud";
  /** hud: always on screen; overlay: shown and hidden by procedure steps. */
  mode: "hud" | "overlay";
  /** Overlay: darken the game behind it. */
  dim: boolean;
  widgets: HudWidget[];
}

export type ModElement =
  | BlockElement
  | PlantElement
  | ItemElement
  | ToolElement
  | ArmorElement
  | FoodElement
  | EntityElement
  | RecipeElement
  | LootElement
  | OreElement
  | ProcedureElement
  | CommandElement
  | FunctionElement
  | SoundElement
  | FormElement
  | ProjectileElement
  | CropElement
  | StructureElement
  | ParticleElement
  | DiscElement
  | EnchantmentElement
  | CustomEffectElement
  | HudElement;

export type ElementOf<K extends ElementKind> = Extract<ModElement, { kind: K }>;

export interface ProjectUuids {
  bpHeader: string;
  bpData: string;
  bpScript: string;
  rpHeader: string;
  rpResources: string;
}

export interface Project {
  id: string;
  /** Workspace schema version, for future migrations. */
  schema: 1;
  name: string;
  namespace: string;
  description: string;
  author: string;
  version: [number, number, number];
  minEngine: [number, number, number];
  scriptApi: string;
  uuids: ProjectUuids;
  packIcon: string; // texture id, "" = auto
  elements: ModElement[];
  textures: TextureAsset[];
  variables?: GlobalVariable[];
  /** In-game scoreboard objectives, created when the world loads. */
  scoreboards?: ScoreboardDef[];
  /** Extra languages (besides en_US), e.g. "es_ES". */
  languages?: string[];
  /** language -> lang key -> translated text. Missing keys fall back to English. */
  translations?: Record<string, Record<string, string>>;
  /** Your own collapsible groups in the creative inventory (Minecraft 1.21.60+). */
  creativeGroups?: CreativeGroup[];
  createdAt: number;
  updatedAt: number;
}
