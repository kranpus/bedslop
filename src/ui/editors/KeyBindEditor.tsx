import type { KeyBindElement, KeyInput } from "../../model/types";
import { KEY_LABELS, KEY_NEEDS_211 } from "../../export/keybinds";
import { useStore } from "../../store/store";
import { Grid, IdField, Num, Section, Select, Slider } from "../fields";
import { ActionList } from "./LogicEditor";
import type { Patch } from "./types";

const noSlots = { target: false, block: false };

/** What the player does, in words, for each input. */
const HOW: Record<KeyInput, string> = {
  double_jump: "Press jump twice quickly (space / A / the jump button). Works in the air too.",
  double_sneak: "Press sneak twice quickly (shift / right stick / the sneak button).",
  hold_sneak: "Keep sneak held down.",
  sneak_jump: "Press jump while sneaking.",
  sneak_use: "Right-click / use while sneaking.",
  sneak_slot: "Sneak and press a hotbar number (or scroll to that slot). The hotbar stays on the slot it was on, so it works like a key.",
  swing: "Left-click / attack, even at the air.",
  sneak_swing: "Left-click while sneaking.",
};

export function KeyBindEditor({ el, patch }: { el: KeyBindElement; patch: Patch<KeyBindElement> }) {
  const api = useStore((s) => s.project!.scriptApi ?? "2.1.0");
  const old = KEY_NEEDS_211.includes(el.input) && /^2\.[0-9]\./.test(api);
  const double = el.input === "double_jump" || el.input === "double_sneak";
  return (
    <>
      <Section title="Key binding" hint="Bedrock add-ons can't add new keys, so a binding is a combo of controls every device has: jump, sneak, the hotbar, use and attack.">
        <Grid>
          <Select label="The player…" value={el.input} onChange={(input) => patch({ input })} options={(Object.keys(KEY_LABELS) as KeyInput[]).map((k) => ({ value: k, label: KEY_LABELS[k] }))} />
          {el.input === "sneak_slot" && <Slider label="Hotbar number" min={1} max={9} value={el.slot} onChange={(slot) => patch({ slot }, "slot")} />}
          {double && <Num label="Taps within" suffix="seconds" step={0.05} min={0.1} max={2} value={el.seconds} onChange={(seconds) => patch({ seconds }, "sec")} />}
          {el.input === "hold_sneak" && <Num label="Hold for" suffix="seconds" step={0.25} min={0.25} max={30} value={el.seconds} onChange={(seconds) => patch({ seconds }, "sec")} />}
        </Grid>
        <p className="field-help">{HOW[el.input]}</p>
        {old && <p className="warn-text">Left-click needs Script API 2.11.0 (Minecraft 1.26.60) or newer. Change it in Settings.</p>}
        <Grid>
          <IdField label="Only while holding (optional)" kind="item" value={el.item} onChange={(item) => patch({ item }, "item")} help="Empty = whatever is in their hand." />
          <Num label="Cooldown" suffix="seconds" step={0.5} min={0} value={el.cooldown} onChange={(cooldown) => patch({ cooldown }, "cool")} />
        </Grid>
        {el.input === "double_sneak" || el.input === "hold_sneak" || el.input === "sneak_slot" ? (
          <p className="field-help">Tip: sneaking also slows the player down and stops them falling off edges, so pick combos that feel natural.</p>
        ) : null}
      </Section>
      <Section title="When pressed" hint="Runs with the player who did it.">
        <ActionList actions={el.actions} onChange={(actions) => patch({ actions })} slots={noSlots} />
      </Section>
    </>
  );
}
