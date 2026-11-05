import type { BiomeElement } from "../../model/types";
import { FEATURE_STYLES, NETHER_BIOMES, OVERWORLD_BIOMES, VANILLA_FOGS } from "../../model/vanilla";
import { biomeTag } from "../../export/biome";
import { useStore } from "../../store/store";
import { ChipList, Color, Field, Grid, IdField, Section, Segmented, Select, Slider, Toggle } from "../fields";
import type { Patch } from "./types";

const pretty = (s: string) => s.replace(/_/g, " ");
const weather = (t: number) => (t < 0.15 ? "Snowy" : t < 0.4 ? "Cold" : t < 1 ? "Mild" : t < 1.5 ? "Warm" : "Hot (no rain)");

/** One colour that can be left as Minecraft's default. */
function OptionalColor({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="row">
        {value ? <Color label="" value={value} onChange={onChange} /> : <span className="muted">Minecraft's default</span>}
        {value ? <button type="button" className="btn ghost small" onClick={() => onChange("")}>Use default</button>
          : <button type="button" className="btn small" onClick={() => onChange(fallback)}>Pick a colour</button>}
      </div>
    </Field>
  );
}

export function BiomeEditor({ el, patch }: { el: BiomeElement; patch: Patch<BiomeElement> }) {
  const ns = useStore((s) => s.project!.namespace);
  const minEngine = useStore((s) => s.project!.minEngine);
  const update = useStore((s) => s.update);
  const tooOld = minEngine[0] === 1 && (minEngine[1] < 21 || (minEngine[1] === 21 && minEngine[2] < 110));
  const nether = el.dimension === "nether";
  const list = nether ? NETHER_BIOMES : OVERWORLD_BIOMES;
  const tag = biomeTag(ns, el.name);
  const sky = el.skyColor || (nether ? "#3a0d0d" : "#78a7ff"), grass = el.grassColor || "#79c05a", water = el.waterColor || "#44aff5";
  return (
    <>
      <Section title="Where it generates" hint="Bedrock adds custom biomes by taking over part of Minecraft's biomes. Only new chunks get it, so explore somewhere new to find it.">
        {tooOld && (
          <div className="version-need bad">
            <span>Custom biomes need Minecraft 1.21.110 or newer. Your project targets {minEngine.join(".")}.</span>
            <button type="button" className="btn small primary" onClick={() => update((p) => ({ ...p, scriptApi: "2.2.0", minEngine: [1, 21, 110] }))}>Update project to 1.21.110</button>
          </div>
        )}
        <div className="split">
          <div className="stack">
            <Segmented value={el.dimension} onChange={(dimension) => patch({
              dimension, replaces: dimension === "nether" ? ["hell"] : ["plains"],
              ...(dimension === "nether"
                ? { topBlock: "minecraft:netherrack", midBlock: "minecraft:netherrack", foundationBlock: "minecraft:netherrack", seaFloorBlock: "minecraft:netherrack", seaBlock: "minecraft:lava", temperature: 2, downfall: 0, featuresLike: "", animals: false }
                : { topBlock: "minecraft:grass_block", midBlock: "minecraft:dirt", foundationBlock: "minecraft:stone", seaFloorBlock: "minecraft:gravel", seaBlock: "minecraft:water", temperature: 0.8, downfall: 0.4, featuresLike: "plains", animals: true }),
            })} options={[{ value: "overworld", label: "Overworld" }, { value: "nether", label: "Nether" }]} />
            <ChipList label="Takes over part of" values={el.replaces} onChange={(replaces) => patch({ replaces })} suggestions={list} placeholder="biome name…"
              help={nether ? "Nether wastes is called “hell”." : "E.g. plains, forest, desert. Pick a few for more chances to find it."} />
            <Grid>
              <Slider label="How much of them" min={0.05} max={1} step={0.05} value={el.amount} onChange={(amount) => patch({ amount }, "amount")} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Area size" min={1} max={10} value={el.patchSize} onChange={(patchSize) => patch({ patchSize }, "size")} format={(v) => (v <= 3 ? `${v} (small patches)` : v >= 8 ? `${v} (huge, rare)` : String(v))} />
            </Grid>
          </div>
          <div className="biome-preview" aria-label="Biome preview" style={{ background: `linear-gradient(${sky}, ${sky} 55%, transparent 55%)` }}>
            <div className="biome-water" style={{ background: nether ? "#d0541c" : water }} />
            <div className="biome-top" style={{ background: el.topBlock.includes("grass") ? grass : "#8a7a64" }} />
            <span>{el.displayName}</span>
          </div>
        </div>
      </Section>

      <Section title="Ground">
        <Grid>
          <IdField label="Surface" kind="block" value={el.topBlock} onChange={(topBlock) => patch({ topBlock }, "top")} />
          <IdField label="Just below" kind="block" value={el.midBlock} onChange={(midBlock) => patch({ midBlock }, "mid")} help="A few blocks deep." />
          <IdField label="Deep underground" kind="block" value={el.foundationBlock} onChange={(foundationBlock) => patch({ foundationBlock }, "deep")} />
          <IdField label="Under water" kind="block" value={el.seaFloorBlock} onChange={(seaFloorBlock) => patch({ seaFloorBlock }, "floor")} />
          <IdField label={nether ? "Lava seas" : "Water"} kind="block" value={el.seaBlock} onChange={(seaBlock) => patch({ seaBlock }, "sea")} help={nether ? "Usually lava." : "Usually water."} />
        </Grid>
        <p className="field-help">Your own blocks work too.</p>
      </Section>

      <Section title="Weather">
        <Grid>
          <Slider label="Temperature" min={-0.5} max={2} step={0.05} value={el.temperature} onChange={(temperature) => patch({ temperature }, "temp")} format={(v) => `${v} (${weather(v)})`} />
          <Slider label="Rain" min={0} max={1} step={0.05} value={el.downfall} onChange={(downfall) => patch({ downfall }, "rain")} format={(v) => (v === 0 ? "Never" : `${Math.round(v * 100)}%`)} />
        </Grid>
        <p className="field-help">Below 0.15 it snows instead of raining. Temperature also tints grass and leaves when no colour is set.</p>
      </Section>

      <Section title="Colours, sky and fog">
        <Grid>
          <OptionalColor label="Grass" value={el.grassColor} fallback="#79c05a" onChange={(grassColor) => patch({ grassColor }, "grass")} />
          <OptionalColor label="Leaves" value={el.foliageColor} fallback="#59ae30" onChange={(foliageColor) => patch({ foliageColor }, "leaves")} />
          <OptionalColor label="Water" value={el.waterColor} fallback="#44aff5" onChange={(waterColor) => patch({ waterColor }, "water")} />
          <OptionalColor label="Sky" value={el.skyColor} fallback="#78a7ff" onChange={(skyColor) => patch({ skyColor }, "sky")} />
          <Select label="Fog" value={el.fog} onChange={(fog) => patch({ fog })} options={[{ value: "", label: "Default" }, ...VANILLA_FOGS.map((f) => ({ value: f, label: `Like ${pretty(f)}` }))]} />
        </Grid>
      </Section>

      <Section title="Plants and mobs">
        <Grid>
          <Select label="Plants and trees like" value={el.featuresLike} onChange={(featuresLike) => patch({ featuresLike })}
            options={[{ value: "", label: "None (bare ground)" }, ...FEATURE_STYLES.map((f) => ({ value: f, label: pretty(f) }))]}
            help="Brings that kind of biome's grass, flowers and trees." />
        </Grid>
        <Toggle label="Animals spawn" value={el.animals} onChange={(animals) => patch({ animals })} />
        <Toggle label="Monsters spawn" value={el.monsters} onChange={(monsters) => patch({ monsters })} />
        <ChipList label="Extra biome tags" values={el.tags} onChange={(tags) => patch({ tags })} placeholder="tag…" help="Other add-ons and spawn rules look for tags." />
        <p className="field-help">It always has the tag <span className="mono">{tag}</span>: use it in your mobs' spawn biomes or a structure's biomes so they only appear here. Procedures can check <strong>Is in biome</strong> (Script API 2.11+).</p>
      </Section>
    </>
  );
}

/** Tags of the project's own biomes, for biome pickers elsewhere (a plain read, safe inside conditions). */
export function customBiomeTags(): string[] {
  const project = useStore.getState().project;
  return project ? project.elements.filter((e) => e.kind === "biome").map((e) => biomeTag(project.namespace, e.name)) : [];
}
