import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { typecheckScript } from "./typecheck";

describe("game rules", () => {
  const p = createProject("Rules");
  p.namespace = "gr";
  p.gameRules = [
    { id: "1", name: "bonus_loot", type: "bool", initial: "true", description: "Mobs drop extra rubies" },
    { id: "2", name: "boss_hp", type: "number", initial: "200", description: "" },
  ];
  const proc = createElement("procedure", "tweak", "Tweak");
  proc.trigger = "item_use";
  proc.conditions = [{ id: "c", type: "gamerule_is", params: { rule: "bonus_loot", op: "=", value: "true" }, negate: false }];
  proc.actions = [
    { id: "a", type: "set_gamerule", params: { rule: "boss_hp", value: "350" }, chance: 100 },
    { id: "b", type: "set_gamerule", params: { rule: "keepInventory", value: "true" }, chance: 100 },
    { id: "d", type: "message", params: { text: "Boss HP: {rule:boss_hp}", to: "player" }, chance: 100 },
  ];
  p.elements.push(proc);
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("writes the rules with their starting values", () => {
    expect(js).toContain(`const BC_RULES = {"bonus_loot":["bool",true,"Mobs drop extra rubies"],"boss_hp":["number",200,""]};`);
  });

  it("registers /gr:gamerule with the rules as an option list", () => {
    expect(js).toContain(`registry.registerEnum("gr:rule", Object.keys(BC_RULES));`);
    expect(js).toContain(`name: "gr:gamerule"`);
    expect(js).toContain("permissionLevel: CommandPermissionLevel.GameDirectors");
    expect(js).toContain("system.run(() => BC.setRule(rule, t));");
  });

  it("wires the steps, the check and {rule:name}", () => {
    expect(js).toContain(`BC.setRule("boss_hp", BC.fmt(ctx, "350"));`);
    expect(js).toContain(`BC.setRule("keepInventory", BC.fmt(ctx, "true"));`);
    expect(js).toContain(`BC.compare(BC.rule("bonus_loot"), "=", BC.fmt(ctx, "true"))`);
    expect(js).toContain(`k === "rule" ? String(BC.rule(sub) ?? m)`);
  });

  it("type-checks against @minecraft/server 2.1.0 and 2.11.0", () => {
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("reports bad names, unknown rules and a clashing command", () => {
    const bad = generateAddon({ ...p, gameRules: [...p.gameRules!, { id: "3", name: "Bad Name", type: "bool", initial: "true", description: "" }] });
    expect(bad.warnings.filter((w) => w.message.includes(`"Bad Name"`))).toHaveLength(1);
    const unknown = generateAddon({ ...p, gameRules: [] });
    expect(unknown.warnings.some((w) => w.level === "error" && w.message.includes(`game rule "boss_hp"`))).toBe(true);
    expect(unknown.warnings.some((w) => w.message.includes(`"keepInventory"`))).toBe(false);
    expect(unknown.files.get("BP/scripts/main.js")).not.toContain("gr:gamerule");
    const cmd = createElement("command", "gamerule", "Mine");
    cmd.actions = [{ id: "x", type: "message", params: { text: "hi", to: "player" }, chance: 100 }];
    const clash = generateAddon({ ...p, elements: [...p.elements, cmd] });
    expect(clash.warnings.some((w) => w.level === "error" && w.message.includes("same name"))).toBe(true);
  });
});
