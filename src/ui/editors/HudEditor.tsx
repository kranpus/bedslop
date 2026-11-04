import { useRef, useState } from "react";
import type { HudAnchor, HudElement, HudWidget } from "../../model/types";
import { uid } from "../../model/registry";
import { Color, Field, Grid, Num, Section, Segmented, Select, Slider, Text, Toggle } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

/** The canvas is a typical HUD in UI pixels (what JSON UI offsets and sizes use). */
const W = 427, H = 240;
const ANCHORS: HudAnchor[] = ["top_left", "top_middle", "top_right", "left_middle", "center", "right_middle", "bottom_left", "bottom_middle", "bottom_right"];
const fx = (a: HudAnchor) => (a.endsWith("left") ? 0 : a.endsWith("right") ? 1 : 0.5);
const fy = (a: HudAnchor) => (a.startsWith("top") ? 0 : a.startsWith("bottom") ? 1 : 0.5);

const TYPE_LABEL: Record<HudWidget["type"], string> = { image: "Image", text: "Text", live: "Live text", bar: "Bar" };

/** Minecraft's § colour codes. */
const MC_COLORS: Record<string, string> = {
  "0": "#000000", "1": "#0000aa", "2": "#00aa00", "3": "#00aaaa", "4": "#aa0000", "5": "#aa00aa", "6": "#ffaa00", "7": "#aaaaaa",
  "8": "#555555", "9": "#5555ff", a: "#55ff55", b: "#55ffff", c: "#ff5555", d: "#ff55ff", e: "#ffff55", f: "#ffffff",
};

/** Draws text with § formatting codes (colours, bold, italic, underline, strikethrough) like the game. */
function McText({ text, color }: { text: string; color: string }) {
  const parts: React.ReactNode[] = [];
  let style: React.CSSProperties = { color };
  let i = 0;
  for (const piece of text.split(/(§[0-9a-fk-or])/i)) {
    const m = /^§([0-9a-fk-or])$/i.exec(piece);
    if (!m) { if (piece) parts.push(<span key={i++} style={style}>{piece}</span>); continue; }
    const c = m[1].toLowerCase();
    if (c in MC_COLORS) style = { color: MC_COLORS[c] };
    else if (c === "l") style = { ...style, fontWeight: 700 };
    else if (c === "o") style = { ...style, fontStyle: "italic" };
    else if (c === "n") style = { ...style, textDecoration: "underline" };
    else if (c === "m") style = { ...style, textDecoration: "line-through" };
    else if (c === "r") style = { color };
  }
  return <>{parts}</>;
}

/** Sample values so live text looks real in the editor. */
const sample = (t: string) => t.replace(/\{score:[\w.-]+\}/g, "7").replace(/\{player\}/g, "Steve").replace(/\{target\}/g, "Zombie").replace(/\{\w+\}/g, "12");

