import { useMemo, useState } from "react";
import { geometryIdentifier } from "../../export/context";
import { modelBounds, modelFit } from "../../export/content";
import { SCRIPT_API_VERSIONS } from "../../model/project";
import { ModelPreview } from "../ModelPreview";
import { convertBbmodel, isBbmodel } from "../../export/bbmodel";
import { previewGeometry } from "../../export/shapes";
import type {
  BlockShape,
  ArmorElement, ArmorSlot, BlockElement, BlockFace, FoodElement, ItemElement, PlantElement, ToolElement, ToolType,
} from "../../model/types";
import { BLOCK_SOUNDS, EFFECTS, MENU_CATEGORIES } from "../../model/vanilla";
import { ChipList, Color, Field, Grid, IdField, Num, Section, Segmented, Select, Slider, Text, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";
import { ItemUseSection } from "./RangedEditors";

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

const DOOR_SLOTS: { face: BlockFace; label: string }[] = [{ face: "bottom", label: "Lower half" }, { face: "top", label: "Upper half" }];
const shapeOf = (b: BlockElement): BlockShape | "custom" => (b.geometry === "custom" ? "custom" : b.shape ?? "cube");
const SHAPE_HELP: Partial<Record<BlockShape, string>> = {
  slab: "Place a slab on a slab to make a double slab.",
  stairs: "Straight stairs; corners aren't joined automatically yet.",
  trapdoor: "Right-click to open and close.",
  door: "Places its top half automatically. Right-click to open and close.",
  fence: "Joins up with neighbouring fences and solid blocks.",
  wall: "Joins up with neighbouring walls and solid blocks.",
  pane: "Joins up with neighbouring panes, bars and solid blocks.",
};

function ShapeView({ el }: { el: BlockElement }) {
  const ns = useStore((s) => s.project!.namespace);
  const textures = useStore((s) => s.project!.textures);
  const shape = shapeOf(el) as BlockShape;
  const pv = previewGeometry(shape, ns, el.name);
  const tex = textures.find((t) => t.id === (shape === "door" ? el.textures.bottom ?? el.textures.all : el.textures.all ?? el.textures.side))?.dataUrl ?? "";
  if (!pv) return <BlockPreview b={el} />;
  return (
    <div className="stack tight">
      <ModelPreview geometry={pv.json} texture={tex} hideBones={pv.hidden} />
      {SHAPE_HELP[shape] && <span className="field-help shape-help">{SHAPE_HELP[shape]}</span>}
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
  const { load, msg } = useBlockModelLoader(el, patch);
  const [dragging, setDragging] = useState(false);
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !/\.png$/i.test(f.name)) load(f);
  };
  return (
    <>
      <Section title="Look">
        <div className={`split${dragging ? " drop-target" : ""}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={() => setDragging(false)} onDrop={drop}>
          <div className="stack">
            <Select label="Shape" value={shapeOf(el)} onChange={(v) => patch(v === "custom" ? { geometry: "custom" } : { geometry: "full", shape: v as BlockShape, ...(v !== "cube" ? { rotation: "none" as const } : {}) })}
              options={[
                { value: "cube", label: "Full cube" }, { value: "slab", label: "Slab (stacks into a double slab)" }, { value: "stairs", label: "Stairs" },
                { value: "carpet", label: "Carpet / thin layer" }, { value: "trapdoor", label: "Trapdoor (click to open)" }, { value: "door", label: "Door (two blocks tall)" },
                { value: "fence", label: "Fence (connects)" }, { value: "wall", label: "Wall (connects)" }, { value: "pane", label: "Pane / bars (connects)" },
                { value: "custom", label: "Custom Blockbench model" },
              ]} />
            {el.geometry === "custom"
              ? <BlockModelImport el={el} patch={patch} load={load} msg={msg} />
              : (
                <div className="row wrap model-hint">
                  <span className="field-help">Made a model in Blockbench?</span>
                  <ModelFileButton onFile={load} label="Import .bbmodel…" />
                  <ImportStatus msg={msg} />
                </div>
              )}
            {(el.shape !== "door" || el.geometry === "custom") && (
              <Segmented value={el.textureMode} onChange={(textureMode) => patch({ textureMode })} options={[
                { value: "all", label: "Same on all sides" }, { value: "pillar", label: "Top / sides / bottom" }, { value: "six", label: "Six faces" },
              ]} />
            )}
            <div className="tex-grid-slots">
              {(el.shape === "door" && el.geometry !== "custom" ? DOOR_SLOTS : FACE_SLOTS[el.textureMode]).map(({ face, label }) => (
                <TexturePicker key={face} label={label} kind="block" value={el.textures[face]}
                  suggestedName={face === "all" ? el.name : `${el.name}_${face}`}
                  onChange={(id) => patch({ textures: { ...el.textures, [face]: id || undefined } })} />
              ))}
            </div>
            <Grid>
              <Select label="Transparency" value={el.renderMethod} onChange={(renderMethod) => patch({ renderMethod, lightDampening: renderMethod === "opaque" ? 15 : 0 })}
                options={[{ value: "opaque", label: "Solid" }, { value: "alpha_test", label: "Cut-out (leaves, grates)" }, { value: "blend", label: "Translucent (glass, ice)" }]} />
              {(shapeOf(el) === "cube" || shapeOf(el) === "custom") && (
                <Select label="Rotation when placed" value={el.rotation} onChange={(rotation) => patch({ rotation })}
                  options={[{ value: "none", label: "None" }, { value: "facing", label: "Faces the player (furnace)" }, { value: "axis", label: "Follows the clicked face (log)" }]} />
              )}
              <Color label="Map colour" value={el.mapColor} onChange={(mapColor) => patch({ mapColor }, "map")} />
            </Grid>
          </div>
          {el.geometry === "custom" && geometryIdentifier(el.customGeometry)
            ? <BlockModelView el={el} />
            : shapeOf(el) !== "cube" && shapeOf(el) !== "custom" ? <ShapeView el={el} /> : <BlockPreview b={el} />}
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
      <BlockFunctionSection el={el} patch={patch} />
      <RedstoneSection el={el} patch={patch} />
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
          <input type="file" hidden onChange={async (e) => {
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
      <ItemUseSection el={el} patch={patch} />
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

// ---------- Block: custom model, function, redstone ----------

function BlockModelView({ el }: { el: BlockElement }) {
  const textures = useStore((s) => s.project!.textures);
  const tex = textures.find((t) => t.id === (el.textures.all ?? el.textures.side))?.dataUrl ?? "";
  const mode = el.collision ?? "model";
  const box = mode === "full" ? { origin: [-8, 0, -8], size: [16, 16, 16] } : modelBounds(el.customGeometry);
  return <ModelPreview geometry={el.customGeometry} texture={tex} box={mode === "none" ? null : box} />;
}

type ImportMsg = { ok: boolean; text: string } | null;

/** Reads a .bbmodel or .geo.json into a block (switching it to a custom model). Shared by the button and drag-and-drop. */
function useBlockModelLoader(el: BlockElement, patch: Patch<BlockElement>) {
  const addTexture = useStore((s) => s.addTexture);
  const [msg, setMsg] = useState<ImportMsg>(null);
  const load = async (f: File) => {
    try {
      const text = await f.text();
      if (isBbmodel(text)) {
        const c = convertBbmodel(text, el.name);
        const p: Partial<BlockElement> = { geometry: "custom", customGeometry: c.geometry, textureMode: "all", renderMethod: "alpha_test", lightDampening: 0 };
        if (c.texture) p.textures = { ...el.textures, all: addTexture({ ...c.texture, kind: "block" }).id };
        patch(p);
        setMsg({ ok: true, text: `Imported ${f.name}${c.texture ? " with its texture" : ". Now add its texture under “All faces”"}.` });
      } else {
        let json = false;
        try { JSON.parse(text); json = true; } catch { /* not JSON */ }
        if (!json) throw new Error(`${f.name} isn't a Blockbench model. Choose the .bbmodel you saved in Blockbench (File → Save Model), or a .geo.json from File → Export → Bedrock Geometry.`);
        if (!geometryIdentifier(text)) throw new Error(`${f.name} is JSON but not a model (no "minecraft:geometry" inside). In Blockbench use File → Export → Bedrock Geometry, or import the .bbmodel itself.`);
        patch({ geometry: "custom", customGeometry: text, renderMethod: el.renderMethod === "opaque" ? "alpha_test" : el.renderMethod, lightDampening: 0 });
        setMsg({ ok: true, text: `Imported ${f.name}. Add the texture you painted for it under “All faces”.` });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : `${f.name} couldn't be read.` });
    }
  };
  return { load, msg };
}

