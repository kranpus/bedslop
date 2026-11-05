// HUDs and screen overlays (JSON UI).
//
// Layout: RP/ui/_ui_defs.json lists our file; RP/ui/hud_screen.json inserts our root panel into the vanilla HUD;
// RP/ui/<ns>_hud.json holds the panels. Live values travel from the script as invisible titles
// ("bc:<ns>:<channel>:<value>", shown for 0 ticks). For each channel a hidden "data" control keeps the last
// title that starts with its prefix (the community "preserved title" technique), and labels, bars and
// overlay panels read from it.

import type { AchievementElement, CustomEffectElement, HudAnchor, HudElement } from "../model/types";
import { GenContext } from "./context";
import { clampInt, round } from "./content";
import { encodePng } from "./png";

const S = JSON.stringify;

/** "#ffd84a" -> [1, 0.85, 0.29] */
function rgb(hex = "#ffffff"): number[] {
  const n = parseInt((hex || "#ffffff").replace("#", "").padEnd(6, "f").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => round(v / 255));
}

/** JSON UI string literal (single quotes). */
const lit = (s: string) => `'${s.replace(/'/g, "")}'`;

/** A hidden control that keeps the last title starting with `prefix`. */
function dataControl(prefix: string) {
  return {
    type: "panel",
    size: [0, 0],
    bindings: [
      { binding_name: "#hud_title_text_string" },
      { binding_name: "#hud_title_text_string", binding_name_override: "#preserved_text", binding_condition: "visibility_changed" },
      {
        binding_type: "view",
        source_property_name: `(not (#hud_title_text_string = #preserved_text) and not ((#hud_title_text_string - ${lit(prefix)}) = #hud_title_text_string))`,
        target_property_name: "#visible",
      },
    ],
  };
}

const place = (a: HudAnchor, x: number, y: number) => ({ anchor_from: a, anchor_to: a, offset: [round(x), round(y)] });

export interface HudChannel { prefix: string; kind: "live" | "bar" | "show"; hud: string; text?: string; source?: "variable" | "score"; name?: string; max?: number; segments?: number; maxSource?: "variable" | "score"; maxName?: string }

/** Rows in the custom effects list on the left of the screen. */
export const FX_ROWS = 6;
/** Whether custom effects use the list on the left of the screen. */
export const fxOnLeft = (ctx: GenContext) =>
  ctx.project.elements.some((e) => e.kind === "effect" && (e as CustomEffectElement).showTimer && ((e as CustomEffectElement).timerPlace ?? "left") === "left");

