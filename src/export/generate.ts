import { genStructure } from "./structure";
import { genParticle } from "./particle";
import { genDisc } from "./disc";
import { genEnchantments } from "./enchant";
import { genCustomEffects } from "./effects";
import { genHuds } from "./hud";
import { genAchievements } from "./achievements";
import { genKeyBinds } from "./keybinds";
import { genBiome } from "./biome";
import { genScreens } from "./screens";
import { genChestLids } from "./chest";
import { genCreativeGroups } from "./creative";
import type { CommandElement, ModElement, Project } from "../model/types";
import { genArmor, genBlock, genFood, genItem, genPlant, genTool } from "./content";
import { GenContext, type FileMap, type Warning, compareVersion, dataUrlToBytes, vec } from "./context";
import { genFunction, genLoot, genOre, genRecipe, genSound } from "./data";
import { genEntity } from "./entity";
import { buildScript, genBlockScripts, genCommands, genGameRuleCommand, genProcedure } from "./scripts";
import { genForm } from "./forms";
import { genCrop, genProjectile } from "./ranged";
import { uiVersionFor } from "../model/project";

export interface GenerateResult {
  files: FileMap;
  warnings: Warning[];
  usesScripts: boolean;
}

export const RESERVED_NAMESPACES = ["minecraft", "minecon", "mojang", "realms"];

export function validateProject(project: Project): Warning[] {
  const w: Warning[] = [];
  if (!/^[a-z][a-z0-9_]{1,31}$/.test(project.namespace)) {
    w.push({ level: "error", message: "Namespace must be 2-32 characters: lowercase letters, numbers and _ , starting with a letter." });
  }
  const varNames = new Set<string>();
  for (const v of project.variables ?? []) {
    if (!/^[a-z][a-z0-9_]*$/.test(v.name)) w.push({ level: "error", message: `Variable "${v.name}" needs a name of lowercase letters, numbers and _, starting with a letter.` });
    if (varNames.has(v.name)) w.push({ level: "error", message: `Two variables are called "${v.name}".` });
    varNames.add(v.name);
  }
  if (RESERVED_NAMESPACES.includes(project.namespace)) w.push({ level: "error", message: `"${project.namespace}" is reserved by Minecraft. Pick your own namespace.` });
  const seen = new Map<string, ModElement>();
  for (const el of project.elements) {
    if (!/^[a-z0-9_]+$/.test(el.name)) w.push({ elementId: el.id, level: "error", message: `${el.displayName}: the identifier "${el.name}" may only contain lowercase letters, numbers and _.` });
    const key = `${groupOf(el)}:${el.name}`;
    const other = seen.get(key);
    if (other) w.push({ elementId: el.id, level: "error", message: `${el.displayName}: identifier "${el.name}" is already used by ${other.displayName}.` });
    seen.set(key, el);
  }
  return w;
}

