import { useMemo } from "react";
import { convertBbmodel, isBbmodel } from "../../export/bbmodel";
import type {
  ArmorElement, ArmorSlot, BlockElement, BlockFace, FoodElement, ItemElement, PlantElement, ToolElement, ToolType,
} from "../../model/types";
import { BLOCK_SOUNDS, EFFECTS, MENU_CATEGORIES } from "../../model/vanilla";
import { ChipList, Color, Field, Grid, IdField, Num, Section, Segmented, Select, Slider, Text, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

// ---------- Block ----------

function BlockPreview({ b }: { b: BlockElement }) {
  const textures = useStore((s) => s.project!.textures);
  const url = (id?: string) => textures.find((t) => t.id === id)?.dataUrl;
  const t = b.textures;
  const side = b.textureMode === "all" ? t.all : b.textureMode === "pillar" ? t.side ?? t.all : t.north ?? t.side ?? t.all;
  const faces = {
    front: url(side),
    right: url(b.textureMode === "six" ? t.east ?? t.side : b.textureMode === "pillar" ? t.side : t.all),
    top: url(b.textureMode === "all" ? t.all : t.top ?? t.side),
  };
  const glow = b.lightEmission > 0 ? `drop-shadow(0 0 ${4 + b.lightEmission * 1.5}px rgba(255, 220, 120, ${0.15 + b.lightEmission / 30}))` : undefined;
  return (
    <div className="block-preview" aria-label="Block preview" style={{ filter: glow }}>
      <div className={`cube${b.renderMethod !== "opaque" ? " see-through" : ""}`}>
        {(["front", "right", "top"] as const).map((f) => (
          <div key={f} className={`face ${f}`} style={faces[f] ? { backgroundImage: `url(${faces[f]})` } : undefined} />
        ))}
      </div>
    </div>
  );
}

const FACE_SLOTS: Record<BlockElement["textureMode"], { face: BlockFace; label: string }[]> = {
  all: [{ face: "all", label: "All faces" }],
  pillar: [{ face: "top", label: "Top" }, { face: "side", label: "Sides" }, { face: "bottom", label: "Bottom" }],
  six: [
    { face: "top", label: "Top" }, { face: "bottom", label: "Bottom" }, { face: "north", label: "Front (north)" },
    { face: "south", label: "Back (south)" }, { face: "east", label: "East" }, { face: "west", label: "West" },
  ],
};

export function BlockEditor({ el, patch }: { el: BlockElement; patch: Patch<BlockElement> }) {
  return (
    <>
      <Section title="Look">
        <div className="split">
          <div className="stack">
            <Segmented value={el.textureMode} onChange={(textureMode) => patch({ textureMode })} options={[
              { value: "all", label: "Same on all sides" }, { value: "pillar", label: "Top / sides / bottom" }, { value: "six", label: "Six faces" },
            ]} />
            <div className="tex-grid-slots">
              {FACE_SLOTS[el.textureMode].map(({ face, label }) => (
                <TexturePicker key={face} label={label} kind="block" value={el.textures[face]}
                  suggestedName={face === "all" ? el.name : `${el.name}_${face}`}
                  onChange={(id) => patch({ textures: { ...el.textures, [face]: id || undefined } })} />
              ))}
            </div>
            <Grid>
              <Select label="Transparency" value={el.renderMethod} onChange={(renderMethod) => patch({ renderMethod, lightDampening: renderMethod === "opaque" ? 15 : 0 })}
                options={[{ value: "opaque", label: "Solid" }, { value: "alpha_test", label: "Cut-out (leaves, grates)" }, { value: "blend", label: "Translucent (glass, ice)" }]} />
              <Select label="Rotation when placed" value={el.rotation} onChange={(rotation) => patch({ rotation })}
                options={[{ value: "none", label: "None" }, { value: "facing", label: "Faces the player (furnace)" }, { value: "axis", label: "Follows the clicked face (log)" }]} />
              <Select label="Model" value={el.geometry} onChange={(geometry) => patch({ geometry })}
                options={[{ value: "full", label: "Full cube" }, { value: "custom", label: "Custom Blockbench model" }]} />
              <Color label="Map colour" value={el.mapColor} onChange={(mapColor) => patch({ mapColor }, "map")} />
            </Grid>
            {el.geometry === "custom" && <GeometryUpload value={el.customGeometry} onChange={(customGeometry) => patch({ customGeometry })} />}
          </div>
          <BlockPreview b={el} />
        </div>
      </Section>
      <Section title="Behaviour">
        <Grid>
          <Num label="Break time" suffix="seconds" step={0.1} value={el.hardness} onChange={(hardness) => patch({ hardness }, "hard")} help="Stone is 1.5, obsidian 50. Use -1 for unbreakable." />
          <Num label="Explosion resistance" value={el.explosionResistance} onChange={(explosionResistance) => patch({ explosionResistance }, "res")} help="Stone is 6, obsidian 1200." />
          <Select label="Best tool" value={el.bestTool} onChange={(bestTool) => patch({ bestTool })} options={["none", "pickaxe", "axe", "shovel", "hoe"]} />
          <Select label="Sound" value={el.sound} onChange={(sound) => patch({ sound })} options={BLOCK_SOUNDS} />
          <Slider label="Light emitted" min={0} max={15} value={el.lightEmission} onChange={(lightEmission) => patch({ lightEmission }, "light")} help="Torches are 14, glowstone 15." />
          <Slider label="Light blocked" min={0} max={15} value={el.lightDampening} onChange={(lightDampening) => patch({ lightDampening }, "damp")} />
          <Slider label="Slipperiness" min={0} max={0.9} step={0.05} value={el.friction} onChange={(friction) => patch({ friction }, "fric")}
            format={(v) => (v <= 0.1 ? "ice-like" : v >= 0.6 ? "sticky" : v === 0.4 ? "normal" : v.toFixed(2))} help="Friction. 0.4 is normal; lower is more slippery." />
        </Grid>
        <Toggle label="Can catch fire" value={el.flammable} onChange={(flammable) => patch({ flammable })} />
      </Section>
      <Section title="Drops">
        <Segmented value={el.drops} onChange={(drops) => patch({ drops })} options={[
          { value: "self", label: "Drops itself" }, { value: "loot", label: "Loot table" }, { value: "nothing", label: "Nothing" },
        ]} />
        {el.drops === "loot" && <LootSelect value={el.lootTable} onChange={(lootTable) => patch({ lootTable })} />}
      </Section>
      <CreativeSection el={el} patch={patch} />
    </>
  );
}

function LootSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const elements = useStore((s) => s.project!.elements);
  const loots = useMemo(() => elements.filter((e) => e.kind === "loot"), [elements]);
  const addElement = useStore((s) => s.addElement);
  const select = useStore((s) => s.select);
  return (
    <div className="row">
      <Field label="Loot table">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {loots.map((l) => <option key={l.id} value={l.id}>{l.displayName}</option>)}
        </select>
      </Field>
      {!loots.length && (
        <button type="button" className="btn small" onClick={() => { const l = addElement("loot", "Block drops"); select(l.id); }}>Create a loot table</button>
      )}
    </div>
  );
}

