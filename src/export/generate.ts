import type { CommandElement, ModElement, Project } from "../model/types";
import { genArmor, genBlock, genFood, genItem, genPlant, genTool } from "./content";
import { GenContext, type FileMap, type Warning, dataUrlToBytes, vec } from "./context";
import { genFunction, genLoot, genOre, genRecipe, genSound } from "./data";
import { genEntity } from "./entity";
import { buildScript, genCommands, genProcedure } from "./scripts";

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

/** Elements that share the same identifier space. */
function groupOf(el: ModElement) {
  if (["block", "plant", "item", "tool", "armor", "food", "entity"].includes(el.kind)) return "content";
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

function compareVersion(a: string, b: string) {
  const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
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
      case "function": genFunction(ctx, el); break;
      case "sound": genSound(ctx, el); break;
      case "procedure": genProcedure(ctx, el); break;
      case "command": commands.push(el); break;
    }
  }
  if (commands.length && compareVersion(project.scriptApi, "2.1.0") < 0) {
    ctx.warn(undefined, "Custom commands need Script API 2.1.0 or newer (Minecraft 1.21.100+). Change it in Project settings.", "error");
  }
  genCommands(ctx, commands);

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
  if (ctx.tickFunctions.length) ctx.bp("functions/tick.json", { values: ctx.tickFunctions });
  if (project.elements.some((e) => e.kind === "block" && e.drops === "nothing")) ctx.bp("loot_tables/empty.json", { pools: [] });

  const lang = [`## ${project.name}`, `pack.name=${project.name}`, `pack.description=${project.description}`, ...ctx.lang].join("\n") + "\n";
  for (const side of ["BP", "RP"] as const) {
    ctx.files.set(`${side}/texts/en_US.lang`, side === "RP" ? lang : `pack.name=${project.name} BP\npack.description=${project.description}\n`);
    ctx.files.set(`${side}/texts/languages.json`, JSON.stringify(["en_US"]));
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
