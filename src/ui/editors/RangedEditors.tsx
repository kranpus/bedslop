import type { CropElement, EffectEntry, ItemElement, ProjectileElement } from "../../model/types";
import { createElement, slugify } from "../../model/registry";
import { EFFECTS } from "../../model/vanilla";
import { ChipList, Grid, IdField, Num, Section, Segmented, Select, Slider, Text, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import { GeometryUpload } from "./ContentEditors";
import type { Patch } from "./types";
import { TagField } from "../TagField";

/** Effect rows shared by projectiles (and anything else that applies effects). */
export function EffectsList({ effects, onChange, empty = "No effects." }: { effects: EffectEntry[]; onChange: (e: EffectEntry[], key?: string) => void; empty?: string }) {
  const set = (i: number, p: Partial<EffectEntry>) => onChange(effects.map((e, k) => (k === i ? { ...e, ...p } : e)), `fx-${i}`);
  return (
    <>
      {!effects.length && <p className="muted">{empty}</p>}
      {effects.map((fx, i) => (
        <div className="row effect-row" key={i}>
          <Select label="Effect" value={fx.effect} onChange={(effect) => set(i, { effect })} options={EFFECTS} />
          <Num label="Seconds" value={fx.seconds} onChange={(seconds) => set(i, { seconds })} />
          <Num label="Level" value={fx.amplifier + 1} min={1} onChange={(v) => set(i, { amplifier: Math.max(0, v - 1) })} />
          <button type="button" className="btn ghost small" onClick={() => onChange(effects.filter((_, k) => k !== i))} aria-label="Remove effect">Remove</button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => onChange([...effects, { effect: "slowness", seconds: 5, amplifier: 0, chance: 100 }])}>Add effect</button>
    </>
  );
}

// ---------- Projectile ----------

const PRESETS: { label: string; p: Partial<ProjectileElement> }[] = [
  { label: "Snowball-like", p: { look: "sprite", speed: 1.5, gravity: 0.03, onHit: "remove", damage: 0 } },
  { label: "Arrow-like", p: { look: "arrow", speed: 1.1, gravity: 0.05, onHit: "stick", damage: 6 } },
  { label: "Fast & straight", p: { speed: 3, gravity: 0, onHit: "remove" } },
];

export function ProjectileEditor({ el, patch }: { el: ProjectileElement; patch: Patch<ProjectileElement> }) {
  const project = useStore((s) => s.project!);
  const addElements = useStore((s) => s.addElements);
  const users = project.elements.filter((e): e is ItemElement => e.kind === "item" && (e.use === "throw" || e.use === "ammo") && e.projectile === el.name);
  const makeItem = (use: "throw" | "ammo") => {
    const base = use === "throw" ? el.displayName : `${el.displayName} Ammo`;
    let name = slugify(base), n = 2;
    while (project.elements.some((e) => e.name === name)) name = `${slugify(base)}_${n++}`;
    const it = createElement("item", name, base);
    it.use = use;
    it.projectile = el.name;
    it.texture = el.look === "sprite" ? el.texture : "";
    it.maxStack = use === "throw" ? 16 : 64;
    addElements([it]);
  };
  return (
    <>
      <Section title="Look">
        <Segmented value={el.look} onChange={(look) => patch({ look })} options={[
          { value: "sprite", label: "Flat sprite" }, { value: "arrow", label: "Arrow" }, { value: "custom", label: "Blockbench model" },
        ]} />
        {el.look === "sprite" && (
          <TexturePicker label="Sprite" kind="item" template="orb" value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })}
            help="Always faces the camera, like a snowball or ender pearl." />
        )}
        {el.look === "arrow" && (
          <TexturePicker label="Arrow texture" kind="entity" value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })}
            help="Uses the vanilla arrow layout (32 × 32, like textures/entity/arrows.png). Leave empty to look like a normal arrow." />
        )}
        {el.look === "custom" && (
          <>
            <GeometryUpload value={el.customGeometry} onChange={(customGeometry) => patch({ customGeometry })} label="Projectile model (.bbmodel or .geo.json)" />
            <TexturePicker label="Model texture" kind="entity" value={el.texture} suggestedName={el.name} onChange={(texture) => patch({ texture })} />
          </>
        )}
        <Slider label="Hitbox size" min={0.1} max={1} step={0.05} value={el.size} onChange={(size) => patch({ size }, "size")} format={(v) => `${v} blocks`} />
      </Section>
      <Section title="Flight" hint="Start from a preset, then fine-tune.">
        <div className="row wrap">
          {PRESETS.map((pr) => <button type="button" key={pr.label} className="btn small ghost" onClick={() => patch(pr.p)}>{pr.label}</button>)}
        </div>
        <Grid>
          <Slider label="Speed (blocks per tick)" min={0.2} max={5} step={0.1} value={el.speed} onChange={(speed) => patch({ speed }, "speed")}
            help="Snowball 1.5, arrow 1.1 (a fully drawn bow fires faster)." />
          <Slider label="Gravity" min={0} max={0.2} step={0.01} value={el.gravity} onChange={(gravity) => patch({ gravity }, "grav")} format={(v) => (v === 0 ? "none" : String(v))}
            help="Snowball 0.03, arrow 0.05." />
        </Grid>
      </Section>
      <Section title="On hit">
        <Grid>
          <Num label="Damage" min={0} value={el.damage} onChange={(damage) => patch({ damage }, "dmg")} help="In half-hearts. Arrow ≈ 6 at full draw." />
          <Num label="Sets target on fire" suffix="seconds" min={0} value={el.fireSeconds} onChange={(fireSeconds) => patch({ fireSeconds }, "fire")} help="0 = no fire." />
          <Select label="Afterwards" value={el.onHit} onChange={(onHit) => patch({ onHit })} options={[
            { value: "remove", label: "Disappears (snowball)" }, { value: "stick", label: "Sticks in blocks (arrow)" },
          ]} />
          <Text label="Hit sound" value={el.hitSound} onChange={(hitSound) => patch({ hitSound }, "snd")} placeholder="e.g. bow.hit" help="A sound event name. Empty = the default." />
        </Grid>
        <Toggle label="Knocks the target back" value={el.knockback} onChange={(knockback) => patch({ knockback })} />
        <EffectsList effects={el.effects} onChange={(effects, key) => patch({ effects }, key)} empty="No effects on the target." />
        <p className="field-help">For anything else (explosions, lightning, teleports), add a Procedure with the trigger “Projectile hits a mob” or “Projectile hits a block”.</p>
      </Section>
      <Section title="Used by">
        {users.length
          ? <p>{users.map((u) => u.displayName).join(", ")} {users.length === 1 ? "uses" : "use"} this projectile.</p>
          : <p className="muted">Nothing fires this yet. Make an item that throws it, or ammo for a bow.</p>}
        <div className="row">
          <button type="button" className="btn small" onClick={() => makeItem("throw")}>Make a throwable item</button>
          <button type="button" className="btn small ghost" onClick={() => makeItem("ammo")}>Make bow ammo</button>
        </div>
      </Section>
    </>
  );
}

