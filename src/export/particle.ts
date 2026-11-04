// Particle effects: RP/particles/<name>.json plus the sprite texture.

import type { ParticleElement } from "../model/types";
import { SPRITE_SIZE, spritePixels } from "../model/particleSprites";
import { GenContext, dataUrlToBytes } from "./context";
import { round } from "./content";
import { encodePng } from "./png";

const num = (v: number) => round(Number(v) || 0);
/** A fixed number, or math.random(a, b) when the range is real. */
const range = (a: number, b: number) => {
  const lo = num(Math.min(a, b)), hi = num(Math.max(a, b));
  return lo === hi ? lo : `math.random(${lo}, ${hi})`;
};
const LIFE = "variable.particle_age / variable.particle_lifetime";

export function rgba(hex: string, alphaPercent: number): number[] {
  const h = (hex || "#ffffff").replace("#", "").padEnd(6, "f").slice(0, 6);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, Math.max(0, Math.min(100, alphaPercent)) / 100].map((x) => round(x));
}

/** PNG size of a data URL (reads the IHDR header). */
function pngSize(bytes: Uint8Array): [number, number] {
  if (bytes.length < 24) return [16, 16];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

export function genParticle(ctx: GenContext, p: ParticleElement) {
  const id = ctx.id(p.name);
  // Texture: a built-in sprite drawn here, or the chosen texture.
  let path = `textures/particle/${ctx.ns}_${p.name}`;
  let size: [number, number] = [SPRITE_SIZE, SPRITE_SIZE];
  if (p.sprite === "custom") {
    const tex = ctx.texture(p.texture);
    if (!tex) {
      ctx.warn(p, "uses its own texture, but none is chosen. It will use the soft dot instead.");
      ctx.rp(`${path}.png`, encodePng(SPRITE_SIZE, SPRITE_SIZE, spritePixels("dot")));
    } else {
      const bytes = dataUrlToBytes(tex.dataUrl);
      path = `textures/particle/${ctx.ns}_${tex.name}`;
      ctx.rp(`${path}.png`, bytes);
      size = pngSize(bytes);
    }
  } else {
    ctx.rp(`${path}.png`, encodePng(SPRITE_SIZE, SPRITE_SIZE, spritePixels(p.sprite)));
  }

  const components: Record<string, unknown> = {};
  if (p.mode === "burst") {
    components["minecraft:emitter_rate_instant"] = { num_particles: Math.max(1, Math.min(1000, Math.round(p.count))) };
    components["minecraft:emitter_lifetime_once"] = { active_time: 0.1 };
  } else {
    const rate = Math.max(0.1, Math.min(500, p.rate));
    components["minecraft:emitter_rate_steady"] = { spawn_rate: num(rate), max_particles: Math.min(1000, Math.ceil(rate * Math.max(p.lifetimeMin, p.lifetimeMax)) + 10) };
    components["minecraft:emitter_lifetime_once"] = { active_time: num(Math.max(0.05, p.duration)) };
  }

  const s = Math.max(0, Math.min(1, p.spread));
  const direction = p.direction === "up"
    ? (s ? [`math.random(-${num(s)}, ${num(s)})`, 1, `math.random(-${num(s)}, ${num(s)})`] : [0, 1, 0])
    : p.direction;
  const r = num(Math.max(0, p.radius));
  if (p.shape === "box") {
    components["minecraft:emitter_shape_box"] = { half_dimensions: [r, r, r], surface_only: p.surfaceOnly, direction };
  } else if (p.shape === "disc") {
    components["minecraft:emitter_shape_disc"] = { radius: r, plane_normal: "y", surface_only: p.surfaceOnly, direction };
  } else if (r === 0 && p.direction !== "up") {
    // A point has no "outwards": pick a random direction instead.
    components["minecraft:emitter_shape_point"] = {
      direction: p.direction === "outwards" ? ["math.random(-1, 1)", "math.random(-1, 1)", "math.random(-1, 1)"] : [0, -1, 0],
    };
  } else {
    components["minecraft:emitter_shape_sphere"] = { radius: r, surface_only: p.surfaceOnly, direction };
  }

  components["minecraft:particle_lifetime_expression"] = { max_lifetime: range(Math.max(0.05, p.lifetimeMin), Math.max(0.05, p.lifetimeMax)) };
  components["minecraft:particle_initial_speed"] = range(p.speedMin, p.speedMax);
  if (p.spin > 0) components["minecraft:particle_initial_spin"] = { rotation: "math.random(0, 360)", rotation_rate: `math.random(-${num(p.spin)}, ${num(p.spin)})` };
  components["minecraft:particle_motion_dynamic"] = { linear_acceleration: [0, num(-p.gravity), 0], linear_drag_coefficient: num(Math.max(0, p.drag)) };
  if (p.collide !== "none") {
    components["minecraft:particle_motion_collision"] = {
      collision_drag: 0,
      coefficient_of_restitution: p.collide === "bounce" ? num(Math.max(0, Math.min(1, p.bounce))) : 0,
      collision_radius: num(Math.max(0.01, Math.min(p.sizeStart, p.sizeEnd) / 2)),
      expire_on_contact: p.collide === "vanish",
    };
  }
  // Billboard size is half the width.
  const half = (v: number) => num(Math.max(0.005, v) / 2);
  const sz = half(p.sizeStart) === half(p.sizeEnd) ? half(p.sizeStart) : `math.lerp(${half(p.sizeStart)}, ${half(p.sizeEnd)}, ${LIFE})`;
  components["minecraft:particle_appearance_billboard"] = {
    size: [sz, sz],
    facing_camera_mode: "rotate_xyz",
    uv: { texture_width: size[0], texture_height: size[1], uv: [0, 0], uv_size: [size[0], size[1]] },
  };
  const c0 = rgba(p.colorStart, p.alphaStart), c1 = rgba(p.colorEnd, p.alphaEnd);
  components["minecraft:particle_appearance_tinting"] = {
    color: c0.join() === c1.join() ? c0 : { gradient: { "0.0": c0, "1.0": c1 }, interpolant: LIFE },
  };
  if (p.lit) components["minecraft:particle_appearance_lighting"] = {};

  ctx.rp(`particles/${p.name}.json`, {
    format_version: "1.10.0",
    particle_effect: {
      description: { identifier: id, basic_render_parameters: { material: p.blend === "alpha" ? "particles_alpha" : "particles_blend", texture: path } },
      components,
    },
  });
}
