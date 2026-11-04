import { useMemo, useState } from "react";
import type { FunctionElement, LootElement, OreElement, Project, RecipeElement, SoundElement } from "../../model/types";
import { identifiersOf } from "../../model/registry";
import { useStore } from "../../store/store";
import { elementTexture } from "../Thumb";
import { ChipList, Field, Grid, IdField, IdInput, Num, Section, Segmented, Select, Slider, Toggle } from "../fields";
import type { Patch } from "./types";
import { projectTags } from "../TagField";
import { COMMON_ITEM_TAGS, POTION_CONTAINERS, POTION_TYPES, potionLabel } from "../../model/vanilla";

/** Finds the texture for an id like "myaddon:ruby_helmet" so recipe slots can show icons. */
function iconFor(project: Project, id: string): string | undefined {
  if (!id.startsWith(`${project.namespace}:`)) return undefined;
  for (const el of project.elements) {
    if (!identifiersOf(el, project.namespace).includes(id)) continue;
    let tex = elementTexture(el);
    if (el.kind === "armor") {
      const slot = id.split("_").pop() as keyof typeof el.pieces;
      tex = el.pieces[slot]?.texture || tex;
    }
    return project.textures.find((t) => t.id === tex)?.dataUrl;
  }
  return undefined;
}

function Slot({ id, onClick, big, label }: { id: string; onClick?: () => void; big?: boolean; label?: string }) {
  const project = useStore((s) => s.project!);
  const icon = id ? iconFor(project, id) : undefined;
  const short = (id.startsWith("#") ? "#" : "") + id.split(":").pop()?.replace(/_/g, " ");
  return (
    <button type="button" className={`slot${big ? " big" : ""}${id ? " filled" : ""}`} onClick={onClick} title={id || label || "Empty"} aria-label={id ? `Slot: ${id}` : label ?? "Empty slot"}>
      {icon ? <img className="pixel" src={icon} alt="" /> : id ? <span className="slot-text">{short}</span> : null}
    </button>
  );
}

export function RecipeEditor({ el, patch }: { el: RecipeElement; patch: Patch<RecipeElement> }) {
  const [brush, setBrush] = useState("");
  const project = useStore((s) => s.project!);
  const itemTags = useMemo(() => Array.from(new Set([
    ...[...projectTags(project).entries()].filter(([, v]) => v.kind === "item").map(([k]) => k.split("|")[1]),
    ...COMMON_ITEM_TAGS,
  ])), [project]);
  const setSlot = (i: number) => {
    const grid = [...el.grid];
    grid[i] = grid[i] === brush ? "" : brush;
    patch({ grid });
  };
  const furnaces = ["furnace", "blast_furnace", "smoker", "campfire", "soul_campfire"];
  return (
    <>
      <Section title="Recipe type">
        <Segmented value={el.recipeType} onChange={(recipeType) => patch(recipeType === "brewing" && el.recipeType !== "brewing"
          ? { recipeType, brewMode: "mix", input: "minecraft:potion_type:awkward", reagent: el.reagent ?? "", result: "minecraft:potion_type:strength" }
          : recipeType !== "brewing" && el.recipeType === "brewing" ? { recipeType, input: "", result: "" } : { recipeType })} options={[
          { value: "shaped", label: "Crafting (shaped)" }, { value: "shapeless", label: "Crafting (any order)" },
          { value: "furnace", label: "Smelting" }, { value: "stonecutter", label: "Stonecutter" }, { value: "smithing", label: "Smithing" },
          { value: "brewing", label: "Brewing" },
        ]} />
      </Section>

      {(el.recipeType === "shaped" || el.recipeType === "shapeless") && (
        <Section title="Ingredients" hint="Type or pick an item, then click slots to place it. Click again to remove.">
          <div className="row wrap">
            <Field label="Item to place" help="Or #tag for any item with that tag, e.g. #minecraft:planks."><IdInput value={brush} onChange={setBrush} tags={itemTags} /></Field>
            <button type="button" className="btn small ghost" onClick={() => patch({ grid: Array(9).fill("") })}>Clear grid</button>
          </div>
          <div className="crafting">
            <div className="craft-grid">
              {el.grid.map((id, i) => <Slot key={i} id={id} onClick={() => setSlot(i)} />)}
            </div>
            <span className="craft-arrow" aria-hidden>→</span>
            <div className="stack">
              <Slot id={el.result} big label="Result" />
              <span className="muted">× {el.count}</span>
            </div>
          </div>
          {el.recipeType === "shaped" && <p className="field-help">The pattern can be used anywhere on the grid, as long as the shape matches.</p>}
        </Section>
      )}
      {(el.recipeType === "shaped" || el.recipeType === "shapeless") && <CraftIn el={el} patch={patch} />}

      {(el.recipeType === "furnace" || el.recipeType === "stonecutter") && (
        <Section title="Input">
          <div className="crafting">
            <Slot id={el.input} big label="Input" />
            <span className="craft-arrow" aria-hidden>→</span>
            <Slot id={el.result} big label="Result" />
          </div>
          <IdField label="Input item" value={el.input} onChange={(input) => patch({ input }, "input")} />
          {el.recipeType === "furnace" && (
            <ChipList label="Works in" values={el.furnaceTags} onChange={(furnaceTags) => patch({ furnaceTags })} suggestions={furnaces} help="furnace, blast_furnace (ores), smoker (food), campfire, soul_campfire" />
          )}
        </Section>
      )}

      {el.recipeType === "smithing" && (
        <Section title="Smithing table">
          <div className="crafting">
            <Slot id={el.smithingTemplate} label="Template" />
            <Slot id={el.smithingBase} label="Base" />
            <Slot id={el.smithingAddition} label="Addition" />
            <span className="craft-arrow" aria-hidden>→</span>
            <Slot id={el.result} big label="Result" />
          </div>
          <Grid>
            <IdField label="Template" value={el.smithingTemplate} onChange={(smithingTemplate) => patch({ smithingTemplate }, "tpl")} />
            <IdField label="Base item" value={el.smithingBase} onChange={(smithingBase) => patch({ smithingBase }, "base")} help="e.g. minecraft:diamond_sword" />
            <IdField label="Addition" value={el.smithingAddition} onChange={(smithingAddition) => patch({ smithingAddition }, "add")} help="e.g. myaddon:ruby" />
          </Grid>
        </Section>
      )}

      {el.recipeType === "brewing" && <BrewingSection el={el} patch={patch} />}

      {el.recipeType !== "brewing" && <Section title="Result">
        <Grid>
          <IdField label="Result item" value={el.result} onChange={(result) => patch({ result }, "result")} />
          {el.recipeType !== "furnace" && el.recipeType !== "smithing" && <Num label="Count" min={1} max={64} value={el.count} onChange={(count) => patch({ count }, "count")} />}
        </Grid>
      </Section>}
    </>
  );
}

