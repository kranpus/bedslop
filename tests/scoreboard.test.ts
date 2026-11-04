import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { typecheckScript } from "./typecheck";

describe("scoreboards", () => {
  const p = createProject("Arena");
  p.namespace = "arn";
  p.scoreboards = [
    { id: "1", name: "kills", title: "Kills", show: "Sidebar", ascending: false },
    { id: "2", name: "deaths", title: "Deaths", show: "none", ascending: true },
  ];
  const kill = createElement("procedure", "on_kill", "On kill");
  kill.trigger = "entity_die";
  kill.conditions = [{ id: "c", type: "score_compare", params: { objective: "kills", op: "<", value: 100, who: "player" }, negate: false }];
  kill.actions = [
    { id: "a", type: "score_change", params: { objective: "kills", op: "add", value: 1, who: "player" }, chance: 100 },
    { id: "b", type: "score_change", params: { objective: "kills", op: "add", value: 1, who: "global" }, chance: 100 },
    { id: "c", type: "score_reset", params: { objective: "deaths", who: "target" }, chance: 100 },
    { id: "d", type: "score_show", params: { objective: "deaths", slot: "List", order: "lowest first" }, chance: 100 },
    { id: "e", type: "score_hide", params: { slot: "BelowName" }, chance: 100 },
    { id: "f", type: "actionbar", params: { text: "Kills: {score:kills}" }, chance: 100 },
  ];
  const blocks = createElement("procedure", "check", "Check");
  blocks.trigger = "item_use";
  blocks.editor = "blocks";
  blocks.blocks = JSON.stringify({ blocks: { languageVersion: 0, blocks: [{ type: "bc_start", next: { block: {
    type: "bc_act_message", fields: { to: "player" }, inputs: { text: { block: { type: "bc_score_get", fields: { OBJ: "kills", WHO: "global" } } } },
  } } }] } });
  p.elements.push(kill, blocks);
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("creates the scoreboards on world load and shows them where asked", () => {
    expect(js).toContain(`const BC_SCORES = {"kills":["Kills","Sidebar",false],"deaths":["Deaths","none",true]};`);
    expect(js).toContain("world.afterEvents.worldLoad.subscribe");
  });

  it("changes, resets, shows, hides, checks and prints scores", () => {
    for (const s of [
      `BC.setScore(ctx, "kills", "player", "add", 1);`, `BC.setScore(ctx, "kills", "global", "add", 1);`,
      `BC.resetScore(ctx, "deaths", "target");`, `BC.showScore("deaths", "List", true);`, `BC.hideScore("BelowName");`,
      `BC.compare(BC.getScore(ctx, "kills", "player"), "<", 100)`, `BC.getScore(ctx, "kills", "global")`, `k === "score"`,
    ]) expect(js).toContain(s);
  });

  it("type-checks against @minecraft/server 2.1.0 and 2.11.0", () => {
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("rejects scoreboard names Minecraft won't accept", () => {
    const bad = { ...p, scoreboards: [{ id: "x", name: "my kills", title: "", show: "none" as const, ascending: false }] };
    expect(generateAddon(bad).warnings.some((w) => w.level === "error" && w.message.includes(`"my kills"`))).toBe(true);
  });
});
