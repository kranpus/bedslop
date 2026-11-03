// Procedural pixel-art textures. Draws onto a small RGBA grid, then outlines and shades it.
// Runs in the browser (uses canvas only for the final PNG encoding).

export type RGBA = [number, number, number, number];

export interface TemplateInfo {
  id: string;
  label: string;
  size: [number, number];
  kind: "block" | "item" | "entity" | "armor";
}

export const TEMPLATES: TemplateInfo[] = [
  { id: "stone", label: "Stone-like block", size: [16, 16], kind: "block" },
  { id: "ore", label: "Ore block", size: [16, 16], kind: "block" },
  { id: "storage", label: "Storage block (block of …)", size: [16, 16], kind: "block" },
  { id: "planks", label: "Planks", size: [16, 16], kind: "block" },
  { id: "bricks", label: "Bricks", size: [16, 16], kind: "block" },
  { id: "glass", label: "Glass", size: [16, 16], kind: "block" },
  { id: "flower", label: "Flower (plant)", size: [16, 16], kind: "block" },
  { id: "gem", label: "Gem", size: [16, 16], kind: "item" },
  { id: "ingot", label: "Ingot", size: [16, 16], kind: "item" },
  { id: "dust", label: "Dust", size: [16, 16], kind: "item" },
  { id: "fruit", label: "Fruit / food", size: [16, 16], kind: "item" },
  { id: "pickaxe", label: "Pickaxe", size: [16, 16], kind: "item" },
  { id: "axe", label: "Axe", size: [16, 16], kind: "item" },
  { id: "shovel", label: "Shovel", size: [16, 16], kind: "item" },
  { id: "hoe", label: "Hoe", size: [16, 16], kind: "item" },
  { id: "sword", label: "Sword", size: [16, 16], kind: "item" },
  { id: "helmet", label: "Helmet icon", size: [16, 16], kind: "item" },
  { id: "chestplate", label: "Chestplate icon", size: [16, 16], kind: "item" },
  { id: "leggings", label: "Leggings icon", size: [16, 16], kind: "item" },
  { id: "boots", label: "Boots icon", size: [16, 16], kind: "item" },
  { id: "armor_layer_1", label: "Worn armor (layer 1)", size: [64, 32], kind: "armor" },
  { id: "armor_layer_2", label: "Worn armor (layer 2)", size: [64, 32], kind: "armor" },
  { id: "mob_humanoid", label: "Humanoid mob skin", size: [64, 64], kind: "entity" },
  { id: "mob_quadruped", label: "Four-legged mob skin", size: [64, 64], kind: "entity" },
];

// ---------- colour helpers ----------

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

/** f in -1..1: negative darkens, positive lightens. */
export function shade(c: [number, number, number], f: number): RGBA {
  const t = f < 0 ? 0 : 255;
  const k = Math.abs(f);
  return [c[0] + (t - c[0]) * k, c[1] + (t - c[1]) * k, c[2] + (t - c[2]) * k, 255].map(Math.round) as RGBA;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- grid ----------

export class Grid {
  data: (RGBA | null)[];
  constructor(readonly w: number, readonly h: number) {
    this.data = Array(w * h).fill(null);
  }
  get(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.data[y * this.w + x];
  }
  set(x: number, y: number, c: RGBA | null) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: (x: number, y: number) => RGBA | null) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, c(x, y));
  }
  line(x0: number, y0: number, x1: number, y1: number, c: (x: number, y: number) => RGBA) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c(x0, y0));
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  polygon(pts: [number, number][], c: (x: number, y: number) => RGBA) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, c(x, y));
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: (x: number, y: number) => RGBA) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c(x, y));
  }
  /** Adds a dark outline around every filled shape (classic item look). */
  outline(darkness = 0.55) {
    const copy = [...this.data];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (copy[y * this.w + x]) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => (x + dx >= 0 && x + dx < this.w && y + dy >= 0 && y + dy < this.h ? copy[(y + dy) * this.w + x + dx] : null))
          .find(Boolean);
        if (n) this.set(x, y, shade([n[0], n[1], n[2]], -darkness));
      }
  }
}

// ---------- templates ----------

const WOOD: [number, number, number] = [122, 86, 52];

