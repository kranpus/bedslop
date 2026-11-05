import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { typecheckScript } from "./typecheck";

describe("damage types", () => {
  const p = createProject("Damage");
  p.namespace = "dmg";
  const zap = createElement("damage", "zap", "Zap");
  Object.assign(zap, { cause: "lightning", deathMessage: "{victim} was zapped", deathMessageBy: "{victim} was zapped by {attacker}", scaleWithDifficulty: true });
  const proc = createElement("procedure", "hit", "Hit");
  proc.trigger = "entity_hit";
  proc.actions = [
    { id: "a", type: "custom_damage", params: { who: "target", damage: "zap", amount: 6, from: "player" }, chance: 100 },
    { id: "b", type: "custom_damage", params: { who: "player", damage: "zap", amount: 1, from: "nobody" }, chance: 100 },
  ];
  p.elements.push(zap, proc);
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("writes the damage type and the step", () => {
    expect(js).toContain(`"zap": { cause: "lightning", msg: "{victim} was zapped", by: "{victim} was zapped by {attacker}", scale: true }`);
    expect(js).toContain(`bcDamage(BC.who(ctx, "target"), "zap", 6, BC.who(ctx, "player"));`);
    expect(js).toContain(`bcDamage(BC.who(ctx, "player"), "zap", 1, undefined);`);
  });

  it("hides Minecraft's message for a lethal hit and sends its own", () => {
    expect(js).toContain("world.gameRules.showDeathMessages = false; hidden = true;");
    expect(js).toContain("system.run(() => { try { world.gameRules.showDeathMessages = true; } catch {} });");
    expect(js).toContain(`text.replace(/\\{victim\\}/g, BC.name(e)).replace(/\\{attacker\\}/g, BC.name(att))`);
  });

  it("type-checks against @minecraft/server 2.1.0 and 2.11.0", () => {
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("reports missing damage types and still type-checks without any", () => {
    const out = generateAddon({ ...p, elements: [proc] });
    expect(out.warnings.some((w) => w.level === "error" && w.message.includes(`damage type "zap"`))).toBe(true);
    expect(typecheckScript(out.files.get("BP/scripts/main.js") as string)).toEqual([]);
  });
});
