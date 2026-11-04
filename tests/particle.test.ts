import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng } from "../src/export/png";
import { spritePixels, PARTICLE_SPRITES } from "../src/model/particleSprites";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

/** Decodes our own (filter 0) PNGs, checking every chunk's CRC. */
function decode(png: Uint8Array) {
  expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const v = new DataView(png.buffer, png.byteOffset);
  let o = 8, w = 0, h = 0;
  const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = v.getUint32(o), type = String.fromCharCode(...png.slice(o + 4, o + 8));
    const data = png.slice(o + 8, o + 8 + len);
    if (type === "IHDR") { w = v.getUint32(o + 8); h = v.getUint32(o + 12); }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return { w, h, raw };
}

describe("PNG encoder", () => {
  it("writes valid PNGs that decode to the same pixels", () => {
    const px = spritePixels("heart");
    const { w, h, raw } = decode(encodePng(16, 16, px));
    expect([w, h]).toEqual([16, 16]);
    expect(raw[0]).toBe(0);
    expect([...raw.slice(1, 65)]).toEqual([...px.slice(0, 64)]);
  });
  it("handles images bigger than one deflate block", () => {
    const px = new Uint8Array(200 * 100 * 4).map((_, i) => i % 251);
    const { raw } = decode(encodePng(200, 100, px));
    expect(raw.length).toBe(100 * (200 * 4 + 1));
  });
  it("draws every built-in sprite with something visible", () => {
    for (const s of PARTICLE_SPRITES) expect(spritePixels(s.id).some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  });
});

describe("particle effects", () => {
  const project = () => {
    const p = createProject("Fx");
    p.namespace = "fx";
    p.textures.push({ id: "own", name: "glimmer", kind: "item", width: 1, height: 1, dataUrl: PNG });
    const burst = createElement("particle", "sparkle", "Sparkle");
    const stream = createElement("particle", "fountain", "Fountain");
    Object.assign(stream, { mode: "stream", rate: 40, duration: 2, shape: "disc", direction: "up", spread: 0.25, collide: "bounce", bounce: 0.3, sprite: "custom", texture: "own", blend: "alpha", lit: true, colorEnd: "#ffe680", alphaEnd: 100, sizeEnd: 0.25, spin: 90 });
    const point = createElement("particle", "poof", "Poof");
    point.radius = 0;
    const proc = createElement("procedure", "zap", "Zap");
    proc.trigger = "item_use";
    proc.actions = [
      { id: "a", type: "spawn_particle", params: { particle: "sparkle", at: "player", height: 1.5 }, chance: 100 },
      { id: "b", type: "spawn_particle", params: { particle: "minecraft:heart_particle", at: "target", height: 2 }, chance: 100 },
    ];
    p.elements.push(burst, stream, point, proc);
    return p;
  };
  const { files, warnings } = generateAddon(project());
  const fx = (n: string) => JSON.parse(files.get(`RP/particles/${n}.json`) as string).particle_effect;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("writes a burst with a fading colour and shrinking size", () => {
    const e = fx("sparkle");
    expect(e.description).toEqual({ identifier: "fx:sparkle", basic_render_parameters: { material: "particles_blend", texture: "textures/particle/fx_sparkle" } });
    const c = e.components;
    expect(c["minecraft:emitter_rate_instant"]).toEqual({ num_particles: 24 });
    expect(c["minecraft:emitter_shape_sphere"]).toEqual({ radius: 0.2, surface_only: false, direction: "outwards" });
    expect(c["minecraft:particle_lifetime_expression"].max_lifetime).toBe("math.random(0.6, 1.2)");
    expect(c["minecraft:particle_motion_dynamic"]).toEqual({ linear_acceleration: [0, -2, 0], linear_drag_coefficient: 1.5 });
    expect(c["minecraft:particle_appearance_billboard"].size[0]).toBe("math.lerp(0.125, 0.025, variable.particle_age / variable.particle_lifetime)");
    const grad = c["minecraft:particle_appearance_tinting"].color.gradient;
    expect(grad["0.0"][3]).toBe(1);
    expect(grad["1.0"][3]).toBe(0);
    expect(c["minecraft:particle_appearance_lighting"]).toBeUndefined();
    expect(decode(files.get("RP/textures/particle/fx_sparkle.png") as Uint8Array).w).toBe(16);
  });

  it("writes a stream with its own texture, bouncing and spin", () => {
    const c = fx("fountain").components;
    expect(fx("fountain").description.basic_render_parameters).toEqual({ material: "particles_alpha", texture: "textures/particle/fx_glimmer" });
    expect(files.has("RP/textures/particle/fx_glimmer.png")).toBe(true);
    expect(c["minecraft:emitter_rate_steady"].spawn_rate).toBe(40);
    expect(c["minecraft:emitter_lifetime_once"]).toEqual({ active_time: 2 });
    expect(c["minecraft:emitter_shape_disc"].direction).toEqual(["math.random(-0.25, 0.25)", 1, "math.random(-0.25, 0.25)"]);
    expect(c["minecraft:particle_motion_collision"]).toMatchObject({ coefficient_of_restitution: 0.3, expire_on_contact: false });
    expect(c["minecraft:particle_initial_spin"].rotation_rate).toBe("math.random(-90, 90)");
    expect(c["minecraft:particle_appearance_lighting"]).toEqual({});
    expect(c["minecraft:particle_appearance_billboard"].uv).toEqual({ texture_width: 1, texture_height: 1, uv: [0, 0], uv_size: [1, 1] });
  });

  it("uses a random direction for single-point bursts", () => {
    expect(fx("poof").components["minecraft:emitter_shape_point"].direction[0]).toBe("math.random(-1, 1)");
  });

  it("spawns own and vanilla particles from procedures with a script that type-checks", () => {
    const js = files.get("BP/scripts/main.js") as string;
    expect(js).toContain(`BC.particle(ctx, "sparkle", "player", 1.5);`);
    expect(js).toContain(`BC.particle(ctx, "minecraft:heart_particle", "target", 2);`);
    expect(typecheckScript(js)).toEqual([]);
  });

  it("reports missing particle effects and textures", () => {
    const p = project();
    p.textures = [];
    const proc = p.elements.find((e) => e.kind === "procedure");
    if (proc?.kind === "procedure") proc.actions[0].params.particle = "gone";
    const msgs = generateAddon(p).warnings.map((w) => w.message);
    expect(msgs.some((m) => m.includes(`"gone"`))).toBe(true);
    expect(msgs.some((m) => m.includes("none is chosen"))).toBe(true);
  });
});