export function drawTemplate(id: string, hex: string, seed = 1): Grid {
  const info = TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
  const [w, h] = info.size;
  const g = new Grid(w, h);
  const base = hexToRgb(hex);
  const r = rng(seed);
  const noise = (amt: number) => (r() - 0.5) * amt;
  const diag = (x: number, y: number, k = 0.25) => ((w - x) + (h - y) - w) / w * k; // lighter top-left
  const mat = (x: number, y: number) => shade(base, diag(x, y, 0.35) + noise(0.12));
  const stone: [number, number, number] = [125, 125, 125];
  const handle = (x: number, y: number) => shade(WOOD, diag(x, y, 0.3) + noise(0.08));

  switch (id) {
    case "stone":
      g.rect(0, 0, 15, 15, () => shade(base, noise(0.28)));
      break;
    case "ore": {
      g.rect(0, 0, 15, 15, () => shade(stone, noise(0.25)));
      const spots = 5 + Math.floor(r() * 2);
      for (let i = 0; i < spots; i++) {
        const cx = 2 + Math.floor(r() * 12), cy = 2 + Math.floor(r() * 12);
        const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].slice(0, 3 + Math.floor(r() * 4));
        pts.forEach(([dx, dy], k) => g.set(cx + dx, cy + dy, shade(base, k === 0 ? 0.3 : noise(0.2) - 0.05)));
        g.set(cx + 1, cy + 2, shade(base, -0.45));
      }
      break;
    }
    case "storage":
      g.rect(0, 0, 15, 15, (x, y) => {
        if (x === 0 || y === 0) return shade(base, 0.35);
        if (x === 15 || y === 15) return shade(base, -0.4);
        if (x === 1 || y === 1) return shade(base, 0.15 + noise(0.05));
        if (x === 14 || y === 14) return shade(base, -0.2);
        return shade(base, noise(0.14) + (x + y < 12 ? 0.08 : 0));
      });
      break;
    case "planks":
      g.rect(0, 0, 15, 15, (x, y) => {
        if (y % 4 === 3) return shade(base, -0.45);
        const offset = Math.floor(y / 4) % 2 ? 8 : 0;
        if ((x + offset) % 16 === 0) return shade(base, -0.35);
        return shade(base, noise(0.1) + (y % 4 === 0 ? 0.08 : 0));
      });
      break;
    case "bricks":
      g.rect(0, 0, 15, 15, (x, y) => {
        if (y % 4 === 3) return [200, 195, 185, 255];
        const offset = Math.floor(y / 4) % 2 ? 4 : 0;
        if ((x + offset) % 8 === 7) return [200, 195, 185, 255];
        return shade(base, noise(0.16) + (y % 4 === 0 ? 0.1 : 0));
      });
      break;
    case "glass":
      g.rect(0, 0, 15, 15, (x, y) => {
        if (x === 0 || y === 0 || x === 15 || y === 15) return shade(base, -0.1);
        if ((x === y + 2 || x === y + 3) && x < 8) return [255, 255, 255, 170];
        return [base[0], base[1], base[2], 40];
      });
      break;
    case "flower": {
      const green: [number, number, number] = [72, 140, 48];
      g.line(8, 15, 8, 8, () => shade(green, noise(0.1)));
      g.line(9, 13, 11, 11, () => shade(green, 0.1));
      g.line(7, 12, 5, 10, () => shade(green, 0.1));
      g.circle(8.5, 5.5, 3.6, (x, y) => shade(base, diag(x, y, 0.4) + noise(0.1)));
      g.rect(8, 5, 8, 5, () => [245, 210, 60, 255]);
      g.set(7, 5, [230, 180, 40, 255]);
      g.outline(0.5);
      break;
    }
    case "gem":
      g.polygon([[8, 2], [14, 6], [8, 14], [2, 6]], (x, y) => shade(base, y < 6 ? 0.35 : diag(x, y, 0.3) - (x > 8 ? 0.15 : 0)));
      g.line(5, 5, 7, 4, () => [255, 255, 255, 255]);
      g.outline();
      break;
    case "ingot":
      g.polygon([[5, 5], [14, 5], [11, 11], [2, 11]], (x, y) => shade(base, y <= 6 ? 0.35 : y >= 10 ? -0.3 : diag(x, y, 0.25)));
      g.line(6, 6, 9, 6, () => shade(base, 0.6));
      g.outline();
      break;
    case "dust":
      for (let i = 0; i < 42; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 5.2;
        const x = Math.round(8 + Math.cos(a) * d), y = Math.round(10 + Math.sin(a) * d * 0.6);
        g.set(x, y, shade(base, noise(0.5)));
      }
      g.outline(0.4);
      break;
    case "fruit":
      g.circle(8, 9.5, 5.4, (x, y) => shade(base, diag(x, y, 0.45) + noise(0.06)));
      g.set(6, 7, shade(base, 0.6));
      g.set(6, 8, shade(base, 0.45));
      g.line(8, 2, 8, 4, () => shade(WOOD, -0.1));
      g.line(9, 3, 11, 2, () => [80, 150, 50, 255]);
      g.outline();
      break;
    case "pickaxe":
      g.line(3, 13, 10, 6, handle);
      g.line(3, 12, 9, 6, handle);
      [[4, 3], [5, 2], [9, 2], [12, 4], [13, 5], [13, 9], [12, 11]].reduce((a, b) => {
        g.line(a[0], a[1], b[0], b[1], mat);
        g.line(a[0], a[1] + 1, b[0] - 1, b[1] + 1, mat);
        return b;
      });
      g.outline();
      break;
    case "axe":
      g.line(3, 13, 10, 6, handle);
      g.line(3, 12, 9, 6, handle);
      g.polygon([[8, 3], [11, 1], [15, 5], [13, 9], [10, 9], [9, 6]], mat);
      g.outline();
      break;
    case "shovel":
      g.line(3, 13, 9, 7, handle);
      g.line(3, 12, 8, 7, handle);
      g.polygon([[11, 1], [15, 5], [11, 9], [7, 5]], mat);
      g.outline();
      break;
    case "hoe":
      g.line(3, 13, 11, 5, handle);
      g.line(3, 12, 10, 5, handle);
      g.polygon([[7, 2], [13, 2], [14, 3], [13, 6], [11, 6], [11, 4], [7, 4]], mat);
      g.outline();
      break;
    case "sword":
      g.line(5, 10, 13, 2, mat);
      g.line(6, 10, 13, 3, mat);
      g.line(5, 9, 12, 2, (x, y) => shade(base, 0.35 + diag(x, y, 0.1)));
      g.line(3, 8, 7, 12, () => shade(base, -0.35));
      g.line(2, 13, 4, 11, handle);
      g.set(2, 14, shade(base, -0.2));
      g.outline();
      break;
    case "helmet":
      g.rect(3, 3, 12, 10, mat);
      g.rect(5, 7, 10, 10, () => null);
      g.set(3, 3, null); g.set(12, 3, null);
      g.outline();
      break;
    case "chestplate":
      g.rect(2, 2, 13, 13, mat);
      g.rect(6, 2, 9, 3, () => null);
      g.rect(2, 6, 3, 13, () => null);
      g.rect(12, 6, 13, 13, () => null);
      g.outline();
      break;
    case "leggings":
      g.rect(3, 2, 12, 5, mat);
      g.rect(3, 6, 6, 13, mat);
      g.rect(9, 6, 12, 13, mat);
      g.outline();
      break;
    case "boots":
      g.rect(2, 5, 5, 12, mat);
      g.rect(2, 10, 7, 12, mat);
      g.rect(10, 5, 13, 12, mat);
      g.rect(8, 10, 13, 12, mat);
      g.outline();
      break;
    case "armor_layer_1":
    case "armor_layer_2": {
      const paint = (x0: number, y0: number, x1: number, y1: number) =>
        g.rect(x0, y0, x1, y1, (x, y) => shade(base, ((x + y) % 7 === 0 ? 0.12 : 0) + noise(0.14) - ((y - y0) / (y1 - y0 + 1)) * 0.2));
      if (id === "armor_layer_1") {
        paint(0, 0, 31, 15); // helmet
        paint(16, 16, 39, 31); // chestplate body
        paint(40, 16, 55, 31); // arms
        paint(0, 16, 15, 31); // boots
        g.rect(8, 8, 15, 15, (x, y) => (y > 10 && x > 9 && x < 14 ? null : g.get(x, y))); // visor
      } else {
        paint(16, 16, 39, 31); // waist
        paint(0, 16, 15, 31); // legs
      }
      break;
    }
    case "mob_humanoid":
    case "mob_quadruped": {
      const box = (u: number, v: number, bw: number, bh: number, bd: number, col: [number, number, number]) =>
        g.rect(u, v, u + 2 * (bd + bw) - 1, v + bd + bh - 1, (x, y) => (x < u + bd && y < v + bd) || (x >= u + bd + 2 * bw && y < v + bd) ? null : shade(col, noise(0.12)));
      const face = (fx: number, fy: number, fw: number) => {
        const eye: RGBA = [30, 30, 40, 255];
        g.set(fx + 1, fy + 4, [240, 240, 240, 255]); g.set(fx + 2, fy + 4, eye);
        g.set(fx + fw - 3, fy + 4, eye); g.set(fx + fw - 2, fy + 4, [240, 240, 240, 255]);
      };
      const dark = shade(base, -0.35).slice(0, 3) as [number, number, number];
      const light = shade(base, 0.3).slice(0, 3) as [number, number, number];
      if (id === "mob_humanoid") {
        box(0, 0, 8, 8, 8, light); face(8, 8, 8);
        g.rect(10, 13, 13, 13, () => shade(light, -0.4));
        box(16, 16, 8, 12, 4, base);
        box(40, 16, 4, 12, 4, light); box(32, 48, 4, 12, 4, light);
        box(0, 16, 4, 12, 4, dark); box(16, 48, 4, 12, 4, dark);
      } else {
        box(0, 0, 8, 8, 8, base); face(8, 8, 8);
        g.rect(10, 13, 13, 15, () => shade(light, 0.1));
        box(0, 16, 10, 8, 16, base);
        box(0, 40, 4, 6, 4, dark);
      }
      break;
    }
  }
  return g;
}

export function gridToDataUrl(g: Grid): string {
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(g.w, g.h);
  g.data.forEach((px, i) => {
    if (!px) return;
    img.data.set(px.map((v) => Math.max(0, Math.min(255, Math.round(v)))), i * 4);
  });
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export function generateTexture(template: string, hex: string, seed = 1) {
  const g = drawTemplate(template, hex, seed);
  return { dataUrl: gridToDataUrl(g), width: g.w, height: g.h };
}

/** Scales a texture up with crisp pixels for a pack icon (PNG bytes). */
export async function packIconFrom(dataUrl: string, size = 256): Promise<Uint8Array> {
  const img = await loadImage(dataUrl);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1e2a22";
  ctx.fillRect(0, 0, size, size);
  const pad = size * 0.12;
  ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
  const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
