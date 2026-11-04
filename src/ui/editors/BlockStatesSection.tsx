import { useMemo } from "react";
import type { BlockElement, BlockStateRule, CustomBlockState } from "../../model/types";
import { createElement, uid } from "../../model/registry";
import { stateValues } from "../../export/content";
import { ChipList, Color, Field, Num, Section, Select, Slider, Text, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

const TYPE_LABEL = { bool: "On / off", int: "Number range", enum: "List of options" } as const;

/** Custom block states and the rules that change the block per state. */
export function BlockStatesSection({ el, patch }: { el: BlockElement; patch: Patch<BlockElement> }) {
  const project = useStore((s) => s.project!);
  const addElements = useStore((s) => s.addElements);
  const states = el.customStates ?? [];
  const bones = useMemo(() => {
    try { return (JSON.parse(el.customGeometry || "{}")["minecraft:geometry"]?.[0]?.bones ?? []).map((b: { name: string }) => b.name) as string[]; } catch { return []; }
  }, [el.customGeometry]);
  const rules = el.stateRules ?? [];
  const setState = (i: number, p: Partial<CustomBlockState>) => patch({ customStates: states.map((x, k) => (k === i ? { ...x, ...p } : x)) }, `state-${i}`);
  const setRule = (i: number, p: Partial<BlockStateRule>) => patch({ stateRules: rules.map((x, k) => (k === i ? { ...x, ...p } : x)) }, `rule-${i}`);
  const valuesOf = (name: string) => {
    const st = states.find((s) => s.name === name);
    return st ? stateValues(st).map(String) : [];
  };
  const addState = () => {
    const taken = new Set(states.map((s) => s.name));
    let name = "lit", n = 2;
    while (taken.has(name)) name = `state_${n++}`;
    patch({ customStates: [...states, { name, type: "bool" }] });
  };
  const addRule = () => {
    const first = states[0];
    patch({ stateRules: [...rules, { id: uid(), when: first ? [{ state: first.name, value: valuesOf(first.name)[1] ?? valuesOf(first.name)[0] ?? "" }] : [] }] });
  };
  const makeClickProcedure = (st: CustomBlockState) => {
    const proc = createElement("procedure", `${el.name}_click_${st.name}`, `${el.displayName}: change ${st.name}`);
    proc.trigger = "block_interact";
    proc.filter = `${project.namespace}:${el.name}`;
    proc.actions = [{ id: uid(), type: "cycle_block_state", params: { at: "block", state: st.name }, chance: 100 }];
    addElements([proc]);
  };

  return (
    <Section title="States" hint="Extra settings a placed block remembers, like on/off or a colour. Rules below change how it looks or behaves for each value.">
      {states.map((st, i) => (
        <div className="state-row" key={i}>
          <Text label="Name" value={st.name} mono onChange={(name) => setState(i, { name: name.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
          <Select label="Kind" value={st.type} onChange={(type) => setState(i, { type, ...(type === "int" && st.max == null ? { min: 0, max: 3 } : {}), ...(type === "enum" && !st.options?.length ? { options: ["red", "green", "blue"] } : {}) })}
            options={(["bool", "int", "enum"] as const).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
          {st.type === "int" && (
            <>
              <Num label="From" value={st.min ?? 0} onChange={(min) => setState(i, { min })} />
              <Num label="To" value={st.max ?? 3} onChange={(max) => setState(i, { max })} help="Up to 16 numbers." />
            </>
          )}
          {st.type === "enum" && <ChipList label="Options" values={st.options ?? []} onChange={(options) => setState(i, { options })} placeholder="add option…" />}
          <div className="row">
            <button type="button" className="btn small ghost" onClick={() => makeClickProcedure(st)} title="Creates a procedure that steps through the values when a player right-clicks the block">Change on click</button>
            <button type="button" className="btn small ghost" onClick={() => patch({ customStates: states.filter((_, k) => k !== i) })}>Remove</button>
          </div>
          <span className="field-help state-values">Values: {stateValues(st).map(String).join(", ") || "none yet"}. Starts as {String(stateValues(st)[0] ?? "-")}.</span>
        </div>
      ))}
      <button type="button" className="btn small" onClick={addState}>Add state</button>

      {states.length > 0 && (
        <>
          <h4 className="subhead">Rules</h4>
          {rules.map((r, i) => (
            <div className="rule-card" key={r.id}>
              <div className="rule-when">
                <strong>When</strong>
                {r.when.map((w, k) => (
                  <div className="row wrap" key={k}>
                    <Select label="State" value={w.state} onChange={(state) => setRule(i, { when: r.when.map((x, j) => (j === k ? { state, value: valuesOf(state)[0] ?? "" } : x)) })}
                      options={states.map((s) => s.name)} />
                    <Select label="is" value={w.value} onChange={(value) => setRule(i, { when: r.when.map((x, j) => (j === k ? { ...x, value } : x)) })}
                      options={valuesOf(w.state).length ? valuesOf(w.state) : [w.value]} />
                    {r.when.length > 1 && <button type="button" className="btn ghost small" onClick={() => setRule(i, { when: r.when.filter((_, j) => j !== k) })}>Remove</button>}
                  </div>
                ))}
                <button type="button" className="btn ghost small" onClick={() => setRule(i, { when: [...r.when, { state: states[0].name, value: valuesOf(states[0].name)[0] ?? "" }] })}>And also…</button>
              </div>
              <div className="rule-then">
                <strong>Then</strong>
                <Toggle label="Use another texture" value={r.texture != null} onChange={(on) => setRule(i, { texture: on ? el.textures.all ?? "" : undefined })} />
                {r.texture != null && <TexturePicker label="Texture" kind="block" value={r.texture || undefined} suggestedName={`${el.name}_${r.when.map((w) => w.value).join("_")}`} onChange={(texture) => setRule(i, { texture })} />}
                <Toggle label="Give off light" value={r.light != null} onChange={(on) => setRule(i, { light: on ? 15 : undefined })} />
                {r.light != null && <Slider label="Light" min={0} max={15} value={r.light} onChange={(light) => setRule(i, { light })} />}
                <Toggle label="Change break time" value={r.hardness != null} onChange={(on) => setRule(i, { hardness: on ? el.hardness : undefined })} />
                {r.hardness != null && <Num label="Break time" suffix="seconds" step={0.1} value={r.hardness} onChange={(hardness) => setRule(i, { hardness })} help="-1 = unbreakable." />}
                <Toggle label="Change slipperiness" value={r.friction != null} onChange={(on) => setRule(i, { friction: on ? 0.1 : undefined })} />
                {r.friction != null && <Slider label="Slipperiness" min={0} max={0.9} step={0.05} value={r.friction} onChange={(friction) => setRule(i, { friction })} />}
                <Toggle label="Change map colour" value={r.mapColor != null} onChange={(on) => setRule(i, { mapColor: on ? el.mapColor : undefined })} />
                {r.mapColor != null && <Color label="Map colour" value={r.mapColor} onChange={(mapColor) => setRule(i, { mapColor })} />}
                <Toggle label="Players walk through it" value={!!r.noCollision} onChange={(noCollision) => setRule(i, { noCollision: noCollision || undefined })} />
                {el.geometry === "custom" && (
                  <ChipList label="Hide model parts" values={r.hideBones ?? []} onChange={(hideBones) => setRule(i, { hideBones })} suggestions={bones} placeholder="part name…"
                    help="Parts (bones) of your Blockbench model to hide, e.g. a lid or a flame." />
                )}
              </div>
              <button type="button" className="btn ghost small" onClick={() => patch({ stateRules: rules.filter((_, k) => k !== i) })}>Remove rule</button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={addRule}>Add rule</button>
          <Field label="Changing states in game">
            <p className="field-help">Use the <strong>Set block state</strong> or <strong>Cycle block state</strong> steps in any procedure, or “Change on click” above. Test them with <strong>Block state is</strong>.</p>
          </Field>
        </>
      )}
    </Section>
  );
}