function CreativeSection({ el, patch }: { el: BlockElement | ItemElement; patch: Patch<BlockElement> | Patch<ItemElement> }) {
  const p = patch as (x: Partial<Pick<ItemElement, "category" | "group">>, k?: string) => void;
  return (
    <Section title="Creative inventory">
      <Grid>
        <Select label="Category" value={el.category} onChange={(category) => p({ category })} options={MENU_CATEGORIES} help='"none" hides it from the creative menu.' />
        <Text label="Group (optional)" mono value={el.group} onChange={(group) => p({ group }, "group")} placeholder="minecraft:itemGroup.name.ore" help="Groups it with similar vanilla items." />
      </Grid>
    </Section>
  );
}

export function GeometryUpload({ value, onChange, label = "Blockbench model (.bbmodel or .geo.json)" }: { value: string; onChange: (v: string) => void; label?: string }) {
  let id: string | null = null;
  try {
    const d = JSON.parse(value);
    id = d["minecraft:geometry"]?.[0]?.description?.identifier ?? null;
  } catch { /* empty */ }
  return (
    <div className="field wide">
      <span className="field-label">{label}</span>
      <div className="row">
        <label className="btn small">
          Choose file…
          <input type="file" accept=".bbmodel,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const text = await f.text();
            try { onChange(isBbmodel(text) ? convertBbmodel(text).geometry : text); } catch { onChange(text); }
          }} />
        </label>
        <span className={id ? "mono" : "muted"}>{id ?? (value ? "Couldn't read this file" : "No model yet. In Blockbench: File → Export → Bedrock Geometry.")}</span>
      </div>
    </div>
  );
}