/** Brewing stand: potion + ingredient -> potion. */
function BrewingSection({ el, patch }: { el: RecipeElement; patch: Patch<RecipeElement> }) {
  const mode = el.brewMode ?? "mix";
  const list = mode === "mix" ? POTION_TYPES : POTION_CONTAINERS;
  const pick = (label: string, value: string, onChange: (v: string) => void) => (
    <Select label={label} value={list.includes(value) ? value : ""} onChange={onChange}
      options={[...(list.includes(value) ? [] : [{ value: "", label: "Choose…" }]), ...list.map((v) => ({ value: v, label: potionLabel(v) }))]} />
  );
  return (
    <Section title="Brewing stand" hint="Bedrock can only brew Minecraft's own potions. Your items can be the ingredient. For a potion with your own effects, make a Food element with the “drink” animation.">
      <Segmented value={mode} onChange={(brewMode) => patch(brewMode === "mix"
        ? { brewMode, input: "minecraft:potion_type:awkward", result: "minecraft:potion_type:strength" }
        : { brewMode, input: "minecraft:potion", result: "minecraft:splash_potion" })} options={[
        { value: "mix", label: "Turn one potion into another" }, { value: "container", label: "Change the bottle (splash, lingering)" },
      ]} />
      <div className="brew-row">
        <span className="brew-pill">{potionLabel(el.input || "minecraft:potion")}</span>
        <span className="craft-arrow" aria-hidden>+</span>
        <Slot id={el.reagent ?? ""} label="Ingredient" />
        <span className="craft-arrow" aria-hidden>→</span>
        <span className="brew-pill">{el.result ? potionLabel(el.result) : "?"}</span>
      </div>
      <Grid>
        {pick(mode === "mix" ? "Starting potion" : "Starting bottle", el.input, (input) => patch({ input }))}
        <IdField label="Ingredient" value={el.reagent ?? ""} onChange={(reagent) => patch({ reagent }, "reagent")} help="Any item, e.g. minecraft:glowstone_dust or one of yours." />
        {pick(mode === "mix" ? "Result potion" : "Result bottle", el.result, (result) => patch({ result }))}
      </Grid>
      {mode === "container" && <p className="field-help">Works for every potion type, like gunpowder turning any potion into a splash potion.</p>}
    </Section>
  );
}

