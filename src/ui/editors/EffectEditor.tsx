import type { CustomEffectElement, CustomEffectStep } from "../../model/types";
import { uid } from "../../model/registry";
import { EFFECTS, VANILLA_PARTICLES } from "../../model/vanilla";
import { Field, Grid, Num, Section, Select, Slider, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

/** Minecraft colour codes for the on-screen timer. */
const COLORS: { code: string; label: string; hex: string }[] = [
  { code: "d", label: "Pink", hex: "#ff55ff" }, { code: "5", label: "Purple", hex: "#aa00aa" }, { code: "c", label: "Red", hex: "#ff5555" },
  { code: "6", label: "Gold", hex: "#ffaa00" }, { code: "e", label: "Yellow", hex: "#ffff55" }, { code: "a", label: "Green", hex: "#55ff55" },
  { code: "2", label: "Dark green", hex: "#00aa00" }, { code: "b", label: "Aqua", hex: "#55ffff" }, { code: "9", label: "Blue", hex: "#5555ff" },
  { code: "f", label: "White", hex: "#ffffff" }, { code: "7", label: "Grey", hex: "#aaaaaa" },
];

const STEP_TYPES: { value: CustomEffectStep["type"]; label: string }[] = [
  { value: "vanilla", label: "Keep a Minecraft effect on" }, { value: "damage", label: "Hurt every second" }, { value: "heal", label: "Heal every second" },
  { value: "particles", label: "Show particles" }, { value: "procedure", label: "Run a procedure every few seconds" },
  { value: "on_start", label: "Run a procedure when it starts" }, { value: "on_end", label: "Run a procedure when it ends" },
];

const roman = (n: number) => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);

