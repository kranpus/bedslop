// Converts a Blockbench project file (.bbmodel) into Bedrock geometry + animations,
// following Blockbench's own Bedrock exporter conventions. Pure: no DOM.

type V3 = [number, number, number];

interface BbFace { uv?: number[]; texture?: number | string | null; rotation?: number }
interface BbElement {
  uuid: string; name?: string; type?: string;
  from: V3; to: V3; origin?: V3; rotation?: V3; inflate?: number;
  box_uv?: boolean; uv_offset?: [number, number]; mirror_uv?: boolean;
  faces?: Record<string, BbFace>;
}
interface BbGroup { uuid: string; name: string; origin?: V3; rotation?: V3; mirror_uv?: boolean; children?: (string | BbGroup)[] }
interface BbKeyframe { channel: string; time: number; data_points?: Record<string, string | number>[]; interpolation?: string }
interface BbAnimation { name: string; loop?: string; length?: number; animators?: Record<string, { name?: string; type?: string; keyframes?: BbKeyframe[] }> }
interface BbModel {
  meta?: { model_format?: string; box_uv?: boolean };
  name?: string; model_identifier?: string;
  resolution?: { width: number; height: number };
  elements?: BbElement[];
  outliner?: (string | BbGroup)[];
  textures?: { name?: string; source?: string; width?: number; height?: number }[];
  animations?: BbAnimation[];
}

