import { useMemo, useState } from "react";
import { ACTIONS, CONDITIONS, TRIGGERS, actionSpec, conditionSpec, defaultParams, triggerSpec, type ParamSpec } from "../../model/logic";
import { uid } from "../../model/registry";
import type { Action, CommandElement, Condition, ProcedureElement } from "../../model/types";
import { EFFECTS, VANILLA_SOUNDS } from "../../model/vanilla";
import { GenContext } from "../../export/context";
import { genCommands, genProcedure } from "../../export/scripts";
import { useStore } from "../../store/store";
import { Field, IdInput, Num, Section, Select, Text, Toggle } from "../fields";
import type { Patch } from "./types";

interface Slots { target: boolean; block: boolean }

function ParamInput({ spec, value, onChange, slots }: { spec: ParamSpec; value: unknown; onChange: (v: string | number | boolean) => void; slots: Slots }) {
  const project = useStore((s) => s.project!);
  const v = value ?? spec.default;
  switch (spec.kind) {
    case "number":
      return <Num label={spec.label} value={Number(v)} step={0.1} onChange={onChange} />;
    case "bool":
      return <Toggle label={spec.label} value={!!v} onChange={onChange} />;
    case "longtext":
      return (
        <Field label={spec.label} wide>
          <textarea className="code" rows={5} spellCheck={false} value={String(v)} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "item": case "block": case "entity":
      return <Field label={spec.label}><IdInput kind={spec.kind} value={String(v)} onChange={onChange} /></Field>;
    case "effect":
      return <Select label={spec.label} value={String(v)} onChange={onChange} options={EFFECTS} />;
    case "sound": {
      const custom = project.elements.filter((e) => e.kind === "sound").map((e) => `${project.namespace}.${e.name}`);
      return (
        <Field label={spec.label}>
          <input className="mono" list="bc-sounds" value={String(v)} onChange={(e) => onChange(e.target.value)} />
          <datalist id="bc-sounds">{[...custom, ...VANILLA_SOUNDS].map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
      );
    }
    case "who":
      return <Select label={spec.label} value={String(v)} onChange={onChange} options={[
        { value: "player", label: "the player" }, ...(slots.target || v === "target" ? [{ value: "target", label: "the target entity" }] : []),
      ]} />;
    case "at":
      return <Select label={spec.label} value={String(v)} onChange={onChange} options={[
        { value: "player", label: "at the player" },
        ...(slots.target || v === "target" ? [{ value: "target", label: "at the target" }] : []),
        ...(slots.block || v === "block" ? [{ value: "block", label: "at the block" }] : []),
      ]} />;
    case "select":
      return <Select label={spec.label} value={String(v)} onChange={onChange} options={spec.options ?? []} />;
    default:
      return <Text label={spec.label} value={String(v)} onChange={onChange} />;
  }
}

function usesMissingSlot(params: Record<string, unknown>, slots: Slots) {
  return Object.values(params).some((v) => (v === "target" && !slots.target) || (v === "block" && !slots.block));
}

function ConditionList({ conditions, onChange, slots }: { conditions: Condition[]; onChange: (c: Condition[]) => void; slots: Slots }) {
  const set = (i: number, c: Partial<Condition>) => onChange(conditions.map((x, k) => (k === i ? { ...x, ...c } : x)));
  return (
    <div className="logic-list">
      {conditions.map((c, i) => {
        const spec = conditionSpec(c.type);
        return (
          <div className="logic-card cond" key={c.id}>
            <div className="logic-head">
              <span className="logic-tag">{i === 0 ? "Only if" : "and"}</span>
              <select value={c.negate ? "not" : "is"} onChange={(e) => set(i, { negate: e.target.value === "not" })} aria-label="Condition mode">
                <option value="is">it's true that</option>
                <option value="not">it's NOT true that</option>
              </select>
              <select value={c.type} onChange={(e) => { const s = conditionSpec(e.target.value)!; set(i, { type: s.type, params: defaultParams(s.params) }); }} aria-label="Condition">
                {CONDITIONS.map((s) => <option key={s.type} value={s.type}>{s.label.toLowerCase()}</option>)}
              </select>
              <span className="spacer" />
              <button type="button" className="btn ghost small" onClick={() => onChange(conditions.filter((_, k) => k !== i))}>Remove</button>
            </div>
            {spec && spec.params.length > 0 && (
              <div className="logic-params">
                {spec.params.map((p) => <ParamInput key={p.key} spec={p} value={c.params[p.key]} slots={slots} onChange={(v) => set(i, { params: { ...c.params, [p.key]: v } })} />)}
              </div>
            )}
            {usesMissingSlot(c.params, slots) && <p className="warn-text">This trigger has no target or block. Pick “the player” instead.</p>}
          </div>
        );
      })}
      <AddMenu label="Add condition" groups={[{ name: "", items: CONDITIONS.map((c) => ({ value: c.type, label: c.label })) }]}
        onPick={(t) => { const s = conditionSpec(t)!; onChange([...conditions, { id: uid(), type: t, params: defaultParams(s.params), negate: false }]); }} />
    </div>
  );
}

function ActionList({ actions, onChange, slots }: { actions: Action[]; onChange: (a: Action[]) => void; slots: Slots }) {
  const set = (i: number, a: Partial<Action>) => onChange(actions.map((x, k) => (k === i ? { ...x, ...a } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= actions.length) return;
    const next = [...actions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const groups = ["Chat & screen", "Entities", "Items", "World", "Advanced"].map((g) => ({
    name: g, items: ACTIONS.filter((a) => a.group === g).map((a) => ({ value: a.type, label: a.label })),
  }));
  return (
    <div className="logic-list">
      {actions.map((a, i) => {
        const spec = actionSpec(a.type);
        return (
          <div className="logic-card act" key={a.id}>
            <div className="logic-head">
              <span className="logic-step mono">{i + 1}</span>
              <select value={a.type} onChange={(e) => { const s = actionSpec(e.target.value)!; set(i, { type: s.type, params: defaultParams(s.params) }); }} aria-label="Action">
                {groups.map((g) => <optgroup key={g.name} label={g.name}>{g.items.map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}</optgroup>)}
              </select>
              <span className="chance">
                <input type="number" min={0} max={100} value={a.chance} onChange={(e) => set(i, { chance: Math.max(0, Math.min(100, Number(e.target.value))) })} aria-label="Chance percent" />
                <span>% chance</span>
              </span>
              <span className="spacer" />
              <button type="button" className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" className="btn ghost small" onClick={() => move(i, 1)} disabled={i === actions.length - 1} aria-label="Move down">↓</button>
              <button type="button" className="btn ghost small" onClick={() => onChange(actions.filter((_, k) => k !== i))}>Remove</button>
            </div>
            {spec && spec.params.length > 0 && (
              <div className="logic-params">
                {spec.params.map((p) => <ParamInput key={p.key} spec={p} value={a.params[p.key]} slots={slots} onChange={(v) => set(i, { params: { ...a.params, [p.key]: v } })} />)}
              </div>
            )}
            {usesMissingSlot(a.params, slots) && <p className="warn-text">This trigger has no target or block, so this step will be skipped.</p>}
          </div>
        );
      })}
      <AddMenu label="Add action" groups={groups}
        onPick={(t) => { const s = actionSpec(t)!; onChange([...actions, { id: uid(), type: t, params: defaultParams(s.params), chance: 100 }]); }} />
    </div>
  );
}

function AddMenu({ label, groups, onPick }: { label: string; groups: { name: string; items: { value: string; label: string }[] }[]; onPick: (v: string) => void }) {
  return (
    <select className="btn add-menu" value="" onChange={(e) => { if (e.target.value) onPick(e.target.value); }} aria-label={label}>
      <option value="">+ {label}…</option>
      {groups.map((g) => g.name
        ? <optgroup key={g.name} label={g.name}>{g.items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}</optgroup>
        : g.items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>))}
    </select>
  );
}

function CodePreview({ build }: { build: () => string }) {
  const [open, setOpen] = useState(false);
  const code = useMemo(() => (open ? build() : ""), [open, build]);
  return (
    <div className="code-preview">
      <button type="button" className="btn small ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide" : "Show"} generated JavaScript
      </button>
      {open && <pre className="code-block"><code>{code}</code></pre>}
    </div>
  );
}

export function ProcedureEditor({ el, patch }: { el: ProcedureElement; patch: Patch<ProcedureElement> }) {
  const project = useStore((s) => s.project!);
  const trig = triggerSpec(el.trigger);
  const slots = trig.has;
  const build = () => {
    const ctx = new GenContext(project);
    genProcedure(ctx, el);
    return ctx.script.sections.join("\n");
  };
  return (
    <>
      <Section title="When">
        <Select label="Trigger" value={el.trigger} onChange={(trigger) => patch({ trigger })} options={TRIGGERS.map((t) => ({ value: t.type, label: t.label }))} help={trig.help} />
        {trig.filter && (
          <Field label={`${trig.filter.label} (leave empty for any)`}>
            <IdInput kind={trig.filter.kind} value={el.filter} onChange={(filter) => patch({ filter }, "filter")} placeholder={`any ${trig.filter.kind}`} />
          </Field>
        )}
        {el.trigger === "tick" && <Num label="Every" suffix="ticks" min={1} value={el.intervalTicks} onChange={(intervalTicks) => patch({ intervalTicks }, "ticks")} help="20 ticks = 1 second" />}
      </Section>
      <Section title="Only if" hint="All conditions must be true. Leave empty to always run.">
        <ConditionList conditions={el.conditions} onChange={(conditions) => patch({ conditions })} slots={slots} />
      </Section>
      <Section title="Do" hint="Steps run in order. Text can include {player} and {target}.">
        <ActionList actions={el.actions} onChange={(actions) => patch({ actions })} slots={slots} />
      </Section>
      <CodePreview build={build} />
    </>
  );
}

export function CommandEditor({ el, patch }: { el: CommandElement; patch: Patch<CommandElement> }) {
  const project = useStore((s) => s.project!);
  const slots = { target: false, block: false };
  const build = () => {
    const ctx = new GenContext(project);
    genCommands(ctx, [el]);
    return ctx.script.sections.join("\n");
  };
  return (
    <>
      <Section title="Command" hint={`Players type /${project.namespace}:${el.name}`}>
        <Text label="Description (shown in command suggestions)" wide value={el.description} onChange={(description) => patch({ description }, "desc")} />
        <Select label="Who can use it" value={el.permission} onChange={(permission) => patch({ permission })} options={[
          { value: "any", label: "Everyone" }, { value: "game_directors", label: "Operators (game directors)" },
          { value: "admin", label: "Admins" }, { value: "host", label: "Host only" }, { value: "owner", label: "Owner only" },
        ]} />
        <Toggle label="Requires cheats to be on" value={el.cheatsRequired} onChange={(cheatsRequired) => patch({ cheatsRequired })} />
      </Section>
      <Section title="Only if">
        <ConditionList conditions={el.conditions} onChange={(conditions) => patch({ conditions })} slots={slots} />
      </Section>
      <Section title="Do">
        <ActionList actions={el.actions} onChange={(actions) => patch({ actions })} slots={slots} />
      </Section>
      <CodePreview build={build} />
    </>
  );
}