export function LootEditor({ el, patch }: { el: LootElement; patch: Patch<LootElement> }) {
  const setPool = (i: number, p: Partial<LootElement["pools"][number]>, key?: string) =>
    patch({ pools: el.pools.map((x, k) => (k === i ? { ...x, ...p } : x)) }, key);
  const ns = useStore((s) => s.project!.namespace);
  return (
    <>
      <Section title="Used for" hint={`File: loot_tables/${el.lootType}/${ns}_${el.name}.json`}>
        <Segmented value={el.lootType} onChange={(lootType) => patch({ lootType })} options={[
          { value: "blocks", label: "Block drops" }, { value: "entities", label: "Mob drops" }, { value: "chests", label: "Chest loot" }, { value: "gameplay", label: "Other" },
        ]} />
      </Section>
      {el.pools.map((pool, pi) => {
        const total = pool.entries.reduce((s, e) => s + (Number(e.weight) || 0), 0) || 1;
        return (
          <Section key={pi} title={`Pool ${pi + 1}`} hint="Each roll picks one entry, weighted by its weight.">
            <Grid>
              <Num label="Rolls (min)" value={pool.rollsMin} onChange={(rollsMin) => setPool(pi, { rollsMin }, `r1-${pi}`)} />
              <Num label="Rolls (max)" value={pool.rollsMax} onChange={(rollsMax) => setPool(pi, { rollsMax }, `r2-${pi}`)} />
            </Grid>
            {pool.entries.map((e, ei) => {
              const setEntry = (p: Partial<typeof e>) => setPool(pi, { entries: pool.entries.map((x, k) => (k === ei ? { ...x, ...p } : x)) }, `e-${pi}-${ei}`);
              return (
                <div className="row effect-row" key={ei}>
                  <Field label="Item"><IdInput value={e.item} onChange={(item) => setEntry({ item })} /></Field>
                  <Num label="Weight" value={e.weight} onChange={(weight) => setEntry({ weight })} />
                  <Num label="Min" value={e.min} onChange={(min) => setEntry({ min })} />
                  <Num label="Max" value={e.max} onChange={(max) => setEntry({ max })} />
                  <span className="pct mono">{Math.round(((Number(e.weight) || 0) / total) * 100)}%</span>
                  <button type="button" className="btn ghost small" onClick={() => setPool(pi, { entries: pool.entries.filter((_, k) => k !== ei) })}>Remove</button>
                </div>
              );
            })}
            <div className="row">
              <button type="button" className="btn small" onClick={() => setPool(pi, { entries: [...pool.entries, { item: "", weight: 1, min: 1, max: 1 }] })}>Add entry</button>
              {el.pools.length > 1 && <button type="button" className="btn small ghost" onClick={() => patch({ pools: el.pools.filter((_, k) => k !== pi) })}>Remove pool</button>}
            </div>
          </Section>
        );
      })}
      <button type="button" className="btn" onClick={() => patch({ pools: [...el.pools, { rollsMin: 1, rollsMax: 1, entries: [{ item: "", weight: 1, min: 1, max: 1 }] }] })}>Add pool</button>
    </>
  );
}

const DIM_DEFAULTS: Record<OreElement["dimension"], { replaces: string[]; minY: number; maxY: number }> = {
  overworld: { replaces: ["minecraft:stone", "minecraft:deepslate", "minecraft:granite", "minecraft:diorite", "minecraft:andesite", "minecraft:tuff"], minY: -60, maxY: 32 },
  nether: { replaces: ["minecraft:netherrack"], minY: 10, maxY: 117 },
  the_end: { replaces: ["minecraft:end_stone"], minY: 0, maxY: 80 },
};

export function OreEditor({ el, patch }: { el: OreElement; patch: Patch<OreElement> }) {
  return (
    <>
      <Section title="What to place">
        <IdField label="Block" kind="block" value={el.block} onChange={(block) => patch({ block }, "block")} help="Usually an ore block from this add-on." />
        <Select label="Dimension" value={el.dimension} onChange={(dimension) => patch({ dimension, ...DIM_DEFAULTS[dimension] })} options={[
          { value: "overworld", label: "Overworld" }, { value: "nether", label: "Nether" }, { value: "the_end", label: "The End" },
        ]} />
        <ChipList label="Replaces" values={el.replaces} onChange={(replaces) => patch({ replaces })} kind="block" />
      </Section>
      <Section title="How much">
        <Grid>
          <Slider label="Vein size" min={1} max={32} value={el.veinSize} onChange={(veinSize) => patch({ veinSize }, "vein")} help="Diamond: 8, coal: 17" />
          <Slider label="Veins per chunk" min={1} max={40} value={el.veinsPerChunk} onChange={(veinsPerChunk) => patch({ veinsPerChunk }, "veins")} help="Diamond: ~7, iron: ~20" />
          <Num label="Lowest Y" min={-64} max={320} value={el.minY} onChange={(minY) => patch({ minY }, "miny")} />
          <Num label="Highest Y" min={-64} max={320} value={el.maxY} onChange={(maxY) => patch({ maxY }, "maxy")} />
        </Grid>
        <HeightBar min={el.minY} max={el.maxY} />
        <p className="field-help">Ore generation only appears in newly generated chunks.</p>
      </Section>
    </>
  );
}

