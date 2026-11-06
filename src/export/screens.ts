// Custom form layouts and themed container screens (JSON UI).
//
// Forms: menu forms with a layout get an invisible marker (formatting codes only) at the start of their
// title. server_form.json points vanilla's form factory at our switch panel, which shows the vanilla
// form for unmarked titles and our layout for marked ones. The layout reuses vanilla's dialog frame (or
// an image) and lists the buttons as a grid of tiles from the "form_buttons" collection.
//
// Containers: storage blocks with a background get it drawn behind their slots in the data-driven
// container screen, matched by the container's title.

import type { ContainerLayout, FormElement, FormLayout } from "../model/types";
import type { GenContext } from "./context";
import { clampInt, round } from "./content";

/** Invisible title marker for the i-th form layout: only formatting codes, so players never see it. */
export const formMarker = (i: number) => "§r§r" + i.toString(16).split("").map((d) => "§" + d).join("") + "§r";

/** Menu forms that use a custom layout, in a stable order (their index picks the marker). */
export const layoutForms = (forms: FormElement[]) => forms.filter((f) => f.formType === "menu" && f.layout?.style === "grid");

function rgb(hex: string | undefined, fallback: string): number[] {
  const n = parseInt((hex || fallback).replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => round(v / 255));
}
const lit = (s: string) => `'${s.replace(/'/g, "")}'`;
const visibleWhen = (expr: string) => [{ binding_name: "#title_text" }, { binding_type: "view", source_property_name: expr, target_property_name: "#visible" }];

