import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { KeyBindElement, KeyInput } from "../src/model/types";
import { typecheckScript } from "./typecheck";

const bind = (name: string, input: KeyInput, extra: Partial<KeyBindElement> = {}) => {
  const k = createElement("keybind", name, name);
  Object.assign(k, { input, ...extra });
  return k;
};

describe("key bindings", () => {
  const p = createProject("Keys");
  p.namespace = "key";
  p.scriptApi = "2.11.0";
  p.minEngine = [1, 26, 60];
  const dash = bind("dash", "double_jump", { seconds: 0.3, cooldown: 2, actions: [{ id: "a", type: "effect", params: { who: "player", effect: "speed", seconds: 2, amplifier: 1, particles: false }, chance: 100 }] });
  const menu = bind("menu", "sneak_slot", { slot: 9 });
  const charge = bind("charge", "hold_sneak", { seconds: 1.5, item: "diamond_sword" });
  const blink = bind("blink", "sneak_swing");
  p.elements.push(dash, menu, charge, blink, bind("roll", "double_sneak"), bind("leap", "sneak_jump"), bind("cast", "sneak_use"), bind("hit", "swing"));
  const { files, warnings } = generateAddon(p);
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level !== "info")).toEqual([]);
  });

  it("writes each binding with its timing, slot and item", () => {
    expect(js).toContain(`{ name: "dash", input: "double_jump", item: "", slot: 0, ticks: 6, cooldown: 40,`);
    expect(js).toContain(`{ name: "menu", input: "sneak_slot", item: "", slot: 8,`);
    expect(js).toContain(`{ name: "charge", input: "hold_sneak", item: "minecraft:diamond_sword", slot: 0, ticks: 30,`);
    expect(js).toMatch(/run: \(ctx\) => \{\n\s+BC\.run\("Key dash → step 1/);
  });

  it("listens only to the inputs it needs", () => {
    for (const ev of ["playerButtonInput", "playerHotbarSelectedSlotChange", "itemUse", "playerSwingStart"]) expect(js).toContain(`world.afterEvents.${ev}.subscribe(`);
    expect(js).toMatch(/import \{[^}]*ButtonState[^}]*\} from "@minecraft\/server"/);
    const only = generateAddon({ ...p, elements: [menu] }).files.get("BP/scripts/main.js") as string;
    expect(only).toContain("playerHotbarSelectedSlotChange");
    expect(only).not.toContain("playerButtonInput");
    expect(only).not.toContain("playerSwingStart");
  });

  it("puts the hotbar back after a sneak + number press", () => {
    expect(js).toContain("p.selectedSlotIndex = ev.previousSlotSelected;");
  });

  it("type-checks against @minecraft/server 2.11.0, and 2.1.0 without left-click", () => {
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
    const q = { ...p, scriptApi: "2.1.0", minEngine: [1, 21, 100] as [number, number, number], elements: p.elements.filter((e) => !["blink", "hit"].includes(e.name)) };
    const out = generateAddon(q);
    expect(out.warnings.filter((w) => w.level === "error")).toEqual([]);
    expect(typecheckScript(out.files.get("BP/scripts/main.js") as string)).toEqual([]);
  });

  it("says left-click needs 2.11", () => {
    const out = generateAddon({ ...p, scriptApi: "2.1.0", minEngine: [1, 21, 100], elements: [blink] });
    expect(out.warnings.some((w) => w.level === "error" && w.message.includes("2.11.0"))).toBe(true);
    expect(out.files.get("BP/scripts/main.js") ?? "").not.toContain("playerSwingStart");
  });
});
