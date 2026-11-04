import type { AchievementElement, AchievementTrigger } from "../../model/types";
import { useStore } from "../../store/store";
import { Field, Grid, IdField, Num, Section, Segmented, Select, Text, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import type { Patch } from "./types";

const TRIGGERS: { value: AchievementTrigger; label: string }[] = [
  { value: "obtain_item", label: "Get an item" },
  { value: "break_block", label: "Break blocks" },
  { value: "place_block", label: "Place blocks" },
  { value: "kill_mob", label: "Defeat mobs" },
  { value: "use_item", label: "Use an item" },
  { value: "variable", label: "A variable reaches a number" },
  { value: "score", label: "A score reaches a number" },
  { value: "dimension", label: "Enter a dimension" },
  { value: "manual", label: "Only from a procedure" },
];

const HEAD = { task: ["Advancement Made!", "#ffff55"], goal: ["Goal Reached!", "#ffff55"], challenge: ["Challenge Complete!", "#ff55ff"] } as const;

/** How many / what value, per trigger. */
const COUNT_LABEL: Partial<Record<AchievementTrigger, string>> = {
  obtain_item: "How many at once", break_block: "How many", place_block: "How many", kill_mob: "How many", use_item: "How many times",
  variable: "Reaches at least", score: "Reaches at least",
};

export function AchievementEditor({ el, patch }: { el: AchievementElement; patch: Patch<AchievementElement> }) {
  const project = useStore((s) => s.project!);
  const others = project.elements.filter((e): e is AchievementElement => e.kind === "achievement" && e.id !== el.id);
  const procedures = project.elements.filter((e) => e.kind === "procedure");
  const icon = project.textures.find((t) => t.id === el.icon)?.dataUrl;
  const [head, color] = HEAD[el.frame];
  const anyOk = el.trigger === "break_block" || el.trigger === "place_block" || el.trigger === "kill_mob" || el.trigger === "use_item";

  return (
    <>
      <Section title="Achievement" hint="Bedrock has no custom achievements, so this one is tracked per player by the add-on's script. Earning it shows a toast in the top right.">
        <div className="split">
          <div className="stack">
            <Text label="Description" value={el.description} onChange={(description) => patch({ description }, "desc")} />
            <Segmented value={el.frame} onChange={(frame) => patch({ frame })} options={[
              { value: "task", label: "Advancement" }, { value: "goal", label: "Goal" }, { value: "challenge", label: "Challenge" },
            ]} />
            <Select label="Comes after" value={el.parent} onChange={(parent) => patch({ parent })}
              options={[{ value: "", label: "Nothing (starts a new tree)" }, ...others.map((o) => ({ value: o.name, label: o.displayName }))]}
              help="Where it sits in the achievements list. It can still be earned in any order." />
          </div>
          <div className="adv-toast" aria-label="Toast preview">
            {icon && <img className="pixel" src={icon} alt="" />}
            <div><div style={{ color }}>{head}</div><div>{el.displayName}</div></div>
          </div>
        </div>
        <TexturePicker label="Icon" kind="item" value={el.icon || undefined} suggestedName={`${el.name}_icon`} onChange={(i) => patch({ icon: i })} help="Shown in the toast and the achievements list." />
        <Toggle label="Secret" value={el.secret} onChange={(secret) => patch({ secret })} help="Shows as ??? in the list until it's earned." />
        <Toggle label="Tell everyone in chat" value={el.announce} onChange={(announce) => patch({ announce })} help={`“Steve ${el.frame === "challenge" ? "has completed the challenge" : el.frame === "goal" ? "has reached the goal" : "has made the advancement"} [${el.displayName}]”`} />
      </Section>

      <Section title="How it's earned">
        <Select label="When the player…" value={el.trigger} onChange={(trigger) => patch({ trigger, target: trigger === "dimension" ? "minecraft:nether" : trigger === "variable" || trigger === "score" || trigger === "manual" ? "" : el.target })} options={TRIGGERS} />
        <Grid>
          {(el.trigger === "obtain_item" || el.trigger === "use_item") && <IdField label="Item" kind="item" value={el.target} onChange={(target) => patch({ target }, "target")} help={el.trigger === "use_item" ? "Empty = any item." : undefined} />}
          {(el.trigger === "break_block" || el.trigger === "place_block") && <IdField label="Block" kind="block" value={el.target} onChange={(target) => patch({ target }, "target")} help="Empty = any block." />}
          {el.trigger === "kill_mob" && <IdField label="Mob" kind="entity" value={el.target} onChange={(target) => patch({ target }, "target")} help="Empty = any mob." />}
          {el.trigger === "variable" && (
            <Select label="Variable" value={el.target} onChange={(target) => patch({ target })}
              options={[{ value: "", label: (project.variables ?? []).length ? "Choose…" : "Add one on the Variables tab" }, ...(project.variables ?? []).map((v) => ({ value: v.name, label: v.name }))]} />
          )}
          {el.trigger === "score" && (
            <Select label="Scoreboard" value={el.target} onChange={(target) => patch({ target })}
              options={[{ value: "", label: (project.scoreboards ?? []).length ? "Choose…" : "Add one on the Variables tab" }, ...(project.scoreboards ?? []).map((b) => ({ value: b.name, label: b.title || b.name }))]} />
          )}
          {el.trigger === "dimension" && (
            <Select label="Dimension" value={el.target} onChange={(target) => patch({ target })} options={[
              { value: "minecraft:nether", label: "The Nether" }, { value: "minecraft:the_end", label: "The End" }, { value: "minecraft:overworld", label: "The Overworld" },
            ]} />
          )}
          {COUNT_LABEL[el.trigger] && <Num label={COUNT_LABEL[el.trigger]!} min={1} value={el.count} onChange={(count) => patch({ count }, "count")} />}
        </Grid>
        {anyOk && !el.target && <p className="field-help">Counts any {el.trigger === "kill_mob" ? "mob" : el.trigger === "use_item" ? "item" : "block"}.</p>}
        <p className="field-help">Procedures can also <strong>Give achievement</strong>, <strong>Take away achievement</strong>, check <strong>Player has achievement</strong> and <strong>Show achievements list</strong> (a menu with progress, e.g. from a command).</p>
      </Section>

      <Section title="Rewards">
        <Grid>
          <Num label="Experience" suffix="XP" min={0} value={el.rewardXp} onChange={(rewardXp) => patch({ rewardXp }, "xp")} />
          <IdField label="Item (optional)" kind="item" value={el.rewardItem} onChange={(rewardItem) => patch({ rewardItem }, "item")} />
          {el.rewardItem && <Num label="How many" min={1} value={el.rewardCount} onChange={(rewardCount) => patch({ rewardCount }, "n")} />}
          <Field label="Run a procedure (optional)" help="It gets the player. Give it the “Run manually” trigger.">
            <select value={el.rewardProcedure} onChange={(e) => patch({ rewardProcedure: e.target.value })}>
              <option value="">{procedures.length ? "None" : "No procedures yet"}</option>
              {procedures.map((p) => <option key={p.id} value={p.name}>{p.displayName}</option>)}
            </select>
          </Field>
        </Grid>
      </Section>
    </>
  );
}
