import { describe, expect, it, vi } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createProject } from "../src/model/project";
import { applyTemplate, ELEMENT_TEMPLATES, STARTER_TEMPLATES } from "../src/model/templates";
import { PNG } from "./fixture";
import { typecheckScript } from "./typecheck";

// Template textures are drawn on a canvas, which tests don't have.
vi.mock("../src/textures/procedural", async (orig) => ({
  ...(await orig<typeof import("../src/textures/procedural")>()),
  generateTexture: () => ({ dataUrl: PNG, width: 16, height: 16 }),
}));

const errors = (p: ReturnType<typeof createProject>) => generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);

describe("templates gallery", () => {
  for (const t of ELEMENT_TEMPLATES) {
    it(`“${t.title}” adds working elements to a new project`, () => {
      const p = createProject("T");
      p.namespace = "tpl";
      const { project } = applyTemplate(p, t.build(p.namespace));
      expect(project.elements.length).toBeGreaterThan(0);
      expect(errors(project)).toEqual([]);
    });
  }

  it("renames clashing elements and their references when added twice", () => {
    const p = createProject("T");
    p.namespace = "tpl";
    const lucky = ELEMENT_TEMPLATES.find((t) => t.id === "lucky_block")!;
    const once = applyTemplate(p, lucky.build("tpl")).project;
    const twice = applyTemplate(once, lucky.build("tpl"));
    expect(twice.renamed).toMatchObject({ lucky_block: "lucky_block_2", lucky_block_surprise: "lucky_block_surprise_2" });
    expect(twice.project.elements.find((e) => e.name === "lucky_block_2")!.displayName).toBe("Lucky Block 2");
    const proc = twice.project.elements.find((e) => e.name === "lucky_block_surprise_2")!;
    expect(proc.kind === "procedure" && proc.filter).toBe("tpl:lucky_block_2");
    const recipe = twice.project.elements.find((e) => e.name === "lucky_block_recipe_2")!;
    expect(recipe.kind === "recipe" && recipe.result).toBe("tpl:lucky_block_2");
    expect(errors(twice.project)).toEqual([]);
  });

  it("shares variables and scoreboards instead of duplicating them", () => {
    const p = createProject("T");
    const mana = ELEMENT_TEMPLATES.find((t) => t.id === "mana")!;
    const twice = applyTemplate(applyTemplate(p, mana.build(p.namespace)).project, mana.build(p.namespace)).project;
    expect(twice.variables!.filter((v) => v.name === "mana")).toHaveLength(1);
  });

  it("raises the project version when a template needs it", () => {
    const p = createProject("T");
    const crate = applyTemplate(p, ELEMENT_TEMPLATES.find((t) => t.id === "storage_crate")!.build(p.namespace)).project;
    expect(crate.scriptApi).toBe("2.11.0");
    expect(crate.minEngine).toEqual([1, 26, 60]);
  });

  for (const s of STARTER_TEMPLATES) {
    it(`starter “${s.title}” exports without errors and its script type-checks`, () => {
      const p = s.build(createProject("Start"));
      expect(errors(p)).toEqual([]);
      const js = generateAddon(p).files.get("BP/scripts/main.js") as string | undefined;
      if (js) expect(typecheckScript(js, p.scriptApi === "2.11.0" ? "node_modules/mcserver211/index.d.ts" : undefined)).toEqual([]);
    });
  }
});
