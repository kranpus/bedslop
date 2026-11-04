import { describe, expect, it } from "vitest";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";

describe("creative inventory groups", () => {
  const p = createProject("Gems");
  p.namespace = "gem";
  const ruby = createElement("item", "ruby", "Ruby");
  ruby.group = "minecraft:itemGroup.name.ore";
  const block = createElement("block", "ruby_block", "Block of Ruby");
  const armor = createElement("armor", "ruby_armor", "Ruby Armor");
  p.elements.push(ruby, block, armor);
  p.creativeGroups = [
    { id: "g1", title: "Ruby Stuff", category: "items", icon: "", members: [ruby.id, block.id] },
    { id: "g2", title: "Ruby Gear", category: "equipment", icon: "gem:ruby_armor_chestplate", members: [armor.id] },
    { id: "g3", title: "Empty", category: "nature", icon: "", members: [] },
  ];
  const { files, warnings } = generateAddon(p);
  const json = (f: string) => JSON.parse(files.get(f) as string);

  it("exports without problems on the default 1.21.100 target", () => {
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
  });

  it("writes the item catalog with named, iconed groups per tab", () => {
    const cat = json("BP/item_catalog/crafting_item_catalog.json");
    expect(cat.format_version).toBe("1.21.60");
    const cats = cat["minecraft:crafting_items_catalog"].categories;
    expect(cats.map((c: any) => c.category_name)).toEqual(["items", "equipment"]);
    expect(cats[0].groups[0]).toEqual({ group_identifier: { name: "gem:itemGroup.name.ruby_stuff", icon: "gem:ruby" }, items: ["gem:ruby", "gem:ruby_block"] });
    expect(cats[1].groups[0].items).toEqual(["gem:ruby_armor_helmet", "gem:ruby_armor_chestplate", "gem:ruby_armor_leggings", "gem:ruby_armor_boots"]);
    expect(files.get("RP/texts/en_US.lang")).toContain("gem:itemGroup.name.ruby_stuff=Ruby Stuff");
  });

  it("moves members into the group's tab and out of vanilla groups", () => {
    expect(json("BP/items/ruby.json")["minecraft:item"].description.menu_category).toEqual({ category: "items" });
    expect(json("BP/blocks/ruby_block.json")["minecraft:block"].description.menu_category).toEqual({ category: "items" });
    expect(json("BP/items/ruby_armor_boots.json")["minecraft:item"].description.menu_category).toEqual({ category: "equipment" });
  });

  it("asks for Minecraft 1.21.60 when the project targets older", () => {
    const old = { ...p, minEngine: [1, 21, 50] as [number, number, number] };
    expect(generateAddon(old).warnings.some((w) => w.level === "error" && w.message.includes("1.21.60"))).toBe(true);
  });
});
