import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { achievementTree } from "../src/export/achievements";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

describe("achievements", () => {
  const p = createProject("Adv");
  p.namespace = "adv";
  p.variables = [{ id: "v", name: "coins", scope: "player", type: "number", initial: "0" }];
  p.textures.push({ id: "gem", name: "gem", kind: "item", width: 16, height: 16, dataUrl: PNG });
  const root = createElement("achievement", "start", "Getting Started");
  Object.assign(root, { icon: "gem", trigger: "obtain_item", target: "oak_log", count: 1 });
  const miner = createElement("achievement", "miner", "Miner");
  Object.assign(miner, { parent: "start", trigger: "break_block", target: "minecraft:stone", count: 50, rewardXp: 10, rewardItem: "minecraft:diamond", rewardCount: 2 });
  const hunter = createElement("achievement", "hunter", "Monster Hunter");
  Object.assign(hunter, { parent: "start", frame: "challenge", trigger: "kill_mob", target: "", count: 10, secret: true, rewardProcedure: "party" });
  const rich = createElement("achievement", "rich", "Rich");
  Object.assign(rich, { parent: "miner", frame: "goal", trigger: "variable", target: "coins", count: 100, announce: false });
  const nether = createElement("achievement", "hot", "Hot Stuff");
  Object.assign(nether, { trigger: "dimension", target: "minecraft:nether" });
  const party = createElement("procedure", "party", "Party");
  party.trigger = "manual";
  party.actions = [{ id: "m", type: "message", params: { text: "Woo!", to: "player" }, chance: 100 }];
  const proc = createElement("procedure", "award", "Award");
  proc.trigger = "item_use";
  proc.conditions = [{ id: "c", type: "has_achievement", params: { achievement: "start" }, negate: false }];
  proc.actions = [
    { id: "a", type: "grant_achievement", params: { achievement: "hot" }, chance: 100 },
    { id: "b", type: "revoke_achievement", params: { achievement: "miner" }, chance: 100 },
    { id: "d", type: "show_achievements", params: {}, chance: 100 },
  ];
  p.elements.push(rich, hunter, miner, root, nether, party, proc);
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;
  const ui = JSON.parse(files.get("RP/ui/adv_hud.json") as string);

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("orders the list as a tree", () => {
    expect(achievementTree([rich, hunter, miner, root, nether]).map(([a, d]) => `${a.name}:${d}`)).toEqual(["start:0", "hunter:1", "miner:1", "rich:2", "hot:0"]);
  });

  it("writes the achievement table", () => {
    expect(js).toContain(`"start": { title: "Getting Started", desc: "Do something great", frame: "task", depth: 0, secret: false, trigger: "obtain_item", target: "minecraft:oak_log", count: 1, icon: "textures/ui/adv_gem"`);
    expect(js).toContain(`"miner": { title: "Miner"`);
    expect(js).toMatch(/"miner": \{[^\n]*xp: 10, item: "minecraft:diamond", n: 2/);
    expect(js).toMatch(/"hunter": \{[^\n]*frame: "challenge", depth: 1, secret: true[^\n]*run: \(ctx\) => proc_party\(ctx\)/);
    expect(js).toMatch(/"rich": \{[^\n]*target: "coins", count: 100[^\n]*announce: false/);
  });

  it("counts the events it needs", () => {
    expect(js).toContain("world.afterEvents.playerBreakBlock.subscribe(");
    expect(js).toContain(`a.trigger === "kill_mob"`);
    expect(js).not.toContain("world.afterEvents.playerPlaceBlock.subscribe(");
  });

  it("wires the procedure steps", () => {
    expect(js).toContain(`bcAdvGrant(ctx.player, "hot");`);
    expect(js).toContain(`bcAdvRevoke(ctx.player, "miner");`);
    expect(js).toContain(`bcAdvList(ctx.player);`);
    expect(js).toContain(`bcAdvHas(ctx.player, "start")`);
  });

  it("adds a toast with icons to the HUD", () => {
    expect(ui.root.controls).toContainEqual({ "adv_toast@bc_adv.adv_toast": {} });
    expect(ui.adv_toast).toMatchObject({ anchor_from: "top_right", size: [160, 32] });
    const box = ui.adv_toast.controls[2].box;
    expect(box.controls[1].icon_start).toMatchObject({ texture: "textures/ui/adv_gem" });
    expect(box.controls[1].icon_start.bindings[0].source_property_name).toBe("(#preserved_text = 'bc:adv:adv:start')");
    expect(js).toContain(`bcHudPut(p, "bc:adv:advt:", next[1])`);
  });

  it("type-checks against @minecraft/server 2.1.0 and 2.11.0", () => {
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("reports missing references and still type-checks without achievements", () => {
    const q = { ...p, elements: [proc] };
    const out = generateAddon(q);
    expect(out.warnings.some((w) => w.level === "error" && w.message.includes(`achievement "hot"`))).toBe(true);
    expect(typecheckScript(out.files.get("BP/scripts/main.js") as string)).toEqual([]);
    const bad = generateAddon({ ...p, elements: [{ ...rich, target: "gold" }, { ...miner, parent: "nope" }] });
    expect(bad.warnings.some((w) => w.message.includes(`variable "gold"`))).toBe(true);
    expect(bad.warnings.some((w) => w.message.includes(`"nope"`))).toBe(true);
  });
});
