import type { ModElement, Project, TextureAsset } from "../model/types";

export type FileContent = string | Uint8Array;
export type FileMap = Map<string, FileContent>;

export const FORMATS = {
  block: "1.21.40",
  item: "1.21.40",
  entity: "1.21.0",
  clientEntity: "1.10.0",
  attachable: "1.10.0",
  recipe: "1.20.10",
  feature: "1.13.0",
  spawnRules: "1.8.0",
  geometry: "1.12.0",
  animation: "1.8.0",
  sounds: "1.14.0",
};

export interface Warning {
  elementId?: string;
  /** "info" is a note about something the exporter handled for you. */
  level: "error" | "warning" | "info";
  message: string;
}

export interface ScriptParts {
  imports: Set<string>;
  sections: string[];
  /** Ids of tools mapped to [durability cost when mining, cost when hitting]. */
  tools: Record<string, [number, number]>;
  foods: Record<string, [string, number, number, number][]>;
}

export class GenContext {
  readonly ns: string;
  readonly files: FileMap = new Map();
  readonly warnings: Warning[] = [];
  readonly lang: string[] = [];
  readonly terrain: Record<string, { textures: string }> = {};
  readonly itemAtlas: Record<string, { textures: string }> = {};
  readonly blockSounds: Record<string, { sound: string }> = {};
  readonly soundDefs: Record<string, unknown> = {};
  readonly tickFunctions: string[] = [];
  readonly script: ScriptParts = { imports: new Set(["world", "system"]), sections: [], tools: {}, foods: {} };
  private writtenTextures = new Map<string, string>();

  constructor(readonly project: Project) {
    this.ns = project.namespace;
  }

  bp(path: string, content: FileContent | object) {
    this.files.set(`BP/${path}`, toContent(content));
  }
  rp(path: string, content: FileContent | object) {
    this.files.set(`RP/${path}`, toContent(content));
  }

  id(name: string) {
    return `${this.ns}:${name}`;
  }

  warn(el: ModElement | undefined, message: string, level: Warning["level"] = "warning") {
    this.warnings.push({ elementId: el?.id, level, message: el ? `${el.displayName}: ${message}` : message });
  }

  texture(id: string | undefined): TextureAsset | undefined {
    return id ? this.project.textures.find((t) => t.id === id) : undefined;
  }

  /**
   * Writes a texture PNG into the resource pack (once) and returns its path without extension,
   * e.g. "textures/blocks/myaddon_ruby_ore". Returns "" when the texture is missing.
   */
  writeTexture(id: string | undefined, folder: "blocks" | "items" | "entity" | "models/armor"): string {
    const tex = this.texture(id);
    if (!tex) return "";
    const key = `${folder}|${tex.id}`;
    const existing = this.writtenTextures.get(key);
    if (existing) return existing;
    const path = `textures/${folder}/${this.ns}_${tex.name}`;
    this.rp(`${path}.png`, dataUrlToBytes(tex.dataUrl));
    this.writtenTextures.set(key, path);
    return path;
  }

  /** Registers a block texture in terrain_texture.json and returns its atlas key. */
  terrainKey(id: string | undefined): string {
    const path = this.writeTexture(id, "blocks");
    if (!path) return "";
    const key = path.split("/").pop()!;
    this.terrain[key] = { textures: path };
    return key;
  }

  /** Registers an item texture in item_texture.json and returns its atlas key. */
  itemKey(id: string | undefined): string {
    const path = this.writeTexture(id, "items");
    if (!path) return "";
    const key = path.split("/").pop()!;
    this.itemAtlas[key] = { textures: path };
    return key;
  }

  /** Every identifier the project defines, for reference checks. */
  knownIds(): Set<string> {
    const ids = new Set<string>();
    for (const el of this.project.elements) {
      if (el.kind === "armor") {
        for (const [slot, piece] of Object.entries(el.pieces)) if (piece.enabled) ids.add(this.id(`${el.name}_${slot}`));
      } else if (["block", "plant", "item", "tool", "food", "entity"].includes(el.kind)) {
        ids.add(this.id(el.name));
      }
    }
    return ids;
  }
}

function toContent(c: FileContent | object): FileContent {
  if (typeof c === "string" || c instanceof Uint8Array) return c;
  return JSON.stringify(c, null, 2);
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = dataUrl.slice(comma + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Reads the first geometry identifier from a Blockbench .geo.json file. */
export function geometryIdentifier(json: string): string | null {
  try {
    const data = JSON.parse(json);
    const list = data["minecraft:geometry"];
    if (Array.isArray(list) && list[0]?.description?.identifier) return list[0].description.identifier;
    // Legacy 1.8 format: { "geometry.name": {...} }
    const legacy = Object.keys(data).find((k) => k.startsWith("geometry."));
    return legacy ? legacy.split(":")[0] : null;
  } catch {
    return null;
  }
}

export const vec = (v: [number, number, number]) => v.map((n) => Math.max(0, Math.floor(Number(n) || 0))) as [number, number, number];
