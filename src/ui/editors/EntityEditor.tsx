import type { AnimationSlot, AnimWhen, AutoRig, EntityElement, RigRole } from "../../model/types";
import { BIOME_TAGS } from "../../model/vanilla";
import { ChipList, Color, Field, Grid, IdInput, Num, Section, Segmented, Select, Slider, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { MobPreview } from "../MobPreview";
import { useState } from "react";
import { convertBbmodel, isBbmodel } from "../../export/bbmodel";
import { geometryIdentifier } from "../../export/context";
import { AUTO_LOOK, AUTO_WALK, RIG_ROLES, WHEN, activeSlots, animationLabel, defaultSlots, listAnimations, listBones, listControllers, resolveRig } from "../../export/entityAnimations";
import { useStore } from "../../store/store";
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
      <Section title="3D preview" hint="Exactly what the add-on exports. Edits update it live.">
        <MobPreview el={el} />
      </Section>

      <Section title="Model & texture">
        <Segmented value={el.model} onChange={(model) => patch({ model })} options={[
          { value: "humanoid", label: "Humanoid (player-shaped)" }, { value: "quadruped", label: "Four-legged animal" }, { value: "custom", label: "Blockbench model" },
        ]} />
        <TexturePicker label="Texture" kind="entity" template={el.model === "quadruped" ? "mob_quadruped" : "mob_humanoid"} value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })}
          help={el.model === "humanoid" ? "64 × 64 in the player-skin layout. Any Minecraft skin works here; textures painted for your own model won't." : el.model === "quadruped" ? "64 × 64. Generate a template to see where each part goes." : "The texture you painted in Blockbench. Imported automatically from a .bbmodel."} />
        <BlockbenchImport el={el} patch={patch} />
        <Grid>
          <Num label="Hitbox width" suffix="blocks" step={0.1} value={el.width} onChange={(width) => patch({ width }, "w")} />
          <Num label="Hitbox height" suffix="blocks" step={0.1} value={el.height} onChange={(height) => patch({ height }, "h")} />
          <Num label="Scale" step={0.1} value={el.scale} onChange={(scale) => patch({ scale }, "scale")} />
        </Grid>
      </Section>

      {el.model === "custom" && geometryIdentifier(el.customGeometry) && <AnimationSection el={el} patch={patch} />}

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

