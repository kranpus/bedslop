import { useMemo, useState } from "react";
import type { ParticleElement } from "../../model/types";
import { PARTICLE_SPRITES, SPRITE_SIZE, spritePixels, type BuiltInSprite } from "../../model/particleSprites";
import { Color, Grid, Num, Section, Segmented, Select, Slider, Toggle } from "../fields";
import { ParticlePreview } from "../ParticlePreview";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

type Preset = { label: string; p: Partial<ParticleElement> };

/** Starting points: each sets every visible setting, so they don't mix oddly. */
const PRESETS: Preset[] = [
  { label: "Sparkles", p: { sprite: "spark", colorStart: "#fff2a8", colorEnd: "#ffd24a", alphaStart: 100, alphaEnd: 0, sizeStart: 0.2, sizeEnd: 0.03, blend: "blend", lit: false, mode: "burst", count: 30, shape: "sphere", radius: 0.3, surfaceOnly: false, direction: "outwards", speedMin: 0.5, speedMax: 1.5, lifetimeMin: 0.6, lifetimeMax: 1.2, gravity: 0, drag: 2, collide: "none", spin: 0 } },
  { label: "Smoke puff", p: { sprite: "puff", colorStart: "#a0a0a0", colorEnd: "#505050", alphaStart: 80, alphaEnd: 0, sizeStart: 0.4, sizeEnd: 0.9, blend: "blend", lit: true, mode: "burst", count: 12, shape: "sphere", radius: 0.3, surfaceOnly: false, direction: "up", spread: 0.4, speedMin: 0.3, speedMax: 0.8, lifetimeMin: 1.2, lifetimeMax: 2.4, gravity: -0.6, drag: 1, collide: "none", spin: 40 } },
  { label: "Fire burst", p: { sprite: "dot", colorStart: "#ffd24a", colorEnd: "#ff3a1a", alphaStart: 100, alphaEnd: 0, sizeStart: 0.35, sizeEnd: 0.05, blend: "blend", lit: false, mode: "burst", count: 40, shape: "sphere", radius: 0.1, surfaceOnly: false, direction: "outwards", speedMin: 2, speedMax: 4, lifetimeMin: 0.4, lifetimeMax: 0.8, gravity: -1, drag: 3, collide: "none", spin: 0 } },
  { label: "Hearts", p: { sprite: "heart", colorStart: "#ff5a7a", colorEnd: "#ff5a7a", alphaStart: 100, alphaEnd: 0, sizeStart: 0.3, sizeEnd: 0.3, blend: "alpha", lit: false, mode: "burst", count: 6, shape: "sphere", radius: 0.4, surfaceOnly: false, direction: "up", spread: 0.3, speedMin: 0.4, speedMax: 0.8, lifetimeMin: 1, lifetimeMax: 1.5, gravity: -0.3, drag: 1, collide: "none", spin: 0 } },
  { label: "Magic swirl", p: { sprite: "star", colorStart: "#b06cff", colorEnd: "#4fd2ff", alphaStart: 100, alphaEnd: 0, sizeStart: 0.18, sizeEnd: 0.05, blend: "blend", lit: false, mode: "stream", rate: 30, duration: 2, shape: "sphere", radius: 0.4, surfaceOnly: true, direction: "outwards", speedMin: 0.2, speedMax: 0.6, lifetimeMin: 0.8, lifetimeMax: 1.4, gravity: -0.4, drag: 0.5, collide: "none", spin: 180 } },
  { label: "Fountain", p: { sprite: "circle", colorStart: "#4fa8ff", colorEnd: "#bfe4ff", alphaStart: 100, alphaEnd: 60, sizeStart: 0.12, sizeEnd: 0.08, blend: "blend", lit: true, mode: "stream", rate: 40, duration: 2, shape: "disc", radius: 0.1, surfaceOnly: false, direction: "up", spread: 0.25, speedMin: 4, speedMax: 6, lifetimeMin: 1.2, lifetimeMax: 1.8, gravity: 9.8, drag: 0.2, collide: "bounce", bounce: 0.3, spin: 0 } },
  { label: "Shockwave", p: { sprite: "dot", colorStart: "#ffffff", colorEnd: "#9fd3ff", alphaStart: 100, alphaEnd: 0, sizeStart: 0.25, sizeEnd: 0.05, blend: "blend", lit: false, mode: "burst", count: 60, shape: "disc", radius: 0.2, surfaceOnly: true, direction: "outwards", speedMin: 4, speedMax: 5, lifetimeMin: 0.5, lifetimeMax: 0.7, gravity: 0, drag: 2, collide: "none", spin: 0 } },
];

