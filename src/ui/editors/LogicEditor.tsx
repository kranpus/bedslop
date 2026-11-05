import { useMemo, useState } from "react";
import { ACTIONS, CONDITIONS, TRIGGERS, actionSpec, conditionSpec, defaultParams, triggerSpec, type ParamSpec } from "../../model/logic";
import { uid } from "../../model/registry";
import type { Action, CommandArg, CommandArgType, CommandElement, Condition, ProcedureElement } from "../../model/types";
import { EFFECTS, VANILLA_GAMERULES, VANILLA_PARTICLES, VANILLA_SOUNDS } from "../../model/vanilla";
import { GenContext } from "../../export/context";
import { genCommands, genProcedure } from "../../export/scripts";
import { useStore } from "../../store/store";
import { ChipList, Field, IdInput, Num, Section, Segmented, Select, Text, Toggle } from "../fields";
import { BlocklyEditor } from "../BlocklyEditor";
import { simpleToWorkspace } from "../../export/blocks";
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
    case "objective": {
      const names = (project.scoreboards ?? []).map((b) => b.name);
      return (
        <Field label={spec.label}>
          <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
            <option value="">{names.length ? "Choose…" : "Add one on the Variables tab"}</option>
            {(project.scoreboards ?? []).map((b) => <option key={b.id} value={b.name}>{b.title || b.name} ({b.name})</option>)}
            {v && !names.includes(String(v)) && <option value={String(v)}>{String(v)} (not on the Variables tab)</option>}
          </select>
        </Field>
      );
    }
    case "particle": {
      const own = project.elements.filter((e) => e.kind === "particle");
      const known = !v || own.some((e) => e.name === v) || VANILLA_PARTICLES.includes(String(v));
      return (
        <Field label={spec.label}>
          <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {own.length > 0 && <optgroup label="Your particle effects">{own.map((e) => <option key={e.id} value={e.name}>{e.displayName}</option>)}</optgroup>}
            <optgroup label="Minecraft's">{VANILLA_PARTICLES.map((id) => <option key={id} value={id}>{id.replace("minecraft:", "").replace(/_/g, " ")}</option>)}</optgroup>
            {!known && <option value={String(v)}>{String(v)} (missing)</option>}
          </select>
        </Field>
      );
    }
    case "hud": {
      const own = project.elements.filter((e) => e.kind === "hud" && e.mode === "overlay");
      return (
        <Field label={spec.label}>
          <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
            <option value="">{own.length ? "Choose…" : "No overlays yet (make a HUD / screen set to Overlay)"}</option>
            {own.map((e) => <option key={e.id} value={e.name}>{e.displayName}</option>)}
            {v && !own.some((e) => e.name === v) && <option value={String(v)}>{String(v)} (missing)</option>}
          </select>
        </Field>
      );
    }
    case "gamerule": {
      const own = project.gameRules ?? [];
      const known = !v || own.some((r) => r.name === v) || VANILLA_GAMERULES.some(([n]) => n === v);
      return (
        <Field label={spec.label}>
          <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {own.length > 0 && <optgroup label="Your game rules">{own.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}</optgroup>}
            <optgroup label="Minecraft's">{VANILLA_GAMERULES.map(([n, t]) => <option key={n} value={n}>{n}{t === "number" ? " (number)" : ""}</option>)}</optgroup>
            {!known && <option value={String(v)}>{String(v)} (missing)</option>}
          </select>
        </Field>
      );
    }
    case "achievement": {
      const own = project.elements.filter((e) => e.kind === "achievement");
      return (
        <Field label={spec.label}>
          <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
            <option value="">{own.length ? "Choose…" : "No achievements yet"}</option>
            {own.map((e) => <option key={e.id} value={e.name}>{e.displayName}</option>)}
            {v && !own.some((e) => e.name === v) && <option value={String(v)}>{String(v)} (missing)</option>}
          </select>
        </Field>
      );
    }
    case "custom_effect": {
      const own = project.elements.filter((e) => e.kind === "effect");
      return (
        <Field label={spec.label}>
          <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
            <option value="">{own.length ? "Choose…" : "No custom effects yet"}</option>
            {own.map((e) => <option key={e.id} value={e.name}>{e.displayName}</option>)}
            {v && !own.some((e) => e.name === v) && <option value={String(v)}>{String(v)} (missing)</option>}
          </select>
        </Field>
      );
    }
    case "variable": case "procedure": case "form": case "structure": case "enchantment": {
      const names = spec.kind === "variable"
        ? (project.variables ?? []).map((x) => x.name)
        : project.elements.filter((e) => e.kind === spec.kind).map((e) => e.name);
      const empty = { variable: "Add one on the Variables tab", procedure: "No procedures yet", form: "No forms yet", structure: "No structures yet", enchantment: "No enchantments yet" }[spec.kind];
      return (
        <Field label={spec.label}>
          <select value={String(v)} onChange={(e) => onChange(e.target.value)}>
            <option value="">{names.length ? "Choose…" : empty}</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
            {v && !names.includes(String(v)) && <option value={String(v)}>{String(v)} (missing)</option>}
          </select>
        </Field>
      );
    }
    default:
      return <Text label={spec.label} value={String(v)} onChange={onChange} />;
  }
}

