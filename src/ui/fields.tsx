import { useId, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../store/store";
import { identifiersOf } from "../model/registry";
import { VANILLA_ALL, VANILLA_BLOCKS, VANILLA_ENTITIES } from "../model/vanilla";

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {hint && <p className="hint">{hint}</p>}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function Field({ label, help, children, wide }: { label: string; help?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field${wide ? " wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}

export function Text({ label, value, onChange, help, placeholder, wide, mono }: {
  label: string; value: string; onChange: (v: string) => void; help?: string; placeholder?: string; wide?: boolean; mono?: boolean;
}) {
  return (
    <Field label={label} help={help} wide={wide}>
      <input className={mono ? "mono" : ""} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Num({ label, value, onChange, help, min, max, step = 1, suffix }: {
  label: string; value: number; onChange: (v: number) => void; help?: string; min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <Field label={label} help={help}>
      <span className="num">
        <input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
    </Field>
  );
}

export function Slider({ label, value, onChange, min, max, step = 1, help, format }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; help?: string; format?: (v: number) => string;
}) {
  return (
    <Field label={label} help={help}>
      <span className="slider">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{format ? format(value) : value}</output>
      </span>
    </Field>
  );
}

export function Toggle({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span className="toggle-text">
        <span>{label}</span>
        {help && <span className="field-help">{help}</span>}
      </span>
    </label>
  );
}

export function Select<T extends string>({ label, value, onChange, options, help }: {
  label: string; value: T; onChange: (v: T) => void; options: readonly (T | { value: T; label: string })[]; help?: string;
}) {
  return (
    <Field label={label} help={help}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o.replace(/_/g, " ") : o.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <span className="color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input className="mono" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </Field>
  );
}

export type IdKind = "item" | "block" | "entity";

/** Every custom identifier in the project, so pickers can suggest them first. */
export function useCustomIds(kind: IdKind) {
  const project = useStore((s) => s.project);
  return useMemo(() => {
    if (!project) return [];
    const ns = project.namespace;
    return project.elements.flatMap((el) => {
      if (kind === "entity") return el.kind === "entity" ? [`${ns}:${el.name}`] : [];
      if (kind === "block") return el.kind === "block" || el.kind === "plant" ? [`${ns}:${el.name}`] : [];
      return el.kind === "entity" ? [] : identifiersOf(el, ns);
    });
  }, [project, kind]);
}

export function IdInput({ value, onChange, kind = "item", placeholder, onEnter }: {
  value: string; onChange: (v: string) => void; kind?: IdKind; placeholder?: string; onEnter?: (v: string) => void;
}) {
  const listId = useId();
  const custom = useCustomIds(kind);
  const vanilla = kind === "entity" ? VANILLA_ENTITIES : kind === "block" ? VANILLA_BLOCKS : VANILLA_ALL;
  const ns = useStore((s) => s.project?.namespace);
  const fixup = (v: string) => {
    const t = v.trim().toLowerCase();
    if (t && !t.includes(":")) {
      // "ruby" -> "myns:ruby" if it exists, otherwise "minecraft:ruby".
      return custom.includes(`${ns}:${t}`) ? `${ns}:${t}` : `minecraft:${t}`;
    }
    return t;
  };
  return (
    <>
      <input className="mono" list={listId} value={value} placeholder={placeholder ?? "minecraft:stick"}
        onChange={(e) => onChange(e.target.value)} onBlur={(e) => onChange(fixup(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(fixup(e.currentTarget.value)); } }} />
      <datalist id={listId}>
        {custom.map((id) => <option key={id} value={id}>Your add-on</option>)}
        {vanilla.map((id) => <option key={id} value={id} />)}
      </datalist>
    </>
  );
}

export function IdField({ label, value, onChange, kind, help }: { label: string; value: string; onChange: (v: string) => void; kind?: IdKind; help?: string }) {
  return (
    <Field label={label} help={help}>
      <IdInput value={value} onChange={onChange} kind={kind} />
    </Field>
  );
}

/** Editable list of short strings (ids or tags) shown as chips. */
export function ChipList({ label, values, onChange, kind, suggestions, help, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; kind?: IdKind; suggestions?: string[]; help?: string; placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const add = (v: string) => {
    const t = v.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  };
  return (
    <div className="field wide">
      <span className="field-label">{label}</span>
      <div className="chips">
        {values.map((v) => (
          <span className="chip" key={v}>
            <span className="mono">{v}</span>
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
          </span>
        ))}
        <span className="chip-add">
          {kind ? (
            <IdInput value={draft} onChange={setDraft} onEnter={add} kind={kind} placeholder={placeholder ?? "add…"} />
          ) : (
            <>
              <input className="mono" list={listId} value={draft} placeholder={placeholder ?? "add…"} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }} />
              <datalist id={listId}>{suggestions?.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          )}
          <button type="button" className="btn small" onClick={() => add(draft)} disabled={!draft.trim()}>Add</button>
        </span>
      </div>
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>;
}