function spriteUrl(id: BuiltInSprite): string {
  const c = document.createElement("canvas");
  c.width = c.height = SPRITE_SIZE;
  const g = c.getContext("2d");
  if (!g) return "";
  g.putImageData(new ImageData(new Uint8ClampedArray(spritePixels(id)), SPRITE_SIZE, SPRITE_SIZE), 0, 0);
  return c.toDataURL();
}

export function ParticleEditor({ el, patch }: { el: ParticleElement; patch: Patch<ParticleElement> }) {
  const project = useStore((s) => s.project!);
  const [replay, setReplay] = useState(0);
  const sprites = useMemo(() => PARTICLE_SPRITES.map((s) => ({ ...s, url: spriteUrl(s.id) })), []);
  const texture = el.sprite === "custom" ? project.textures.find((t) => t.id === el.texture)?.dataUrl : undefined;
  const id = `${project.namespace}:${el.name}`;
  const pair = (a: number, b: number) => (a === b ? `${a}` : `${Math.min(a, b)}–${Math.max(a, b)}`);

  return (
    <>
      <Section title="Preview" hint="Start from a preset, then change anything. The preview updates as you go.">
        <div className="split">
          <div className="stack">
            <div className="row wrap">
              {PRESETS.map((pr) => <button type="button" key={pr.label} className="btn small" onClick={() => { patch(pr.p); setReplay((r) => r + 1); }}>{pr.label}</button>)}
            </div>
            <p className="field-help">
              {el.mode === "burst" ? `${el.count} particles at once` : `${el.rate} per second for ${el.duration} s`}, living {pair(el.lifetimeMin, el.lifetimeMax)} s.
              Spawn it with the <strong>Spawn particles</strong> step, or in game: <span className="mono">/particle {id} ~ ~1 ~</span>
            </p>
            <button type="button" className="btn small ghost" onClick={() => setReplay((r) => r + 1)}>Replay</button>
          </div>
          <ParticlePreview el={el} texture={texture} replay={replay} />
        </div>
      </Section>

      <Section title="Look">
        <div className="sprite-picker" role="radiogroup" aria-label="Particle shape">
          {sprites.map((s) => (
            <button type="button" key={s.id} role="radio" aria-checked={el.sprite === s.id} className={`sprite-choice${el.sprite === s.id ? " on" : ""}`} onClick={() => patch({ sprite: s.id })} title={s.label}>
              <img src={s.url} alt="" className="pixel" width={32} height={32} />
              <span>{s.label}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={el.sprite === "custom"} className={`sprite-choice${el.sprite === "custom" ? " on" : ""}`} onClick={() => patch({ sprite: "custom" })}>
            <span className="sprite-own">Own</span>
            <span>Your texture</span>
          </button>
        </div>
        {el.sprite === "custom" && (
          <TexturePicker label="Particle texture" kind="item" template="orb" value={el.texture || undefined} suggestedName={`${el.name}_particle`} onChange={(texture) => patch({ texture })}
            help="Drawn whole on each particle. White or light textures take the colours below best." />
        )}
        <Grid>
          <Color label="Colour at start" value={el.colorStart} onChange={(colorStart) => patch({ colorStart }, "c0")} />
          <Color label="Colour at end" value={el.colorEnd} onChange={(colorEnd) => patch({ colorEnd }, "c1")} />
          <Slider label="Opacity at start" min={0} max={100} value={el.alphaStart} onChange={(alphaStart) => patch({ alphaStart }, "a0")} format={(v) => `${v}%`} />
          <Slider label="Opacity at end" min={0} max={100} value={el.alphaEnd} onChange={(alphaEnd) => patch({ alphaEnd }, "a1")} format={(v) => `${v}%`} />
          <Slider label="Size at start (blocks)" min={0.02} max={2} step={0.01} value={el.sizeStart} onChange={(sizeStart) => patch({ sizeStart }, "s0")} />
          <Slider label="Size at end (blocks)" min={0.02} max={2} step={0.01} value={el.sizeEnd} onChange={(sizeEnd) => patch({ sizeEnd }, "s1")} />
        </Grid>
        <Segmented value={el.blend} onChange={(blend) => patch({ blend })} options={[
          { value: "blend", label: "Smooth (fades)" }, { value: "alpha", label: "Crisp pixels" },
        ]} />
        <Toggle label="Darker in shadows" value={el.lit} onChange={(lit) => patch({ lit })} help="Off: particles glow at night (sparks, magic). On: they take the world's light (smoke, dust)." />
      </Section>

      <Section title="Emission">
        <Segmented value={el.mode} onChange={(mode) => patch({ mode })} options={[
          { value: "burst", label: "All at once" }, { value: "stream", label: "Stream for a while" },
        ]} />
        <Grid>
          {el.mode === "burst"
            ? <Num label="Particles" min={1} max={1000} value={el.count} onChange={(count) => patch({ count }, "count")} />
            : <>
                <Num label="Per second" min={0.1} max={500} step={1} value={el.rate} onChange={(rate) => patch({ rate }, "rate")} />
                <Num label="For" suffix="seconds" min={0.05} step={0.1} value={el.duration} onChange={(duration) => patch({ duration }, "dur")} />
              </>}
          <Select label="Spawn area" value={el.shape} onChange={(shape) => patch({ shape })} options={[
            { value: "sphere", label: "Ball" }, { value: "box", label: "Cube" }, { value: "disc", label: "Flat circle" },
          ]} />
          <Slider label={el.shape === "box" ? "Half width" : "Radius"} min={0} max={3} step={0.05} value={el.radius} onChange={(radius) => patch({ radius }, "rad")} format={(v) => (v === 0 ? "a single point" : `${v} blocks`)} />
        </Grid>
        {el.radius > 0 && <Toggle label="Only on the edge" value={el.surfaceOnly} onChange={(surfaceOnly) => patch({ surfaceOnly })} help="Spawn on the outside of the area instead of all through it." />}
        <Segmented value={el.direction} onChange={(direction) => patch({ direction })} options={[
          { value: "outwards", label: "Fly outwards" }, { value: "up", label: "Fly up" }, { value: "inwards", label: "Fly inwards" },
        ]} />
        {el.direction === "up" && <Slider label="Spread" min={0} max={1} step={0.05} value={el.spread} onChange={(spread) => patch({ spread }, "spread")} format={(v) => (v === 0 ? "straight up" : String(v))} />}
      </Section>

      <Section title="Motion">
        <Grid>
          <Num label="Speed from" suffix="blocks/s" min={0} step={0.1} value={el.speedMin} onChange={(speedMin) => patch({ speedMin }, "v0")} />
          <Num label="Speed to" suffix="blocks/s" min={0} step={0.1} value={el.speedMax} onChange={(speedMax) => patch({ speedMax }, "v1")} />
          <Num label="Lives from" suffix="seconds" min={0.05} step={0.1} value={el.lifetimeMin} onChange={(lifetimeMin) => patch({ lifetimeMin }, "l0")} />
          <Num label="Lives to" suffix="seconds" min={0.05} step={0.1} value={el.lifetimeMax} onChange={(lifetimeMax) => patch({ lifetimeMax }, "l1")} />
          <Slider label="Gravity" min={-10} max={20} step={0.1} value={el.gravity} onChange={(gravity) => patch({ gravity }, "g")} format={(v) => (v < 0 ? `${v} (floats up)` : v === 0 ? "none" : String(v))}
            help="Real gravity is about 9.8. Negative makes particles rise." />
          <Slider label="Air resistance" min={0} max={10} step={0.1} value={el.drag} onChange={(drag) => patch({ drag }, "drag")} help="Slows particles down over time." />
          <Slider label="Spin" min={0} max={720} step={10} value={el.spin} onChange={(spin) => patch({ spin }, "spin")} format={(v) => (v ? `up to ${v}°/s` : "none")} />
        </Grid>
        <Segmented value={el.collide} onChange={(collide) => patch({ collide })} options={[
          { value: "none", label: "Pass through blocks" }, { value: "bounce", label: "Bounce off blocks" }, { value: "vanish", label: "Vanish on blocks" },
        ]} />
        {el.collide === "bounce" && <Slider label="Bounciness" min={0} max={1} step={0.05} value={el.bounce} onChange={(bounce) => patch({ bounce }, "bounce")} />}
      </Section>
    </>
  );
}
