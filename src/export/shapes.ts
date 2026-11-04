// Built-in block shapes: slabs, stairs, carpets, trapdoors, doors, fences, walls and panes.
// Each returns its geometry and the block JSON pieces (states, traits, permutations, boxes) it needs.
import type { BlockShape } from "../model/types";

type V3 = [number, number, number];
type Box = { origin: number[]; size: number[] };

/** A cube in block pixels (x/z -8..8, y 0..16) with UVs that line up with the world, like vanilla blocks. */
function cube(from: V3, to: V3) {
  const [x0, y0, z0] = from, [x1, y1, z1] = to;
  const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
  const u = (x: number) => x + 8, v = (y: number) => 16 - y;
  const side = (a0: number, w: number) => ({ uv: [a0, v(y1)], uv_size: [w, sy] });
  return {
    origin: from, size: [sx, sy, sz],
    uv: {
      north: side(u(x0), sx), south: side(u(x0), sx),
      east: side(z0 + 8, sz), west: side(z0 + 8, sz),
      up: { uv: [u(x0), z0 + 8], uv_size: [sx, sz] }, down: { uv: [u(x0), z0 + 8], uv_size: [sx, sz] },
    },
  };
}

function geometry(id: string, bones: { name: string; cubes: ReturnType<typeof cube>[] }[]) {
  return {
    format_version: "1.12.0",
    "minecraft:geometry": [{
      description: { identifier: id, texture_width: 16, texture_height: 16, visible_bounds_width: 2, visible_bounds_height: 2, visible_bounds_offset: [0, 0.5, 0] },
      bones: bones.map((b) => ({ name: b.name, pivot: [0, 0, 0], cubes: b.cubes })),
    }],
  };
}

const box = (from: V3, to: V3): Box => ({ origin: from, size: [to[0] - from[0], to[1] - from[1], to[2] - from[2]] });
const FULL = box([-8, 0, -8], [8, 16, 8]);
/** Facing rotations for the "minecraft:cardinal_direction" state (front faces the player who placed it). */
const FACINGS: [string, number][] = [["north", 0], ["west", 90], ["south", 180], ["east", -90]];
const facingTrait = { "minecraft:placement_direction": { enabled_states: ["minecraft:cardinal_direction"], y_rotation_offset: 180 } };
const dirIs = (d: string) => `q.block_state('minecraft:cardinal_direction') == '${d}'`;
const top = "q.block_state('minecraft:vertical_half') == 'top'";

/** Which group a connecting shape joins with: fences with fences, walls with walls, panes with panes. */
export const CONNECTING: BlockShape[] = ["fence", "wall", "pane"];

export interface ShapeParts {
  geometry: object;
  geometryId: string;
  boneVisibility?: Record<string, string>;
  collision: Box | false;
  selection: Box;
  traits?: Record<string, unknown>;
  states?: Record<string, unknown[]>;
  permutations: { condition: string; components: Record<string, unknown> }[];
  /** Script behaviour the shape needs (registered in main.js). */
  logic?: "slab" | "trapdoor" | "door" | "connect";
  /** Faces of the texture slots used by this shape (for the editor). */
  textureSlots: ("all" | "top" | "bottom")[];
}

