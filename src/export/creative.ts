// Your own creative inventory groups, through the item catalog (Minecraft 1.21.60+).

import type { CreativeGroup } from "../model/types";
import { identifiersOf, slugify } from "../model/registry";
import type { GenContext } from "./context";

/** Localization key used as the group's name. */
export const groupKey = (ns: string, g: CreativeGroup) => `${ns}:itemGroup.name.${slugify(g.title) || g.id.slice(0, 8)}`;

export function genCreativeGroups(ctx: GenContext) {
  const groups = (ctx.project.creativeGroups ?? []).filter((g) => g.members.length);
  if (!groups.length) return;
  ctx.requires.push({ engine: "1.21.60", reason: "Creative inventory groups", elementId: "" });
  const byCategory = new Map<string, unknown[]>();
  for (const g of groups) {
    const items = g.members.flatMap((id) => {
      const el = ctx.project.elements.find((e) => e.id === id);
      return el ? identifiersOf(el, ctx.ns) : [];
    });
    if (!items.length) continue;
    const key = groupKey(ctx.ns, g);
    ctx.lang.push(`${key}=${g.title}`);
    // Keep each member in the group's tab (and out of any vanilla group) in its own definition too.
    for (const id of items) placeInCategory(ctx, id, g.category);
    const list = byCategory.get(g.category) ?? [];
    list.push({ group_identifier: { name: key, icon: g.icon || items[0] }, items });
    byCategory.set(g.category, list);
  }
  ctx.bp("item_catalog/crafting_item_catalog.json", {
    format_version: "1.21.60",
    "minecraft:crafting_items_catalog": { categories: [...byCategory].map(([category_name, groups]) => ({ category_name, groups })) },
  });
}

/** Rewrites the menu_category of the generated item or block with this identifier. */
function placeInCategory(ctx: GenContext, id: string, category: string) {
  for (const [path, content] of ctx.files) {
    if (typeof content !== "string" || !/^BP\/(items|blocks)\//.test(path)) continue;
    if (!content.includes(`"${id}"`)) continue;
    const json = JSON.parse(content);
    const def = json["minecraft:item"] ?? json["minecraft:block"];
    if (def?.description?.identifier !== id) continue;
    def.description.menu_category = { category };
    ctx.files.set(path, JSON.stringify(json, null, 2));
    return;
  }
}