/** Add a Blockbench mob: quick .bbmodel conversion, or Blockbench's exported files used exactly as-is. */
function BlockbenchImport({ el, patch }: { el: EntityElement; patch: Patch<EntityElement> }) {
  const addTexture = useStore((s) => s.addTexture);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const source = el.modelSource ?? "bbmodel";
  const geoId = geometryIdentifier(el.customGeometry);
  const animCount = listAnimations(el.customAnimations).length;

  const importBbmodel = async (f: File) => {
    try {
      const text = await f.text();
      if (!isBbmodel(text)) throw new Error(`${f.name} isn't a Blockbench project. For exported .geo.json or .animation.json files, use "Manual files".`);
      const c = convertBbmodel(text, el.name);
      const p: Partial<EntityElement> = { model: "custom", modelSource: "bbmodel", customGeometry: c.geometry, customAnimations: c.animations, customControllers: "" };
      if (c.texture) p.texture = addTexture({ ...c.texture, kind: "entity" }).id;
      patch(p);
      setMessage({ ok: true, text: [`Imported ${f.name}: model${c.texture ? ", texture" : ""}${c.animations ? ", animations" : ""}.`, ...c.notes].join(" ") });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "That file couldn't be read." });
    }
  };
  const bbInput = (
    <label className={`btn small${el.model === "custom" && !geoId ? " primary" : ""}`}>
      Import .bbmodel…
      <input type="file" accept=".bbmodel,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importBbmodel(f); }} />
    </label>
  );

  if (el.model !== "custom") {
    return (
      <div className="bb-import">
        <div className="row between">
          <div className="stack tight">
            <strong>Made this mob in Blockbench?</strong>
            <span className="field-help">Import the .bbmodel, or add the files Blockbench exports yourself.</span>
          </div>
          <div className="row">
            {bbInput}
            <button type="button" className="btn small" onClick={() => patch({ model: "custom", modelSource: "files" })}>Add files manually</button>
          </div>
        </div>
        {message && <p className={message.ok ? "ok-text" : "warn-text"} role="status">{message.text}</p>}
      </div>
    );
  }

  return (
    <div className="bb-import on">
      <Segmented value={source} onChange={(modelSource) => { setMessage(null); patch({ modelSource }); }} options={[
        { value: "bbmodel", label: "Quick import (.bbmodel)" },
        { value: "files", label: "Manual files (exact Blockbench export)" },
      ]} />
      {source === "bbmodel" ? (
        <>
          <div className="row between">
            <span className="field-help">
              {geoId ? <>Using <span className="mono">{geoId}</span>{animCount ? `, ${animCount} animation${animCount > 1 ? "s" : ""}` : ""}. The app converts the project file for you.</> : "Pick your Blockbench project file. Its model, texture and animations come with it."}
            </span>
            {bbInput}
          </div>
          <p className="field-help">If poses or animations look different from Blockbench, use Manual files instead.</p>
        </>
      ) : (
        <>
          <p className="field-help">These files go into the add-on exactly as you upload them, so they match Blockbench exactly.</p>
          <JsonFileSlot label="Model" required value={el.customGeometry} onChange={(customGeometry) => patch({ customGeometry }, "geo")}
            how="Blockbench: File → Export → Export Bedrock Geometry (.geo.json)"
            check={(t) => {
              const id = geometryIdentifier(t);
              if (!id) return null;
              const d = JSON.parse(t)["minecraft:geometry"]?.[0];
              return `${id} · ${d?.bones?.length ?? 0} bones${d?.description ? ` · texture ${d.description.texture_width}×${d.description.texture_height}` : ""}`;
            }} />
          <JsonFileSlot label="Animations" value={el.customAnimations} onChange={(customAnimations) => patch({ customAnimations }, "anim")}
            how="Blockbench: Animate tab → Animation menu → Export Animations (.animation.json)"
            check={(t) => {
              const list = listAnimations(t);
              return list.length ? `${list.length} animation${list.length > 1 ? "s" : ""}: ${list.map((a) => a.short).join(", ")}` : null;
            }} />
          <JsonFileSlot label="Animation controllers" value={el.customControllers ?? ""} onChange={(customControllers) => patch({ customControllers }, "ctrl")}
            how="Optional. Blockbench: Animate tab → Animation Controllers → Export (.animation_controllers.json). Controllers can refer to your animations by their last name part, e.g. walk."
            check={(t) => {
              const list = listControllers(t);
              return list.length ? `${list.length} controller${list.length > 1 ? "s" : ""}: ${list.map((c) => c.split(".").pop()).join(", ")}` : null;
            }} />
          <p className="field-help">Upload the texture with the Texture picker above.</p>
        </>
      )}
      {message && <p className={message.ok ? "ok-text" : "warn-text"} role="status">{message.text}</p>}
    </div>
  );
}

