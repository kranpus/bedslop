import type { EntityElement } from "../../model/types";
import { BIOME_TAGS } from "../../model/vanilla";
import { ChipList, Color, Field, Grid, IdInput, Num, Section, Segmented, Select, Slider, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { GeometryUpload } from "./ContentEditors";
import type { Patch } from "./types";

const PRESETS = {
  passive: { populationControl: "animal", spawnBiomeTags: ["animal"], lightMin: 7, lightMax: 15, spawnSurface: true },
  neutral: { populationControl: "animal", spawnBiomeTags: ["animal"], lightMin: 7, lightMax: 15, spawnSurface: true },
  hostile: { populationControl: "monster", spawnBiomeTags: ["monster"], lightMin: 0, lightMax: 7, spawnSurface: true },
} as const;

export function EntityEditor({ el, patch }: { el: EntityElement; patch: Patch<EntityElement> }) {
  const setDrop = (i: number, p: Partial<EntityElement["drops"][number]>) =>
    patch({ drops: el.drops.map((d, k) => (k === i ? { ...d, ...p } : d)) }, `drop-${i}`);
  return (
    <>
      <Section title="Model & texture">
        <Segmented value={el.model} onChange={(model) => patch({ model })} options={[
          { value: "humanoid", label: "Humanoid (player-shaped)" }, { value: "quadruped", label: "Four-legged animal" }, { value: "custom", label: "Blockbench model" },
        ]} />
        <TexturePicker label="Texture" kind="entity" template={el.model === "quadruped" ? "mob_quadruped" : "mob_humanoid"} value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })}
          help={el.model === "humanoid" ? "64 × 64. Any Minecraft skin works here." : el.model === "quadruped" ? "64 × 64. Generate a template to see where each part goes." : "Use the texture you painted in Blockbench."} />
        {el.model === "custom" && (
          <>
            <GeometryUpload value={el.customGeometry} onChange={(customGeometry) => patch({ customGeometry })} />
            <div className="field wide">
              <span className="field-label">Animations (.animation.json, optional)</span>
              <div className="row">
                <label className="btn small">
                  Choose file…
                  <input type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) patch({ customAnimations: await f.text() }); }} />
                </label>
                <span className="muted">{el.customAnimations ? "Loaded. Animations named walk/move play while moving, idle while standing." : "None"}</span>
              </div>
            </div>
          </>
        )}
        <Grid>
          <Num label="Hitbox width" suffix="blocks" step={0.1} value={el.width} onChange={(width) => patch({ width }, "w")} />
          <Num label="Hitbox height" suffix="blocks" step={0.1} value={el.height} onChange={(height) => patch({ height }, "h")} />
          <Num label="Scale" step={0.1} value={el.scale} onChange={(scale) => patch({ scale }, "scale")} />
        </Grid>
      </Section>

      <Section title="Behaviour">
        <Segmented value={el.behavior} onChange={(behavior) => patch({ behavior, ...PRESETS[behavior], spawnBiomeTags: [...PRESETS[behavior].spawnBiomeTags] })} options={[
          { value: "passive", label: "Passive: runs when hurt" }, { value: "neutral", label: "Neutral: fights back" }, { value: "hostile", label: "Hostile: hunts players" },
        ]} />
        <Grid>
          <Num label="Health" value={el.health} onChange={(health) => patch({ health }, "hp")} help="Zombie: 20, iron golem: 100" />
          <Slider label="Speed" min={0.05} max={0.6} step={0.01} value={el.speed} onChange={(speed) => patch({ speed }, "speed")} help="Zombie: 0.23, horse: ~0.3" />
          {el.behavior !== "passive" && <Num label="Attack damage" value={el.attackDamage} onChange={(attackDamage) => patch({ attackDamage }, "atk")} />}
          <Slider label="Knockback resistance" min={0} max={1} step={0.1} value={el.knockbackResistance} onChange={(knockbackResistance) => patch({ knockbackResistance }, "kb")} />
          <Num label="XP dropped" value={el.xp} onChange={(xp) => patch({ xp }, "xp")} />
        </Grid>
        <div className="toggles">
          <Toggle label="Floats in water" value={el.canSwim} onChange={(canSwim) => patch({ canSwim })} />
          <Toggle label="Immune to fire and lava" value={el.fireImmune} onChange={(fireImmune) => patch({ fireImmune })} />
          <Toggle label="Burns in sunlight" value={el.burnsInDaylight} onChange={(burnsInDaylight) => patch({ burnsInDaylight })} />
        </div>
        <ChipList label="Follows players holding" values={el.temptItems} onChange={(temptItems) => patch({ temptItems })} kind="item" help="Like cows following wheat." />
        <ChipList label="Extra families" values={el.families} onChange={(families) => patch({ families })} suggestions={["undead", "arthropod", "illager", "zombie", "skeleton"]} help="Families decide how other mobs react, e.g. 'undead' is hurt by Smite." />
      </Section>

      <Section title="Drops">
        {el.drops.map((d, i) => (
          <div className="row effect-row" key={i}>
            <Field label="Item"><IdInput value={d.item} onChange={(item) => setDrop(i, { item })} /></Field>
            <Num label="Min" value={d.min} onChange={(min) => setDrop(i, { min })} />
            <Num label="Max" value={d.max} onChange={(max) => setDrop(i, { max })} />
            <Num label="Chance" suffix="%" value={d.chance} onChange={(chance) => setDrop(i, { chance })} />
            <button type="button" className="btn ghost small" onClick={() => patch({ drops: el.drops.filter((_, k) => k !== i) })}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => patch({ drops: [...el.drops, { item: "", min: 1, max: 1, chance: 100 }] })}>Add drop</button>
      </Section>

      <Section title="Spawn egg">
        <Grid>
          <Color label="Base colour" value={el.eggBase} onChange={(eggBase) => patch({ eggBase }, "egg1")} />
          <Color label="Spots colour" value={el.eggOverlay} onChange={(eggOverlay) => patch({ eggOverlay }, "egg2")} />
          <div className="egg" style={{ background: el.eggBase }} aria-hidden>
            <span style={{ background: el.eggOverlay }} /><span style={{ background: el.eggOverlay }} /><span style={{ background: el.eggOverlay }} />
          </div>
        </Grid>
      </Section>

      <Section title="Natural spawning">
        <Toggle label="Spawns naturally" value={el.spawnEnabled} onChange={(spawnEnabled) => patch({ spawnEnabled })} />
        {el.spawnEnabled && (
          <>
            <ChipList label="Biomes (by tag)" values={el.spawnBiomeTags} onChange={(spawnBiomeTags) => patch({ spawnBiomeTags })} suggestions={BIOME_TAGS}
              help='"animal" = everywhere animals spawn, "monster" = everywhere monsters spawn.' />
            <Grid>
              <Select label="Counts toward" value={el.populationControl} onChange={(populationControl) => patch({ populationControl })} options={["animal", "monster", "water_animal", "ambient"]} />
              <Num label="Spawn weight" value={el.spawnWeight} onChange={(spawnWeight) => patch({ spawnWeight }, "weight")} help="Pig: 10, zombie: 100" />
              <Num label="Group size min" value={el.herdMin} onChange={(herdMin) => patch({ herdMin }, "hmin")} />
              <Num label="Group size max" value={el.herdMax} onChange={(herdMax) => patch({ herdMax }, "hmax")} />
              <Num label="Min light level" min={0} max={15} value={el.lightMin} onChange={(lightMin) => patch({ lightMin }, "lmin")} />
              <Num label="Max light level" min={0} max={15} value={el.lightMax} onChange={(lightMax) => patch({ lightMax }, "lmax")} />
            </Grid>
            <Toggle label="Spawns on the surface" value={el.spawnSurface} onChange={(spawnSurface) => patch({ spawnSurface })} help="Off = caves only. Hostile mobs also spawn in caves." />
          </>
        )}
      </Section>
    </>
  );
}