/** File input for models. No `accept` filter: phones and tablets grey out .bbmodel files they don't recognise. */
function ModelFileButton({ onFile, label, primary }: { onFile: (f: File) => void; label: string; primary?: boolean }) {
  return (
    <label className={`btn small${primary ? " primary" : ""}`}>
      {label}
      <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

function ImportStatus({ msg }: { msg: ImportMsg }) {
  return msg ? <p className={msg.ok ? "ok-text" : "warn-text"} role="status">{msg.text}</p> : null;
}

function BlockModelImport({ el, patch, load, msg }: { el: BlockElement; patch: Patch<BlockElement>; load: (f: File) => void; msg: ImportMsg }) {
  const id = geometryIdentifier(el.customGeometry);
  const fit = id ? modelFit(el.customGeometry) : null;
  return (
    <div className="bb-import on">
      <div className="row between">
        <div className="stack tight">
          <strong>Blockbench model</strong>
          <span className="field-help">{id
            ? <>Using <span className="mono">{id}</span>.</>
            : "Import the .bbmodel you saved in Blockbench (model + texture), or an exported .geo.json. You can also drop the file here."}</span>
        </div>
        <ModelFileButton onFile={load} label={id ? "Replace model…" : "Import model…"} primary={!id} />
      </div>
      <ImportStatus msg={msg} />
      {fit && <p className="warn-text">{fit}</p>}
      {id && (
        <Select label="Hitbox" value={el.collision ?? "model"} onChange={(collision) => patch({ collision })} options={[
          { value: "model", label: "Fit to the model" }, { value: "full", label: "Full block" }, { value: "none", label: "None: walk through it" },
        ]} />
      )}
    </div>
  );
}

/** Minimum game / Script API a block's features need (mirrors the exporter's checks). */
function blockNeeds(b: BlockElement): { engine: number[]; api: string; reasons: string[] } {
  const needs: { engine: number[]; api: string; reason: string }[] = [];
  if ((b.function ?? "none") === "storage") needs.push({ engine: [1, 26, 60], api: "2.11.0", reason: "storage" });
  if (b.redstoneInput) needs.push({ engine: [1, 26, 0], api: "2.5.0", reason: "redstone input" });
  if ((b.redstonePower ?? 0) > 0) needs.push({ engine: [1, 21, 120], api: "2.3.0", reason: "redstone output" });
  const cmp = (a: number[], c: number[]) => a[0] - c[0] || a[1] - c[1] || a[2] - c[2];
  const top = needs.sort((a, c) => cmp(c.engine, a.engine))[0];
  return top ? { engine: top.engine, api: top.api, reasons: needs.map((n) => n.reason) } : { engine: [0, 0, 0], api: "0.0.0", reasons: [] };
}

function VersionNeed({ el }: { el: BlockElement }) {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const need = blockNeeds(el);
  if (!need.reasons.length) return null;
  const cmp = (a: number[], c: number[]) => a[0] - c[0] || a[1] - c[1] || a[2] - c[2];
  const ok = cmp(project.minEngine, need.engine) >= 0;
  const target = SCRIPT_API_VERSIONS.find((v) => cmp(v.engine, need.engine) >= 0);
  return (
    <div className={`version-need ${ok ? "ok" : "bad"}`}>
      <span>
        {need.reasons.join(" and ")[0].toUpperCase() + need.reasons.join(" and ").slice(1)} need{need.reasons.length === 1 ? "s" : ""} Minecraft {need.engine.join(".")} or newer.
        {ok ? " Your project is set up for that." : ` Your project targets ${project.minEngine.join(".")}.`}
      </span>
      {!ok && target && (
        <button type="button" className="btn small primary" onClick={() => update((p) => ({ ...p, scriptApi: target.api, minEngine: [...target.engine] as [number, number, number] }))}>
          Update project to {target.game}
        </button>
      )}
    </div>
  );
}

function BlockFunctionSection({ el, patch }: { el: BlockElement; patch: Patch<BlockElement> }) {
  const ns = useStore((s) => s.project!.namespace);
  const recipes = useStore((s) => s.project!.elements);
  const tags = el.craftingTags?.length ? el.craftingTags : [`${ns}:${el.name}`];
  const usedBy = recipes.filter((r) => r.kind === "recipe" && r.stations?.some((t) => tags.includes(t))).length;
  const fn = el.function ?? "none";
  return (
    <Section title="What it does when used">
      <Segmented value={fn} onChange={(f) => patch({ function: f })} options={[
        { value: "none", label: "Nothing special" }, { value: "crafting", label: "Crafting station" }, { value: "storage", label: "Storage (chest)" },
      ]} />
      {fn === "crafting" && (
        <>
          <Grid>
            <Text label="Name shown on its screen" value={el.tableName ?? ""} onChange={(tableName) => patch({ tableName }, "tableName")} placeholder={el.displayName} />
          </Grid>
          <p className="field-help">
            Opens a 3×3 crafting grid. {usedBy ? `${usedBy} recipe${usedBy > 1 ? "s" : ""} can be made here.` : "No recipes use it yet:"} In a recipe, choose “{el.displayName}” under “Craft in”.
          </p>
        </>
      )}
      {fn === "storage" && (
        <>
          <Grid>
            <Slider label="Slots" min={1} max={54} value={el.slotCount ?? 27} onChange={(slotCount) => patch({ slotCount }, "slots")} format={(v) => (v === 27 ? "27 (chest)" : v === 54 ? "54 (double chest)" : v === 9 ? "9 (dispenser)" : String(v))} />
            <Text label="Title on its screen" value={el.containerTitle ?? ""} onChange={(containerTitle) => patch({ containerTitle }, "ctitle")} placeholder={el.displayName} />
          </Grid>
          <p className="field-help">Right-click opens a chest screen. Uses Bedrock's built-in block containers.</p>
        </>
      )}
      {fn !== "none" && <VersionNeed el={el} />}
    </Section>
  );
}

function RedstoneSection({ el, patch }: { el: BlockElement; patch: Patch<BlockElement> }) {
  const power = el.redstonePower ?? 0;
  const anyOn = (power > 0 && el.redstoneMode === "toggle") || !!el.redstoneInput;
  return (
    <Section title="Redstone">
      <Grid>
        <Slider label="Gives off a signal" min={0} max={15} value={power} onChange={(redstonePower) => patch({ redstonePower }, "power")} format={(v) => (v ? `power ${v}` : "no")} />
        {power > 0 && (
          <Select label="Signal" value={el.redstoneMode ?? "always"} onChange={(redstoneMode) => patch({ redstoneMode })} options={[
            { value: "always", label: "Always on (like a redstone block)" }, { value: "toggle", label: "Right-click to switch (like a lever)" },
          ]} />
        )}
      </Grid>
      <Toggle label="Reacts to redstone" value={!!el.redstoneInput} onChange={(redstoneInput) => patch({ redstoneInput })}
        help="Use the “A block receives / loses redstone power” procedure triggers to run anything you like." />
      {el.redstoneInput && <Toggle label="Lets the signal pass through" value={!!el.passesPower} onChange={(passesPower) => patch({ passesPower })} />}
      {anyOn && (
        <>
          <Toggle label={el.redstoneInput ? "Lights up while powered (like a redstone lamp)" : "Lights up while switched on"} value={!!el.litWhenPowered} onChange={(litWhenPowered) => patch({ litWhenPowered })} />
          {el.litWhenPowered && <Grid><Slider label="Light level when on" min={1} max={15} value={el.litLevel ?? 15} onChange={(litLevel) => patch({ litLevel }, "lit")} /></Grid>}
          <TexturePicker label="Texture when on (optional)" kind="block" value={el.poweredTexture} suggestedName={`${el.name}_on`} onChange={(poweredTexture) => patch({ poweredTexture })} />
        </>
      )}
      {(power > 0 || el.redstoneInput) && <VersionNeed el={el} />}
    </Section>
  );
}