function usesMissingSlot(params: Record<string, unknown>, slots: Slots) {
  return Object.values(params).some((v) => (v === "target" && !slots.target) || (v === "block" && !slots.block));
}

export function ConditionList({ conditions, onChange, slots }: { conditions: Condition[]; onChange: (c: Condition[]) => void; slots: Slots }) {
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

export function ActionList({ actions, onChange, slots }: { actions: Action[]; onChange: (a: Action[]) => void; slots: Slots }) {
  const set = (i: number, a: Partial<Action>) => onChange(actions.map((x, k) => (k === i ? { ...x, ...a } : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= actions.length) return;
    const next = [...actions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const groups = [...new Set(ACTIONS.map((a) => a.group))].map((g) => ({
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

type LogicPatch = (p: { editor?: "simple" | "blocks"; blocks?: string }, key?: string) => void;

function EditorSwitch({ el, patch }: { el: ProcedureElement | CommandElement; patch: LogicPatch }) {
  const mode = el.editor ?? "simple";
  return (
    <div className="row between editor-switch">
      <Segmented value={mode} onChange={(editor) => {
        // First switch to blocks: carry the simple steps over.
        if (editor === "blocks" && !el.blocks) patch({ editor, blocks: simpleToWorkspace(el.conditions, el.actions) });
        else patch({ editor });
      }} options={[{ value: "simple", label: "Simple steps" }, { value: "blocks", label: "Blocks" }]} />
      <span className="field-help">{mode === "blocks" ? "Drag blocks from the left. Use variables, loops, math and waits." : "A list of conditions and steps. Switch to Blocks for loops, variables and math."}</span>
    </div>
  );
}

function BlocksSection({ el, patch, isCommand }: { el: ProcedureElement | CommandElement; patch: LogicPatch; isCommand?: boolean }) {
  const project = useStore((s) => s.project!);
  const setView = useStore((s) => s.setView);
  return (
    <Section title="Blocks" hint="Text can include {player}, {target}, {variable names} and {argument names}.">
      <BlocklyEditor
        resetKey={el.id}
        value={el.blocks ?? ""}
        onChange={(blocks) => patch({ blocks }, "blocks")}
        variables={(project.variables ?? []).map((v) => v.name)}
        procedures={project.elements.filter((e) => e.kind === "procedure" && e.id !== el.id).map((e) => e.name)}
        forms={project.elements.filter((e) => e.kind === "form").map((e) => e.name)}
        structures={project.elements.filter((e) => e.kind === "structure").map((e) => e.name)}
        particles={project.elements.filter((e) => e.kind === "particle").map((e) => e.name)}
        enchantments={project.elements.filter((e) => e.kind === "enchantment").map((e) => e.name)}
        objectives={(project.scoreboards ?? []).map((b) => b.name)}
        effects={project.elements.filter((e) => e.kind === "effect").map((e) => e.name)}
        overlays={project.elements.filter((e) => e.kind === "hud" && e.mode === "overlay").map((e) => e.name)}
        achievements={project.elements.filter((e) => e.kind === "achievement").map((e) => e.name)}
        rules={(project.gameRules ?? []).map((r) => r.name)}
        args={isCommand ? ((el as CommandElement).args ?? []).map((a) => a.name) : []}
        isCommand={isCommand}
      />
      <button type="button" className="btn small ghost" onClick={() => setView("variables")}>Manage global variables…</button>
    </Section>
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
      <EditorSwitch el={el} patch={patch as never} />
      {(el.editor ?? "simple") === "blocks" ? (
        <BlocksSection el={el} patch={patch as never} />
      ) : (
        <>
          <Section title="Only if" hint="All conditions must be true. Leave empty to always run.">
            <ConditionList conditions={el.conditions} onChange={(conditions) => patch({ conditions })} slots={slots} />
          </Section>
          <Section title="Do" hint="Steps run in order. Text can include {player}, {target} and {variable names}.">
            <ActionList actions={el.actions} onChange={(actions) => patch({ actions })} slots={slots} />
          </Section>
        </>
      )}
      <CodePreview build={build} />
    </>
  );
}

const ARG_TYPES: { value: CommandArgType; label: string }[] = [
  { value: "integer", label: "Whole number" }, { value: "float", label: "Decimal number" }, { value: "string", label: "Text" },
  { value: "boolean", label: "true / false" }, { value: "player", label: "Player (becomes the target)" },
  { value: "item", label: "Item (its id)" }, { value: "block", label: "Block (its id)" }, { value: "entity_type", label: "Mob type (its id)" },
  { value: "enum", label: "One of a list" },
];

export function CommandEditor({ el, patch }: { el: CommandElement; patch: Patch<CommandElement> }) {
  const project = useStore((s) => s.project!);
  const slots = { target: (el.args ?? []).some((a) => a.type === "player"), block: false };
  const args = el.args ?? [];
  const setArg = (i: number, p: Partial<CommandArg>, key?: string) => patch({ args: args.map((a, k) => (k === i ? { ...a, ...p } : a)) }, key);
  const usage = `/${project.namespace}:${el.name}${[...args].sort((a, b) => Number(a.optional) - Number(b.optional)).map((a) => (a.optional ? ` [${a.name}]` : ` <${a.name}>`)).join("")}`;
  const build = () => {
    const ctx = new GenContext(project);
    genCommands(ctx, [el]);
    return ctx.script.sections.join("\n");
  };
  return (
    <>
      <Section title="Command" hint={`Players type ${usage}`}>
        <Text label="Description (shown in command suggestions)" wide value={el.description} onChange={(description) => patch({ description }, "desc")} />
        <Select label="Who can use it" value={el.permission} onChange={(permission) => patch({ permission })} options={[
          { value: "any", label: "Everyone" }, { value: "game_directors", label: "Operators (game directors)" },
          { value: "admin", label: "Admins" }, { value: "host", label: "Host only" }, { value: "owner", label: "Owner only" },
        ]} />
        <Toggle label="Requires cheats to be on" value={el.cheatsRequired} onChange={(cheatsRequired) => patch({ cheatsRequired })} />
      </Section>
      <Section title="Arguments" hint="Values typed after the command. Use them in text as {name}, or with the “argument” block.">
        {args.map((a, i) => (
          <div className="row effect-row" key={a.id}>
            <Field label="Name"><input className="mono" value={a.name} onChange={(e) => setArg(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }, `arg-${a.id}`)} /></Field>
            <Select label="Type" value={a.type} onChange={(type) => setArg(i, { type, ...(type === "enum" && !a.options?.length ? { options: ["easy", "hard"] } : {}) })} options={ARG_TYPES} />
            <Toggle label="Optional" value={a.optional} onChange={(optional) => setArg(i, { optional })} />
            <button type="button" className="btn ghost small" onClick={() => patch({ args: args.filter((_, k) => k !== i) })}>Remove</button>
            {a.type === "enum" && (
              <ChipList label="Options" values={a.options ?? []} onChange={(options) => setArg(i, { options: options.map((o) => o.toLowerCase().replace(/[^a-z0-9_]/g, "_")) })}
                placeholder="add option…" help="Players pick one with tab completion." />
            )}
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => patch({ args: [...args, { id: uid(), name: `arg${args.length + 1}`, type: "integer", optional: false }] })}>Add argument</button>
      </Section>
      <EditorSwitch el={el} patch={patch as never} />
      {(el.editor ?? "simple") === "blocks" ? (
        <BlocksSection el={el} patch={patch as never} isCommand />
      ) : (
        <>
          <Section title="Only if">
            <ConditionList conditions={el.conditions} onChange={(conditions) => patch({ conditions })} slots={slots} />
          </Section>
          <Section title="Do">
            <ActionList actions={el.actions} onChange={(actions) => patch({ actions })} slots={slots} />
          </Section>
        </>
      )}
      <CodePreview build={build} />
    </>
  );
}