/** One JSON file: upload, check, view/edit, remove. */
function JsonFileSlot({ label, value, onChange, how, check, required }: {
  label: string; value: string; onChange: (v: string) => void; how: string; check: (text: string) => string | null; required?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  let status: { ok: boolean; text: string };
  if (!value.trim()) status = { ok: !required, text: required ? "Required" : "None" };
  else {
    let parsed = true;
    try { JSON.parse(value); } catch { parsed = false; }
    const summary = parsed ? check(value) : null;
    status = summary ? { ok: true, text: summary } : { ok: false, text: parsed ? "This doesn't look like the right kind of file." : "This isn't valid JSON." };
  }
  return (
    <div className="file-slot">
      <div className="row between">
        <div className="stack tight">
          <strong>{label}</strong>
          <span className={status.ok ? "muted small mono" : "warn-text"}>{status.text}</span>
          <span className="field-help">{how}</span>
        </div>
        <div className="row">
          <label className="btn small">
            {value ? "Replace…" : "Upload…"}
            <input type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onChange(await f.text()); }} />
          </label>
          {value && <button type="button" className="btn small ghost" onClick={() => setEditing(!editing)} aria-expanded={editing}>{editing ? "Hide JSON" : "View / edit"}</button>}
          {value && <button type="button" className="btn small ghost" onClick={() => { onChange(""); setEditing(false); }}>Remove</button>}
        </div>
      </div>
      {editing && <textarea className="code" rows={14} spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} JSON`} />}
    </div>
  );
}

const whenLabel = (w: AnimWhen) => WHEN.find((x) => x.value === w)?.label ?? w;

/** Choose which animation plays when, plus the bones the generated walk/look use. */
function AnimationSection({ el, patch }: { el: EntityElement; patch: Patch<EntityElement> }) {
  const manual = el.animationMode === "manual" && !!el.animationSlots;
  const slots = activeSlots(el);
  const imported = listAnimations(el.customAnimations);
  const bones = listBones(el.customGeometry);
  const ctrls = listControllers(el.customControllers);
  const choices = [...imported.map((a) => ({ value: a.id, label: a.short })), ...ctrls.map((c) => ({ value: c, label: animationLabel(c) })), { value: AUTO_WALK, label: animationLabel(AUTO_WALK) }, { value: AUTO_LOOK, label: animationLabel(AUTO_LOOK) }];

  const setSlots = (animationSlots: AnimationSlot[], key?: string) => patch({ animationMode: "manual", animationSlots }, key);
  const setSlot = (i: number, p: Partial<AnimationSlot>, key?: string) => setSlots(slots.map((s, k) => (k === i ? { ...s, ...p } : s)), key);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[i], next[j]] = [next[j], next[i]];
    setSlots(next);
  };
  const add = () => {
    const unused = choices.find((c) => !slots.some((s) => s.animation === c.value)) ?? choices[0];
    setSlots([...slots, { id: `s${Date.now().toString(36)}`, animation: unused.value, when: "always", condition: "", mode: "loop", speed: 1, matchMovement: false }]);
  };
  const usesRig = slots.some((s) => (s.animation === AUTO_WALK || s.animation === AUTO_LOOK) && s.when !== "never");

  return (
    <Section title="Animations" hint="Choose what plays, and when. Animations on the same body part add together.">
      <div className="row between">
        <Segmented value={manual ? "manual" : "auto"} onChange={(m) => (m === "manual" ? patch({ animationMode: "manual", animationSlots: el.animationSlots?.length ? el.animationSlots : defaultSlots(el) }) : patch({ animationMode: "auto" }))}
          options={[{ value: "auto", label: "Automatic (by name)" }, { value: "manual", label: "Manual" }]} />
        {manual && <button type="button" className="btn small ghost" onClick={() => patch({ animationSlots: defaultSlots(el) })}>Reset to automatic picks</button>}
      </div>

      {!manual && (
        <>
          <ul className="anim-summary">
            {slots.map((s) => (
              <li key={s.id} className={s.when === "never" ? "off" : ""}>
                <span className="mono">{animationLabel(s.animation)}</span>
                <span className="muted">{s.when === "never" ? "not used" : `${whenLabel(s.when)}${s.mode === "once" ? ", once" : ""}`}</span>
              </li>
            ))}
            {!slots.length && <li className="muted">No animations. Import an .animation.json or a .bbmodel with animations, or pick body parts below for a generated walk.</li>}
          </ul>
          <p className="field-help">Picked from animation names (walk, idle, attack, hurt, death…). Switch to Manual if something plays at the wrong time.</p>
        </>
      )}

      {manual && (
        <div className="logic-list">
          {slots.map((s, i) => {
            const auto = s.animation === AUTO_WALK || s.animation === AUTO_LOOK;
            const isCtrl = s.animation.startsWith("controller.");
            return (
              <div className={`logic-card${s.when === "never" ? " muted-card" : ""}`} key={s.id}>
                <div className="logic-head">
                  <span className="logic-step mono">{i + 1}</span>
                  <select value={s.animation} onChange={(e) => setSlot(i, { animation: e.target.value })} aria-label="Animation">
                    {!choices.some((c) => c.value === s.animation) && <option value={s.animation}>{animationLabel(s.animation)} (missing)</option>}
                    {imported.length > 0 && <optgroup label="From your animation file">{imported.map((a) => <option key={a.id} value={a.id}>{a.short}</option>)}</optgroup>}
                    {ctrls.length > 0 && <optgroup label="Your animation controllers">{ctrls.map((c) => <option key={c} value={c}>{animationLabel(c)}</option>)}</optgroup>}
                    <optgroup label="Generated"><option value={AUTO_WALK}>{animationLabel(AUTO_WALK)}</option><option value={AUTO_LOOK}>{animationLabel(AUTO_LOOK)}</option></optgroup>
                  </select>
                  <span className="spacer" />
                  <button type="button" className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="btn ghost small" onClick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="btn ghost small" onClick={() => setSlots(slots.filter((_, k) => k !== i))}>Remove</button>
                </div>
                <div className="logic-params">
                  <Select label="Plays" value={s.when} onChange={(when) => setSlot(i, { when, ...(["attacking", "hurt", "dying"].includes(when) && !auto ? { mode: "once" as const } : {}) })} options={WHEN.map((w) => ({ value: w.value, label: w.label }))} />
                  {s.when === "custom" && (
                    <Field label="Rule (Molang)" help="e.g. query.is_sneaking or query.health < 5">
                      <input className="mono" value={s.condition} onChange={(e) => setSlot(i, { condition: e.target.value }, `cond-${s.id}`)} placeholder="query.is_on_ground" />
                    </Field>
                  )}
                  {!auto && !isCtrl && (
                    <Select label="Repeat" value={s.mode} onChange={(mode) => setSlot(i, { mode })}
                      options={[{ value: "loop", label: "Loops while active" }, { value: "once", label: "Plays once each time" }]} />
                  )}
                  {s.animation !== AUTO_LOOK && !isCtrl && <Num label={auto ? "Step speed" : "Speed"} step={0.1} min={0.1} value={s.speed} onChange={(speed) => setSlot(i, { speed }, `speed-${s.id}`)} suffix="×" />}
                  {!auto && !isCtrl && <Toggle label="Match walking speed" value={s.matchMovement} onChange={(matchMovement) => setSlot(i, { matchMovement })} help="Plays faster when the mob moves faster and pauses when it stops." />}
                </div>
              </div>
            );
          })}
          <button type="button" className="btn small add-menu" onClick={add}>+ Add animation</button>
        </div>
      )}

      {(usesRig || manual) && bones.length > 0 && <RigEditor el={el} patch={patch} bones={bones} />}
    </Section>
  );
}

function RigEditor({ el, patch, bones }: { el: EntityElement; patch: Patch<EntityElement>; bones: string[] }) {
  const rig: AutoRig = el.autoRig ?? { bones: {}, swing: 50, reverse: false };
  const detected = resolveRig(bones, undefined);
  const setRig = (p: Partial<AutoRig>, key?: string) => patch({ autoRig: { ...rig, ...p } }, key);
  const setBone = (role: RigRole, v: string) => {
    const next = { ...rig.bones };
    if (v === "__auto") delete next[role];
    else next[role] = v === "__none" ? "" : v;
    setRig({ bones: next });
  };
  return (
    <fieldset className="panel rig">
      <legend>Body parts for generated walk and head look</legend>
      <div className="logic-params">
        {RIG_ROLES.map(({ role, label }) => {
          const v = rig.bones[role];
          return (
            <Field key={role} label={label}>
              <select value={v === undefined ? "__auto" : v === "" ? "__none" : v} onChange={(e) => setBone(role, e.target.value)}>
                <option value="__auto">Auto{detected[role] ? ` (${detected[role]})` : " (none found)"}</option>
                <option value="__none">None</option>
                {bones.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
          );
        })}
      </div>
      <div className="row wrap">
        <Slider label="Swing" min={5} max={90} value={rig.swing} onChange={(swing) => setRig({ swing }, "swing")} format={(v) => `${v}°`} />
        <Toggle label="Reverse swing direction" value={rig.reverse} onChange={(reverse) => setRig({ reverse })} help="Use if arms and legs swing the wrong way." />
      </div>
    </fieldset>
  );
}
