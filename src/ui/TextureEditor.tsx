import { useEffect, useMemo, useRef, useState } from "react";
import type { TextureAsset } from "../model/types";
import { TEMPLATES, drawTemplate, hashSeed, hexToRgb, loadImage, rgbToHex } from "../textures/procedural";
import { Modal } from "./Modal";

type Tool = "pencil" | "eraser" | "fill" | "picker";

export interface TextureDraft {
  name: string;
  kind: TextureAsset["kind"];
  width: number;
  height: number;
  dataUrl: string;
}

const DEFAULT_TEMPLATE: Record<TextureAsset["kind"], string> = {
  block: "stone", item: "gem", entity: "mob_humanoid", armor: "armor_layer_1", other: "stone",
};

const BASE_PALETTE = ["#000000", "#3b3b3b", "#7f7f7f", "#c6c6c6", "#ffffff", "#7a5634", "#c4283c", "#e07b28", "#f2d544", "#4f8a3a", "#3fb4c4", "#3b5fc4", "#8a46b8"];

function bufferFromImage(img: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function toDataUrl(buf: Uint8ClampedArray, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(buf), w, h), 0, 0);
  return c.toDataURL("image/png");
}

function hueShift(src: Uint8ClampedArray, degrees: number) {
  const out = new Uint8ClampedArray(src);
  const a = (degrees * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  // Rotation in YIQ-like space keeps brightness stable.
  const m = [
    0.299 + 0.701 * cos + 0.168 * sin, 0.587 - 0.587 * cos + 0.330 * sin, 0.114 - 0.114 * cos - 0.497 * sin,
    0.299 - 0.299 * cos - 0.328 * sin, 0.587 + 0.413 * cos + 0.035 * sin, 0.114 - 0.114 * cos + 0.292 * sin,
    0.299 - 0.300 * cos + 1.250 * sin, 0.587 - 0.588 * cos - 1.050 * sin, 0.114 + 0.886 * cos - 0.203 * sin,
  ];
  for (let i = 0; i < out.length; i += 4) {
    const r = src[i], g = src[i + 1], b = src[i + 2];
    out[i] = m[0] * r + m[1] * g + m[2] * b;
    out[i + 1] = m[3] * r + m[4] * g + m[5] * b;
    out[i + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
  return out;
}

export function TextureEditor({ initial, kind, suggestedName, onSave, onClose, template: startTemplate }: {
  initial?: TextureDraft;
  template?: string;
  kind: TextureAsset["kind"];
  suggestedName: string;
  onSave: (t: TextureDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? suggestedName);
  const [size, setSize] = useState<[number, number]>([initial?.width ?? 16, initial?.height ?? 16]);
  const buf = useRef<Uint8ClampedArray>(new Uint8ClampedArray(size[0] * size[1] * 4));
  const [version, setVersion] = useState(0);
  const undo = useRef<Uint8ClampedArray[]>([]);
  const redo = useRef<Uint8ClampedArray[]>([]);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#c4283c");
  const firstTemplate = startTemplate ?? DEFAULT_TEMPLATE[kind];
  const [template, setTemplate] = useState(firstTemplate);
  const [tplColor, setTplColor] = useState("#c4283c");
  const [seed, setSeed] = useState(1);
  const [hue, setHue] = useState(0);
  const hueBase = useRef<Uint8ClampedArray | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painting = useRef<{ last: [number, number] | null }>({ last: null });
  const fileInput = useRef<HTMLInputElement>(null);

  const [w, h] = size;
  const bump = () => setVersion((v) => v + 1);
  const snapshot = () => {
    undo.current.push(new Uint8ClampedArray(buf.current));
    if (undo.current.length > 60) undo.current.shift();
    redo.current = [];
  };

  // Load the initial image or generate a starting texture.
  useEffect(() => {
    (async () => {
      if (initial?.dataUrl) {
        const img = await loadImage(initial.dataUrl);
        buf.current = bufferFromImage(img, initial.width, initial.height);
      } else {
        applyTemplate(firstTemplate, tplColor, 1, false);
      }
      bump();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = w;
    c.height = h;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(buf.current), w, h), 0, 0);
  }, [version, w, h]);

  function applyTemplate(id: string, hex: string, s: number, record = true) {
    if (record) snapshot();
    const g = drawTemplate(id, hex, hashSeed(id + hex) + s);
    const out = new Uint8ClampedArray(g.w * g.h * 4);
    g.data.forEach((px, i) => px && out.set(px.map((v) => Math.round(v)), i * 4));
    buf.current = out;
    setSize([g.w, g.h]);
    bump();
  }

  const palette = useMemo(() => {
    const counts = new Map<string, number>();
    const b = buf.current;
    for (let i = 0; i < b.length; i += 4) {
      if (b[i + 3] < 10) continue;
      const hex = rgbToHex([b[i], b[i + 1], b[i + 2]]);
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([c]) => c);
  }, [version]);

  const cellAt = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * w), Math.floor(((e.clientY - r.top) / r.height) * h)];
  };

  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    if (tool === "eraser") buf.current.set([0, 0, 0, 0], i);
    else buf.current.set([...hexToRgb(color), 255], i);
  };

  const fill = (x: number, y: number) => {
    const b = buf.current;
    const i0 = (y * w + x) * 4;
    const target = [b[i0], b[i0 + 1], b[i0 + 2], b[i0 + 3]];
    const rep = [...hexToRgb(color), 255];
    if (target.every((v, k) => v === rep[k])) return;
    const stack = [[x, y]];
    const same = (i: number) => target.every((v, k) => b[i + k] === v);
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const i = (cy * w + cx) * 4;
      if (!same(i)) continue;
      b.set(rep, i);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  };

  const onDown = (e: React.PointerEvent) => {
    const [x, y] = cellAt(e);
    if (tool === "picker") {
      const i = (y * w + x) * 4;
      const b = buf.current;
      if (b[i + 3] > 0) setColor(rgbToHex([b[i], b[i + 1], b[i + 2]]));
      setTool("pencil");
      return;
    }
    snapshot();
    if (tool === "fill") {
      fill(x, y);
      bump();
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    painting.current.last = [x, y];
    paint(x, y);
    bump();
  };

  const onMove = (e: React.PointerEvent) => {
    const last = painting.current.last;
    if (!last) return;
    const [x, y] = cellAt(e);
    // Bresenham so fast strokes don't leave gaps.
    let [x0, y0] = last;
    const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      paint(x0, y0);
      if (x0 === x && y0 === y) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    painting.current.last = [x, y];
    bump();
  };

  const onUp = () => (painting.current.last = null);

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(buf.current);
    buf.current = prev;
    if (prev.length !== w * h * 4) setSize(guessSize(prev.length));
    bump();
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(buf.current);
    buf.current = next;
    if (next.length !== w * h * 4) setSize(guessSize(next.length));
    bump();
  };
  const guessSize = (len: number): [number, number] => {
    const px = len / 4;
    if (px === 64 * 32) return [64, 32];
    const s = Math.round(Math.sqrt(px));
    return [s, s];
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const resize = (nw: number, nh: number) => {
    snapshot();
    buf.current = new Uint8ClampedArray(nw * nh * 4);
    setSize([nw, nh]);
    bump();
  };

  const importFile = async (f: File) => {
    const url = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(f);
    });
    const img = await loadImage(url);
    const nw = Math.min(256, img.width), nh = Math.min(256, img.height);
    snapshot();
    buf.current = bufferFromImage(img, nw, nh);
    setSize([nw, nh]);
    if (name === suggestedName) setName(f.name.replace(/\.png$/i, ""));
    bump();
  };

  const startHue = () => {
    if (!hueBase.current) {
      snapshot();
      hueBase.current = new Uint8ClampedArray(buf.current);
    }
  };
  const onHue = (deg: number) => {
    startHue();
    setHue(deg);
    buf.current = hueShift(hueBase.current!, deg);
    bump();
  };
  const endHue = () => {
    hueBase.current = null;
  };

  const zoom = Math.max(4, Math.floor(384 / Math.max(w, h)));
  const templates = TEMPLATES;

  return (
    <Modal title={initial ? `Edit texture` : "New texture"} onClose={onClose} wide
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave({ name: name || suggestedName, kind, width: w, height: h, dataUrl: toDataUrl(buf.current, w, h) })}>
            Save texture
          </button>
        </>
      }>
      <div className="tex-editor">
        <div className="tex-stage">
          <div className="tex-toolbar" role="toolbar" aria-label="Drawing tools">
            {(["pencil", "eraser", "fill", "picker"] as Tool[]).map((t) => (
              <button key={t} className={`btn tool${tool === t ? " on" : ""}`} onClick={() => setTool(t)} aria-pressed={tool === t}>
                {{ pencil: "Pencil", eraser: "Eraser", fill: "Fill", picker: "Pick colour" }[t]}
              </button>
            ))}
            <span className="spacer" />
            <button className="btn tool" onClick={doUndo} title="Undo (Ctrl+Z)">Undo</button>
            <button className="btn tool" onClick={doRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
          </div>
          <div className="tex-canvas-wrap checker" style={{ width: w * zoom, height: h * zoom }}>
            <canvas ref={canvas} className="pixel" style={{ width: w * zoom, height: h * zoom }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />
            {showGrid && zoom >= 8 && (
              <div className="tex-grid" style={{ backgroundSize: `${zoom}px ${zoom}px` }} aria-hidden />
            )}
          </div>
          <div className="tex-meta">
            <span className="mono">{w} × {h} px</span>
            <label className="inline-check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
            <span className="tex-preview checker" aria-label="Actual size preview"><canvas ref={(c) => {
              if (!c) return;
              c.width = w; c.height = h;
              c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(buf.current), w, h), 0, 0);
            }} className="pixel" style={{ width: Math.min(64, w * 2), height: Math.min(64, w * 2) * (h / w) }} key={version} /></span>
          </div>
        </div>

        <div className="tex-side">
          <label className="field">
            <span className="field-label">Texture name</span>
            <input className="mono" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="field">
            <span className="field-label">Colour</span>
            <span className="color">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              <input className="mono" value={color} onChange={(e) => setColor(e.target.value)} />
            </span>
            <div className="swatches">
              {[...palette, ...BASE_PALETTE.filter((c) => !palette.includes(c))].slice(0, 24).map((c) => (
                <button key={c} className={`swatch${c === color ? " on" : ""}`} style={{ background: c }} onClick={() => { setColor(c); if (tool === "eraser" || tool === "picker") setTool("pencil"); }} aria-label={c} />
              ))}
            </div>
          </div>

          <fieldset className="panel">
            <legend>Generate from a template</legend>
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              {(["block", "item", "armor", "entity"] as const).map((k) => (
                <optgroup key={k} label={{ block: "Blocks", item: "Items", armor: "Armor", entity: "Mobs" }[k]}>
                  {templates.filter((t) => t.kind === k).map((t) => <option key={t.id} value={t.id}>{t.label} ({t.size.join("×")})</option>)}
                </optgroup>
              ))}
            </select>
            <span className="color">
              <input type="color" value={tplColor} onChange={(e) => setTplColor(e.target.value)} aria-label="Template colour" />
              <input className="mono" value={tplColor} onChange={(e) => setTplColor(e.target.value)} />
            </span>
            <div className="row">
              <button className="btn primary" onClick={() => applyTemplate(template, tplColor, seed)}>Generate</button>
              <button className="btn" onClick={() => { const s = seed + 1; setSeed(s); applyTemplate(template, tplColor, s); }}>Another variation</button>
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend>Recolour</legend>
            <span className="slider">
              <input type="range" min={-180} max={180} value={hue} onPointerDown={startHue} onChange={(e) => onHue(Number(e.target.value))} onPointerUp={() => { endHue(); setHue(0); }} aria-label="Shift hue" />
              <output>{hue}°</output>
            </span>
            <span className="field-help">Drag to shift every colour's hue. Great for making variants.</span>
          </fieldset>

          <fieldset className="panel">
            <legend>Canvas</legend>
            <div className="row wrap">
              <button className="btn" onClick={() => fileInput.current?.click()}>Import PNG…</button>
              <select aria-label="New blank canvas" value="" onChange={(e) => { const [a, b] = e.target.value.split("x").map(Number); if (a) resize(a, b); }}>
                <option value="">New blank…</option>
                <option value="16x16">16 × 16</option>
                <option value="32x32">32 × 32</option>
                <option value="64x32">64 × 32 (armor)</option>
                <option value="64x64">64 × 64 (mob)</option>
              </select>
            </div>
            <input ref={fileInput} type="file" accept="image/png,image/*" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </fieldset>
        </div>
      </div>
    </Modal>
  );
}
