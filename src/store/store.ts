import { create } from "zustand";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { ElementKind, ModElement, Project, TextureAsset } from "../model/types";
import { createElement, slugify, uid } from "../model/registry";
import { createProject, migrateProject } from "../model/project";

export type View = "home" | "element" | "textures" | "settings" | "export" | "roadmap";

export interface ProjectMeta {
  id: string;
  name: string;
  namespace: string;
  elementCount: number;
  updatedAt: number;
}

interface State {
  index: ProjectMeta[];
  project: Project | null;
  view: View;
  selectedId: string | null;
  past: Project[];
  future: Project[];
  saveState: "saved" | "saving" | "error";
  loaded: boolean;

  init(): Promise<void>;
  newProject(name: string, author?: string, seed?: (p: Project) => Project): Promise<void>;
  openProject(id: string): Promise<void>;
  importProject(raw: unknown): Promise<void>;
  deleteProject(id: string): Promise<void>;
  closeProject(): void;

  setView(v: View): void;
  select(id: string | null): void;
  /** Applies a change to the project. `coalesceKey` merges rapid edits (typing) into one undo step. */
  update(fn: (p: Project) => Project, coalesceKey?: string): void;
  undo(): void;
  redo(): void;

  addElement(kind: ElementKind, displayName: string): ModElement;
  addElements(els: ModElement[], textures?: TextureAsset[]): void;
  patchElement(id: string, patch: Partial<ModElement>, coalesceKey?: string): void;
  removeElement(id: string): void;
  duplicateElement(id: string): void;
  addTexture(t: Omit<TextureAsset, "id">): TextureAsset;
  patchTexture(id: string, patch: Partial<TextureAsset>): void;
  removeTexture(id: string): void;
}

const INDEX_KEY = "bc:index";
const LAST_KEY = "bc:last";
const projectKey = (id: string) => `bc:project:${id}`;

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastCoalesce = { key: "", at: 0 };

