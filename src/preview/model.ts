// Builds a three.js model from Bedrock geometry, using Blockbench's conventions:
// X is mirrored, bone/cube rotations become (-x, -y, z) in ZYX order, 1 unit = 1 pixel.
import * as THREE from "three";

type V3 = [number, number, number];
interface FaceUV { uv: [number, number]; uv_size?: [number, number]; uv_rotation?: number }
interface GeoCube { origin: V3; size: V3; uv?: [number, number] | Record<string, FaceUV>; inflate?: number; mirror?: boolean; pivot?: V3; rotation?: V3 }
interface GeoBone { name: string; parent?: string; pivot?: V3; rotation?: V3; mirror?: boolean; cubes?: GeoCube[]; inflate?: number }

export interface PreviewBone {
  name: string;
  group: THREE.Group;
  /** Rest pose, so animations can be applied on top each frame. */
  rest: { position: THREE.Vector3; rotation: THREE.Euler };
}

export interface PreviewModel {
  root: THREE.Group;
  bones: Map<string, PreviewBone>;
  /** Bounding box height in blocks, for camera framing. */
  size: THREE.Vector3;
  center: THREE.Vector3;
}

const RAD = Math.PI / 180;
const n = (v: unknown) => Number(v) || 0;
const v3 = (v: unknown): V3 => (Array.isArray(v) ? [n(v[0]), n(v[1]), n(v[2])] : [0, 0, 0]);

/** Rect in texture pixels: [u1, v1, u2, v2]; u1 > u2 or v1 > v2 means flipped. */
type Rect = [number, number, number, number];
type FaceName = "north" | "south" | "east" | "west" | "up" | "down";

function boxUv(u: number, v: number, [w, h, d]: V3, mirror: boolean): Record<FaceName, Rect> {
  // Blockbench box UV layout (sizes are floored like Minecraft does).
  const W = Math.floor(w), H = Math.floor(h), D = Math.floor(d);
  const r: Record<FaceName, Rect> = {
    east: [u, v + D, u + D, v + D + H],
    north: [u + D, v + D, u + D + W, v + D + H],
    west: [u + D + W, v + D, u + 2 * D + W, v + D + H],
    south: [u + 2 * D + W, v + D, u + 2 * D + 2 * W, v + D + H],
    up: [u + D + W, v + D, u + D, v],
    down: [u + D + 2 * W, v, u + D + W, v + D],
  };
  if (mirror) {
    [r.east, r.west] = [r.west, r.east];
    for (const k of Object.keys(r) as FaceName[]) r[k] = [r[k][2], r[k][1], r[k][0], r[k][3]];
  }
  return r;
}

function perFaceUv(uv: Record<string, FaceUV>): Partial<Record<FaceName, Rect>> {
  const out: Partial<Record<FaceName, Rect>> = {};
  for (const [face, f] of Object.entries(uv)) {
    if (!f?.uv) continue;
    const [u, v] = f.uv.map(n);
    const [w, h] = (f.uv_size ?? [0, 0]).map(n);
    // Bedrock stores up/down faces flipped compared to how Blockbench shows them.
    out[face as FaceName] = face === "up" || face === "down" ? [u + w, v + h, u, v] : [u, v, u + w, v + h];
  }
  return out;
}

/**
 * Box mesh with one quad per face. Corners are listed as seen from outside the face:
 * top-left, top-right, bottom-left, bottom-right, so a texture rect maps upright.
 */