export function shapeParts(shape: BlockShape, ns: string, name: string): ShapeParts | null {
  const geoId = `geometry.${ns}.${name}`;
  const st = (s: string) => `${ns}:${s}`;
  const q = (s: string) => `q.block_state('${st(s)}')`;
  switch (shape) {
    case "slab":
      return {
        geometry: geometry(geoId, [{ name: "slab", cubes: [cube([-8, 0, -8], [8, 8, 8])] }]),
        geometryId: geoId,
        collision: box([-8, 0, -8], [8, 8, 8]), selection: box([-8, 0, -8], [8, 8, 8]),
        traits: { "minecraft:placement_position": { enabled_states: ["minecraft:vertical_half"] } },
        states: { [st("double")]: [false, true] },
        permutations: [
          { condition: `${top} && !${q("double")}`, components: { "minecraft:transformation": { translation: [0, 0.5, 0] } } },
          { condition: q("double"), components: { "minecraft:geometry": "minecraft:geometry.full_block", "minecraft:collision_box": FULL, "minecraft:selection_box": FULL, "minecraft:loot": `loot_tables/blocks/${ns}_${name}_double.json` } },
        ],
        logic: "slab",
        textureSlots: ["all"],
      };
    case "stairs":
      return {
        geometry: geometry(geoId, [{ name: "stairs", cubes: [cube([-8, 0, -8], [8, 8, 8]), cube([-8, 8, 0], [8, 16, 8])] }]),
        geometryId: geoId,
        // The lower half only, so players can walk up stairs without jumping.
        collision: box([-8, 0, -8], [8, 8, 8]), selection: FULL,
        traits: { ...facingTrait, "minecraft:placement_position": { enabled_states: ["minecraft:vertical_half"] } },
        permutations: FACINGS.flatMap(([d, y]) => [
          { condition: `${dirIs(d)} && !(${top})`, components: { "minecraft:transformation": { rotation: [0, y, 0] } } },
          { condition: `${dirIs(d)} && ${top}`, components: { "minecraft:transformation": { rotation: [0, y, 180] } } },
        ]),
        textureSlots: ["all"],
      };
    case "carpet":
      return {
        geometry: geometry(geoId, [{ name: "carpet", cubes: [cube([-8, 0, -8], [8, 1, 8])] }]),
        geometryId: geoId,
        collision: box([-8, 0, -8], [8, 1, 8]), selection: box([-8, 0, -8], [8, 1, 8]),
        permutations: [],
        textureSlots: ["all"],
      };
    case "trapdoor": {
      const closedBottom = `!${q("open")} && !(${top})`, closedTop = `!${q("open")} && ${top}`;
      return {
        geometry: geometry(geoId, [
          { name: "closed", cubes: [cube([-8, 0, -8], [8, 3, 8])] },
          { name: "closed_top", cubes: [cube([-8, 13, -8], [8, 16, 8])] },
          { name: "open", cubes: [cube([-8, 0, 5], [8, 16, 8])] },
        ]),
        geometryId: geoId,
        boneVisibility: { closed: closedBottom, closed_top: closedTop, open: q("open") },
        collision: box([-8, 0, -8], [8, 3, 8]), selection: box([-8, 0, -8], [8, 3, 8]),
        traits: { ...facingTrait, "minecraft:placement_position": { enabled_states: ["minecraft:vertical_half"] } },
        states: { [st("open")]: [false, true] },
        permutations: [
          ...FACINGS.map(([d, y]) => ({ condition: dirIs(d), components: { "minecraft:transformation": { rotation: [0, y, 0] } } })),
          { condition: closedTop, components: { "minecraft:collision_box": box([-8, 13, -8], [8, 16, 8]), "minecraft:selection_box": box([-8, 13, -8], [8, 16, 8]) } },
          { condition: q("open"), components: { "minecraft:collision_box": box([-8, 0, 5], [8, 16, 8]), "minecraft:selection_box": box([-8, 0, 5], [8, 16, 8]) } },
        ],
        logic: "trapdoor",
        textureSlots: ["all"],
      };
    }
    case "door":
      return {
        geometry: geometry(geoId, [
          { name: "closed", cubes: [cube([-8, 0, -8], [8, 16, -5])] },
          { name: "open", cubes: [cube([-8, 0, -8], [-5, 16, 8])] },
        ]),
        geometryId: geoId,
        boneVisibility: { closed: `!${q("open")}`, open: q("open") },
        collision: box([-8, 0, -8], [8, 16, -5]), selection: box([-8, 0, -8], [8, 16, -5]),
        traits: facingTrait,
        states: { [st("open")]: [false, true], [st("upper")]: [false, true] },
        permutations: [
          ...FACINGS.map(([d, y]) => ({ condition: dirIs(d), components: { "minecraft:transformation": { rotation: [0, y, 0] } } })),
          { condition: q("open"), components: { "minecraft:collision_box": box([-8, 0, -8], [-5, 16, 8]), "minecraft:selection_box": box([-8, 0, -8], [-5, 16, 8]) } },
          // The top half drops nothing; the bottom half drops the door.
          { condition: q("upper"), components: { "minecraft:loot": "loot_tables/empty.json" } },
        ],
        logic: "door",
        textureSlots: ["bottom", "top"],
      };
    case "fence": case "wall": case "pane": {
      const dims = { fence: { post: 2, arm: 1, armH: [[6, 9], [12, 15]] }, wall: { post: 4, arm: 3, armH: [[0, 14]] }, pane: { post: 1, arm: 1, armH: [[0, 16]] } }[shape];
      const p = dims.post, a = dims.arm;
      const arms = (dir: "north" | "south" | "east" | "west") => dims.armH.map(([y0, y1]) => {
        switch (dir) {
          case "north": return cube([-a, y0, -8], [a, y1, -p]);
          case "south": return cube([-a, y0, p], [a, y1, 8]);
          case "west": return cube([-8, y0, -a], [-p, y1, a]);
          default: return cube([p, y0, -a], [8, y1, a]);
        }
      });
      const dirs = ["north", "south", "east", "west"] as const;
      const anyZ = `(${q("north")} || ${q("south")})`, anyX = `(${q("east")} || ${q("west")})`;
      const height = shape === "wall" ? 16 : 16;
      return {
        geometry: geometry(geoId, [{ name: "post", cubes: [cube([-p, 0, -p], [p, height, p])] }, ...dirs.map((d) => ({ name: d, cubes: arms(d) }))]),
        geometryId: geoId,
        boneVisibility: Object.fromEntries(dirs.map((d) => [d, q(d)])),
        collision: box([-p, 0, -p], [p, 16, p]), selection: box([-p, 0, -p], [p, 16, p]),
        states: Object.fromEntries(dirs.map((d) => [st(d), [false, true]])),
        // One box per permutation: grow it along each axis that has a connection.
        permutations: [
          { condition: `${anyZ} && !${anyX}`, components: { "minecraft:collision_box": box([-p, 0, -8], [p, 16, 8]), "minecraft:selection_box": box([-p, 0, -8], [p, 16, 8]) } },
          { condition: `${anyX} && !${anyZ}`, components: { "minecraft:collision_box": box([-8, 0, -p], [8, 16, p]), "minecraft:selection_box": box([-8, 0, -p], [8, 16, p]) } },
          { condition: `${anyX} && ${anyZ}`, components: { "minecraft:collision_box": FULL, "minecraft:selection_box": FULL } },
        ],
        logic: "connect",
        textureSlots: ["all"],
      };
    }
    default:
      return null;
  }
}

/** Geometry for the editor preview, with the block's states as they'd look when placed. */
export function previewGeometry(shape: BlockShape, ns: string, name: string): { json: string; hidden: string[] } | null {
  const parts = shapeParts(shape, ns, name);
  if (!parts) return null;
  // Show fences/walls/panes connected north-south, doors and trapdoors closed.
  const hidden = shape === "trapdoor" ? ["closed_top", "open"] : shape === "door" ? ["open"] : CONNECTING.includes(shape) ? ["east", "west"] : [];
  return { json: JSON.stringify(parts.geometry), hidden };
}
