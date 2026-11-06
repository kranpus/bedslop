import { useRef, useState } from "react";
import type { BlockElement, ContainerLayout } from "../../model/types";
import { slotPositions } from "../../export/screens";
import { useStore } from "../../store/store";
import { Color, Grid, Toggle } from "../fields";
import type { Patch } from "./types";

const K = 2; // editor pixels per screen pixel
const CELL = 18;

/** Slot arrangements for any number of slots, centred in the 162px slot area. */
function preset(kind: string, n: number): { x: number; y: number }[] {
  const centreRow = (count: number, y: number, start = 0) => Array.from({ length: count }, (_, i) => ({ x: Math.round((162 - count * CELL) / 2) + i * CELL, y, k: start + i }));
  const rows = (perRow: number) => Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / perRow), inRow = Math.min(perRow, n - row * perRow);
    return { x: Math.round((162 - inRow * CELL) / 2) + (i % perRow) * CELL, y: row * CELL };
  });
  switch (kind) {
    case "grid3": return rows(3);
    case "grid5": return rows(5);
    case "row": return n <= 9 ? centreRow(n, 0) : rows(9);
    case "ring": {
      // Around a square: works best for 8 slots (a 3×3 with an empty middle).
      const side = Math.max(3, Math.ceil(n / 4) + 1), ox = Math.round((162 - side * CELL) / 2);
      const ring: { x: number; y: number }[] = [];
      for (let i = 0; i < side; i++) ring.push({ x: ox + i * CELL, y: 0 });
      for (let i = 1; i < side; i++) ring.push({ x: ox + (side - 1) * CELL, y: i * CELL });
      for (let i = side - 2; i >= 0; i--) ring.push({ x: ox + i * CELL, y: (side - 1) * CELL });
      for (let i = side - 2; i > 0; i--) ring.push({ x: ox, y: i * CELL });
      return Array.from({ length: n }, (_, i) => ring[i] ?? { x: (i % 9) * CELL, y: (side + Math.floor((i - ring.length) / 9)) * CELL });
    }
    default: return slotPositions(n);
  }
}

export const DEFAULT_LAYOUT = (n: number): ContainerLayout => ({ enabled: true, slots: preset(n === 9 ? "grid3" : "chest", n), showTitle: true, titleX: 0, titleY: 0, titleColor: "#404040" });

export function ContainerLayoutEditor({ el, patch }: { el: BlockElement; patch: Patch<BlockElement> }) {
  const textures = useStore((s) => s.project!.textures);
  const n = Math.max(1, Math.min(54, el.slotCount ?? 27));
  const layout = el.containerLayout;
  const on = !!layout?.enabled;
  const set = (p: Partial<ContainerLayout>, key?: string) => patch({ containerLayout: { ...(layout ?? DEFAULT_LAYOUT(n)), ...p } }, key);
  const slots = slotPositions(n, layout);
  const slotsH = Math.max(18, ...slots.map((p) => p.y + 18));
  const topH = slotsH + 24;
  const bg = textures.find((t) => t.id === el.containerBackground)?.dataUrl;
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ what: number | "title"; dx: number; dy: number } | null>(null);

  // Overlapping slots are hard to click in game.
  const overlaps = slots.some((a, i) => slots.some((b, j) => j > i && Math.abs(a.x - b.x) < CELL && Math.abs(a.y - b.y) < CELL));

  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / K, y: (e.clientY - r.top) / K };
  };
  const onDown = (what: number | "title") => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = point(e);
    const at = what === "title" ? { x: 7 + (layout?.titleX ?? 0), y: 10 + (layout?.titleY ?? 0) } : { x: 7 + slots[what].x, y: 21 + slots[what].y };
    setDrag({ what, dx: p.x - at.x, dy: p.y - at.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = point(e);
    if (drag.what === "title") {
      set({ titleX: Math.round(p.x - drag.dx - 7), titleY: Math.round(p.y - drag.dy - 10) }, "title-drag");
    } else {
      const x = Math.max(0, Math.min(144, Math.round(p.x - drag.dx - 7))), y = Math.max(0, Math.min(144, Math.round(p.y - drag.dy - 21)));
      const next = slotPositions(n, layout).map((s, k) => (k === drag.what ? { x, y } : s));
      set({ slots: next }, "slot-drag");
    }
  };

  return (
    <div className="stack">
      <Toggle label="Own slot layout" value={on} onChange={(v) => patch({ containerLayout: v ? { ...(layout ?? DEFAULT_LAYOUT(n)), enabled: true } : layout ? { ...layout, enabled: false } : undefined })}
        help="Put each slot where you like (for example a 3×3 grid for a crafter), and move or recolour the title. Works on every device." />
      {on && (
        <>
          <div className="row wrap">
            <span className="muted small">Arrange:</span>
            {[["chest", "Chest rows"], ["grid3", "3 per row"], ["grid5", "5 per row"], ["row", "One row"], ["ring", "Ring"]].map(([k, label]) => (
              <button key={k} type="button" className="btn small" onClick={() => set({ slots: preset(k, n) })}>{label}</button>
            ))}
          </div>
          <div className="slot-canvas-wrap">
            <div ref={box} className="slot-canvas" style={{ width: 176 * K, height: (topH + 11 + 40) * K }} onPointerMove={onMove} onPointerUp={() => setDrag(null)}>
              <div className="slot-top" style={{ top: 11 * K, height: topH * K }}>
                {bg && <img className="pixel slot-bg" src={bg} alt="" style={{ left: 4 * K, top: -7 * K, width: 168 * K, height: (topH + 4) * K }} />}
              </div>
              {(layout?.showTitle ?? true) && (
                <span className="slot-title" style={{ left: (7 + (layout?.titleX ?? 0)) * K, top: (10 + (layout?.titleY ?? 0)) * K, color: layout?.titleColor || "#404040" }} onPointerDown={onDown("title")}>
                  {el.containerTitle || el.displayName}
                </span>
              )}
              {slots.map((p, k) => (
                <span key={k} className={`slot-cell${drag?.what === k ? " on" : ""}`} style={{ left: (7 + p.x) * K, top: (21 + p.y) * K, width: CELL * K, height: CELL * K }} onPointerDown={onDown(k)}>{k + 1}</span>
              ))}
              <div className="slot-inventory" style={{ top: (topH + 11) * K }}>Inventory</div>
            </div>
          </div>
          {overlaps && <p className="warn-text">Some slots overlap, which makes them hard to tap in game.</p>}
          <Grid>
            <Toggle label="Show the title" value={layout!.showTitle} onChange={(showTitle) => set({ showTitle })} />
            {layout!.showTitle && <Color label="Title colour" value={layout!.titleColor || "#404040"} onChange={(titleColor) => set({ titleColor }, "tcolor")} />}
          </Grid>
          <p className="field-help">Drag slots and the title. Slot numbers are the container's slot order (what hoppers and scripts see). The screen grows to fit; keep it to about 6 rows high so the inventory still fits on small screens.</p>
        </>
      )}
    </div>
  );
}
