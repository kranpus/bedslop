// Core data model for a Bedrock Creator workspace.
// Everything here is plain JSON so a project can be saved, exported and re-imported as-is.

export type ElementKind =
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
  | "sound";

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

export interface BlockElement extends BaseElement {
  kind: "block";
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
}

export interface PlantElement extends BaseElement {
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

export interface EntityElement extends BaseElement {
  kind: "entity";
  model: "humanoid" | "quadruped" | "custom";
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
}

export type RecipeType = "shaped" | "shapeless" | "furnace" | "stonecutter" | "smithing";

export interface RecipeElement extends BaseElement {
  kind: "recipe";
  recipeType: RecipeType;
  grid: string[]; // 9 slots, item ids or ""
  input: string; // furnace / stonecutter input
  furnaceTags: string[];
  smithingTemplate: string;
  smithingBase: string;
  smithingAddition: string;
  result: string;
  count: number;
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
  | "tick";

export interface ProcedureElement extends BaseElement {
  kind: "procedure";
  trigger: TriggerType;
  filter: string;
  intervalTicks: number;
  conditions: Condition[];
  actions: Action[];
}

export interface CommandElement extends BaseElement {
  kind: "command";
  description: string;
  permission: "any" | "game_directors" | "admin" | "host" | "owner";
  cheatsRequired: boolean;
  conditions: Condition[];
  actions: Action[];
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
  | SoundElement;

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
  createdAt: number;
  updatedAt: number;
}
