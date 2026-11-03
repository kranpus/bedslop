import type { Project } from "./types";
import { slugify, uid } from "./registry";

export const DEFAULT_MIN_ENGINE: [number, number, number] = [1, 21, 100];
export const DEFAULT_SCRIPT_API = "2.1.0";

/** Script API versions with the oldest game version that supports them. */
export const SCRIPT_API_VERSIONS: { api: string; game: string; engine: [number, number, number] }[] = [
  { api: "2.0.0", game: "1.21.90", engine: [1, 21, 90] },
  { api: "2.1.0", game: "1.21.100", engine: [1, 21, 100] },
  { api: "2.2.0", game: "1.21.110", engine: [1, 21, 110] },
  { api: "2.3.0", game: "1.21.120", engine: [1, 21, 120] },
  { api: "2.4.0", game: "1.21.130", engine: [1, 21, 130] },
  { api: "2.5.0", game: "1.26.0", engine: [1, 26, 0] },
  { api: "2.6.0", game: "1.26.10", engine: [1, 26, 10] },
  { api: "2.7.0", game: "1.26.20", engine: [1, 26, 20] },
  { api: "2.8.0", game: "1.26.30", engine: [1, 26, 30] },
  { api: "2.9.0", game: "1.26.40", engine: [1, 26, 40] },
  { api: "2.10.0", game: "1.26.50", engine: [1, 26, 50] },
  { api: "2.11.0", game: "1.26.60", engine: [1, 26, 60] },
];

export function createProject(name: string, author = ""): Project {
  const now = Date.now();
  return {
    id: uid(),
    schema: 1,
    name,
    namespace: slugify(name).replace(/^_+/, "").slice(0, 24) || "myaddon",
    description: "",
    author,
    version: [1, 0, 0],
    minEngine: [...DEFAULT_MIN_ENGINE],
    scriptApi: DEFAULT_SCRIPT_API,
    uuids: { bpHeader: uid(), bpData: uid(), bpScript: uid(), rpHeader: uid(), rpResources: uid() },
    packIcon: "",
    elements: [],
    textures: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Brings older saved projects up to the current shape. */
export function migrateProject(raw: unknown): Project {
  const p = raw as Project;
  if (!p || typeof p !== "object" || !Array.isArray(p.elements)) throw new Error("This file is not a Bedrock Creator project.");
  return { ...createProject(p.name || "Imported"), ...p, schema: 1, textures: p.textures ?? [] };
}