export interface BbConversion {
  geometry: string;
  geometryId: string;
  animations: string;
  texture?: { name: string; dataUrl: string; width: number; height: number };
  notes: string[];
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const vec = (v: unknown): V3 => (Array.isArray(v) ? [num(v[0]), num(v[1]), num(v[2])] : [0, 0, 0]);
const zero = (v: V3) => v.every((n) => n === 0);
const round = (n: number) => Math.round(n * 10000) / 10000 + 0; // + 0 turns -0 into 0
const neg = (n: number) => round(-n);

export function isBbmodel(text: string) {
  try {
    const d = JSON.parse(text);
    return !!d && typeof d === "object" && "meta" in d && Array.isArray(d.elements);
  } catch {
    return false;
  }
}

export function convertBbmodel(text: string, fallbackName = "model"): BbConversion {
  const d = JSON.parse(text) as BbModel;
  const notes: string[] = [];
  const format = d.meta?.model_format ?? "";
  if (/java|block|item/i.test(format) && !/bedrock/i.test(format)) {
    throw new Error("This is a Java block/item model. Make the mob as a Bedrock Entity in Blockbench (File → Convert Project → Bedrock Entity), then import it.");
  }
  const width = d.resolution?.width ?? 64;
  const height = d.resolution?.height ?? 64;
  const globalBoxUv = d.meta?.box_uv ?? true;
  const elements = new Map((d.elements ?? []).filter((e) => !e.type || e.type === "cube").map((e) => [e.uuid, e]));
  if (!elements.size) throw new Error("This Blockbench file has no cubes.");

  const cube = (e: BbElement, boneMirror: boolean) => {
    const from = vec(e.from), to = vec(e.to);
    const size: V3 = [round(to[0] - from[0]), round(to[1] - from[1]), round(to[2] - from[2])];
    const c: Record<string, unknown> = { origin: [neg(from[0] + size[0]), round(from[1]), round(from[2])], size };
    if (e.inflate) c.inflate = e.inflate;
    const rot = vec(e.rotation);
    if (!zero(rot)) {
      const o = vec(e.origin);
      c.pivot = [neg(o[0]), round(o[1]), round(o[2])];
      c.rotation = [neg(rot[0]), neg(rot[1]), round(rot[2])];
    }
    if (e.box_uv ?? globalBoxUv) {
      c.uv = e.uv_offset ?? [0, 0];
      if (!!e.mirror_uv !== boneMirror) c.mirror = !!e.mirror_uv;
    } else {
      const uv: Record<string, unknown> = {};
      for (const [face, f] of Object.entries(e.faces ?? {})) {
        if (!f || f.texture === null || !f.uv) continue;
        const [u1, v1, u2, v2] = f.uv.map(num);
        let fu = [u1, v1], fs = [round(u2 - u1), round(v2 - v1)];
        if (face === "up" || face === "down") {
          fu = [round(u1 + fs[0]), round(v1 + fs[1])];
          fs = [-fs[0], -fs[1]];
        }
        uv[face] = { uv: fu, uv_size: fs, ...(f.rotation ? { uv_rotation: f.rotation } : {}) };
      }
      c.uv = uv;
    }
    return c;
  };

  const bones: Record<string, unknown>[] = [];
  const nameOf = new Map<string, string>();
  const used = new Set<string>();
  const uniqueName = (n: string) => {
    let name = n || "bone", i = 2;
    while (used.has(name)) name = `${n}${i++}`;
    used.add(name);
    return name;
  };
  const rootCubes: BbElement[] = [];

  const walk = (g: BbGroup, parent?: string) => {
    const name = uniqueName(g.name);
    nameOf.set(g.uuid, name);
    const o = vec(g.origin);
    const rot = vec(g.rotation);
    const bone: Record<string, unknown> = { name, ...(parent ? { parent } : {}), pivot: [neg(o[0]), round(o[1]), round(o[2])] };
    if (!zero(rot)) bone.rotation = [neg(rot[0]), neg(rot[1]), round(rot[2])];
    if (g.mirror_uv) bone.mirror = true;
    const cubes: unknown[] = [];
    bones.push(bone);
    for (const child of g.children ?? []) {
      if (typeof child === "string") {
        const e = elements.get(child);
        if (e) cubes.push(cube(e, !!g.mirror_uv));
      } else walk(child, name);
    }
    if (cubes.length) bone.cubes = cubes;
  };
  const outliner = d.outliner ?? [...elements.keys()];
  for (const node of outliner) {
    if (typeof node === "string") {
      const e = elements.get(node);
      if (e) rootCubes.push(e);
    } else walk(node);
  }
  if (rootCubes.length) bones.unshift({ name: uniqueName("bb_main"), pivot: [0, 0, 0], cubes: rootCubes.map((e) => cube(e, false)) });

  // Visible bounds from the cube extents, with headroom for animation.
  let maxXZ = 1, maxY = 1, minY = 0;
  for (const e of elements.values()) {
    const f = vec(e.from), t = vec(e.to);
    maxXZ = Math.max(maxXZ, ...[f[0], t[0], f[2], t[2]].map((n) => Math.abs(n) / 16));
    maxY = Math.max(maxY, t[1] / 16);
    minY = Math.min(minY, f[1] / 16);
  }
  const slug = (d.model_identifier || d.name || fallbackName).toLowerCase().replace(/^geometry\./, "").replace(/[^a-z0-9_.]+/g, "_") || "model";
  const geometryId = `geometry.${slug}`;
  const geometry = {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: {
        identifier: geometryId,
        texture_width: width,
        texture_height: height,
        visible_bounds_width: Math.ceil(maxXZ * 2 + 1),
        visible_bounds_height: Math.ceil(maxY - minY + 1),
        visible_bounds_offset: [0, round((maxY + minY) / 2), 0],
      },
      bones,
    }],
  };

  // Animations
  const anims: Record<string, unknown> = {};
  for (const a of d.animations ?? []) {
    const out: Record<string, unknown> = {};
    if (a.loop === "loop") out.loop = true;
    else if (a.loop === "hold") out.loop = "hold_on_last_frame";
    if (a.length) out.animation_length = a.length;
    // Animation-level settings Blockbench keeps in the project file.
    const extra = a as unknown as Record<string, unknown>;
    if (extra.override) out.override_previous_animation = true;
    for (const [from, to] of [["anim_time_update", "anim_time_update"], ["blend_weight", "blend_weight"], ["start_delay", "start_delay"], ["loop_delay", "loop_delay"]]) {
      const v = extra[from];
      if (v !== undefined && v !== "" && v !== null) out[to] = typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : v;
    }
    const boneAnims: Record<string, Record<string, Record<string, unknown>>> = {};
    for (const [uuid, animator] of Object.entries(a.animators ?? {})) {
      if (animator.type && animator.type !== "bone") continue;
      const bone = nameOf.get(uuid) ?? animator.name;
      if (!bone) continue;
      for (const k of animator.keyframes ?? []) {
        if (!["rotation", "position", "scale"].includes(k.channel)) continue;
        // Empty axes mean "unchanged": 0 for rotation/position, 1 for scale.
        const empty = k.channel === "scale" ? 1 : 0;
        const val = (x: unknown) => {
          if (x === undefined || x === null || String(x).trim() === "") return empty;
          const n = Number(x);
          return Number.isFinite(n) ? n : String(x).trim();
        };
        const point = (p: Record<string, string | number> | undefined) => [val(p?.x), val(p?.y), val(p?.z)];
        const pre = point(k.data_points?.[0]);
        const post = k.data_points && k.data_points.length > 1 ? point(k.data_points[1]) : null;
        const ch = (boneAnims[bone] ??= {})[k.channel] ??= {};
        let frame: unknown = pre;
        if (post) frame = { pre, post, ...(k.interpolation === "catmullrom" ? { lerp_mode: "catmullrom" } : {}) };
        else if (k.interpolation === "catmullrom") frame = { post: pre, lerp_mode: "catmullrom" };
        else if (k.interpolation === "step") frame = { pre, post: pre, lerp_mode: "step" };
        ch[String(round(k.time))] = frame;
      }
    }
    if (Object.keys(boneAnims).length) {
      out.bones = boneAnims;
      const animName = a.name.startsWith("animation.") ? a.name : `animation.${slug}.${a.name.replace(/[^a-z0-9_.]+/gi, "_")}`;
      anims[animName] = out;
    }
  }
  if ((d.animations?.length ?? 0) > Object.keys(anims).length) notes.push("Some animations had no bone keyframes and were skipped.");

  const tex = d.textures?.find((t) => t.source?.startsWith("data:image/png"));
  if (!tex && d.textures?.length) notes.push("The texture isn't embedded in this file. Upload the PNG separately.");

  return {
    geometry: JSON.stringify(geometry, null, 2),
    geometryId,
    animations: Object.keys(anims).length ? JSON.stringify({ format_version: "1.8.0", animations: anims }, null, 2) : "",
    texture: tex ? { name: (tex.name ?? slug).replace(/\.png$/i, ""), dataUrl: tex.source!, width: tex.width || width, height: tex.height || height } : undefined,
    notes,
  };
}