// ---------- Plant ----------

export function PlantEditor({ el, patch }: { el: PlantElement; patch: Patch<PlantElement> }) {
  return (
    <>
      <Section title="Look">
        <TexturePicker label="Texture" kind="block" template="flower" value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })}
          help="Drawn twice in an X shape, like vanilla flowers. Use transparency around the plant." />
        <Grid>
          <Select label="Sound" value={el.sound} onChange={(sound) => patch({ sound })} options={BLOCK_SOUNDS} />
          <Slider label="Light emitted" min={0} max={15} value={el.lightEmission} onChange={(lightEmission) => patch({ lightEmission }, "light")} />
          <Num label="Break time" suffix="seconds" step={0.1} value={el.hardness} onChange={(hardness) => patch({ hardness }, "hard")} />
        </Grid>
      </Section>
      <Section title="Placement">
        <ChipList label="Can be placed on" values={el.placeableOn} onChange={(placeableOn) => patch({ placeableOn })} kind="block" help="The plant pops off if the block below is removed." />
      </Section>
      <Section title="World generation">
        <Toggle label="Grows naturally in the Overworld" value={el.generate} onChange={(generate) => patch({ generate })} />
        {el.generate && <Slider label="Patches per chunk (attempts)" min={1} max={16} value={el.generateTries} onChange={(generateTries) => patch({ generateTries }, "tries")} />}
      </Section>
    </>
  );
}

// ---------- Item ----------

export function ItemEditor({ el, patch }: { el: ItemElement; patch: Patch<ItemElement> }) {
  return (
    <>
      <Section title="Look">
        <TexturePicker label="Icon" kind="item" template="gem" value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })} />
        <Toggle label="Enchanted glint" value={el.glint} onChange={(glint) => patch({ glint })} />
        <Toggle label="Held like a tool" value={el.handEquipped} onChange={(handEquipped) => patch({ handEquipped })} help="Shown upright in the hand, like a stick." />
      </Section>
      <Section title="Properties">
        <Grid>
          <Num label="Max stack size" min={1} max={64} value={el.maxStack} onChange={(maxStack) => patch({ maxStack }, "stack")} />
          <Num label="Furnace fuel" suffix="seconds" value={el.fuelSeconds} onChange={(fuelSeconds) => patch({ fuelSeconds }, "fuel")} help="0 = not a fuel. Coal burns 80 s." />
        </Grid>
        <ChipList label="Tags" values={el.tags} onChange={(tags) => patch({ tags })} suggestions={["minecraft:is_food", "minecraft:is_tool", "minecraft:transform_materials", "minecraft:trim_materials"]} help="Used by recipes and other add-ons to find similar items." />
      </Section>
      <CreativeSection el={el} patch={patch} />
    </>
  );
}

// ---------- Tool ----------

