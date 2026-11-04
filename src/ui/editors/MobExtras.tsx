import type { EntityElement, TradeEntry } from "../../model/types";
import { VANILLA_MOB_SOUNDS } from "../../model/vanilla";
import { VANILLA_PROJECTILES } from "../../export/entityExtras";
import { ChipList, Field, Grid, IdInput, Num, Section, Segmented, Select, Slider, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

const label = (id: string) => id.replace(/^minecraft:/, "").replace(/_/g, " ");

/** Movement, combat style, taming, breeding, riding, trades, sounds and texture variants for preset and Blockbench mobs. */
export function MobExtras({ el, patch }: { el: EntityElement; patch: Patch<EntityElement> }) {
  const project = useStore((s) => s.project!);
  const projectiles = project.elements.filter((e) => e.kind === "projectile");
  const sounds = project.elements.filter((e) => e.kind === "sound");
  const movement = el.movement ?? "walk";
  const attacker = el.behavior !== "passive";
  const tameable = (el.tameItems ?? []).length > 0;
  const trades = el.trades ?? [];
  const setTrade = (i: number, t: Partial<TradeEntry>) => patch({ trades: trades.map((x, k) => (k === i ? { ...x, ...t } : x)) }, `trade-${i}`);
  const variants = el.variants ?? [];
  const sound = el.sounds ?? {};

  return (
    <>
      <Section title="Movement and fighting">
        <Segmented value={movement} onChange={(m) => patch(m === "swim"
          ? { movement: m, populationControl: "water_animal", spawnSurface: false }
          : { movement: m, ...(el.populationControl === "water_animal" ? { populationControl: "animal" as const, spawnSurface: true } : {}) })}
          options={[{ value: "walk", label: "Walks" }, { value: "fly", label: "Flies (like a bee)" }, { value: "swim", label: "Swims (like a fish)" }]} />
        {movement === "swim" && <p className="field-help">Swimmers spawn underwater and count toward water animals.</p>}
        {movement === "fly" && <p className="field-help">Flyers hover around and never take fall damage.</p>}
        {attacker && (
          <>
            <Segmented value={el.attackStyle ?? "melee"} onChange={(attackStyle) => patch({ attackStyle })} options={[
              { value: "melee", label: "Attacks up close" }, { value: "ranged", label: "Shoots from a distance" },
            ]} />
            {el.attackStyle === "ranged" && (
              <Grid>
                <Field label="Shoots">
                  <select value={el.projectile || "minecraft:arrow"} onChange={(e) => patch({ projectile: e.target.value })}>
                    {projectiles.length > 0 && <optgroup label="Your projectiles">{projectiles.map((p) => <option key={p.id} value={p.name}>{p.displayName}</option>)}</optgroup>}
                    <optgroup label="Minecraft's">{VANILLA_PROJECTILES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</optgroup>
                  </select>
                </Field>
                <Num label="Time between shots" suffix="seconds" min={0.25} step={0.25} value={el.attackInterval ?? 2} onChange={(attackInterval) => patch({ attackInterval }, "interval")} help="Skeleton: about 2." />
                <Num label="Shooting range" suffix="blocks" min={2} value={el.attackRange ?? 15} onChange={(attackRange) => patch({ attackRange }, "range")} />
              </Grid>
            )}
            {el.attackStyle === "ranged" && <p className="field-help">Damage comes from the projectile. Your own projectiles set it on their page.</p>}
          </>
        )}
      </Section>

      <Section title="Taming and breeding">
        <ChipList label="Tamed with" values={el.tameItems ?? []} onChange={(tameItems) => patch({ tameItems })} kind="item" placeholder="no taming"
          help="Feed it one of these to try to tame it. Tamed mobs follow their owner and fight for them." />
        {tameable && (
          <Grid>
            <Slider label="Chance per item" min={1} max={100} value={el.tameChance ?? 33} onChange={(tameChance) => patch({ tameChance }, "tame")} format={(v) => `${v}%`} help="Wolves: 33%." />
            {!el.rideable && movement === "walk" && <Toggle label="Sits when tapped" value={el.canSit ?? true} onChange={(canSit) => patch({ canSit })} />}
          </Grid>
        )}
        <ChipList label="Breeds with" values={el.breedItems ?? []} onChange={(breedItems) => patch({ breedItems })} kind="item" placeholder="no breeding"
          help="Feed two of them one of these and a baby appears. Babies grow up faster when fed." />
        {(el.breedItems ?? []).length > 0 && (
          <Grid>
            <Num label="Babies grow up in" suffix="minutes" min={0.1} step={1} value={el.growMinutes ?? 20} onChange={(growMinutes) => patch({ growMinutes }, "grow")} help="Vanilla animals: 20." />
            {tameable && <Toggle label="Only tamed ones breed" value={!!el.breedNeedsTame} onChange={(breedNeedsTame) => patch({ breedNeedsTame })} />}
          </Grid>
        )}
      </Section>

      <Section title="Riding">
        <Toggle label="Players can ride it" value={!!el.rideable} onChange={(rideable) => patch({ rideable })} />
        {el.rideable && (
          <Grid>
            {movement === "walk" && <Toggle label="Rider steers" value={el.steerable ?? true} onChange={(steerable) => patch({ steerable })} help="Like a horse. Off: it wanders with the rider on, like a pig without a carrot." />}
            {tameable && <Toggle label="Only once tamed" value={!!el.rideNeedsTame} onChange={(rideNeedsTame) => patch({ rideNeedsTame })} />}
            <Slider label="Seat height" min={0} max={4} step={0.05} value={el.seatHeight ?? Math.round(Math.max(0.5, el.height * 0.85) * 100) / 100} onChange={(seatHeight) => patch({ seatHeight }, "seat")} format={(v) => `${v} blocks`} />
          </Grid>
        )}
      </Section>

      <Section title="Trades" hint="Players tap it to open a trading screen, like a villager.">
        {trades.map((t, i) => (
          <div className="trade-row" key={i}>
            <div className="row wrap">
              <Field label="Wants"><IdInput value={t.wants} onChange={(wants) => setTrade(i, { wants })} /></Field>
              <Num label="×" min={1} max={64} value={t.wantsCount} onChange={(wantsCount) => setTrade(i, { wantsCount })} />
              <Field label="And (optional)"><IdInput value={t.wants2 ?? ""} onChange={(wants2) => setTrade(i, { wants2 })} placeholder="nothing else" /></Field>
              {t.wants2 && <Num label="×" min={1} max={64} value={t.wants2Count ?? 1} onChange={(wants2Count) => setTrade(i, { wants2Count })} />}
            </div>
            <div className="row wrap">
              <Field label="Gives"><IdInput value={t.gives} onChange={(gives) => setTrade(i, { gives })} /></Field>
              <Num label="×" min={1} max={64} value={t.givesCount} onChange={(givesCount) => setTrade(i, { givesCount })} />
              <Num label="Uses before restock" min={1} value={t.maxUses} onChange={(maxUses) => setTrade(i, { maxUses })} />
              <button type="button" className="btn ghost small" onClick={() => patch({ trades: trades.filter((_, k) => k !== i) })}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => patch({ trades: [...trades, { wants: "minecraft:emerald", wantsCount: 1, gives: "", givesCount: 1, maxUses: 8 }] })}>Add trade</button>
      </Section>

      <Section title="Sounds" hint="Your own Sound elements or Minecraft's mob sounds.">
        <Grid>
          {(["ambient", "hurt", "death", "step"] as const).map((k) => (
            <Select key={k} label={{ ambient: "Now and then", hurt: "When hurt", death: "When it dies", step: "Footsteps" }[k]} value={sound[k] ?? ""}
              onChange={(v) => patch({ sounds: { ...sound, [k]: v || undefined } })}
              options={[
                { value: "", label: "Default (none)" },
                ...sounds.map((s) => ({ value: s.name, label: `${s.displayName} (yours)` })),
                ...VANILLA_MOB_SOUNDS.map((s) => ({ value: s, label: s })),
                ...(sound[k] && !sounds.some((s) => s.name === sound[k]) && !VANILLA_MOB_SOUNDS.includes(sound[k]!) ? [{ value: sound[k]!, label: `${sound[k]} (missing)` }] : []),
              ]} />
          ))}
        </Grid>
      </Section>

      <Section title="Texture variants" hint="Each one spawns with a random pick between the main texture and these, like cats or rabbits. They use the same layout as the main texture.">
        <div className="tex-grid-slots">
          {variants.map((t, i) => (
            <div className="stack tight" key={i}>
              <TexturePicker label={`Variant ${i + 2}`} kind="entity" template={el.model === "quadruped" ? "mob_quadruped" : "mob_humanoid"} value={t || undefined}
                suggestedName={`${el.name}_variant_${i + 2}`} onChange={(id) => patch({ variants: variants.map((x, k) => (k === i ? id : x)) })} />
              <button type="button" className="btn ghost small" onClick={() => patch({ variants: variants.filter((_, k) => k !== i) })}>Remove</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn small" onClick={() => patch({ variants: [...variants, ""] })}>Add variant</button>
      </Section>
    </>
  );
}
