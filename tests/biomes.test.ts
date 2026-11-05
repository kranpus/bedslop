import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { typecheckScript } from "./typecheck";

describe("custom biomes", () => {
  const p = createProject("Biomes");
  p.namespace = "bio";
  p.scriptApi = "2.11.0";
  p.minEngine = [1, 26, 60];
  const grove = createElement("biome", "ruby_grove", "Ruby Grove");
  Object.assign(grove, { replaces: ["plains", "minecraft:forest"], amount: 0.25, patchSize: 5, temperature: 0.7, downfall: 0.6,
    topBlock: "minecraft:grass_block", featuresLike: "forest", tags: ["ruby"], grassColor: "#c4283c", foliageColor: "#a01f30", waterColor: "#ff6b7d", skyColor: "#ffb0b8", fog: "cherry_grove" });
  const ash = createElement("biome", "ash_wastes", "Ash Wastes");
  Object.assign(ash, { dimension: "nether", replaces: ["hell"], topBlock: "minecraft:basalt", midBlock: "minecraft:netherrack", seaBlock: "minecraft:lava", featuresLike: "", animals: false });
  const mob = createElement("entity", "rubling", "Rubling");
  Object.assign(mob, { spawnEnabled: true, spawnBiomeTags: ["bio_ruby_grove"] });
  const proc = createElement("procedure", "where", "Where");
  proc.trigger = "item_use";
  proc.conditions = [{ id: "c", type: "in_biome", params: { who: "player", biome: "ruby_grove" }, negate: false }];
  proc.actions = [{ id: "a", type: "message", params: { text: "You're in the grove!", to: "player" }, chance: 100 }];
  p.elements.push(grove, ash, mob, proc);
  const { files, warnings } = generateAddon(p);
  const json = (f: string) => JSON.parse(files.get(f) as string);
  const js = files.get("BP/scripts/main.js") as string;

  it("exports without errors", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("writes the biome: climate, ground, placement and tags", () => {
    const b = json("BP/biomes/ruby_grove.biome.json")["minecraft:biome"];
    expect(b.description.identifier).toBe("bio:ruby_grove");
    expect(b.components["minecraft:climate"]).toEqual({ temperature: 0.7, downfall: 0.6, snow_accumulation: [0, 0.125] });
    expect(b.components["minecraft:surface_builder"].builder).toMatchObject({ type: "minecraft:overworld", top_material: "minecraft:grass_block", sea_material: "minecraft:water" });
    expect(b.components["minecraft:replace_biomes"].replacements[0]).toEqual({ dimension: "minecraft:overworld", targets: ["plains", "forest"], amount: 0.25, noise_frequency_scale: 1.266 });
    expect(b.components["minecraft:tags"].tags).toEqual(["overworld", "bio_ruby_grove", "forest", "animal", "monster", "ruby"]);
    expect(b.components["minecraft:map_tints"]).toEqual({ foliage: "#A01F30", grass: { tint: "#C4283C" } });
  });

  it("writes its colours, sky and fog for the resource pack", () => {
    const c = json("RP/biomes/ruby_grove.client_biome.json")["minecraft:client_biome"];
    expect(c.description.identifier).toBe("bio:ruby_grove");
    expect(c.components).toEqual({
      "minecraft:water_appearance": { surface_color: "#FF6B7D" }, "minecraft:sky_color": { sky_color: "#FFB0B8" },
      "minecraft:grass_appearance": { color: "#C4283C" }, "minecraft:foliage_appearance": { color: "#A01F30" },
      "minecraft:fog_appearance": { fog_identifier: "minecraft:fog_cherry_grove" },
    });
  });

  it("makes Nether biomes with Nether ground", () => {
    const b = json("BP/biomes/ash_wastes.biome.json")["minecraft:biome"];
    expect(b.components["minecraft:replace_biomes"].replacements[0]).toMatchObject({ dimension: "minecraft:nether", targets: ["hell"] });
    expect(b.components["minecraft:surface_builder"].builder).toMatchObject({ top_material: "minecraft:basalt", mid_material: "minecraft:netherrack", sea_material: "minecraft:lava" });
    expect(b.components["minecraft:tags"].tags).toEqual(["nether", "bio_ash_wastes", "monster"]);
  });

  it("lets mobs spawn there by its tag, and procedures check it", () => {
    const rules = json("BP/spawn_rules/rubling.json")["minecraft:spawn_rules"].conditions[0];
    expect(rules["minecraft:biome_filter"]).toEqual({ test: "has_biome_tag", operator: "==", value: "bio_ruby_grove" });
    expect(js).toContain(`BC.inBiome(ctx, "player", "ruby_grove")`);
    expect(typecheckScript(js, "node_modules/mcserver211/index.d.ts")).toEqual([]);
  });

  it("reports bad targets, no targets, old game versions and the check on 2.1", () => {
    const bad = generateAddon({ ...p, elements: [{ ...grove, replaces: ["hell"] }, { ...ash, replaces: [] }] });
    expect(bad.warnings.some((w) => w.message.includes(`"hell", which isn't a Minecraft Overworld biome`))).toBe(true);
    expect(bad.warnings.some((w) => w.message.includes("doesn't replace any biome"))).toBe(true);
    const old = generateAddon({ ...p, scriptApi: "2.1.0", minEngine: [1, 21, 100] });
    expect(old.warnings.some((w) => w.level === "error" && w.message.includes("custom biomes"))).toBe(true);
    expect(old.warnings.some((w) => w.message.includes("“Is in biome” check needs Script API 2.11.0"))).toBe(true);
    expect(typecheckScript(old.files.get("BP/scripts/main.js") as string)).toEqual([]);
  });
});