export function EffectEditor({ el, patch }: { el: CustomEffectElement; patch: Patch<CustomEffectElement> }) {
  const project = useStore((s) => s.project!);
  const procedures = project.elements.filter((e) => e.kind === "procedure");
  const particles = project.elements.filter((e) => e.kind === "particle");
  const setStep = (i: number, p: Partial<CustomEffectStep>) => patch({ steps: el.steps.map((x, k) => (k === i ? { ...x, ...p } : x)) }, `st-${i}`);
  const color = COLORS.find((c) => c.code === el.color) ?? COLORS[0];
  const place = el.timerPlace ?? "left";
  const levels = Array.from({ length: Math.max(1, el.maxLevel) }, (_, i) => i + 1);

  return (
    <>
      <Section title="Effect" hint="Bedrock has no custom status effects, so this one is run by the add-on's script and shown with a timer on screen.">
        <Grid>
          <Select label="Timer colour" value={el.color} onChange={(c) => patch({ color: c })} options={COLORS.map((c) => ({ value: c.code, label: c.label }))} />
          <Slider label="Highest level" min={1} max={10} value={el.maxLevel} onChange={(maxLevel) => patch({ maxLevel }, "max")} format={roman} />
        </Grid>
        <Toggle label="Show the timer" value={el.showTimer} onChange={(showTimer) => patch({ showTimer })} help="Players see the name, level and time left." />
        {el.showTimer && (
          <>
            <Select label="Timer goes" value={place} onChange={(timerPlace) => patch({ timerPlace })} options={[
              { value: "left", label: "In a list on the left of the screen" }, { value: "actionbar", label: "Above the hotbar" },
            ]} help={place === "left" ? "Like Minecraft's own effect list. Up to 6 effects show at once." : "Shares the space used by action bar messages."} />
            <div className={`fx-timer-preview${place === "left" ? " left" : ""}`} aria-label="Timer preview">
              <span style={{ color: color.hex }}>{el.displayName}{el.maxLevel > 1 ? " II" : ""}</span> <span className="fx-time">0:42</span>
            </div>
          </>
        )}
        <Toggle label="Milk cures it" value={el.milkCures} onChange={(milkCures) => patch({ milkCures })} />
      </Section>

      <Section title="While active" hint="Numbers are for level I. “Per level” is added for each level above that.">
        {el.steps.map((st, i) => {
          const v = (lv: number) => Math.round((st.amount + st.perLevel * (lv - 1)) * 100) / 100;
          return (
            <div className="rule-card" key={st.id}>
              <div className="rule-when">
                <Select label="Does" value={st.type} onChange={(type) => setStep(i, { type })} options={STEP_TYPES} />
                {st.type === "vanilla" && (
                  <Select label="Minecraft effect" value={st.effect ?? ""} onChange={(effect) => setStep(i, { effect })} options={[{ value: "", label: "Choose…" }, ...EFFECTS.map((e) => ({ value: e, label: e.replace(/_/g, " ") }))]} />
                )}
                {st.type === "particles" && (
                  <Field label="Particles">
                    <select value={st.particle ?? ""} onChange={(e) => setStep(i, { particle: e.target.value })}>
                      <option value="">Choose…</option>
                      {particles.length > 0 && <optgroup label="Your particle effects">{particles.map((p) => <option key={p.id} value={p.name}>{p.displayName}</option>)}</optgroup>}
                      <optgroup label="Minecraft's">{VANILLA_PARTICLES.map((id) => <option key={id} value={id}>{id.replace("minecraft:", "").replace(/_/g, " ")}</option>)}</optgroup>
                    </select>
                  </Field>
                )}
                {(st.type === "procedure" || st.type === "on_start" || st.type === "on_end") && (
                  <Select label="Procedure" value={st.procedure ?? ""} onChange={(procedure) => setStep(i, { procedure })}
                    options={[{ value: "", label: procedures.length ? "Choose…" : "No procedures yet" }, ...procedures.map((p) => ({ value: p.name, label: p.displayName }))]}
                    help="It gets the player (or the mob as the target) and {level}. Give it the “Run manually” trigger." />
                )}
              </div>
              <div className="rule-then">
                {st.type === "vanilla" && <Toggle label="Stronger at higher levels" value={!!st.stronger} onChange={(stronger) => setStep(i, { stronger })} help="Level II gives the Minecraft effect at level II, and so on." />}
                {(st.type === "damage" || st.type === "heal") && (
                  <>
                    <Grid>
                      <Num label={st.type === "damage" ? "Damage" : "Healing"} suffix="half-hearts / s" step={0.5} value={st.amount} onChange={(amount) => setStep(i, { amount })} />
                      <Num label="Per level" step={0.5} value={st.perLevel} onChange={(perLevel) => setStep(i, { perLevel })} />
                    </Grid>
                    <p className="field-help">{levels.map((lv) => `${roman(lv)}: ${v(lv)}`).join(" · ")}</p>
                  </>
                )}
                {st.type === "procedure" && <Num label="Every" suffix="seconds" min={1} value={st.every ?? 5} onChange={(every) => setStep(i, { every })} />}
              </div>
              <button type="button" className="btn ghost small" onClick={() => patch({ steps: el.steps.filter((_, k) => k !== i) })}>Remove</button>
            </div>
          );
        })}
        <button type="button" className="btn small" onClick={() => patch({ steps: [...el.steps, { id: uid(), type: "vanilla", effect: "", amount: 1, perLevel: 0 }] })}>Add</button>
      </Section>

      <Section title="Getting it">
        <Toggle label="Potion to drink" value={el.potion} onChange={(potion) => patch({ potion })} help={`Adds ${project.namespace}:${el.name}_potion. Drinking it gives the effect and leaves a glass bottle.`} />
        {el.potion && (
          <>
            <Grid>
              <Num label="Lasts" suffix="seconds" min={1} value={el.potionSeconds} onChange={(potionSeconds) => patch({ potionSeconds }, "psec")} />
              <Select label="Level" value={String(Math.min(el.potionLevel, el.maxLevel))} onChange={(v) => patch({ potionLevel: Number(v) })} options={levels.map((l) => ({ value: String(l), label: roman(l) }))} />
            </Grid>
            <TexturePicker label="Potion icon (optional)" kind="item" template="potion" value={el.potionTexture || undefined} suggestedName={`${el.name}_potion`} onChange={(potionTexture) => patch({ potionTexture })} help="Empty = Minecraft's potion bottle." />
          </>
        )}
        <p className="field-help">Procedures can use the <strong>Give custom effect</strong> and <strong>Remove custom effect</strong> steps and the <strong>Has custom effect</strong> check, on players and mobs.</p>
      </Section>
    </>
  );
}