// ---------- Item "When used" ----------

export function ItemUseSection({ el, patch }: { el: ItemElement; patch: Patch<ItemElement> }) {
  const project = useStore((s) => s.project!);
  const projectiles = project.elements.filter((e): e is ProjectileElement => e.kind === "projectile");
  const ammoItems = project.elements.filter((e): e is ItemElement => e.kind === "item" && e.use === "ammo").map((e) => `${project.namespace}:${e.name}`);
  const use = el.use ?? "none";
  return (
    <Section title="When used">
      <Segmented value={use} onChange={(v) => patch({ use: v, ...(v === "bow" && !el.ammo?.length ? { ammo: ["minecraft:arrow"] } : {}) })} options={[
        { value: "none", label: "Nothing special" }, { value: "throw", label: "Throws a projectile" }, { value: "bow", label: "Bow" }, { value: "ammo", label: "Bow ammo" },
      ]} />
      {(use === "throw" || use === "ammo") && (
        projectiles.length
          ? <Select label="Projectile" value={el.projectile ?? ""} onChange={(projectile) => patch({ projectile })}
              options={[{ value: "", label: "Choose…" }, ...projectiles.map((p) => ({ value: p.name, label: p.displayName }))]}
              help={use === "throw" ? "Thrown on right-click; one is used up each throw." : "What flies out when a bow shoots this item."} />
          : <p className="warn-text">Make a Projectile element first, then pick it here.</p>
      )}
      {use === "bow" && (
        <>
          <ChipList label="Ammo" values={el.ammo ?? []} onChange={(ammo) => patch({ ammo })} kind="item" suggestions={["minecraft:arrow", ...ammoItems]}
            help="Items it can fire, in order of preference. Your own ammo items need “Bow ammo” set." />
          <Grid>
            <Num label="Full draw time" suffix="seconds" step={0.1} min={0.1} value={el.drawSeconds ?? 1} onChange={(drawSeconds) => patch({ drawSeconds }, "draw")} help="Vanilla bow: 1." />
            <Num label="Durability" min={0} value={el.durability ?? 384} onChange={(durability) => patch({ durability }, "dur")} help="Shots before it breaks. Vanilla: 384." />
          </Grid>
        </>
      )}
    </Section>
  );
}

