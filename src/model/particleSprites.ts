// Built-in particle sprites: 16×16 white shapes (so colour tinting works), shared by the preview and the export.

export const PARTICLE_SPRITES = [
  { id: "dot", label: "Soft dot" },
  { id: "circle", label: "Circle" },
  { id: "spark", label: "Spark" },
  { id: "star", label: "Star" },
  { id: "heart", label: "Heart" },
  { id: "square", label: "Square" },
  { id: "ring", label: "Ring" },
  { id: "puff", label: "Smoke puff" },
] as const;

export type BuiltInSprite = (typeof PARTICLE_SPRITES)[number]["id"];

const N = 16;

/** RGBA pixels (16×16) for a built-in sprite: white with shape-dependent alpha. */
export function spritePixels(id: BuiltInSprite): Uint8Array {
  const px = new Uint8Array(N * N * 4);
  const c = (N - 1) / 2;
  const alpha = (x: number, y: number): number => {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
    switch (id) {
      case "dot": return Math.max(0, 1 - r / 7.5) ** 1.4;
      case "circle": return r <= 6.6 ? 1 : 0;
      case "ring": return r <= 6.8 && r >= 4.6 ? 1 : 0;
      case "square": return Math.abs(dx) <= 5.5 && Math.abs(dy) <= 5.5 ? 1 : 0;
      case "spark": {
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const arm = (a: number, b: number) => (b <= 1.1 && a <= 7.5 ? 1 - a / 9 : 0);
        return Math.min(1, Math.max(arm(ax, ay), arm(ay, ax), r <= 2.2 ? 1 : 0));
      }
      case "star": {
        // Five-pointed star by polar test.
        const a = Math.atan2(dy, dx) + Math.PI / 2;
        const k = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5;
        const edge = 3 + 4.6 * (1 - Math.abs(k) / (Math.PI / 5)) ** 1.6;
        return r <= edge ? 1 : 0;
      }
      case "heart": {
        const hx = dx / 6.5, hy = -(dy + 0.8) / 6.5;
        const v = (hx * hx + hy * hy - 0.6) ** 3 - hx * hx * hy * hy * hy;
        return v <= 0 ? 1 : 0;
      }
      case "puff": {
        const blobs = [[-2.5, 1, 4.2], [2.6, 1.4, 4], [0, -2.4, 4.4], [0, 2.6, 3.6]];
        let a = 0;
        for (const [bx, by, br] of blobs) a = Math.max(a, 1 - Math.hypot(dx - bx, dy - by) / br);
        return Math.min(1, a * 1.6) * 0.9;
      }
    }
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const a = Math.round(Math.max(0, Math.min(1, alpha(x, y))) * 255);
    // Slight shading toward the edge keeps solid shapes readable.
    const shade = id === "dot" || id === "puff" ? 255 : 255 - Math.round(Math.min(60, Math.hypot(x - c, y - c) * 6));
    px[i] = px[i + 1] = px[i + 2] = a ? shade : 0;
    px[i + 3] = a;
  }
  return px;
}

export const SPRITE_SIZE = N;