export function genHuds(ctx: GenContext) {
  const huds = ctx.project.elements.filter((e): e is HudElement => e.kind === "hud");
  const fxList = fxOnLeft(ctx);
  const advs = ctx.project.elements.filter((e): e is AchievementElement => e.kind === "achievement");
  if (!huds.length && !fxList && !advs.length) return;
  const space = `bc_${ctx.ns}`;
  const channels: HudChannel[] = [];
  const defs: Record<string, unknown> = {};
  let n = 0;

  for (const h of huds) {
    const controls: Record<string, unknown>[] = [];
    const data: Record<string, unknown>[] = [];
    if (!h.widgets.length) ctx.warn(h, "is empty. Add something to show.");
    for (const w of h.widgets) {
      const name = `w${++n}`;
      const at = place(w.anchor, w.x, w.y);
      if (w.type === "image") {
        const tex = ctx.writeTexture(w.texture, "ui");
        if (!tex) { ctx.warn(h, "has an image with no texture yet."); continue; }
        controls.push({ [name]: { type: "image", texture: tex, size: [clampInt(w.w, 1, 2000), clampInt(w.h, 1, 2000)], layer: 10, ...at } });
      } else if (w.type === "text") {
        controls.push({ [name]: { type: "label", text: w.text ?? "", color: rgb(w.color), shadow: !!w.shadow, font_scale_factor: round(w.scale ?? 1), size: ["default", "default"], layer: 11, ...at } });
      } else if (w.type === "live") {
        const prefix = `bc:${ctx.ns}:${name}:`;
        channels.push({ prefix, kind: "live", hud: h.name, text: w.text ?? "" });
        data.push({ [`${name}_data`]: dataControl(prefix) });
        controls.push({ [name]: {
          type: "label", text: "#text", color: rgb(w.color), shadow: !!w.shadow, font_scale_factor: round(w.scale ?? 1), size: ["default", "default"], layer: 11, ...at,
          bindings: [{ binding_type: "view", source_control_name: `${name}_data`, source_property_name: `(#preserved_text - ${lit(prefix)})`, target_property_name: "#text" }],
        } });
      } else if (w.type === "bar") {
        if (!w.sourceName) { ctx.warn(h, "has a bar that doesn't show anything yet. Pick a variable or scoreboard."); continue; }
        const fill = ctx.writeTexture(w.texture, "ui");
        if (!fill) { ctx.warn(h, "has a bar with no fill texture yet."); continue; }
        const empty = ctx.writeTexture(w.emptyTexture, "ui");
        const segs = clampInt(w.segments ?? 10, 2, 20);
        const prefix = `bc:${ctx.ns}:${name}:`;
        const maxFrom = w.maxSource === "variable" || w.maxSource === "score" ? w.maxSource : undefined;
        if (maxFrom && !w.maxName) ctx.warn(h, `has a bar whose “full at” ${maxFrom === "score" ? "scoreboard" : "variable"} isn't chosen yet. It uses ${Math.max(1, Number(w.max) || 10)} for now.`);
        if (maxFrom === "variable" && w.maxName && !(ctx.project.variables ?? []).some((v) => v.name === w.maxName)) ctx.warn(h, `has a bar that fills up to the variable "${w.maxName}", which doesn't exist.`, "error");
        if (maxFrom === "score" && w.maxName && !(ctx.project.scoreboards ?? []).some((o) => o.name === w.maxName)) ctx.warn(h, `has a bar that fills up to the scoreboard "${w.maxName}", which doesn't exist.`, "error");
        channels.push({ prefix, kind: "bar", hud: h.name, source: w.source ?? "variable", name: w.sourceName, max: Math.max(1, Number(w.max) || 10), segments: segs,
          ...(maxFrom && w.maxName ? { maxSource: maxFrom, maxName: w.maxName } : {}) });
        data.push({ [`${name}_data`]: dataControl(prefix) });
        // One image per segment, left to right; segment k shows when the value is k or more.
        const segW = Math.max(1, Math.floor(clampInt(w.w, segs, 2000) / segs)), segH = clampInt(w.h, 1, 2000);
        const segments: Record<string, unknown>[] = [];
        for (let k = 1; k <= segs; k++) {
          const shown = Array.from({ length: segs - k + 1 }, (_, i) => `((#preserved_text - ${lit(prefix)}) = ${lit(String(k + i))})`).join(" or ");
          if (empty) segments.push({ [`${name}_e${k}`]: { type: "image", texture: empty, size: [segW, segH], offset: [(k - 1) * segW, 0], anchor_from: "left_middle", anchor_to: "left_middle", layer: 10 } });
          segments.push({ [`${name}_s${k}`]: {
            type: "image", texture: fill, size: [segW, segH], offset: [(k - 1) * segW, 0], anchor_from: "left_middle", anchor_to: "left_middle", layer: 11,
            bindings: [{ binding_type: "view", source_control_name: `${name}_data`, source_property_name: `(${shown})`, target_property_name: "#visible" }],
          } });
        }
        controls.push({ [name]: { type: "panel", size: [segW * segs, segH], ...at, controls: segments } });
      }
    }

    // Overlays are hidden until a procedure shows them.
    const content: Record<string, unknown> = { type: "panel", size: ["100%", "100%"], controls: [
      ...(h.mode === "overlay" && h.dim ? [{ dim: { type: "image", texture: `textures/ui/${ctx.ns}_dim`, size: ["100%", "100%"], layer: 5 } }] : []),
      ...controls,
    ] };
    if (h.mode === "overlay") {
      const prefix = `bc:${ctx.ns}:show_${h.name}:`;
      channels.push({ prefix, kind: "show", hud: h.name });
      data.push({ [`show_${h.name}_data`]: dataControl(prefix) });
      content.bindings = [{ binding_type: "view", source_control_name: `show_${h.name}_data`, source_property_name: `(#preserved_text = ${lit(prefix + "1")})`, target_property_name: "#visible" }];
    }
    defs[`hud_${h.name}`] = { type: "panel", size: ["100%", "100%"], controls: [...data, { content }] };
  }

  if (huds.some((h) => h.mode === "overlay" && h.dim)) {
    // 1×1 half-transparent black, stretched over the screen behind overlays.
    ctx.rp(`textures/ui/${ctx.ns}_dim.png`, encodePng(1, 1, new Uint8Array([0, 0, 0, 140])));
  }
  if (fxList) {
    // Custom effects: a list on the left, like vanilla's effect icons on the right.
    const rows: Record<string, unknown>[] = [];
    for (let k = 0; k < FX_ROWS; k++) {
      const prefix = `bc:${ctx.ns}:fx${k}:`;
      rows.push({ [`fx${k}`]: { type: "panel", size: ["100%c", 11], controls: [
        { [`fx${k}_data`]: dataControl(prefix) },
        { [`fx${k}_text`]: {
          type: "label", text: "#text", shadow: true, size: ["default", "default"], layer: 11, anchor_from: "left_middle", anchor_to: "left_middle",
          bindings: [{ binding_type: "view", source_control_name: `fx${k}_data`, source_property_name: `(#preserved_text - ${lit(prefix)})`, target_property_name: "#text" }],
        } },
      ] } });
    }
    defs.fx_list = { type: "stack_panel", orientation: "vertical", size: [160, FX_ROWS * 11], anchor_from: "left_middle", anchor_to: "left_middle", offset: [4, -20], controls: rows };
  }
  if (advs.length) {
    // Achievement toast in the top right: the script sends the achievement's name (for its icon) and the text.
    const name = `bc:${ctx.ns}:adv:`, text = `bc:${ctx.ns}:advt:`;
    const nameData = `${ctx.ns}_adv_data`, textData = `${ctx.ns}_advt_data`;
    const icons = advs.flatMap((a) => {
      const tex = a.icon ? ctx.writeTexture(a.icon, "ui") : "";
      return tex ? [{ [`icon_${a.name}`]: {
        type: "image", texture: tex, size: [16, 16], anchor_from: "left_middle", anchor_to: "left_middle", offset: [8, 0], layer: 32,
        bindings: [{ binding_type: "view", source_control_name: nameData, source_property_name: `(#preserved_text = ${lit(name + a.name)})`, target_property_name: "#visible" }],
      } }] : [];
    });
    defs.adv_toast = { type: "panel", size: [160, 32], anchor_from: "top_right", anchor_to: "top_right", offset: [-4, 4], controls: [
      { [nameData]: dataControl(name) },
      { [textData]: dataControl(text) },
      { box: { type: "panel", size: ["100%", "100%"],
        bindings: [{ binding_type: "view", source_control_name: nameData, source_property_name: `(not ((#preserved_text - ${lit(name)}) = ''))`, target_property_name: "#visible" }],
        controls: [
          { bg: { type: "image", texture: "textures/ui/hud_tip_text_background", size: ["100%", "100%"], alpha: 0.9, layer: 30 } },
          ...icons,
          { text: { type: "label", text: "#text", shadow: true, size: [icons.length ? "100% - 32px" : "100% - 12px", "default"], anchor_from: "left_middle", anchor_to: "left_middle", offset: [icons.length ? 28 : 8, 0], layer: 32,
            bindings: [{ binding_type: "view", source_control_name: textData, source_property_name: `(#preserved_text - ${lit(text)})`, target_property_name: "#text" }] } },
        ] } },
    ] };
  }
  ctx.rp(`ui/${ctx.ns}_hud.json`, {
    namespace: space,
    root: { type: "panel", size: ["100%", "100%"], controls: [
      ...huds.map((h) => ({ [`hud_${h.name}@${space}.hud_${h.name}`]: {} })),
      ...(fxList ? [{ [`fx_list@${space}.fx_list`]: {} }] : []),
      ...(advs.length ? [{ [`adv_toast@${space}.adv_toast`]: {} }] : []),
    ] },
    ...defs,
  });
  ctx.uiDefs.push(`ui/${ctx.ns}_hud.json`);
  ctx.rp("ui/hud_screen.json", {
    namespace: "hud",
    root_panel: { modifications: [{ array_name: "controls", operation: "insert_back", value: [{ [`${space}_root@${space}.root`]: {} }] }] },
  });

  // ----- Script: work out each player's values and send the ones that changed, one title per tick. -----
  ctx.script.sections.push(`// ----- HUDs and screen overlays -----
/** [prefix, kind, hud, text or source, name, max, segments, max source ("" = fixed), max name] */
const BC_HUD = /** @type {any[][]} */ (${S(channels.map((c) => [c.prefix, c.kind, c.hud, c.kind === "live" ? c.text : c.source ?? "", c.name ?? "", c.max ?? 0, c.segments ?? 0, c.maxSource ?? "", c.maxName ?? ""]))});
/** Per player: last value sent per channel, values waiting to go out, overlays shown (hud -> hide at tick or 0). */
const BC_HUD_STATE = new Map();
function bcHudState(p) {
  let st = BC_HUD_STATE.get(p.id);
  if (!st) { st = { sent: {}, queue: new Map(), shown: {} }; BC_HUD_STATE.set(p.id, st); }
  return st;
}
/** Queues a value for one of the player's screen channels (sent if it changed). */
function bcHudPut(p, prefix, v) {
  const st = bcHudState(p);
  if (st.sent[prefix] !== v) st.queue.set(prefix, v);
  else st.queue.delete(prefix);
}
/** Shows or hides an overlay for a player (seconds > 0 hides it again after that long). */
function bcHudShow(p, hud, on, seconds) {
  if (!p || p.typeId !== "minecraft:player") return;
  const ch = BC_HUD.find((c) => c[1] === "show" && c[2] === hud);
  if (!ch) return;
  const st = bcHudState(p);
  st.shown[hud] = on ? (Number(seconds) > 0 ? system.currentTick + Math.round(Number(seconds) * 20) : -1) : 0;
  st.queue.set(ch[0], on ? "1" : "0");
}
system.runInterval(() => {
  const tick = system.currentTick;
  for (const p of world.getAllPlayers()) {
    const st = bcHudState(p);
    if (tick % 10 === 0) {
      const ctx = BC.ctxP(p);
      for (const [prefix, kind, hud, a, name, fixedMax, segs, maxFrom, maxName] of BC_HUD) {
        let v;
        if (kind === "live") v = BC.fmt(ctx, a);
        else if (kind === "bar") {
          const raw = Number(a === "score" ? BC.getScore(ctx, name, "player") : BC.getVar(ctx, name, "player")) || 0;
          // "Full at" can come from a variable or score (e.g. max mana), read for this player.
          const max = maxFrom ? Number(maxFrom === "score" ? BC.getScore(ctx, maxName, "player") : BC.getVar(ctx, maxName, "player")) || 0 : fixedMax;
          v = max > 0 ? String(Math.max(0, Math.min(segs, Math.round((raw / max) * segs)))) : "0";
        } else {
          const until = st.shown[hud] ?? 0;
          if (until > 0 && tick >= until) st.shown[hud] = 0;
          v = st.shown[hud] ? "1" : "0";
        }
        if (st.sent[prefix] !== v) st.queue.set(prefix, v);
      }
    }
    // One title per tick: the screen only sees the latest one.
    const next = st.queue.entries().next();
    if (next.done) continue;
    const [prefix, v] = next.value;
    st.queue.delete(prefix);
    st.sent[prefix] = v;
    BC.run("hud", () => p.onScreenDisplay.setTitle(prefix + v, { fadeInDuration: 0, stayDuration: 0, fadeOutDuration: 0 }));
  }
}, 1);
world.afterEvents.playerLeave.subscribe((ev) => BC_HUD_STATE.delete(ev.playerId));
`);
}
