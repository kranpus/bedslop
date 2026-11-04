import type { EnchantEffect, EnchantTarget, EnchantmentElement } from "../../model/types";
import { uid } from "../../model/registry";
import { EFFECTS } from "../../model/vanilla";
import { ChipList, Field, Grid, Num, Section, Select, Slider, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

const TARGETS: { value: EnchantTarget; label: string }[] = [
  { value: "sword", label: "Swords" }, { value: "axe", label: "Axes" }, { value: "pickaxe", label: "Pickaxes" }, { value: "shovel", label: "Shovels" },
  { value: "hoe", label: "Hoes" }, { value: "bow", label: "Bows" }, { value: "helmet", label: "Helmets" }, { value: "chestplate", label: "Chestplates" },
  { value: "leggings", label: "Leggings" }, { value: "boots", label: "Boots" }, { value: "any", label: "Anything (single items)" },
];

const TYPES: Record<EnchantEffect["when"], { value: EnchantEffect["type"]; label: string }[]> = {
  hit: [
    { value: "damage", label: "Extra damage" }, { value: "fire", label: "Set the target on fire" }, { value: "effect", label: "Give the target an effect" },
    { value: "lifesteal", label: "Heal from damage dealt" }, { value: "lightning", label: "Chance of lightning" }, { value: "procedure", label: "Run a procedure" },
  ],
  break: [{ value: "xp", label: "Drop extra XP" }, { value: "self_effect", label: "Give yourself an effect" }, { value: "procedure", label: "Run a procedure" }],
  equipped: [{ value: "self_effect", label: "Give an effect while worn or held" }],
};

/** What the numbers mean for each kind of effect. */
const UNITS: Partial<Record<EnchantEffect["type"], { label: string; unit: string; fmt: (v: number) => string }>> = {
  damage: { label: "Extra damage", unit: "half-hearts", fmt: (v) => `+${v} damage` },
  fire: { label: "Burns for", unit: "seconds", fmt: (v) => `${v}s fire` },
  effect: { label: "Effect lasts", unit: "seconds", fmt: (v) => `${v}s` },
  lifesteal: { label: "Heals", unit: "% of damage", fmt: (v) => `${v}%` },
  lightning: { label: "Chance", unit: "%", fmt: (v) => `${v}%` },
  xp: { label: "Extra XP orbs", unit: "orbs", fmt: (v) => `${v} orbs` },
  self_effect: { label: "Effect lasts", unit: "seconds", fmt: (v) => `${v}s` },
};

const roman = (n: number) => ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);