const TIER_PRESETS: Record<ToolElement["tier"], { durability: number; miningSpeed: number; enchantability: number }> = {
  wooden: { durability: 59, miningSpeed: 2, enchantability: 15 },
  stone: { durability: 131, miningSpeed: 4, enchantability: 5 },
  iron: { durability: 250, miningSpeed: 6, enchantability: 14 },
  golden: { durability: 32, miningSpeed: 12, enchantability: 22 },
  diamond: { durability: 1561, miningSpeed: 8, enchantability: 10 },
  netherite: { durability: 2031, miningSpeed: 9, enchantability: 15 },
};

export function ToolEditor({ el, patch }: { el: ToolElement; patch: Patch<ToolElement> }) {
  return (
    <>
      <Section title="Type">
        <Segmented value={el.toolType} onChange={(toolType: ToolType) => patch({ toolType })} options={(["pickaxe", "axe", "shovel", "hoe", "sword"] as ToolType[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} />
        <TexturePicker label="Icon" kind="item" template={el.toolType} value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })} />
      </Section>
      <Section title="Stats" hint="Choosing a tier fills in vanilla-like values. You can change any of them.">
        <Grid>
          <Select label="Tier" value={el.tier} onChange={(tier) => patch({ tier, ...TIER_PRESETS[tier] })} options={["wooden", "stone", "iron", "golden", "diamond", "netherite"]}
            help="Decides which vanilla blocks it can harvest." />
          <Num label="Attack damage" value={el.attackDamage} onChange={(attackDamage) => patch({ attackDamage }, "dmg")} help="Diamond sword: 7" />
          <Num label="Durability" value={el.durability} onChange={(durability) => patch({ durability }, "dur")} help="Uses before it breaks." />
          {el.toolType !== "sword" && <Num label="Mining speed" value={el.miningSpeed} onChange={(miningSpeed) => patch({ miningSpeed }, "speed")} help="Iron: 6, diamond: 8" />}
          <Num label="Enchantability" value={el.enchantability} onChange={(enchantability) => patch({ enchantability }, "ench")} help="Higher gives better enchantments." />
          <IdField label="Repaired with" value={el.repairItem} onChange={(repairItem) => patch({ repairItem }, "repair")} />
        </Grid>
        <Toggle label="Enchanted glint" value={el.glint} onChange={(glint) => patch({ glint })} />
      </Section>
    </>
  );
}

// ---------- Armor ----------

const SLOTS: { slot: ArmorSlot; label: string }[] = [
  { slot: "helmet", label: "Helmet" }, { slot: "chestplate", label: "Chestplate" }, { slot: "leggings", label: "Leggings" }, { slot: "boots", label: "Boots" },
];