/** Parses "key=value" lines (comments and blanks skipped). */
export function parseLang(text: string): [string, string][] {
  return text.split(/\r?\n/).flatMap((line) => {
    const t = line.replace(/\t*#.*$/, "");
    const i = t.indexOf("=");
    return !t.trim() || t.startsWith("##") || i < 1 ? [] : [[t.slice(0, i).trim(), t.slice(i + 1)] as [string, string]];
  });
}

/** A .lang file with each value replaced by its translation, when there is one. */
export function translateLang(english: string, tr: Record<string, string>): string {
  return english.split("\n").map((line) => {
    const i = line.indexOf("=");
    if (line.startsWith("##") || i < 1) return line;
    const key = line.slice(0, i);
    const t = tr[key]?.trim();
    return t ? `${key}=${t.replace(/\r?\n/g, " ")}` : line;
  }).join("\n");
}

/** Every text the add-on puts in the game (RP en_US.lang), as [key, English]. */
export function englishTexts(project: Project): [string, string][] {
  const lang = generateAddon(project).files.get("RP/texts/en_US.lang");
  return typeof lang === "string" ? parseLang(lang) : [];
}

/** Elements that share the same identifier space. */
function groupOf(el: ModElement) {
  if (["block", "plant", "item", "tool", "armor", "food", "entity", "crop", "disc"].includes(el.kind)) return "content";
  return el.kind;
}

function checkReferences(ctx: GenContext) {
  const known = ctx.knownIds();
  const check = (el: ModElement, id: string, what: string) => {
    if (!id) return;
    if (id.startsWith(`${ctx.ns}:`) && !known.has(id)) ctx.warn(el, `${what} "${id}" doesn't exist in this project.`, "error");
    if (!id.includes(":")) ctx.warn(el, `${what} "${id}" needs a namespace, e.g. minecraft:${id}.`, "error");
  };
  for (const el of ctx.project.elements) {
    if (el.kind === "recipe") {
      el.grid.forEach((g) => check(el, g, "Ingredient"));
      check(el, el.result, "Result");
      check(el, el.input, "Input");
      if (el.recipeType === "smithing") [el.smithingBase, el.smithingAddition, el.smithingTemplate].forEach((i) => check(el, i, "Item"));
      if (el.recipeType === "brewing" && el.reagent) check(el, el.reagent, "Ingredient");
    }
    if (el.kind === "ore") check(el, el.block, "Block");
    if (el.kind === "loot") el.pools.forEach((p) => p.entries.forEach((e) => check(el, e.item, "Item")));
    if (el.kind === "entity") el.drops.forEach((d) => check(el, d.item, "Drop"));
  }
}

function manifests(ctx: GenContext, usesScripts: boolean) {
  const p = ctx.project;
  const version = vec(p.version);
  const minEngine = vec(p.minEngine);
  const description = p.description || `Made with Bedrock Creator by ${p.author || "an unknown creator"}`;
  const metadata = { authors: [p.author || "Unknown"], generated_with: { bedrock_creator: ["0.1.0"] } };

  const bpModules: unknown[] = [{ type: "data", uuid: p.uuids.bpData, version }];
  const bpDeps: unknown[] = [{ uuid: p.uuids.rpHeader, version }];
  if (usesScripts) {
    bpModules.push({ type: "script", language: "javascript", uuid: p.uuids.bpScript, version, entry: "scripts/main.js" });
    bpDeps.push({ module_name: "@minecraft/server", version: p.scriptApi });
    if (ctx.script.uiImports.size) bpDeps.push({ module_name: "@minecraft/server-ui", version: uiVersionFor(p.scriptApi) });
  }
  ctx.bp("manifest.json", {
    format_version: 2,
    header: { name: `${p.name} BP`, description, uuid: p.uuids.bpHeader, version, min_engine_version: minEngine },
    modules: bpModules,
    dependencies: bpDeps,
    metadata,
  });
  ctx.rp("manifest.json", {
    format_version: 2,
    header: { name: `${p.name} RP`, description, uuid: p.uuids.rpHeader, version, min_engine_version: minEngine },
    modules: [{ type: "resources", uuid: p.uuids.rpResources, version }],
    dependencies: [{ uuid: p.uuids.bpHeader, version }],
    metadata,
  });
}


export function generateAddon(project: Project, packIconPng?: Uint8Array): GenerateResult {
  const ctx = new GenContext(project);
  ctx.warnings.push(...validateProject(project));
  checkReferences(ctx);

  const commands: CommandElement[] = [];
  for (const el of project.elements) {
    switch (el.kind) {
      case "block": genBlock(ctx, el); break;
      case "plant": genPlant(ctx, el); break;
      case "item": genItem(ctx, el); break;
      case "tool": genTool(ctx, el); break;
      case "armor": genArmor(ctx, el); break;
      case "food": genFood(ctx, el); break;
      case "entity": genEntity(ctx, el); break;
      case "recipe": genRecipe(ctx, el); break;
      case "loot": genLoot(ctx, el); break;
      case "ore": genOre(ctx, el); break;
      case "structure": genStructure(ctx, el); break;
      case "biome": genBiome(ctx, el); break;
      case "particle": genParticle(ctx, el); break;
      case "disc": genDisc(ctx, el); break;
      case "enchantment": break; // all enchantments share one script section, made below
      case "effect": break; // same for custom effects
      case "hud": break; // all HUDs share one UI file and script section
      case "achievement": break; // all achievements share one script section
      case "keybind": break; // same for key bindings
      case "function": genFunction(ctx, el); break;
      case "sound": genSound(ctx, el); break;
      case "projectile": genProjectile(ctx, el); break;
      case "crop": genCrop(ctx, el); break;
      case "procedure": genProcedure(ctx, el); break;
      case "command": commands.push(el); break;
      case "form": genForm(ctx, el); break;
    }
  }
  if (commands.length && compareVersion(project.scriptApi, "2.1.0") < 0) {
    ctx.warn(undefined, "Custom commands need Script API 2.1.0 or newer (Minecraft 1.21.100+). Change it in Project settings.", "error");
  }
  genCommands(ctx, commands);
  genBlockScripts(ctx);
  genEnchantments(ctx);
  genCustomEffects(ctx);
  genAchievements(ctx);
  genKeyBinds(ctx);
  genGameRuleCommand(ctx);
  genHuds(ctx);
  genCreativeGroups(ctx);

  // Features in use that need a newer game or Script API than the project targets.
  for (const r of ctx.requires) {
    if (r.engine && compareVersion(project.minEngine, r.engine) < 0) {
      ctx.warnings.push({ elementId: r.elementId, level: "error", message: `${r.reason} need Minecraft ${r.engine} or newer, but the project targets ${project.minEngine.join(".")}. Change the Script API in Settings (or use the “Update project” button on its page).` });
    } else if (r.api && compareVersion(project.scriptApi, r.api) < 0) {
      ctx.warnings.push({ elementId: r.elementId, level: "error", message: `${r.reason} need Script API ${r.api} or newer (project uses ${project.scriptApi}). Change it in Settings.` });
    }
  }

  genScreens(ctx);
  genChestLids(ctx);
  if (ctx.uiDefs.length) ctx.rp("ui/_ui_defs.json", { ui_defs: ctx.uiDefs });

  const script = buildScript(ctx);
  if (script) ctx.bp("scripts/main.js", script);
  manifests(ctx, !!script);

  // Shared resource files
  const packName = project.name;
  if (Object.keys(ctx.terrain).length) {
    ctx.rp("textures/terrain_texture.json", { resource_pack_name: packName, texture_name: "atlas.terrain", padding: 8, num_mip_levels: 4, texture_data: ctx.terrain });
  }
  if (Object.keys(ctx.itemAtlas).length) {
    ctx.rp("textures/item_texture.json", { resource_pack_name: packName, texture_name: "atlas.items", texture_data: ctx.itemAtlas });
  }
  if (Object.keys(ctx.blockSounds).length) ctx.rp("blocks.json", { format_version: [1, 1, 0], ...ctx.blockSounds });
  if (Object.keys(ctx.soundDefs).length) ctx.rp("sounds/sound_definitions.json", { format_version: "1.14.0", sound_definitions: ctx.soundDefs });
  if (Object.keys(ctx.entitySounds).length) ctx.rp("sounds.json", { entity_sounds: { entities: ctx.entitySounds } });
  if (ctx.tickFunctions.length) ctx.bp("functions/tick.json", { values: ctx.tickFunctions });
  if (project.elements.some((e) => e.kind === "block" && e.drops === "nothing")) ctx.bp("loot_tables/empty.json", { pools: [] });

  const lang = [`## ${project.name}`, `pack.name=${project.name}`, `pack.description=${project.description}`, ...ctx.lang].join("\n") + "\n";
  const bpLang = `pack.name=${project.name} BP\npack.description=${project.description}\n`;
  const langs = ["en_US", ...(project.languages ?? []).filter((l) => l !== "en_US")];
  for (const side of ["BP", "RP"] as const) {
    ctx.files.set(`${side}/texts/en_US.lang`, side === "RP" ? lang : bpLang);
    ctx.files.set(`${side}/texts/languages.json`, JSON.stringify(langs));
    // Other languages: the same keys, translated where a translation exists, English otherwise.
    for (const code of langs.slice(1)) ctx.files.set(`${side}/texts/${code}.lang`, translateLang(side === "RP" ? lang : bpLang, project.translations?.[code] ?? {}));
  }

  const icon = packIconPng ?? (project.packIcon ? iconFromTexture(project, project.packIcon) : undefined);
  if (icon) {
    ctx.files.set("BP/pack_icon.png", icon);
    ctx.files.set("RP/pack_icon.png", icon);
  }

  return { files: ctx.files, warnings: ctx.warnings, usesScripts: !!script };
}

function iconFromTexture(project: Project, id: string) {
  const t = project.textures.find((x) => x.id === id);
  return t ? dataUrlToBytes(t.dataUrl) : undefined;
}
