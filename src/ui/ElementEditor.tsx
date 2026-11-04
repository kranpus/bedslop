import { useDeferredValue, useMemo, useState } from "react";
import type { ModElement } from "../model/types";
import { identifiersOf, kindInfo, slugify } from "../model/registry";
import { generateAddon } from "../export/generate";
import { useStore } from "../store/store";
import { Thumb } from "./Thumb";
import { ArmorEditor, BlockEditor, FoodEditor, ItemEditor, PlantEditor, ToolEditor } from "./editors/ContentEditors";
import { EntityEditor } from "./editors/EntityEditor";
import { FunctionEditor, LootEditor, OreEditor, RecipeEditor, SoundEditor } from "./editors/DataEditors";
import { CommandEditor, ProcedureEditor } from "./editors/LogicEditor";
import { FormEditor } from "./editors/FormEditor";
import { CropEditor, ProjectileEditor } from "./editors/RangedEditors";
import { StructureEditor } from "./editors/StructureEditor";
import { ParticleEditor } from "./editors/ParticleEditor";
import { DiscEditor } from "./editors/DiscEditor";
import { EnchantmentEditor } from "./editors/EnchantmentEditor";
import { EffectEditor } from "./editors/EffectEditor";

/** Warnings for the whole project, computed lazily so typing stays smooth. */
export function useWarnings() {
  const project = useStore((s) => s.project);
  const deferred = useDeferredValue(project);
  return useMemo(() => (deferred ? generateAddon(deferred).warnings : []), [deferred]);
}

function Body({ el }: { el: ModElement }) {
  const patchElement = useStore((s) => s.patchElement);
  const patch = (p: Partial<ModElement>, key?: string) => patchElement(el.id, p, key);
  switch (el.kind) {
    case "block": return <BlockEditor el={el} patch={patch} />;
    case "plant": return <PlantEditor el={el} patch={patch} />;
    case "item": return <ItemEditor el={el} patch={patch} />;
    case "tool": return <ToolEditor el={el} patch={patch} />;
    case "armor": return <ArmorEditor el={el} patch={patch} />;
    case "food": return <FoodEditor el={el} patch={patch} />;
    case "entity": return <EntityEditor el={el} patch={patch} />;
    case "recipe": return <RecipeEditor el={el} patch={patch} />;
    case "loot": return <LootEditor el={el} patch={patch} />;
    case "ore": return <OreEditor el={el} patch={patch} />;
    case "procedure": return <ProcedureEditor el={el} patch={patch} />;
    case "command": return <CommandEditor el={el} patch={patch} />;
    case "function": return <FunctionEditor el={el} patch={patch} />;
    case "sound": return <SoundEditor el={el} patch={patch} />;
    case "form": return <FormEditor el={el} patch={patch} />;
    case "projectile": return <ProjectileEditor el={el} patch={patch} />;
    case "crop": return <CropEditor el={el} patch={patch} />;
    case "structure": return <StructureEditor el={el} patch={patch} />;
    case "particle": return <ParticleEditor el={el} patch={patch} />;
    case "disc": return <DiscEditor el={el} patch={patch} />;
    case "enchantment": return <EnchantmentEditor el={el} patch={patch} />;
    case "effect": return <EffectEditor el={el} patch={patch} />;
  }
}

export function ElementEditor() {
  const project = useStore((s) => s.project!);
  const selectedId = useStore((s) => s.selectedId);
  const { patchElement, removeElement, duplicateElement } = useStore.getState();
  const warnings = useWarnings();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const el = project.elements.find((e) => e.id === selectedId);

  if (!el) return <EmptyWorkspace />;
  const info = kindInfo(el.kind);
  const ids = identifiersOf(el, project.namespace);
  const mine = warnings.filter((w) => w.elementId === el.id);
  const fullId = el.kind === "command" ? `/${project.namespace}:${el.name}` : el.kind === "function" ? `${project.namespace}/${el.name}` : `${project.namespace}:${el.name}`;

  return (
    <div className="editor" key={el.id}>
      <header className="editor-head">
        <Thumb el={el} project={project} size={48} />
        <div className="editor-title">
          <span className="eyebrow" style={{ color: info.color }}>{info.label}</span>
          <input className="title-input" value={el.displayName} aria-label="Display name"
            onChange={(e) => patchElement(el.id, { displayName: e.target.value }, "displayName")} />
          <label className="id-line">
            <span className="mono muted">{fullId.replace(el.name, "")}</span>
            <input className="mono id-input" value={el.name} aria-label="Identifier"
              onChange={(e) => patchElement(el.id, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }, "name")}
              onBlur={(e) => patchElement(el.id, { name: slugify(e.target.value) })} />
          </label>
          {ids.length > 1 && <span className="muted small">Registers {ids.join(", ")}</span>}
        </div>
        <div className="editor-actions">
          <button className="btn small" onClick={() => duplicateElement(el.id)}>Duplicate</button>
          {confirmDelete ? (
            <span className="confirm">
              <span>Delete?</span>
              <button className="btn small danger" onClick={() => { removeElement(el.id); setConfirmDelete(false); }}>Delete</button>
              <button className="btn small ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
            </span>
          ) : (
            <button className="btn small ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
          )}
        </div>
      </header>
      {mine.length > 0 && (
        <ul className="problems" aria-label="Problems with this element">
          {mine.map((w, i) => <li key={i} className={w.level}>{w.message.replace(`${el.displayName}: `, "")}</li>)}
        </ul>
      )}
      <Body el={el} />
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="empty-state">
      <h2>Your add-on is empty</h2>
      <p>Start with a single element, or let the Material Pack wizard build an ore, tools, armor and recipes in one go.</p>
      <div className="row">
        <button className="btn primary" onClick={() => document.dispatchEvent(new CustomEvent("bc:new-element"))}>New element</button>
        <button className="btn" onClick={() => document.dispatchEvent(new CustomEvent("bc:material-pack"))}>Material Pack wizard</button>
      </div>
    </div>
  );
}
