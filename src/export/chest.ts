// Storage blocks that open like a chest: while anyone is looking inside, the block's "opened" state is
// true (which swaps the lid's model parts), with a sound when the first player opens it and the last
// one closes it. Players are counted per block, so one player leaving doesn't shut it on another.

import type { GenContext } from "./context";

const S = JSON.stringify;

export function genChestLids(ctx: GenContext) {
  if (!ctx.chestLids.length) return;
  const table = Object.fromEntries(ctx.chestLids.map((l) => [l.id, [l.open, l.close]]));
  ctx.script.sections.push(`// ----- Chests that open -----
/** Block id -> [open sound, close sound]. */
const BC_LIDS = ${S(table)};
const BC_LID_STATE = ${S(`${ctx.ns}:opened`)};
/** How many players are looking inside each block, by position. */
const BC_LID_VIEWERS = new Map();
const bcLidKey = (b) => b.dimension.id + " " + b.x + " " + b.y + " " + b.z;
function bcLidSet(b, open) {
  try {
    if (b.permutation.getState(/** @type {any} */ (BC_LID_STATE)) === open) return;
    b.setPermutation(b.permutation.withState(/** @type {any} */ (BC_LID_STATE), /** @type {any} */ (open)));
    const sound = BC_LIDS[b.typeId]?.[open ? 0 : 1];
    if (sound) b.dimension.playSound(sound, b.center());
  } catch {} // The block can already be gone when it was broken with its screen open.
}
world.afterEvents.blockContainerOpened.subscribe((ev) => {
  const b = ev.block;
  if (!BC_LIDS[b?.typeId]) return;
  const key = bcLidKey(b);
  const n = (BC_LID_VIEWERS.get(key) ?? 0) + 1;
  BC_LID_VIEWERS.set(key, n);
  if (n === 1) bcLidSet(b, true);
});
world.afterEvents.blockContainerClosed.subscribe((ev) => {
  const b = ev.block;
  if (!BC_LIDS[b?.typeId]) return;
  const key = bcLidKey(b);
  const n = (BC_LID_VIEWERS.get(key) ?? 1) - 1;
  if (n > 0) { BC_LID_VIEWERS.set(key, n); return; }
  BC_LID_VIEWERS.delete(key);
  bcLidSet(b, false);
});
// A block broken while open never sends a close, so forget its count.
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  if (BC_LIDS[ev.brokenBlockPermutation?.type?.id]) BC_LID_VIEWERS.delete(bcLidKey(ev.block));
});
`);
}
