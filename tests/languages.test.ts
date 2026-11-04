import { describe, expect, it } from "vitest";
import { englishTexts, generateAddon, parseLang, translateLang } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";

describe("languages", () => {
  const p = createProject("Gems");
  p.namespace = "gem";
  p.description = "Shiny things";
  p.elements.push(createElement("item", "ruby", "Ruby"), createElement("block", "ruby_block", "Block of Ruby"), createElement("entity", "golem", "Golem"));
  p.languages = ["es_ES", "de_DE"];
  p.translations = { es_ES: { "item.gem:ruby.name": "Rubí", "pack.description": "Cosas brillantes", "tile.gem:ruby_block.name": "  " } };
  const { files } = generateAddon(p);

  it("lists every language", () => {
    expect(JSON.parse(files.get("RP/texts/languages.json") as string)).toEqual(["en_US", "es_ES", "de_DE"]);
    expect(JSON.parse(files.get("BP/texts/languages.json") as string)).toEqual(["en_US", "es_ES", "de_DE"]);
  });

  it("translates what's translated and keeps English for the rest", () => {
    const es = Object.fromEntries(parseLang(files.get("RP/texts/es_ES.lang") as string));
    expect(es["item.gem:ruby.name"]).toBe("Rubí");
    expect(es["pack.description"]).toBe("Cosas brillantes");
    expect(es["tile.gem:ruby_block.name"]).toBe("Block of Ruby");
    expect(es["entity.gem:golem.name"]).toBe("Golem");
    const de = Object.fromEntries(parseLang(files.get("RP/texts/de_DE.lang") as string));
    expect(de["item.gem:ruby.name"]).toBe("Ruby");
  });

  it("lists the English texts for the editor", () => {
    const keys = englishTexts(p).map(([k]) => k);
    expect(keys).toEqual(expect.arrayContaining(["pack.name", "pack.description", "item.gem:ruby.name", "tile.gem:ruby_block.name", "entity.gem:golem.name", "item.spawn_egg.entity.gem:golem.name"]));
  });

  it("parses .lang files with comments and keeps = in values", () => {
    expect(parseLang("## header\nitem.a.name=A = B\t# note\n\nbad line\n")).toEqual([["item.a.name", "A = B"]]);
    expect(translateLang("## x\nitem.a.name=A\n", { "item.a.name": "Ä\nline" })).toBe("## x\nitem.a.name=Ä line\n");
  });
});
