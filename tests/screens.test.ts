import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { formMarker } from "../src/export/screens";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

describe("form layouts, container screens and the effect list", () => {
  const p = createProject("Screens");
  p.namespace = "scr";
  p.scriptApi = "2.11.0";
  p.minEngine = [1, 26, 60];
  p.textures.push({ id: "bg", name: "menu_bg", kind: "other", width: 16, height: 16, dataUrl: PNG }, { id: "chestbg", name: "chest_bg", kind: "other", width: 16, height: 16, dataUrl: PNG });
  const plain = createElement("form", "plain", "Plain");
  const shop = createElement("form", "shop", "Shop");
  shop.layout = { style: "grid", columns: 4, tileWidth: 50, tileHeight: 50, iconSize: 20, width: 225, height: 200, showBody: true };
  const fancy = createElement("form", "fancy", "Fancy");
  fancy.layout = { style: "grid", columns: 2, tileWidth: 90, tileHeight: 40, iconSize: 16, width: 200, height: 160, showBody: false, background: "bg", titleColor: "#ffaa00" };
  const box = createElement("block", "crate", "Crate");
  Object.assign(box, { function: "storage", containerTitle: "Crate's Stuff", containerBackground: "chestbg" });
  // Like a hand-made "basic crafter" screen: 9 slots in a 3×3 grid, white title.
  const crafter = createElement("block", "basic_crafter", "Basic Crafter");
  Object.assign(crafter, { function: "storage", slotCount: 9, containerLayout: {
    enabled: true, showTitle: true, titleX: 47, titleY: -2, titleColor: "#ffffff",
    slots: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ x: 45 + (i % 3) * 18, y: Math.floor(i / 3) * 18 })),
  } });
  const fx = createElement("effect", "glow", "Glow");
  const bar = createElement("effect", "zap", "Zap");
  bar.timerPlace = "actionbar";
  p.elements.push(plain, shop, fancy, box, crafter, fx, bar);
  const { files, warnings } = generateAddon(p);
  const json = (f: string) => JSON.parse(files.get(f) as string);
  const js = files.get("BP/scripts/main.js") as string;
  const ui = json("RP/ui/scr_screens.json");

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("registers both UI files", () => {
    expect(json("RP/ui/_ui_defs.json").ui_defs.sort()).toEqual(["ui/scr_hud.json", "ui/scr_screens.json"]);
  });

  it("marks layout forms with an invisible title prefix", () => {
    expect(formMarker(0)).toBe("§r§r§0§r");
    expect(formMarker(11)).toBe("§r§r§b§r");
    expect(js).toContain(`.title("§r§r§0§r" + BC.fmt(ctx, "Shop"))`);
    expect(js).toContain(`.title("§r§r§1§r" + BC.fmt(ctx, "Fancy"))`);
    expect(js).toMatch(/new ActionFormData\(\)\.title\(BC\.fmt\(ctx, "Plain"\)\)/);
  });

  it("swaps vanilla's form factory for a switch between layouts", () => {
    expect(json("RP/ui/server_form.json").main_screen_content.modifications[0]).toMatchObject({
      operation: "replace", control_name: "server_form_factory",
      value: { server_form_factory: { type: "factory", control_ids: { long_form: "@bc_scr_screens.form_switch", custom_form: "@server_form.custom_form" } } },
    });
    const [vanilla, f0, f1] = ui.form_switch.controls;
    expect(vanilla.vanilla_form.controls).toEqual([{ "long_form@server_form.long_form": {} }]);
    expect(vanilla.vanilla_form.bindings[1].source_property_name).toBe("(((#title_text - '§r§r§0§r') = #title_text) and ((#title_text - '§r§r§1§r') = #title_text))");
    expect(f0.form_0.bindings[1].source_property_name).toBe("(not ((#title_text - '§r§r§0§r') = #title_text))");
    expect(f1.form_1.controls).toEqual([{ "layout@bc_scr_screens.layout_1": {} }]);
  });

  it("builds a tile grid from the form's buttons", () => {
    expect(ui["layout_0@common_dialogs.main_panel_no_buttons"]).toMatchObject({ size: [225, 200], $child_control: "bc_scr_screens.scroller_0" });
    const grid = ui.content_0.controls.at(-1).grid_holder.controls[0].grid;
    expect(grid).toMatchObject({ type: "grid", size: [200, "default"], collection_name: "form_buttons", grid_item_template: "bc_scr_screens.tile_0" });
    expect(grid.maximum_grid_items).toBe(1);
    expect(grid.bindings).toBeUndefined();
    expect(ui.content_0.controls[0].body.controls[0].text.color).toBe("$main_header_text_color");
    expect(ui.content_0.controls[0].body).toBeTruthy();
    const button = ui.tile_0.controls[0]["button@common_buttons.light_content_button"];
    expect(button).toMatchObject({ $pressed_button_name: "button.form_button_click", $button_content: "bc_scr_screens.tile_content_0" });
    const icon = ui.tile_content_0.controls[0].icon;
    expect(icon.size).toEqual([20, 20]);
    expect(icon.bindings[0]).toMatchObject({ binding_name: "#form_button_texture", binding_type: "collection", binding_collection_name: "form_buttons" });
  });

  it("gives a layout its own background, title and close button", () => {
    const frame = ui.layout_1;
    expect(frame.size).toEqual([200, 160]);
    expect(frame.controls[0].bg.texture).toBe("textures/ui/scr_menu_bg");
    expect(files.has("RP/textures/ui/scr_menu_bg.png")).toBe(true);
    expect(frame.controls[1].title.color).toEqual([1, 0.667, 0]);
    expect(frame.controls.some((c: object) => "close@common.close_button" in c)).toBe(true);
    expect(ui.content_1.controls).toHaveLength(1);
  });

  it("gives storage blocks with a background or layout their own screen, picked by title", () => {
    const screen = json("RP/ui/data_driven_container_screen.json")["screen@common.inventory_screen_common"];
    expect(screen.variables.slice(0, 2).map((v: { requires: string }) => v.requires)).toEqual(["$desktop_screen", "$pocket_screen"]);
    expect(screen.variables[2]).toMatchObject({ requires: "($container_title = 'Crate’s Stuff')", $screen_content: "bc_scr_screens.container_0" });
    expect(screen.variables[3]).toMatchObject({ requires: "($container_title = 'Basic Crafter')", $screen_content: "bc_scr_screens.container_1" });
    expect(json("BP/blocks/crate.json")["minecraft:block"].components["minecraft:block_entity"].container.title).toBe("Crate’s Stuff");
  });

  it("draws the background behind a chest-style grid when there's no layout", () => {
    const top = ui.container_top_0;
    expect(top.size).toEqual(["100%", 78]);
    expect(top.controls[0].bg.texture).toBe("textures/ui/scr_chest_bg");
    const slots = top.controls.at(-1).slots;
    expect(slots).toMatchObject({ type: "collection_panel", collection_name: "container_items" });
    expect(slots.controls).toHaveLength(27);
    expect(slots.controls[10]["slot_10@chest.chest_grid_item"]).toMatchObject({ collection_index: 10, offset: [18, 18] });
    expect(ui.container_0.controls.at(-1)["root_panel@common.root_panel"].size).toEqual([176, 166]);
  });

  it("places each slot of a custom layout, with the title moved and recoloured", () => {
    const top = ui.container_top_1;
    expect(top.size).toEqual(["100%", 78]);
    const slots = top.controls.at(-1).slots.controls;
    expect(slots).toHaveLength(9);
    expect(slots[4]["slot_4@chest.chest_grid_item"]).toEqual({ collection_index: 4, offset: [63, 18], anchor_from: "top_left", anchor_to: "top_left" });
    expect(top.controls[0]["title@chest.chest_label"]).toMatchObject({ text: "$container_title", offset: [54, -3], color: [1, 1, 1] });
    const root = ui.container_1.controls.at(-1)["root_panel@common.root_panel"];
    const parts = root.controls[1].container_panel.controls.map((c: object) => Object.keys(c)[0]);
    expect(parts).toEqual(["top@bc_scr_screens.container_top_1", "inventory_panel_bottom_half_with_label@common.inventory_panel_bottom_half_with_label", "hotbar_grid@common.hotbar_grid_template", "inventory_take_progress_icon_button@common.inventory_take_progress_icon_button", "flying_item_renderer@common.flying_item_renderer"]);
  });

  it("lists custom effects on the left by default", () => {
    const hud = json("RP/ui/scr_hud.json");
    expect(hud.root.controls).toContainEqual({ "fx_list@bc_scr.fx_list": {} });
    expect(hud.fx_list).toMatchObject({ type: "stack_panel", anchor_from: "left_middle" });
    expect(js).toContain(`"glow": { title: "Glow"`);
    expect(js).toMatch(/"glow": \{[^\n]*left: true/);
    expect(js).toMatch(/"zap": \{[^\n]*left: false/);
    expect(js).toContain(`bcHudPut(e, "bc:scr:fx" + k + ":", rows[k] ?? "")`);
    expect(js).toContain("function bcHudPut(");
  });

  it("type-checks against @minecraft/server 2.1.0 and 2.11.0", () => {
    expect(typecheckScript(js)).toEqual([]);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("writes no screen files when nothing uses them", () => {
    const out = generateAddon({ ...p, elements: [plain] });
    expect(out.files.has("RP/ui/server_form.json")).toBe(false);
    expect(out.files.has("RP/ui/_ui_defs.json")).toBe(false);
    expect(out.files.get("BP/scripts/main.js")).not.toContain("§r§r");
  });
});