export function EnchantmentEditor({ el, patch }: { el: EnchantmentElement; patch: Patch<EnchantmentElement> }) {
  const project = useStore((s) => s.project!);
  const procedures = project.elements.filter((e) => e.kind === "procedure");
  const update = useStore((s) => s.update);
  const others = project.elements.filter((e): e is EnchantmentElement => e.kind === "enchantment" && e.id !== el.id);
  const setFx = (i: number, p: Partial<EnchantEffect>) => patch({ effects: el.effects.map((x, k) => (k === i ? { ...x, ...p } : x)) }, `fx-${i}`);
  const toggleTarget = (t: EnchantTarget, on: boolean) => patch({ targets: on ? [...el.targets, t] : el.targets.filter((x) => x !== t) });
  const levels = Array.from({ length: Math.max(1, el.maxLevel) }, (_, i) => i + 1);

  return (
    <>
      <Section title="Enchantment" hint="Bedrock has no custom enchantments, so this one is run by the add-on's script. It shows in the item's tooltip like a real one.">
        <Slider label="Highest level" min={1} max={10} value={el.maxLevel} onChange={(maxLevel) => patch({ maxLevel }, "max")} format={(v) => roman(v)} />
        <Field label="Goes on">
          <div className="station-list">
            {TARGETS.map((t) => (
              <label key={t.value} className="inline-check big">
                <input type="checkbox" checked={el.targets.includes(t.value)} onChange={(e) => toggleTarget(t.value, e.target.checked)} /> {t.label}
              </label>
            ))}
          </div>
        </Field>
        {others.length > 0 && (
          <Field label="Can't go with" help="Like Sharpness and Smite: an item can only have one of these.">
            <div className="station-list">
              {others.map((o) => (
                <label key={o.id} className="inline-check big">
                  <input type="checkbox" checked={(el.conflicts ?? []).includes(o.name) || !!o.conflicts?.includes(el.name)}
                    onChange={(e) => {
                      const on = e.target.checked;
                      // Kept on both enchantments so either page can turn it off.
                      update((p) => ({ ...p, elements: p.elements.map((x) => {
                        if (x.kind !== "enchantment" || (x.id !== el.id && x.id !== o.id)) return x;
                        const other = x.id === el.id ? o.name : el.name;
                        const list = (x.conflicts ?? []).filter((n) => n !== other);
                        return { ...x, conflicts: on ? [...list, other] : list };
                      }) }));
                    }} /> {o.displayName}
                </label>
              ))}
            </div>
          </Field>
        )}
        <ChipList label="Also these items" values={el.extraItems} onChange={(extraItems) => patch({ extraItems })} kind="item" help="Your own tools, weapons and armour are matched by type automatically." />
      </Section>

      <Section title="Effects" hint="Numbers are for level I. “Per level” is added for each level above that.">
        {el.effects.map((fx, i) => {
          const unit = UNITS[fx.type];
          return (
            <div className="rule-card" key={fx.id}>
              <div className="rule-when">
                <Select label="When" value={fx.when} onChange={(when) => setFx(i, { when, type: TYPES[when][0].value })} options={[
                  { value: "hit", label: "It hits a mob" }, { value: "break", label: "It breaks a block" }, { value: "equipped", label: "Worn or held" },
                ]} />
                <Select label="Does" value={fx.type} onChange={(type) => setFx(i, { type })} options={TYPES[fx.when]} />
                {(fx.type === "effect" || fx.type === "self_effect") && (
                  <Select label="Effect" value={fx.effect ?? ""} onChange={(effect) => setFx(i, { effect })} options={[{ value: "", label: "Choose…" }, ...EFFECTS.map((e) => ({ value: e, label: e.replace(/_/g, " ") }))]} />
                )}
                {fx.type === "procedure" && (
                  <Select label="Procedure" value={fx.procedure ?? ""} onChange={(procedure) => setFx(i, { procedure })}
                    options={[{ value: "", label: procedures.length ? "Choose…" : "No procedures yet" }, ...procedures.map((p) => ({ value: p.name, label: p.displayName }))]}
                    help="It gets the player, the target or block, and {level}. Give it the “Run manually” trigger." />
                )}
              </div>
              <div className="rule-then">
                {unit && fx.when !== "equipped" && (
                  <Grid>
                    <Num label={unit.label} suffix={unit.unit} step={0.5} value={fx.amount} onChange={(amount) => setFx(i, { amount })} />
                    <Num label="Per level" step={0.5} value={fx.perLevel} onChange={(perLevel) => setFx(i, { perLevel })} />
                  </Grid>
                )}
                {(fx.type === "effect" || fx.type === "self_effect") && (
                  <Toggle label="Stronger at higher levels" value={!!fx.stronger} onChange={(stronger) => setFx(i, { stronger })} help="Level II gives effect level II, and so on." />
                )}
                {unit && fx.when !== "equipped" && (
                  <p className="field-help">{levels.map((lv) => `${roman(lv)}: ${unit.fmt(Math.round((fx.amount + fx.perLevel * (lv - 1)) * 100) / 100)}`).join(" · ")}</p>
                )}
              </div>
              <button type="button" className="btn ghost small" onClick={() => patch({ effects: el.effects.filter((_, k) => k !== i) })}>Remove effect</button>
            </div>
          );
        })}
        <button type="button" className="btn small" onClick={() => patch({ effects: [...el.effects, { id: uid(), when: "hit", type: "damage", amount: 2, perLevel: 1 }] })}>Add effect</button>
      </Section>

      <Section title="Getting it">
        <Toggle label="Enchanted book" value={el.book} onChange={(book) => patch({ book })}
          help={`Adds ${project.namespace}:${el.name}_book. Using it lets players pick an item to enchant; using another raises the level. Give it out with recipes, loot tables or trades.`} />
        {el.book && <TexturePicker label="Book icon (optional)" kind="item" value={el.bookTexture || undefined} suggestedName={`${el.name}_book`} onChange={(bookTexture) => patch({ bookTexture })} help="Empty = Minecraft's enchanted book." />}
        <p className="field-help">Procedures can also use the <strong>Enchant held item</strong> step and the <strong>Held item has enchantment</strong> check.</p>
      </Section>
    </>
  );
}
