import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import type { Project } from "../src/model/types";
import { PNG } from "./fixture";

const OGG = "data:audio/ogg;base64,T2dnUwACAAAAAAAAAAA=";

function project(): Project {
  const p = createProject("Tunes");
  p.namespace = "tun";
  p.textures.push({ id: "icon", name: "disc_icon", kind: "item", width: 16, height: 16, dataUrl: PNG });
  const a = createElement("disc", "ruby_rhapsody", "Ruby Rhapsody");
  Object.assign(a, { file: OGG, fileName: "rhapsody.ogg", duration: 183.4, texture: "icon", comparator: 7, volume: 60 });
  const b = createElement("disc", "cave_song", "Cave Song");
  Object.assign(b, { file: OGG, fileName: "cave.ogg", duration: 90, texture: "icon", replaces: "record.wait" });
  p.elements.push(a, b);
  return p;
}

describe("music discs", () => {
  const { files, warnings } = generateAddon(project());
  const item = (n: string) => JSON.parse(files.get(`BP/items/${n}.json`) as string)["minecraft:item"];
  const defs = () => JSON.parse(files.get("RP/sounds/sound_definitions.json") as string).sound_definitions;

  it("exports without problems", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("makes a single-stack record item in the discs group", () => {
    const it = item("ruby_rhapsody");
    expect(it.components["minecraft:record"]).toEqual({ sound_event: "record.13", duration: 183.4, comparator_signal: 7 });
    expect(it.components["minecraft:max_stack_size"]).toEqual({ value: 1 });
    expect(it.description.menu_category.group).toBe("minecraft:itemGroup.name.record");
    expect(item("cave_song").components["minecraft:record"].sound_event).toBe("record.wait");
  });

  it("points the slot's sound at the song, streamed like vanilla records", () => {
    expect(defs()["record.13"]).toEqual({
      __use_legacy_max_distance: "true", category: "record", max_distance: 64, min_distance: null,
      sounds: [{ name: "sounds/tun/records/ruby_rhapsody", stream: true, load_on_low_memory: true, volume: 0.6 }],
    });
    expect(defs()["record.wait"].sounds[0].name).toBe("sounds/tun/records/cave_song");
    expect(files.has("RP/sounds/tun/records/ruby_rhapsody.ogg")).toBe(true);
  });

  it("says which vanilla disc it takes over", () => {
    expect(warnings.some((w) => w.level === "info" && w.message.includes(`"13"`))).toBe(true);
  });

  it("reports two discs on one slot, and missing songs", () => {
    const p = project();
    for (const e of p.elements) if (e.kind === "disc") e.replaces = "record.cat";
    p.elements.push(createElement("disc", "empty", "Empty"));
    const msgs = generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);
    expect(msgs.some((m) => m.includes(`same vanilla disc slot ("cat")`))).toBe(true);
    expect(msgs.some((m) => m.includes("Empty") && m.includes(".ogg"))).toBe(true);
  });
});
