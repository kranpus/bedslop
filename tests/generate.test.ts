import { describe, expect, it } from "vitest";
import ts from "typescript";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateAddon, validateProject } from "../src/export/generate";
import { shapedPattern } from "../src/export/data";
import { fixtureProject } from "./fixture";

const text = (files: Map<string, string | Uint8Array>, path: string) => {
  const f = files.get(path);
  if (typeof f !== "string") throw new Error(`missing text file ${path}`);
  return f;
};
const json = (files: Map<string, string | Uint8Array>, path: string) => JSON.parse(text(files, path));

describe("generateAddon", () => {
  const project = fixtureProject();
  const { files, warnings, usesScripts } = generateAddon(project);

  it("produces no errors for a valid project", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("writes valid JSON everywhere", () => {
    for (const [path, content] of files) {
      if (path.endsWith(".json")) expect(() => JSON.parse(content as string), path).not.toThrow();
    }
  });

  it("links behavior and resource pack manifests", () => {
    const bp = json(files, "BP/manifest.json");
    const rp = json(files, "RP/manifest.json");
    expect(bp.header.uuid).toBe(project.uuids.bpHeader);
    expect(bp.dependencies).toContainEqual({ uuid: rp.header.uuid, version: [1, 0, 0] });
    expect(bp.modules.map((m: { type: string }) => m.type)).toEqual(["data", "script"]);
    expect(bp.dependencies).toContainEqual({ module_name: "@minecraft/server", version: "2.1.0" });
    expect(usesScripts).toBe(true);
  });

  it("generates blocks with textures, rotation and loot", () => {
    const b = json(files, "BP/blocks/ruby_block.json")["minecraft:block"];
    expect(b.description.identifier).toBe("test:ruby_block");
    expect(b.components["minecraft:material_instances"]["*"].texture).toBe("test_ruby_block");
    expect(b.components["minecraft:light_emission"]).toBe(7);
    expect(b.permutations).toHaveLength(4);
    const ore = json(files, "BP/blocks/ruby_ore.json")["minecraft:block"];
    expect(ore.components["minecraft:loot"]).toBe("loot_tables/blocks/test_ruby_ore_drops.json");
    expect(files.has("BP/loot_tables/blocks/test_ruby_ore_drops.json")).toBe(true);
    const terrain = json(files, "RP/textures/terrain_texture.json");
    expect(terrain.texture_data.test_ruby_block.textures).toBe("textures/blocks/test_ruby_block");
    expect(files.get("RP/textures/blocks/test_ruby_block.png")).toBeInstanceOf(Uint8Array);
  });

  it("generates items, tools, armor and food", () => {
    const tool = json(files, "BP/items/ruby_pickaxe.json")["minecraft:item"].components;
    expect(tool["minecraft:durability"].max_durability).toBe(250);
    expect(tool["minecraft:digger"].destroy_speeds[0].speed).toBe(6);
    for (const s of ["helmet", "chestplate", "leggings", "boots"]) {
      expect(files.has(`BP/items/ruby_armor_${s}.json`)).toBe(true);
      expect(files.has(`RP/attachables/ruby_armor_${s}.json`)).toBe(true);
    }
    const legs = json(files, "RP/attachables/ruby_armor_leggings.json");
    expect(legs["minecraft:attachable"].description.textures.default).toBe("textures/models/armor/test_ruby_layer_2");
    const food = json(files, "BP/items/ruby_apple.json")["minecraft:item"].components;
    expect(food["minecraft:food"].nutrition).toBe(4);
  });

  it("generates entities with spawn rules, loot and client files", () => {
    const e = json(files, "BP/entities/ruby_golem.json")["minecraft:entity"];
    expect(e.components["minecraft:behavior.nearest_attackable_target"]).toBeDefined();
    expect(e.components["minecraft:loot"].table).toBe("loot_tables/entities/test_ruby_golem.json");
    const spawn = json(files, "BP/spawn_rules/ruby_golem.json")["minecraft:spawn_rules"];
    expect(spawn.description.population_control).toBe("monster");
    const client = json(files, "RP/entity/ruby_pig.entity.json")["minecraft:client_entity"].description;
    expect(client.geometry.default).toBe("geometry.test.quadruped");
    expect(files.has("RP/models/entity/test_quadruped.geo.json")).toBe(true);
    expect(text(files, "RP/texts/en_US.lang")).toContain("entity.test:ruby_golem.name=Ruby Golem");
  });

  it("generates recipes, ore features and functions", () => {
    const r = json(files, "BP/recipes/ruby_pickaxe_recipe.json")["minecraft:recipe_shaped"];
    expect(r.pattern).toEqual(["AAA", " B ", " B "]);
    expect(r.key).toEqual({ A: { item: "test:ruby" }, B: { item: "minecraft:stick" } });
    expect(json(files, "BP/recipes/smelt_ruby_ore.json")["minecraft:recipe_furnace"].tags).toEqual(["furnace", "blast_furnace"]);
    const rule = json(files, "BP/feature_rules/ruby_ore_gen_rule.json")["minecraft:feature_rules"];
    expect(rule.description.places_feature).toBe("test:ruby_ore_gen_feature");
    expect(text(files, "BP/functions/test/welcome.mcfunction")).toBe("say hi\neffect @a speed 1 0 true\n");
    expect(json(files, "BP/functions/tick.json").values).toEqual(["test/welcome"]);
  });

  it("emits a script that type-checks against @minecraft/server 2.1.0", () => {
    const src = text(files, "BP/scripts/main.js");
    const dir = mkdtempSync(join(tmpdir(), "bc-script-"));
    const file = join(dir, "main.js");
    writeFileSync(file, src);
    // Minecraft's script runtime provides console.
    writeFileSync(join(dir, "env.d.ts"), "declare const console: { log(...a: unknown[]): void; warn(...a: unknown[]): void };");
    const program = ts.createProgram([file, join(dir, "env.d.ts")], {
      allowJs: true, checkJs: true, noEmit: true, strict: false, noImplicitAny: false,
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.es2022.d.ts"], types: [],
      baseUrl: resolve("."), paths: { "@minecraft/server": [resolve("node_modules/@minecraft/server/index.d.ts")] },
    });
    const diags = ts.getPreEmitDiagnostics(program).map((d) => {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
      if (!d.file || d.start === undefined) return msg;
      const { line } = d.file.getLineAndCharacterOfPosition(d.start);
      return `${line + 1}: ${msg}\n    ${src.split("\n")[line]}`;
    });
    expect(diags).toEqual([]);
  });
});

describe("validation", () => {
  it("rejects reserved namespaces and duplicate identifiers", () => {
    const p = fixtureProject();
    p.namespace = "minecraft";
    p.elements.push({ ...p.elements[0], id: "dupe" });
    const errs = validateProject(p).map((w) => w.message);
    expect(errs.some((m) => m.includes("reserved"))).toBe(true);
    expect(errs.some((m) => m.includes("already used"))).toBe(true);
  });

  it("flags references to custom items that don't exist", () => {
    const p = fixtureProject();
    const r = p.elements.find((e) => e.kind === "recipe")!;
    if (r.kind === "recipe") r.result = "test:missing_thing";
    const { warnings } = generateAddon(p);
    expect(warnings.some((w) => w.message.includes("test:missing_thing"))).toBe(true);
  });
});

describe("shapedPattern", () => {
  it("trims empty rows and columns", () => {
    expect(shapedPattern(["", "", "", "", "a:x", "a:x", "", "a:y", ""])).toEqual({
      pattern: ["AA", "B "],
      key: { A: { item: "a:x" }, B: { item: "a:y" } },
    });
  });
});