export function ArmorEditor({ el, patch }: { el: ArmorElement; patch: Patch<ArmorElement> }) {
  const setPiece = (slot: ArmorSlot, p: Partial<ArmorElement["pieces"][ArmorSlot]>, key?: string) =>
    patch({ pieces: { ...el.pieces, [slot]: { ...el.pieces[slot], ...p } } }, key);
  return (
    <>
      <Section title="Pieces" hint="Each piece becomes its own item, e.g. myaddon:ruby_armor_helmet.">
        <div className="armor-pieces">
          {SLOTS.map(({ slot, label }) => (
            <div className={`armor-piece${el.pieces[slot].enabled ? "" : " off"}`} key={slot}>
              <Toggle label={label} value={el.pieces[slot].enabled} onChange={(enabled) => setPiece(slot, { enabled })} />
              {el.pieces[slot].enabled && (
                <>
                  <TexturePicker label="Icon" kind="item" template={slot} value={el.pieces[slot].texture} suggestedName={`${el.name}_${slot}`} onChange={(texture) => setPiece(slot, { texture })} />
                  <Num label="Protection" value={el.pieces[slot].protection} onChange={(protection) => setPiece(slot, { protection }, `prot-${slot}`)} />
                </>
              )}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Worn look" hint="64 × 32 textures in the vanilla armor layout. Layer 1: helmet, chestplate, boots. Layer 2: leggings.">
        <Grid>
          <TexturePicker label="Layer 1" kind="armor" template="armor_layer_1" value={el.layer1} suggestedName={`${el.name}_layer_1`} onChange={(layer1) => patch({ layer1 })} />
          <TexturePicker label="Layer 2" kind="armor" template="armor_layer_2" value={el.layer2} suggestedName={`${el.name}_layer_2`} onChange={(layer2) => patch({ layer2 })} />
        </Grid>
      </Section>
      <Section title="Stats">
        <Grid>
          <Num label="Durability multiplier" value={el.durabilityMultiplier} onChange={(durabilityMultiplier) => patch({ durabilityMultiplier }, "mult")}
            help={`Iron 15, diamond 33, netherite 37. Chestplate lasts ${Math.round(16 * el.durabilityMultiplier)} hits.`} />
          <Num label="Enchantability" value={el.enchantability} onChange={(enchantability) => patch({ enchantability }, "ench")} />
          <IdField label="Repaired with" value={el.repairItem} onChange={(repairItem) => patch({ repairItem }, "repair")} />
        </Grid>
      </Section>
    </>
  );
}

// ---------- Food ----------

export function FoodEditor({ el, patch }: { el: FoodElement; patch: Patch<FoodElement> }) {
  const setEffect = (i: number, p: Partial<FoodElement["effects"][number]>) =>
    patch({ effects: el.effects.map((e, k) => (k === i ? { ...e, ...p } : e)) }, `fx-${i}`);
  return (
    <>
      <Section title="Look">
        <TexturePicker label="Icon" kind="item" template="fruit" value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })} />
        <Toggle label="Enchanted glint" value={el.glint} onChange={(glint) => patch({ glint })} help="Like a golden apple." />
      </Section>
      <Section title="Eating">
        <Grid>
          <Slider label="Hunger restored" min={0} max={20} value={el.nutrition} onChange={(nutrition) => patch({ nutrition }, "nut")} format={(v) => `${v / 2} shanks`} help="Bread: 5, steak: 8" />
          <Num label="Saturation" step={0.1} value={el.saturation} onChange={(saturation) => patch({ saturation }, "sat")} help="Bread 0.6, golden carrot 1.2" />
          <Num label="Time to eat" suffix="seconds" step={0.1} value={el.useDuration} onChange={(useDuration) => patch({ useDuration }, "dur")} help="Most foods: 1.6" />
          <Select label="Animation" value={el.animation} onChange={(animation) => patch({ animation })} options={["eat", "drink"]} />
          <IdField label="Leaves behind" value={el.convertsTo} onChange={(convertsTo) => patch({ convertsTo }, "conv")} help="e.g. minecraft:bowl. Empty = nothing." />
          <Num label="Max stack size" min={1} max={64} value={el.maxStack} onChange={(maxStack) => patch({ maxStack }, "stack")} />
        </Grid>
        <Toggle label="Can eat when not hungry" value={el.canAlwaysEat} onChange={(canAlwaysEat) => patch({ canAlwaysEat })} />
      </Section>
      <Section title="Effects when eaten">
        {el.effects.map((fx, i) => (
          <div className="row effect-row" key={i}>
            <Select label="Effect" value={fx.effect} onChange={(effect) => setEffect(i, { effect })} options={EFFECTS} />
            <Num label="Seconds" value={fx.seconds} onChange={(seconds) => setEffect(i, { seconds })} />
            <Num label="Level" value={fx.amplifier + 1} min={1} onChange={(v) => setEffect(i, { amplifier: Math.max(0, v - 1) })} />
            <Num label="Chance" suffix="%" value={fx.chance} min={0} max={100} onChange={(chance) => setEffect(i, { chance })} />
            <button type="button" className="btn ghost small" onClick={() => patch({ effects: el.effects.filter((_, k) => k !== i) })} aria-label="Remove effect">Remove</button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => patch({ effects: [...el.effects, { effect: "regeneration", seconds: 5, amplifier: 0, chance: 100 }] })}>Add effect</button>
      </Section>
    </>
  );
}
