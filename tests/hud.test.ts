import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

describe("HUDs and overlays", () => {
  const p = createProject("Hud");
  p.namespace = "hd";
  p.variables = [{ id: "v", name: "mana", scope: "player", type: "number", initial: "0" }];
  p.textures.push({ id: "gem", name: "gem", kind: "item", width: 16, height: 16, dataUrl: PNG }, { id: "slot", name: "slot", kind: "item", width: 16, height: 16, dataUrl: PNG });
  const hud = createElement("hud", "stats", "Stats");
  hud.widgets = [
    { id: "1", type: "image", anchor: "top_left", x: 4, y: 4, w: 16, h: 16, texture: "gem" },
    { id: "2", type: "live", anchor: "top_left", x: 24, y: 8, w: 0, h: 0, text: "Mana: {mana}", color: "#55ffff", scale: 1, shadow: true },
    { id: "3", type: "bar", anchor: "bottom_middle", x: 0, y: -40, w: 100, h: 6, texture: "gem", emptyTexture: "slot", source: "variable", sourceName: "mana", max: 50, segments: 5 },
    { id: "4", type: "text", anchor: "center", x: 0, y: 0, w: 0, h: 0, text: "Hello", color: "#ffffff" },
  ];
  const banner = createElement("hud", "boss_banner", "Boss banner");
  banner.mode = "overlay";
  banner.dim = true;
  banner.widgets = [{ id: "5", type: "text", anchor: "center", x: 0, y: 0, w: 0, h: 0, text: "Boss incoming!", color: "#ff5555", scale: 2, shadow: true }];
  const proc = createElement("procedure", "warn", "Warn");
  proc.trigger = "item_use";
  proc.actions = [
    { id: "a", type: "show_overlay", params: { hud: "boss_banner", seconds: 5 }, chance: 100 },
    { id: "b", type: "hide_overlay", params: { hud: "boss_banner" }, chance: 100 },
  ];
  p.elements.push(hud, banner, proc);
  const { files, warnings } = generateAddon(p);
  const json = (f: string) => JSON.parse(files.get(f) as string);
  const ui = json("RP/ui/hd_hud.json");
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("registers the UI file and adds it to the vanilla HUD", () => {
    expect(json("RP/ui/_ui_defs.json")).toEqual({ ui_defs: ["ui/hd_hud.json"] });
    expect(json("RP/ui/hud_screen.json")).toEqual({
      namespace: "hud",
      root_panel: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ "bc_hd_root@bc_hd.root": {} }] }] },
    });
    expect(ui.namespace).toBe("bc_hd");
    expect(ui.root.controls).toEqual([{ "hud_stats@bc_hd.hud_stats": {} }, { "hud_boss_banner@bc_hd.hud_boss_banner": {} }]);
  });

  it("places images and text by anchor", () => {
    const content = ui.hud_stats.controls.at(-1).content.controls;
    expect(content[0].w1).toMatchObject({ type: "image", texture: "textures/ui/hd_gem", size: [16, 16], anchor_from: "top_left", offset: [4, 4] });
    expect(content[3].w4).toMatchObject({ type: "label", text: "Hello", anchor_to: "center" });
  });

  it("feeds live text from a preserved title channel", () => {
    const data = ui.hud_stats.controls.find((c: any) => c.w2_data).w2_data;
    expect(data.bindings[1]).toEqual({ binding_name: "#hud_title_text_string", binding_name_override: "#preserved_text", binding_condition: "visibility_changed" });
    expect(data.bindings[2].source_property_name).toContain("'bc:hd:w2:'");
    const label = ui.hud_stats.controls.at(-1).content.controls[1].w2;
    expect(label.bindings[0]).toEqual({ binding_type: "view", source_control_name: "w2_data", source_property_name: "(#preserved_text - 'bc:hd:w2:')", target_property_name: "#text" });
  });

  it("builds bars from segments that light up by value", () => {
    const bar = ui.hud_stats.controls.at(-1).content.controls[2].w3;
    expect(bar.size).toEqual([100, 6]);
    const segs = bar.controls.filter((c: any) => Object.keys(c)[0].includes("_s"));
    expect(segs).toHaveLength(5);
    expect(segs[4].w3_s5.bindings[0].source_property_name).toBe("(((#preserved_text - 'bc:hd:w3:') = '5'))");
    expect(segs[0].w3_s1.bindings[0].source_property_name.match(/ or /g)).toHaveLength(4);
  });

  it("hides overlays until shown, with a dimmed background", () => {
    const content = ui.hud_boss_banner.controls.at(-1).content;
    expect(content.bindings[0].source_property_name).toBe("(#preserved_text = 'bc:hd:show_boss_banner:1')");
    expect(content.controls[0].dim.texture).toBe("textures/ui/hd_dim");
    expect(files.has("RP/textures/ui/hd_dim.png")).toBe(true);
  });

  it("sends values as invisible titles from a script that type-checks", () => {
    expect(js).toContain(`["bc:hd:w2:","live","stats","Mana: {mana}","",0,0]`);
    expect(js).toContain("const BC_HUD = /** @type {any[][]} */ (");
    expect(js).toContain(`["bc:hd:w3:","bar","stats","variable","mana",50,5]`);
    expect(js).toContain(`bcHudShow(ctx.player, "boss_banner", true, 5);`);
    expect(js).toContain("fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0");
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("reports overlay steps for missing overlays", () => {
    const q = { ...p, elements: p.elements.filter((e) => e.name !== "boss_banner") };
    expect(generateAddon(q).warnings.some((w) => w.level === "error" && w.message.includes(`"boss_banner"`))).toBe(true);
  });
});