function HeightBar({ min, max }: { min: number; max: number }) {
  const lo = -64, hi = 320, span = hi - lo;
  const a = Math.max(lo, Math.min(min, max)), b = Math.min(hi, Math.max(min, max));
  return (
    <div className="height-bar" aria-label={`Generates between y=${a} and y=${b}`}>
      <div className="height-sea" style={{ bottom: `${((63 - lo) / span) * 100}%` }}><span>sea level 63</span></div>
      <div className="height-deep" style={{ bottom: `${((0 - lo) / span) * 100}%` }}><span>deepslate 0</span></div>
      <div className="height-range" style={{ bottom: `${((a - lo) / span) * 100}%`, height: `${((b - a) / span) * 100}%` }} />
    </div>
  );
}

export function FunctionEditor({ el, patch }: { el: FunctionElement; patch: Patch<FunctionElement> }) {
  const ns = useStore((s) => s.project!.namespace);
  return (
    <Section title="Commands" hint={`Run in game with /function ${ns}/${el.name}`}>
      <textarea className="code" spellCheck={false} rows={16} value={el.body} onChange={(e) => patch({ body: e.target.value }, "body")} aria-label="Function commands" />
      <Toggle label="Run every tick" value={el.runEveryTick} onChange={(runEveryTick) => patch({ runEveryTick })} help="Runs 20 times per second. Keep it light." />
    </Section>
  );
}

export function SoundEditor({ el, patch }: { el: SoundElement; patch: Patch<SoundElement> }) {
  const ns = useStore((s) => s.project!.namespace);
  const load = async (f: File) => {
    const file = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(f);
    });
    patch({ file, fileName: f.name });
  };
  return (
    <>
      <Section title="Audio" hint={`Play it with the sound id ${ns}.${el.name}`}>
        <div className="row wrap">
          <label className="btn">
            {el.file ? "Replace .ogg file…" : "Choose .ogg file…"}
            <input type="file" accept=".ogg,audio/ogg" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          </label>
          {el.file && <span className="mono">{el.fileName}</span>}
        </div>
        {el.file && <audio controls src={el.file} className="audio" />}
        <p className="field-help">Bedrock only plays .ogg (Vorbis). Audacity can export this format.</p>
      </Section>
      <Section title="Playback">
        <Grid>
          <Select label="Volume slider" value={el.category} onChange={(category) => patch({ category })} options={["ambient", "block", "hostile", "music", "neutral", "player", "record", "weather", "ui"]} />
          <Slider label="Volume" min={0} max={2} step={0.05} value={el.volume} onChange={(volume) => patch({ volume }, "vol")} />
          <Slider label="Pitch" min={0.5} max={2} step={0.05} value={el.pitch} onChange={(pitch) => patch({ pitch }, "pitch")} />
        </Grid>
      </Section>
    </>
  );
}

/** Where a crafting recipe works: the vanilla crafting table and/or custom crafting stations. */
function CraftIn({ el, patch }: { el: RecipeElement; patch: Patch<RecipeElement> }) {
  const project = useStore((s) => s.project!);
  const stations = [
    { tag: "crafting_table", label: "Crafting table" },
    ...project.elements.flatMap((b) => (b.kind === "block" && b.function === "crafting"
      ? [{ tag: (b.craftingTags?.length ? b.craftingTags[0] : `${project.namespace}:${b.name}`), label: b.displayName }] : [])),
  ];
  const current = el.stations?.length ? el.stations : ["crafting_table"];
  const set = (tag: string, on: boolean) => {
    const next = on ? [...new Set([...current, tag])] : current.filter((t) => t !== tag);
    patch({ stations: next.length ? next : ["crafting_table"] });
  };
  return (
    <Section title="Craft in" hint={stations.length === 1 ? "Make a block a “Crafting station” to craft recipes only there." : "Tick every place this recipe can be crafted."}>
      <div className="station-list">
        {stations.map((s) => (
          <label key={s.tag} className="inline-check big">
            <input type="checkbox" checked={current.includes(s.tag)} onChange={(e) => set(s.tag, e.target.checked)} /> {s.label}
          </label>
        ))}
      </div>
    </Section>
  );
}