// ---------- Crop ----------

export function CropEditor({ el, patch }: { el: CropElement; patch: Patch<CropElement> }) {
  const ns = useStore((s) => s.project!.namespace);
  const stages = el.stageTextures.length;
  const setStages = (n: number) => {
    const next = el.stageTextures.slice(0, n);
    while (next.length < n) next.push("");
    patch({ stageTextures: next });
  };
  return (
    <>
      <Section title="Growth stages" hint="Youngest first. The last stage is fully grown.">
        <Grid>
          <Slider label="Stages" min={2} max={8} value={stages} onChange={setStages} help="Wheat has 8, beetroot 4." />
          <Select label="Shape" value={el.look} onChange={(look) => patch({ look })} options={[
            { value: "crop", label: "Crop rows (#, like wheat)" }, { value: "cross", label: "Cross (X, like a sapling)" },
          ]} />
        </Grid>
        <div className="tex-grid-slots">
          {el.stageTextures.map((t, i) => (
            <TexturePicker key={i} label={i === stages - 1 ? `Stage ${i + 1} (grown)` : `Stage ${i + 1}`} kind="block" template="crop" value={t || undefined}
              suggestedName={`${el.name}_stage_${i}`} onChange={(id) => patch({ stageTextures: el.stageTextures.map((x, k) => (k === i ? id : x)) })} />
          ))}
        </div>
      </Section>
      <Section title="Growing">
        <Slider label="Growth chance" min={1} max={100} value={el.growthChance} onChange={(growthChance) => patch({ growthChance }, "grow")} format={(v) => `${v}% per random tick`}
          help="Higher grows faster. About 33% is close to wheat on wet farmland." />
        <Toggle label="Bone meal speeds it up" value={el.boneMeal} onChange={(boneMeal) => patch({ boneMeal })} />
        <ChipList label="Can be planted on" values={el.placeableOn} onChange={(placeableOn) => patch({ placeableOn })} kind="block" suggestions={["minecraft:farmland", "minecraft:grass_block", "minecraft:dirt", "minecraft:soul_sand"]} />
        <TagField kind="block" values={el.tags ?? []} onChange={(tags) => patch({ tags })} />
      </Section>
      <Section title="Harvest" hint="Breaking a young crop gives back one seed. A grown one drops the produce and extra seeds.">
        <Grid>
          <IdField label="Produce" value={el.produce} onChange={(produce) => patch({ produce }, "prod")} help="e.g. minecraft:wheat or one of your items." />
          <Num label="Produce min" min={0} value={el.produceMin} onChange={(produceMin) => patch({ produceMin }, "pmin")} />
          <Num label="Produce max" min={el.produceMin} value={el.produceMax} onChange={(produceMax) => patch({ produceMax }, "pmax")} />
          <Num label="Extra seeds (max)" min={0} value={el.seedsMax} onChange={(seedsMax) => patch({ seedsMax }, "smax")} />
        </Grid>
      </Section>
      <Section title="Seeds" hint={`The item players plant: ${ns}:${el.name}_seeds.`}>
        <TexturePicker label="Seeds icon" kind="item" template="seeds" value={el.seedsTexture || undefined} suggestedName={`${el.name}_seeds`} onChange={(seedsTexture) => patch({ seedsTexture })} />
      </Section>
    </>
  );
}