const meta = (p: Project): ProjectMeta => ({ id: p.id, name: p.name, namespace: p.namespace, elementCount: p.elements.length, updatedAt: p.updatedAt });

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const useStore = create<State>((set, get) => {
  const persist = (p: Project) => {
    set({ saveState: "saving" });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await idbSet(projectKey(p.id), p);
        const index = [meta(p), ...get().index.filter((m) => m.id !== p.id)];
        set({ index, saveState: "saved" });
        await idbSet(INDEX_KEY, index);
      } catch {
        set({ saveState: "error" });
      }
    }, 350);
  };

  const uniqueName = (p: Project, base: string) => {
    const used = new Set(p.elements.map((e) => e.name));
    let name = base, i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    return name;
  };

  return {
    index: [],
    project: null,
    view: "home",
    selectedId: null,
    past: [],
    future: [],
    saveState: "saved",
    loaded: false,

    async init() {
      const index = await safe(async () => ((await idbGet(INDEX_KEY)) as ProjectMeta[]) ?? [], []);
      set({ index: index.sort((a, b) => b.updatedAt - a.updatedAt), loaded: true });
      const last = await safe(async () => (await idbGet(LAST_KEY)) as string | undefined, undefined);
      if (last && index.some((m) => m.id === last)) await get().openProject(last);
    },

    async newProject(name, author = "", seed) {
      let p = createProject(name, author);
      if (seed) p = seed(p);
      set({ project: p, view: "element", selectedId: p.elements[0]?.id ?? null, past: [], future: [] });
      persist(p);
      await safe(() => idbSet(LAST_KEY, p.id), undefined);
    },

    async openProject(id) {
      const raw = await safe(() => idbGet(projectKey(id)), undefined);
      if (!raw) return;
      const p = migrateProject(raw);
      set({ project: p, view: "element", selectedId: p.elements[0]?.id ?? null, past: [], future: [] });
      await safe(() => idbSet(LAST_KEY, id), undefined);
    },

    async importProject(raw) {
      const p = migrateProject(raw);
      // Imported copies get a fresh id so they never overwrite an existing workspace.
      const copy = { ...p, id: uid(), updatedAt: Date.now() };
      set({ project: copy, view: "element", selectedId: copy.elements[0]?.id ?? null, past: [], future: [] });
      persist(copy);
      await safe(() => idbSet(LAST_KEY, copy.id), undefined);
    },

    async deleteProject(id) {
      const index = get().index.filter((m) => m.id !== id);
      set({ index });
      await safe(async () => {
        await idbDel(projectKey(id));
        await idbSet(INDEX_KEY, index);
      }, undefined);
      if (get().project?.id === id) set({ project: null, view: "home" });
    },

    closeProject() {
      set({ project: null, view: "home", selectedId: null });
      safe(() => idbDel(LAST_KEY), undefined);
    },

    setView(view) {
      set({ view });
    },
    select(id) {
      set({ selectedId: id, view: "element" });
    },

    update(fn, coalesceKey) {
      const cur = get().project;
      if (!cur) return;
      const next = { ...fn(cur), updatedAt: Date.now() };
      const now = Date.now();
      const merge = !!coalesceKey && lastCoalesce.key === coalesceKey && now - lastCoalesce.at < 1200;
      lastCoalesce = { key: coalesceKey ?? "", at: now };
      set({ project: next, past: merge ? get().past : [...get().past.slice(-79), cur], future: [] });
      persist(next);
    },

    undo() {
      const { past, project, future } = get();
      if (!past.length || !project) return;
      const prev = past[past.length - 1];
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
      lastCoalesce = { key: "", at: 0 };
      persist(prev);
    },
    redo() {
      const { past, project, future } = get();
      if (!future.length || !project) return;
      const next = future[0];
      set({ project: next, past: [...past, project], future: future.slice(1) });
      lastCoalesce = { key: "", at: 0 };
      persist(next);
    },

    addElement(kind, displayName) {
      const p = get().project!;
      const el = createElement(kind, uniqueName(p, slugify(displayName)), displayName);
      get().update((p) => ({ ...p, elements: [...p.elements, el] }));
      set({ selectedId: el.id, view: "element" });
      return el;
    },

    addElements(els, textures = []) {
      get().update((p) => ({ ...p, elements: [...p.elements, ...els], textures: [...p.textures, ...textures] }));
      if (els[0]) set({ selectedId: els[0].id, view: "element" });
    },

    patchElement(id, patch, coalesceKey) {
      get().update(
        (p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as ModElement) : e)) }),
        coalesceKey ? `${id}:${coalesceKey}` : undefined,
      );
    },

    removeElement(id) {
      const p = get().project!;
      const idx = p.elements.findIndex((e) => e.id === id);
      get().update((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) }));
      const rest = get().project!.elements;
      set({ selectedId: rest[Math.max(0, idx - 1)]?.id ?? null });
    },

    duplicateElement(id) {
      const p = get().project!;
      const src = p.elements.find((e) => e.id === id);
      if (!src) return;
      const copy = structuredClone(src) as ModElement;
      copy.id = uid();
      copy.name = uniqueName(p, `${src.name}_copy`);
      copy.displayName = `${src.displayName} (copy)`;
      copy.createdAt = Date.now();
      get().update((p) => ({ ...p, elements: [...p.elements, copy] }));
      set({ selectedId: copy.id });
    },

    addTexture(t) {
      const p = get().project!;
      const used = new Set(p.textures.map((x) => x.name));
      let name = slugify(t.name), i = 2;
      while (used.has(name)) name = `${slugify(t.name)}_${i++}`;
      const tex: TextureAsset = { ...t, name, id: uid() };
      get().update((p) => ({ ...p, textures: [...p.textures, tex] }));
      return tex;
    },
    patchTexture(id, patch) {
      get().update((p) => ({ ...p, textures: p.textures.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    },
    removeTexture(id) {
      get().update((p) => ({ ...p, textures: p.textures.filter((t) => t.id !== id) }));
    },
  };
});

export const useProject = () => useStore((s) => s.project!);