export function genScreens(ctx: GenContext) {
  const forms = layoutForms(ctx.project.elements.filter((e): e is FormElement => e.kind === "form"));
  const containers = ctx.containerScreens;
  if (!forms.length && !containers.length) return;
  const space = `bc_${ctx.ns}_screens`;
  const defs: Record<string, unknown> = {};

  if (forms.length) {
    const markers = forms.map((_, i) => formMarker(i));
    defs.form_switch = {
      type: "panel", size: [0, 0],
      controls: [
        // Every other form looks like vanilla.
        { vanilla_form: { type: "panel", size: [0, 0], bindings: visibleWhen(`(${markers.map((m) => `((#title_text - ${lit(m)}) = #title_text)`).join(" and ")})`), controls: [{ "long_form@server_form.long_form": {} }] } },
        ...forms.map((f, i) => ({ [`form_${i}`]: { type: "panel", size: [0, 0], bindings: visibleWhen(`(not ((#title_text - ${lit(markers[i])}) = #title_text))`), controls: [{ [`layout@${space}.layout_${i}`]: {} }] } })),
      ],
    };
    forms.forEach((f, i) => Object.assign(defs, layoutDefs(ctx, space, f, f.layout!, i)));
    ctx.rp("ui/server_form.json", {
      namespace: "server_form",
      main_screen_content: {
        modifications: [{
          array_name: "controls", operation: "replace", control_name: "server_form_factory",
          value: { server_form_factory: { type: "factory", control_ids: { long_form: `@${space}.form_switch`, custom_form: "@server_form.custom_form" } } },
        }],
      },
    });
  }

  if (containers.length) {
    // A storage block with its own look gets a whole screen of its own (classic layout on every device,
    // pocket included), picked by the container's title: background, title and slots where you put them.
    containers.forEach((c, i) => Object.assign(defs, containerScreenDefs(space, c, i)));
    ctx.rp("ui/data_driven_container_screen.json", {
      namespace: "data_driven_container",
      // The pattern custom chest packs use: the screen's variables again (Minecraft's desktop and pocket
      // entries, copied from 1.26.60) with ours last, so a matching title picks our screen on every device.
      "screen@common.inventory_screen_common": {
        variables: [
          { requires: "$desktop_screen", $screen_content: "data_driven_container.desktop_panel", $screen_bg_content: "common.screen_background", $screen_background_alpha: 0.4 },
          { requires: "$pocket_screen", $use_custom_pocket_toast: true, $screen_content: "pocket_containers.data_driven_container_panel" },
          ...containers.map((c, i) => ({
            requires: `($container_title = ${lit(c.title)})`,
            $screen_content: `${space}.container_${i}`, $screen_bg_content: "common.screen_background", $screen_background_alpha: 0.4,
          })),
        ],
      },
    });
  }

  ctx.rp(`ui/${ctx.ns}_screens.json`, { namespace: space, ...defs });
  ctx.uiDefs.push(`ui/${ctx.ns}_screens.json`);
}

/** The panels for one form layout: frame (or image), scrolling content, and the tile template. */
function layoutDefs(ctx: GenContext, space: string, f: FormElement, l: FormLayout, i: number): Record<string, unknown> {
  const cols = clampInt(l.columns, 1, 8), tw = clampInt(l.tileWidth, 24, 400), th = clampInt(l.tileHeight, 24, 400);
  const icon = clampInt(l.iconSize, 8, Math.min(tw, th));
  const w = clampInt(l.width, 120, 600), h = clampInt(l.height, 100, 400);
  // Tiles are light grey buttons: dark text. Vanilla's dialog is dark inside: its own (white) body text.
  const textColor = rgb(l.textColor, "#4c4c4c");
  const bg = l.background ? ctx.writeTexture(l.background, "ui") : "";
  if (l.background && !bg) ctx.warn(f, "has a layout background that no longer exists.");
  if (cols * tw > w - 12) ctx.warn(f, `layout is ${cols} tiles × ${tw}px wide, which is wider than the form (${w}px). Some tiles will wrap or be cut off.`);

  const content = {
    type: "stack_panel", size: ["100% - 4px", "100%c"], orientation: "vertical", anchor_from: "top_left", anchor_to: "top_left",
    controls: [
      ...(l.showBody ? [{ body: { type: "panel", size: ["100%", "100%c"], controls: [{ text: { type: "label", offset: [2, 2], color: l.background ? rgb(l.titleColor, "#ffffff") : "$main_header_text_color", size: ["100%", "default"], anchor_from: "top_left", anchor_to: "top_left", text: "#form_text" } }] } }, { pad: { type: "panel", size: ["100%", 4] } }] : []),
      { grid_holder: { type: "panel", size: ["100%", "100%c"], controls: [{ grid: {
        type: "grid", size: [cols * tw, "default"], anchor_from: "top_middle", anchor_to: "top_middle",
        // A fixed count, like Minecraft's inventory grids: "#form_button_contents" is a list of entry types
        // (button, label, header, divider), not a number, so a grid can't count from it.
        grid_item_template: `${space}.tile_${i}`, grid_rescaling_type: "horizontal", collection_name: "form_buttons",
        maximum_grid_items: Math.max(1, f.buttons.length),
      } }] } },
    ],
  };
  const scroller = {
    type: "panel", size: ["100%", "100%"],
    controls: [{ "scrolling_panel@common.scrolling_panel": {
      anchor_to: "top_left", anchor_from: "top_left", $show_background: false, size: ["100%", "100%"],
      $scrolling_content: `${space}.content_${i}`, $scroll_size: [5, "100% - 4px"], $scrolling_pane_size: ["100% - 4px", "100% - 2px"],
      $scrolling_pane_offset: [2, 0], $scroll_bar_right_padding_size: [0, 0],
    } }],
  };
  // Each tile: a button whose content is the icon above the text.
  const tile = { type: "panel", size: [tw, th], controls: [{ "button@common_buttons.light_content_button": {
    $pressed_button_name: "button.form_button_click", size: ["100% - 2px", "100% - 2px"], $button_content: `${space}.tile_content_${i}`,
    bindings: [{ binding_type: "collection_details", binding_collection_name: "form_buttons" }],
  } }] };
  const tileContent = { type: "panel", size: ["100%", "100%"], controls: [
    { icon: { type: "image", layer: 4, size: [icon, icon], anchor_from: "top_middle", anchor_to: "top_middle", offset: [0, 4], bindings: [
      { binding_name: "#form_button_texture", binding_name_override: "#texture", binding_type: "collection", binding_collection_name: "form_buttons" },
      { binding_name: "#form_button_texture_file_system", binding_name_override: "#texture_file_system", binding_type: "collection", binding_collection_name: "form_buttons" },
      { binding_type: "view", source_property_name: "(not ((#texture = '') or (#texture = 'loading')))", target_property_name: "#visible" },
    ] } },
    { text: { type: "label", layer: 4, text: "#form_button_text", color: textColor, size: ["100% - 4px", "default"], max_size: ["100% - 4px", 20], text_alignment: "center", anchor_from: "bottom_middle", anchor_to: "bottom_middle", offset: [0, -3], bindings: [
      { binding_name: "#form_button_text", binding_type: "collection", binding_collection_name: "form_buttons" },
    ] } },
  ] };

  const frame = bg
    // Own background image, with the title and a close button on top.
    ? { type: "panel", size: [w, h], layer: 2, controls: [
        { bg: { type: "image", texture: bg, size: ["100%", "100%"], layer: 1 } },
        { title: { type: "label", text: "#title_text", color: rgb(l.titleColor, "#ffffff"), shadow: true, size: ["100% - 30px", 10], anchor_from: "top_middle", anchor_to: "top_middle", offset: [0, 7], layer: 3, text_alignment: "center", bindings: [{ binding_name: "#title_text" }] } },
        { "close@common.close_button": { layer: 5 } },
        { body: { type: "panel", size: ["100% - 14px", "100% - 30px"], anchor_from: "top_middle", anchor_to: "top_middle", offset: [0, 24], layer: 3, controls: [{ [`scroll@${space}.scroller_${i}`]: {} }] } },
      ] }
    // Minecraft's own dialog frame (title bar and close button), with our tiles inside.
    : { "$title_panel": "common_dialogs.standard_title_label", $title_size: ["100% - 15px", 10], $title_max_size: ["100% - 15px", 10], size: [w, h], $text_name: "#title_text", $title_text_binding_type: "none", $child_control: `${space}.scroller_${i}`, layer: 2 };

  return {
    [bg ? `layout_${i}` : `layout_${i}@common_dialogs.main_panel_no_buttons`]: frame,
    [`scroller_${i}`]: scroller,
    [`content_${i}`]: content,
    [`tile_${i}`]: tile,
    [`tile_content_${i}`]: tileContent,
  };
}

/** Slot positions: the layout's, or the chest grid (9 per row) for slots it doesn't place. */
export function slotPositions(count: number, layout?: ContainerLayout): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, k) => {
    const p = layout?.slots[k];
    return p ? { x: Math.max(0, Math.min(144, Math.round(p.x))), y: Math.max(0, Math.min(144, Math.round(p.y))) } : { x: (k % 9) * 18, y: Math.floor(k / 9) * 18 };
  });
}

/** One container screen, laid out like Minecraft's chest screen: a top half with our slots, then the inventory. */
function containerScreenDefs(space: string, c: GenContext["containerScreens"][number], i: number): Record<string, unknown> {
  const slots = slotPositions(c.slotCount, c.layout);
  const slotsH = Math.max(18, ...slots.map((p) => p.y + 18));
  const topH = slotsH + 24;
  const showTitle = c.layout ? c.layout.showTitle : true;
  const top = {
    type: "panel", size: ["100%", topH], offset: [0, 11], anchor_from: "top_left", anchor_to: "top_left",
    controls: [
      ...(c.texture ? [{ bg: { type: "image", texture: c.texture, size: ["100% - 8px", "100% + 4px"], offset: [4, -7], anchor_from: "top_left", anchor_to: "top_left", layer: 1 } }] : []),
      ...(showTitle ? [{ "title@chest.chest_label": {
        text: "$container_title", layer: 3,
        ...(c.layout ? { offset: [7 + Math.round(c.layout.titleX), -1 + Math.round(c.layout.titleY)], color: rgb(c.layout.titleColor, "#404040") } : {}),
      } }] : []),
      { slots: {
        type: "collection_panel", collection_name: "container_items", "$item_collection_name": "container_items",
        size: [162, slotsH], offset: [7, 10], anchor_from: "top_left", anchor_to: "top_left", layer: 2,
        controls: slots.map((p, k) => ({ [`slot_${k}@chest.chest_grid_item`]: { collection_index: k, offset: [p.x, p.y], anchor_from: "top_left", anchor_to: "top_left" } })),
      } },
    ],
  };
  return {
    [`container_top_${i}`]: top,
    [`container_${i}`]: {
      type: "panel",
      controls: [
        { "container_gamepad_helpers@common.container_gamepad_helpers": {} },
        { "selected_item_details_factory@common.selected_item_details_factory": { control_name: "@data_driven_container.selected_item_details" } },
        { "item_lock_notification_factory@common.item_lock_notification_factory": { control_name: "@common.item_lock_notification" } },
        { "root_panel@common.root_panel": {
          size: [176, topH + 88], layer: 1,
          controls: [
            { "common_panel@common.common_panel": {} },
            { container_panel: { type: "panel", layer: 5, controls: [
              { [`top@${space}.container_top_${i}`]: {} },
              { "inventory_panel_bottom_half_with_label@common.inventory_panel_bottom_half_with_label": {} },
              { "hotbar_grid@common.hotbar_grid_template": {} },
              { "inventory_take_progress_icon_button@common.inventory_take_progress_icon_button": {} },
              { "flying_item_renderer@common.flying_item_renderer": { layer: 15 } },
            ] } },
            { "inventory_selected_icon_button@common.inventory_selected_icon_button": {} },
            { "gamepad_cursor@common.gamepad_cursor_button": {} },
          ],
        } },
      ],
    },
  };
}
