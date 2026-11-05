import { uid } from "../../model/registry";
import type { FormButton, FormElement, FormField, FormLayout } from "../../model/types";
import { GenContext } from "../../export/context";
import { genForm } from "../../export/forms";
import { useStore } from "../../store/store";
import { Color, Field, Grid, Num, Section, Segmented, Select, Slider, Text, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { ActionList } from "./LogicEditor";
import type { Patch } from "./types";

const noSlots = { target: false, block: false };

export const DEFAULT_LAYOUT: FormLayout = {
  style: "grid", columns: 3, tileWidth: 64, tileHeight: 56, iconSize: 24, width: 225, height: 200, showBody: true, textColor: "#4c4c4c", titleColor: "#ffffff",
};

/** The grid layout at Minecraft's GUI scale (about 1.2× so it's readable). */
function GridPreview({ el, l }: { el: FormElement; l: FormLayout }) {
  const textures = useStore((s) => s.project!.textures);
  const url = (id?: string) => (id ? textures.find((t) => t.id === id)?.dataUrl : undefined);
  const bg = url(l.background);
  const k = Math.min(1.3, 320 / l.width);
  const px = (n: number) => `${n * k}px`;
  return (
    <div className={`form-grid-preview${bg ? " own-bg" : ""}`} aria-label="Form preview"
      style={{ width: px(l.width), height: px(l.height), backgroundImage: bg ? `url(${bg})` : undefined }}>
      <div className="form-grid-title" style={{ color: bg ? l.titleColor || "#fff" : undefined, height: px(bg ? 22 : 18) }}>{el.title || "Untitled"}<span className="form-grid-x">✕</span></div>
      <div className="form-grid-scroll">
        {l.showBody && el.body && <p className="form-grid-body" style={{ color: bg ? l.titleColor || "#fff" : "#fff" }}>{el.body}</p>}
        <div className="form-grid-tiles" style={{ width: px(l.columns * l.tileWidth), gridTemplateColumns: `repeat(${l.columns}, ${px(l.tileWidth)})` }}>
          {el.buttons.map((b) => (
            <div key={b.id} className="form-grid-tile" style={{ height: px(l.tileHeight) }}>
              <span className="form-grid-btn">
                {url(b.icon) ? <img className="pixel" src={url(b.icon)} alt="" style={{ width: px(l.iconSize), height: px(l.iconSize) }} /> : <span style={{ height: px(l.iconSize) }} />}
                <span className="form-grid-label" style={{ color: l.textColor || "#4c4c4c" }}>{b.text || " "}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mock of how the form looks in game, so layout is clear before exporting. */
function FormPreview({ el }: { el: FormElement }) {
  const textures = useStore((s) => s.project!.textures);
  const icon = (id: string) => textures.find((t) => t.id === id)?.dataUrl;
  if (el.formType === "menu" && el.layout?.style === "grid") return <GridPreview el={el} l={el.layout} />;
  return (
    <div className="form-preview" aria-label="Form preview">
      <div className="form-title">{el.title || "Untitled"}</div>
      {el.formType !== "input" && el.body && <p className="form-body">{el.body}</p>}
      {el.formType === "menu" && el.buttons.map((b) => (
        <div key={b.id} className="form-button">{icon(b.icon) && <img className="pixel" src={icon(b.icon)} alt="" />}<span>{b.text || " "}</span></div>
      ))}
      {el.formType === "input" && (
        <>
          {el.fields.map((f) => (
            <div key={f.id} className="form-field">
              <span>{f.label}</span>
              {f.kind === "text" && <span className="form-input">{f.defaultValue || f.placeholder}</span>}
              {f.kind === "slider" && <span className="form-slider"><span style={{ width: `${Math.min(100, Math.max(0, ((Number(f.defaultValue) - f.min) / (f.max - f.min || 1)) * 100))}%` }} /></span>}
              {f.kind === "dropdown" && <span className="form-input">{f.defaultValue || f.options[0] || "–"} ▾</span>}
              {f.kind === "toggle" && <span className={`form-toggle${f.defaultValue === "true" ? " on" : ""}`} />}
            </div>
          ))}
          <div className="form-button">{el.submitText || "Done"}</div>
        </>
      )}
      {el.formType === "confirm" && (
        <div className="form-confirm"><div className="form-button">{el.yesText || "Yes"}</div><div className="form-button">{el.noText || "No"}</div></div>
      )}
    </div>
  );
}

export function FormEditor({ el, patch }: { el: FormElement; patch: Patch<FormElement> }) {
  const project = useStore((s) => s.project!);
  const variables = (project.variables ?? []).map((v) => v.name);
  const setButton = (i: number, p: Partial<FormButton>, key?: string) => patch({ buttons: el.buttons.map((b, k) => (k === i ? { ...b, ...p } : b)) }, key);
  const setField = (i: number, p: Partial<FormField>, key?: string) => patch({ fields: el.fields.map((f, k) => (k === i ? { ...f, ...p } : f)) }, key);
  const move = <T,>(list: T[], i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const users = project.elements.filter((e) =>
    (e.kind === "procedure" || e.kind === "command" || e.kind === "form") &&
    JSON.stringify(e).includes(`"form":"${el.name}"`));
  const build = () => {
    const ctx = new GenContext(project);
    genForm(ctx, el);
    return ctx.script.sections.join("\n");
  };

  return (
    <>
      <Section title="Form" hint={users.length ? `Shown by: ${users.map((u) => u.displayName).join(", ")}` : "Show it with the “Show form” step in a procedure, command or another form."}>
        <div className="split">
          <div className="stack">
            <Segmented value={el.formType} onChange={(formType) => patch({ formType })} options={[
              { value: "menu", label: "Menu of buttons" }, { value: "input", label: "Input form" }, { value: "confirm", label: "Yes / no question" },
            ]} />
            <Grid>
              <Text label="Title" value={el.title} onChange={(title) => patch({ title }, "title")} />
              {el.formType !== "input" && <Text label="Text" value={el.body} onChange={(body) => patch({ body }, "body")} />}
            </Grid>
            <p className="field-help">Text can include {"{player}"}, {"{target}"} and {"{variable names}"}.</p>
          </div>
          <FormPreview el={el} />
        </div>
      </Section>

      {el.formType === "menu" && <LayoutSection el={el} patch={patch} />}

      {el.formType === "menu" && (
        <Section title="Buttons" hint="Each button runs its own steps. Use “Run another procedure” for bigger logic.">
          {el.buttons.map((b, i) => (
            <div className="logic-card" key={b.id}>
              <div className="logic-head">
                <span className="logic-step mono">{i + 1}</span>
                <input value={b.text} onChange={(e) => setButton(i, { text: e.target.value }, `text-${b.id}`)} aria-label="Button text" className="grow" />
                <button type="button" className="btn ghost small" onClick={() => patch({ buttons: move(el.buttons, i, -1) })} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className="btn ghost small" onClick={() => patch({ buttons: move(el.buttons, i, 1) })} disabled={i === el.buttons.length - 1} aria-label="Move down">↓</button>
                <button type="button" className="btn ghost small" onClick={() => patch({ buttons: el.buttons.filter((_, k) => k !== i) })}>Remove</button>
              </div>
              <TexturePicker label="Icon (optional)" kind="item" value={b.icon} suggestedName={`${el.name}_button_${i + 1}`} onChange={(icon) => setButton(i, { icon })} />
              <ActionList actions={b.actions} onChange={(actions) => setButton(i, { actions })} slots={noSlots} />
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => patch({ buttons: [...el.buttons, { id: uid(), text: `Option ${el.buttons.length + 1}`, icon: "", actions: [] }] })}>Add button</button>
        </Section>
      )}

      {el.formType === "input" && (
        <>
          <Section title="Fields" hint="Each value can be saved to a variable, and used in the submit steps as {key}.">
            {el.fields.map((f, i) => (
              <div className="logic-card" key={f.id}>
                <div className="logic-head">
                  <span className="logic-step mono">{i + 1}</span>
                  <select value={f.kind} onChange={(e) => setField(i, { kind: e.target.value as FormField["kind"] })} aria-label="Field type">
                    <option value="text">Text box</option><option value="slider">Slider</option><option value="dropdown">Dropdown</option>
                    <option value="toggle">On/off toggle</option><option value="label">Label (text only)</option>
                  </select>
                  <span className="spacer" />
                  <button type="button" className="btn ghost small" onClick={() => patch({ fields: move(el.fields, i, -1) })} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" className="btn ghost small" onClick={() => patch({ fields: move(el.fields, i, 1) })} disabled={i === el.fields.length - 1} aria-label="Move down">↓</button>
                  <button type="button" className="btn ghost small" onClick={() => patch({ fields: el.fields.filter((_, k) => k !== i) })}>Remove</button>
                </div>
                <div className="logic-params">
                  <Text label="Label" value={f.label} onChange={(label) => setField(i, { label }, `label-${f.id}`)} />
                  {f.kind !== "label" && (
                    <>
                      <Text label="Key (for {key})" mono value={f.key} onChange={(key) => setField(i, { key: key.toLowerCase().replace(/[^a-z0-9_]/g, "_") }, `key-${f.id}`)} />
                      <Field label="Save to variable">
                        <select value={f.variable} onChange={(e) => setField(i, { variable: e.target.value })}>
                          <option value="">Don't save</option>
                          {variables.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </Field>
                    </>
                  )}
                  {f.kind === "text" && <Text label="Placeholder" value={f.placeholder} onChange={(placeholder) => setField(i, { placeholder }, `ph-${f.id}`)} />}
                  {f.kind === "slider" && (
                    <>
                      <Num label="Min" value={f.min} onChange={(min) => setField(i, { min }, `min-${f.id}`)} />
                      <Num label="Max" value={f.max} onChange={(max) => setField(i, { max }, `max-${f.id}`)} />
                      <Num label="Step" value={f.step} onChange={(step) => setField(i, { step }, `step-${f.id}`)} />
                    </>
                  )}
                  {f.kind === "dropdown" && (
                    <Text label="Options (comma separated)" value={f.options.join(", ")} onChange={(v) => setField(i, { options: v.split(",").map((x) => x.trim()).filter(Boolean) }, `opt-${f.id}`)} />
                  )}
                  {f.kind === "toggle" ? (
                    <Select label="Starts" value={f.defaultValue === "true" ? "true" : "false"} onChange={(defaultValue) => setField(i, { defaultValue })} options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} />
                  ) : f.kind !== "label" && (
                    <Text label="Starting value" value={f.defaultValue} onChange={(defaultValue) => setField(i, { defaultValue }, `def-${f.id}`)} />
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="btn small" onClick={() => patch({ fields: [...el.fields, { id: uid(), kind: "text", key: `field${el.fields.length + 1}`, label: "Your answer", placeholder: "", min: 0, max: 10, step: 1, options: [], defaultValue: "", variable: "" }] })}>Add field</button>
          </Section>
          <Section title="When submitted">
            <Text label="Submit button text" value={el.submitText} onChange={(submitText) => patch({ submitText }, "submit")} />
            <ActionList actions={el.submitActions} onChange={(submitActions) => patch({ submitActions })} slots={noSlots} />
          </Section>
        </>
      )}

      {el.formType === "confirm" && (
        <Grid>
          <Section title="Yes button">
            <Text label="Text" value={el.yesText} onChange={(yesText) => patch({ yesText }, "yes")} />
            <ActionList actions={el.yesActions} onChange={(yesActions) => patch({ yesActions })} slots={noSlots} />
          </Section>
          <Section title="No button">
            <Text label="Text" value={el.noText} onChange={(noText) => patch({ noText }, "no")} />
            <ActionList actions={el.noActions} onChange={(noActions) => patch({ noActions })} slots={noSlots} />
          </Section>
        </Grid>
      )}
      <details className="code-preview"><summary className="btn small ghost">Show generated JavaScript</summary><pre className="code-block"><code>{build()}</code></pre></details>
    </>
  );
}

/** Custom look for menus: a grid of tiles, own size and background (made with JSON UI). */
function LayoutSection({ el, patch }: { el: FormElement; patch: Patch<FormElement> }) {
  const l = el.layout;
  const grid = l?.style === "grid";
  const set = (p: Partial<FormLayout>, key?: string) => patch({ layout: { ...DEFAULT_LAYOUT, ...l, ...p } }, key);
  const tooWide = grid && l.columns * l.tileWidth > l.width - 12;
  return (
    <Section title="Look" hint="Menus can use Minecraft's normal list of buttons, or a grid of tiles with their own size and background.">
      <Segmented value={grid ? "grid" : "default"} onChange={(style) => set({ style })} options={[
        { value: "default", label: "Normal list" }, { value: "grid", label: "Grid of tiles" },
      ]} />
      {grid && (
        <>
          <Grid>
            <Slider label="Columns" min={1} max={8} value={l.columns} onChange={(columns) => set({ columns }, "cols")} />
            <Slider label="Icon size" min={8} max={Math.min(l.tileWidth, l.tileHeight)} value={Math.min(l.iconSize, l.tileWidth, l.tileHeight)} onChange={(iconSize) => set({ iconSize }, "icon")} format={(v) => `${v}px`} />
            <Num label="Tile width" suffix="px" min={24} max={400} value={l.tileWidth} onChange={(tileWidth) => set({ tileWidth }, "tw")} />
            <Num label="Tile height" suffix="px" min={24} max={400} value={l.tileHeight} onChange={(tileHeight) => set({ tileHeight }, "th")} />
            <Num label="Form width" suffix="px" min={120} max={600} value={l.width} onChange={(width) => set({ width }, "w")} />
            <Num label="Form height" suffix="px" min={100} max={400} value={l.height} onChange={(height) => set({ height }, "h")} />
          </Grid>
          {tooWide && <p className="warn-text">{l.columns} tiles of {l.tileWidth}px are wider than the form. Make the form wider or the tiles smaller.</p>}
          <Toggle label="Show the text above the tiles" value={l.showBody} onChange={(showBody) => set({ showBody })} />
          <Grid>
            <Color label="Button text colour" value={l.textColor || "#4c4c4c"} onChange={(textColor) => set({ textColor }, "tc")} />
            {l.background && <Color label="Title and text colour" value={l.titleColor || "#ffffff"} onChange={(titleColor) => set({ titleColor }, "tic")} />}
          </Grid>
          <TexturePicker label="Background (optional)" kind="other" value={l.background || undefined} suggestedName={`${el.name}_background`} onChange={(background) => set({ background })}
            help="Empty = Minecraft's grey dialog. Your image is stretched to the form's size, with the title and a close button on top." />
          {l.background && <button type="button" className="btn ghost small" onClick={() => set({ background: "" })}>Use Minecraft's dialog</button>}
          <p className="field-help">Sizes are in Minecraft's screen pixels: the normal form is 225 × 200. Players must have the add-on's resource pack for the custom look.</p>
        </>
      )}
    </Section>
  );
}
