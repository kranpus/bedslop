// A small ruby shrine for the example project, built in code so no binary file is bundled.

import { T, nbt, writeNbt, type NbtTag } from "../export/nbt";

/** Block palette version for Minecraft 1.21.60 (the game upgrades older versions on load). */
const VERSION = (1 << 24) | (21 << 16) | (60 << 8);

export function rubyShrine(ns: string): Uint8Array {
  const [sx, sy, sz] = [7, 5, 7];
  const palette: [string, Record<string, NbtTag>][] = [
    ["minecraft:air", {}],
    ["minecraft:stone_bricks", {}],
    [`${ns}:ruby_block`, {}],
    ["minecraft:chest", { "minecraft:cardinal_direction": nbt.str("south") }],
    ["minecraft:torch", { torch_facing_direction: nbt.str("top") }],
    ["minecraft:smooth_stone_slab", { "minecraft:vertical_half": nbt.str("bottom") }],
  ];
  const [AIR, BRICK, RUBY, CHEST, TORCH, SLAB] = [0, 1, 2, 3, 4, 5];
  const blocks = new Array(sx * sy * sz).fill(AIR);
  const at = (x: number, y: number, z: number) => (x * sy + y) * sz + z;
  // Floor, corner pillars topped with torches, a roof ring of slabs, a chest in the middle.
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) blocks[at(x, 0, z)] = BRICK;
  for (const [x, z] of [[0, 0], [0, 6], [6, 0], [6, 6]]) {
    for (let y = 1; y <= 3; y++) blocks[at(x, y, z)] = RUBY;
    blocks[at(x, 4, z)] = TORCH;
  }
  for (let i = 1; i < 6; i++) for (const [x, z] of [[i, 0], [i, 6], [0, i], [6, i]]) blocks[at(x, 3, z)] = SLAB;
  blocks[at(3, 0, 3)] = RUBY;
  const chest = at(3, 1, 3);
  blocks[chest] = CHEST;

  const root = nbt.compound([
    ["format_version", nbt.int(1)],
    ["size", nbt.ints([sx, sy, sz])],
    ["structure", nbt.compound({
      block_indices: nbt.list(T.List, [nbt.ints(blocks), nbt.ints(new Array(blocks.length).fill(-1))]),
      entities: nbt.list(T.Compound, []),
      palette: nbt.compound({
        default: nbt.compound({
          block_palette: nbt.list(T.Compound, palette.map(([name, states]) => nbt.compound({ name: nbt.str(name), states: nbt.compound(states), version: nbt.int(VERSION) }))),
          block_position_data: nbt.compound({
            [String(chest)]: nbt.compound({
              block_entity_data: nbt.compound({
                id: nbt.str("Chest"), Items: nbt.list(T.Compound, []), Findable: nbt.byte(0), isMovable: nbt.byte(1),
                x: nbt.int(3), y: nbt.int(1), z: nbt.int(3),
              }),
            }),
          }),
        }),
      }),
    })],
    ["structure_world_origin", nbt.ints([0, 0, 0])],
  ]);
  return writeNbt({ name: "", tag: root });
}