export function HudEditor({ el, patch }: { el: HudElement; patch: Patch<HudElement> }) {
  const project = useStore((s) => s.project!);
  const [sel, setSel] = useState<string | null>(el.widgets[0]?.id ?? null);
  const [guides, setGuides] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; x: number; y: number; scale: number } | null>(null);
  const widget = el.widgets.find((w) => w.id === sel);
  const tex = (id?: string) => project.textures.find((t) => t.id === id)?.dataUrl;
  const set = (id: string, p: Partial<HudWidget>, key?: string) => patch({ widgets: el.widgets.map((w) => (w.id === id ? { ...w, ...p } : w)) }, key);

  const add = (type: HudWidget["type"]) => {
    const w: HudWidget = {
      id: uid(), type, anchor: "center", x: 0, y: 0, w: type === "bar" ? 80 : 16, h: type === "bar" ? 6 : 16,
      ...(type === "text" ? { text: "Hello", color: "#ffffff", scale: 1, shadow: true } : {}),
      ...(type === "live" ? { text: "Coins: {coins}", color: "#ffd84a", scale: 1, shadow: true } : {}),
      ...(type === "bar" ? { source: "variable" as const, sourceName: project.variables?.[0]?.name ?? "", max: 20, segments: 10 } : {}),
    };
    patch({ widgets: [...el.widgets, w] });
    setSel(w.id);
  };

  const onDown = (e: React.PointerEvent, w: HudWidget) => {
    e.preventDefault();
    setSel(w.id);
    const scale = (stage.current?.clientWidth ?? W) / W;
    drag.current = { id: w.id, sx: e.clientX, sy: e.clientY, x: w.x, y: w.y, scale };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    set(d.id, { x: Math.round(d.x + (e.clientX - d.sx) / d.scale), y: Math.round(d.y + (e.clientY - d.sy) / d.scale) }, `drag-${d.id}`);
  };
  const onUp = () => { drag.current = null; };

  return (
    <>
      <Section title="Kind">
        <Segmented value={el.mode} onChange={(mode) => patch({ mode })} options={[
          { value: "hud", label: "HUD (always on screen)" }, { value: "overlay", label: "Overlay (shown by procedures)" },
        ]} />
        {el.mode === "overlay"
          ? <>
              <Toggle label="Darken the game behind it" value={el.dim} onChange={(dim) => patch({ dim })} />
              <p className="field-help">Show it with the <strong>Show screen overlay</strong> step (optionally for a few seconds) and hide it with <strong>Hide screen overlay</strong>.</p>
            </>
          : <p className="field-help">Sits on the HUD next to the hotbar and hearts, for every player.</p>}
      </Section>

      <Section title="Layout" hint="Drag pieces to move them. Each one is pinned to a point on the screen, so it stays in place on any screen size.">
        <div className="row wrap">
          {(["image", "text", "live", "bar"] as const).map((t) => <button type="button" key={t} className="btn small" onClick={() => add(t)}>Add {TYPE_LABEL[t].toLowerCase()}</button>)}
          <label className="inline-check"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Show the normal HUD</label>
        </div>
        <div className="hud-stage" ref={stage} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ aspectRatio: `${W} / ${H}` }}>
          <div className="hud-world" />
          {el.mode === "overlay" && el.dim && <div className="hud-dim" />}
          {guides && (
            <>
              <div className="hud-guide" style={{ left: `${((W - 182) / 2 / W) * 100}%`, bottom: 0, width: `${(182 / W) * 100}%`, height: `${(22 / H) * 100}%` }}>hotbar</div>
              <div className="hud-guide" style={{ left: `${((W - 182) / 2 / W) * 100}%`, bottom: `${(30 / H) * 100}%`, width: `${(81 / W) * 100}%`, height: `${(9 / H) * 100}%` }}>hearts</div>
              <div className="hud-guide" style={{ right: `${((W - 182) / 2 / W) * 100}%`, bottom: `${(30 / H) * 100}%`, width: `${(81 / W) * 100}%`, height: `${(9 / H) * 100}%` }}>hunger</div>
            </>
          )}
          {el.widgets.map((w) => {
            const left = fx(w.anchor) * W + w.x, top = fy(w.anchor) * H + w.y;
            const style: React.CSSProperties = {
              left: `${(left / W) * 100}%`, top: `${(top / H) * 100}%`,
              transform: `translate(${-fx(w.anchor) * 100}%, ${-fy(w.anchor) * 100}%)`,
            };
            let body: React.ReactNode;
            if (w.type === "image") {
              const url = tex(w.texture);
              body = url ? <img src={url} alt="" className="pixel" style={{ width: `calc(var(--u) * ${w.w})`, height: `calc(var(--u) * ${w.h})` }} />
                : <span className="hud-missing" style={{ width: `calc(var(--u) * ${w.w})`, height: `calc(var(--u) * ${w.h})` }}>image</span>;
            } else if (w.type === "bar") {
              const segs = Math.max(2, Math.min(20, w.segments ?? 10)), fill = tex(w.texture), empty = tex(w.emptyTexture);
              body = (
                <span className="hud-bar" style={{ width: `calc(var(--u) * ${w.w})`, height: `calc(var(--u) * ${w.h})` }}>
                  {Array.from({ length: segs }, (_, k) => {
                    const on = k < Math.round(segs * 0.6);
                    const url = on ? fill : empty;
                    return url ? <img key={k} src={url} alt="" className="pixel" /> : <span key={k} className={on ? "seg on" : "seg"} />;
                  })}
                </span>
              );
            } else {
              const t = w.type === "live" ? sample(w.text ?? "") : w.text ?? "";
              body = <span className={`hud-text${w.shadow ? " shadow" : ""}`} style={{ fontSize: `calc(var(--u) * ${8 * (w.scale ?? 1)})` }}><McText text={t || " "} color={w.color ?? "#ffffff"} /></span>;
            }
            return (
              <div key={w.id} className={`hud-widget${w.id === sel ? " on" : ""}`} style={style} onPointerDown={(e) => onDown(e, w)} title={`${TYPE_LABEL[w.type]} (${w.anchor.replace("_", " ")})`}>
                {body}
              </div>
            );
          })}
        </div>
      </Section>

      {widget && (
        <Section title={TYPE_LABEL[widget.type]}>
          <Field label="Pinned to">
            <div className="anchor-grid" role="radiogroup" aria-label="Pinned to">
              {ANCHORS.map((a) => (
                <button type="button" key={a} role="radio" aria-checked={widget.anchor === a} aria-label={a.replace("_", " ")} className={widget.anchor === a ? "on" : ""}
                  onClick={() => set(widget.id, { anchor: a, x: 0, y: 0 })} />
              ))}
            </div>
          </Field>
          <Grid>
            <Num label="Across" suffix="px" value={widget.x} onChange={(x) => set(widget.id, { x }, "x")} />
            <Num label="Down" suffix="px" value={widget.y} onChange={(y) => set(widget.id, { y }, "y")} />
            {(widget.type === "image" || widget.type === "bar") && (
              <>
                <Num label="Width" suffix="px" min={1} value={widget.w} onChange={(w) => set(widget.id, { w }, "w")} />
                <Num label="Height" suffix="px" min={1} value={widget.h} onChange={(h) => set(widget.id, { h }, "h")} />
              </>
            )}
          </Grid>
          {widget.type === "image" && (
            <TexturePicker label="Image" kind="item" value={widget.texture} suggestedName={`${el.name}_image`} onChange={(texture) => set(widget.id, { texture })} />
          )}
          {(widget.type === "text" || widget.type === "live") && (
            <>
              <Text label={widget.type === "live" ? "Text (updates live)" : "Text"} wide value={widget.text ?? ""} onChange={(text) => set(widget.id, { text }, "text")}
                help={widget.type === "live" ? "Use {variable}, {score:name}, {player}. It updates twice a second." : "Minecraft formatting codes like §l (bold) work too."} />
              <Grid>
                <Color label="Colour" value={widget.color ?? "#ffffff"} onChange={(color) => set(widget.id, { color }, "color")} />
                <Slider label="Size" min={0.5} max={4} step={0.25} value={widget.scale ?? 1} onChange={(scale) => set(widget.id, { scale }, "scale")} format={(v) => `${v}×`} />
              </Grid>
              <Toggle label="Shadow" value={!!widget.shadow} onChange={(shadow) => set(widget.id, { shadow })} />
            </>
          )}
          {widget.type === "bar" && (
            <>
              <Grid>
                <Select label="Shows" value={widget.source ?? "variable"} onChange={(source) => set(widget.id, { source, sourceName: "" })} options={[{ value: "variable", label: "A variable" }, { value: "score", label: "A scoreboard" }]} />
                <Select label={widget.source === "score" ? "Scoreboard" : "Variable"} value={widget.sourceName ?? ""} onChange={(sourceName) => set(widget.id, { sourceName })}
                  options={[{ value: "", label: "Choose…" }, ...(widget.source === "score" ? (project.scoreboards ?? []).map((b) => b.name) : (project.variables ?? []).map((v) => v.name)).map((n) => ({ value: n, label: n }))]} />
                <Num label="Full at" min={1} value={widget.max ?? 20} onChange={(max) => set(widget.id, { max }, "max")} help="The value that fills the bar." />
                <Slider label="Segments" min={2} max={20} value={widget.segments ?? 10} onChange={(segments) => set(widget.id, { segments }, "segs")} />
              </Grid>
              <Grid>
                <TexturePicker label="Full segment" kind="item" value={widget.texture} suggestedName={`${el.name}_bar_full`} onChange={(texture) => set(widget.id, { texture })} />
                <TexturePicker label="Empty segment (optional)" kind="item" value={widget.emptyTexture} suggestedName={`${el.name}_bar_empty`} onChange={(emptyTexture) => set(widget.id, { emptyTexture })} />
              </Grid>
            </>
          )}
          <div className="row">
            <button type="button" className="btn small ghost" onClick={() => { const c = { ...widget, id: uid(), x: widget.x + 8, y: widget.y + 8 }; patch({ widgets: [...el.widgets, c] }); setSel(c.id); }}>Duplicate</button>
            <button type="button" className="btn small ghost" onClick={() => { patch({ widgets: el.widgets.filter((w) => w.id !== widget.id) }); setSel(null); }}>Remove</button>
          </div>
        </Section>
      )}
      <Section title="How it works">
        <p className="field-help">This makes a JSON UI resource pack file. Live text, bars and overlays get their values from the add-on's script, which passes them to the screen as invisible titles. Avoid other add-ons that also change the HUD, as they can clash.</p>
      </Section>
    </>
  );
}