function boxGeometry(from: V3, to: V3, rects: Partial<Record<FaceName, Rect>>, tw: number, th: number) {
  const [x0, y0, z0] = from, [x1, y1, z1] = to;
  const faces: Record<FaceName, [V3, V3, V3, V3]> = {
    north: [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0], [x0, y0, z0]],
    south: [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1], [x1, y0, z1]],
    east: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1], [x1, y0, z0]],
    west: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0], [x0, y0, z1]],
    up: [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]],
    down: [[x1, y0, z0], [x0, y0, z0], [x1, y0, z1], [x0, y0, z1]],
  };
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [], normals: number[] = [];
  const normal: Record<FaceName, V3> = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
  for (const face of Object.keys(faces) as FaceName[]) {
    const r = rects[face];
    if (!r) continue;
    const base = pos.length / 3;
    const [u1, v1, u2, v2] = r;
    const corner = [[u1, v1], [u2, v1], [u1, v2], [u2, v2]];
    faces[face].forEach((p, k) => {
      pos.push(...p);
      normals.push(...normal[face]);
      uvs.push(corner[k][0] / tw, 1 - corner[k][1] / th);
    });
    idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

const euler = (r: V3) => new THREE.Euler(-r[0] * RAD, -r[1] * RAD, r[2] * RAD, "ZYX");

export function buildModel(geometryJson: unknown, geometryId: string, texture: THREE.Texture | null): PreviewModel {
  const list = (geometryJson as Record<string, unknown>)?.["minecraft:geometry"] as { description?: { identifier?: string; texture_width?: number; texture_height?: number }; bones?: GeoBone[] }[] | undefined;
  const geo = list?.find((g) => g.description?.identifier === geometryId) ?? list?.[0];
  if (!geo) throw new Error("No geometry found in the model file.");
  const tw = geo.description?.texture_width ?? 64, th = geo.description?.texture_height ?? 64;
  const material = new THREE.MeshLambertMaterial({
    map: texture, color: texture ? 0xffffff : 0xb8b2a6, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide,
  });

  const root = new THREE.Group();
  const bones = new Map<string, PreviewBone>();
  const pivotOf = (b: GeoBone): V3 => { const p = v3(b.pivot); return [-p[0], p[1], p[2]]; };
  const byName = new Map((geo.bones ?? []).map((b) => [b.name, b]));

  for (const b of geo.bones ?? []) {
    const group = new THREE.Group();
    group.name = b.name;
    const pivot = pivotOf(b);
    const parent = b.parent ? byName.get(b.parent) : undefined;
    const pp = parent ? pivotOf(parent) : [0, 0, 0];
    group.position.set(pivot[0] - pp[0], pivot[1] - pp[1], pivot[2] - pp[2]);
    group.rotation.copy(euler(v3(b.rotation)));
    for (const c of b.cubes ?? []) {
      const o = v3(c.origin), s = v3(c.size), inf = n(c.inflate ?? b.inflate);
      // Mirror X, and work relative to the bone pivot.
      const from: V3 = [-(o[0] + s[0]) - inf, o[1] - inf, o[2] - inf];
      const to: V3 = [-o[0] + inf, o[1] + s[1] + inf, o[2] + s[2] + inf];
      const rects = Array.isArray(c.uv) || c.uv === undefined
        ? boxUv(n((c.uv as number[] | undefined)?.[0]), n((c.uv as number[] | undefined)?.[1]), s, c.mirror ?? !!b.mirror)
        : perFaceUv(c.uv);
      const hasRot = c.rotation && v3(c.rotation).some((x) => x !== 0);
      const cp: V3 = hasRot ? (() => { const p = v3(c.pivot); return [-p[0], p[1], p[2]] as V3; })() : pivot;
      const mesh = new THREE.Mesh(
        boxGeometry([from[0] - cp[0], from[1] - cp[1], from[2] - cp[2]], [to[0] - cp[0], to[1] - cp[1], to[2] - cp[2]], rects, tw, th),
        material,
      );
      if (hasRot) {
        const holder = new THREE.Group();
        holder.position.set(cp[0] - pivot[0], cp[1] - pivot[1], cp[2] - pivot[2]);
        holder.rotation.copy(euler(v3(c.rotation)));
        holder.add(mesh);
        group.add(holder);
      } else group.add(mesh);
    }
    bones.set(b.name, { name: b.name, group, rest: { position: group.position.clone(), rotation: group.rotation.clone() } });
  }
  for (const b of geo.bones ?? []) {
    const node = bones.get(b.name)!.group;
    const parent = b.parent ? bones.get(b.parent)?.group : undefined;
    (parent ?? root).add(node);
  }
  root.scale.setScalar(1 / 16);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { root, bones, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
}

export function loadTexture(dataUrl: string): Promise<THREE.Texture | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(dataUrl, (t) => {
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      t.generateMipmaps = false;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}
