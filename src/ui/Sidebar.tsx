import { useEffect, useState } from "react";
import { KINDS, kindInfo, slugify } from "../model/registry";
import type { ElementKind } from "../model/types";
import { materialPack, type MaterialPackOptions } from "../model/packs";
import { generateTexture, hashSeed } from "../textures/procedural";
import { useStore } from "../store/store";
import { Modal } from "./Modal";
import { Thumb } from "./Thumb";
import { useWarnings } from "./ElementEditor";

export function Sidebar() {
  const project = useStore((s) => s.project!);
  const selectedId = useStore((s) => s.selectedId);
  const view = useStore((s) => s.view);
  const select = useStore((s) => s.select);
  const warnings = useWarnings();
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<null | "new" | "pack">(null);

  useEffect(() => {
    const n = () => setDialog("new");
    const p = () => setDialog("pack");
    document.addEventListener("bc:new-element", n);
    document.addEventListener("bc:material-pack", p);
    return () => { document.removeEventListener("bc:new-element", n); document.removeEventListener("bc:material-pack", p); };
  }, []);

  const q = query.trim().toLowerCase();
  const visible = project.elements.filter((e) => !q || e.displayName.toLowerCase().includes(q) || e.name.includes(q) || e.kind.includes(q));
  const groups = KINDS.map((k) => ({ info: k, items: visible.filter((e) => e.kind === k.kind) })).filter((g) => g.items.length);
  const problemIds = new Set(warnings.filter((w) => w.level === "error").map((w) => w.elementId));
  const warnIds = new Set(warnings.filter((w) => w.level === "warning").map((w) => w.elementId));

  return (
    <aside className="sidebar">
      <div className="sidebar-actions">
        <button className="btn primary grow" onClick={() => setDialog("new")}>New element</button>
        <button className="btn" onClick={() => setDialog("pack")} title="Create a full material set">Material pack</button>
      </div>
      <input className="search" type="search" placeholder={`Search ${project.elements.length} elements`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search elements" />
      <nav className="element-list" aria-label="Elements">
        {groups.map(({ info, items }) => (
          <div key={info.kind} className="element-group">
            <h4><span>{info.label}</span><span className="count">{items.length}</span></h4>
            {items.map((el) => (
              <button key={el.id} className={`element-row${view === "element" && el.id === selectedId ? " on" : ""}`} onClick={() => select(el.id)}>
                <Thumb el={el} project={project} size={24} />
                <span className="element-name">{el.displayName || el.name}</span>
                {problemIds.has(el.id) ? <span className="dot error" title="Has errors" /> : warnIds.has(el.id) ? <span className="dot warning" title="Has warnings" /> : null}
              </button>
            ))}
          </div>
        ))}
        {!groups.length && <p className="muted pad">{q ? "Nothing matches." : "No elements yet."}</p>}
      </nav>
      {dialog === "new" && <NewElementDialog onClose={() => setDialog(null)} />}
      {dialog === "pack" && <MaterialPackDialog onClose={() => setDialog(null)} />}
    </aside>
  );
}

function NewElementDialog({ onClose }: { onClose: () => void }) {
  const addElement = useStore((s) => s.addElement);
  const ns = useStore((s) => s.project!.namespace);
  const [kind, setKind] = useState<ElementKind>("block");
  const [name, setName] = useState("");
  const info = kindInfo(kind);
  const create = () => {
    addElement(kind, name.trim() || `New ${info.label}`);
    onClose();
  };
  const groups = ["Content", "World", "Logic", "Assets"] as const;
  return (
    <Modal title="New element" onClose={onClose} wide footer={
      <>
        <span className="muted mono grow">{kind === "command" ? "/" : ""}{ns}:{slugify(name || `new_${info.label}`)}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={create}>Create {info.label.toLowerCase()}</button>
      </>
    }>
      {groups.map((g) => (
        <div key={g} className="kind-group">
          <h4>{g}</h4>
          <div className="kind-grid">
            {KINDS.filter((k) => k.group === g).map((k) => (
              <button key={k.kind} className={`kind-card${kind === k.kind ? " on" : ""}`} onClick={() => setKind(k.kind)} onDoubleClick={() => { setKind(k.kind); addElement(k.kind, name.trim() || `New ${k.label}`); onClose(); }}>
                <span className="glyph" style={{ background: k.color }} aria-hidden>{k.glyph}</span>
                <span className="kind-text"><strong>{k.label}</strong><span>{k.blurb}</span></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <label className="field">
        <span className="field-label">Name</span>
        <input autoFocus value={name} placeholder={`e.g. ${({ block: "Marble", plant: "Blue Rose", item: "Ruby", tool: "Ruby Pickaxe", armor: "Ruby", food: "Cheese", entity: "Frost Wolf", recipe: "Ruby Pickaxe recipe", loot: "Treasure chest", ore: "Ruby ore generation", procedure: "Lightning wand", command: "Heal", function: "Reset arena", sound: "Wand zap" } as Record<ElementKind, string>)[kind]}`}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
      </label>
    </Modal>
  );
}

export function MaterialPackDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project!);
  const addElements = useStore((s) => s.addElements);
  const [o, setO] = useState<MaterialPackOptions>({ name: "Ruby", color: "#c4283c", form: "gem", strength: "iron", ore: true, storageBlock: true, tools: true, armor: true });
  const set = (p: Partial<MaterialPackOptions>) => setO({ ...o, ...p });
  const previews = ["ore", o.form, "storage", "pickaxe", "sword", "chestplate"].map((t) => generateTexture(t, o.color, hashSeed(t + o.color)).dataUrl);
  const taken = new Set(project.elements.map((e) => e.name));
  const clash = taken.has(slugify(o.name)) || taken.has(`${slugify(o.name)}_ingot`);
  const count = 1 + (o.ore ? (o.form === "ingot" ? 5 : 4) : 0) + (o.storageBlock ? 3 : 0) + (o.tools ? 10 : 0) + (o.armor ? 5 : 0);
  const create = () => {
    const pack = materialPack(project, o);
    addElements(pack.elements, pack.textures);
    onClose();
  };
  return (
    <Modal title="Material Pack wizard" onClose={onClose} footer={
      <>
        <span className="muted grow">{count} elements with textures and recipes</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={create} disabled={!o.name.trim() || clash}>Create pack</button>
      </>
    }>
      <p className="muted">Type a material and pick a colour. You get everything a vanilla material has, and can edit each piece afterwards.</p>
      <div className="pack-preview" aria-hidden>
        {previews.map((src, i) => <span key={i} className="checker"><img className="pixel" src={src} alt="" /></span>)}
      </div>
      <div className="grid">
        <label className="field"><span className="field-label">Material name</span><input value={o.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span className="field-label">Colour</span>
          <span className="color"><input type="color" value={o.color} onChange={(e) => set({ color: e.target.value })} /><input className="mono" value={o.color} onChange={(e) => set({ color: e.target.value })} /></span>
        </label>
        <label className="field"><span className="field-label">Form</span>
          <select value={o.form} onChange={(e) => set({ form: e.target.value as MaterialPackOptions["form"] })}><option value="gem">Gem (like diamond)</option><option value="ingot">Ingot (like iron, smelted from raw ore)</option></select>
        </label>
        <label className="field"><span className="field-label">Strength</span>
          <select value={o.strength} onChange={(e) => set({ strength: e.target.value as MaterialPackOptions["strength"] })}>
            <option value="stone">Like stone</option><option value="iron">Like iron</option><option value="diamond">Like diamond</option><option value="netherite">Like netherite</option>
          </select>
        </label>
      </div>
      <div className="toggles">
        {([["ore", "Ore + world generation + smelting"], ["storageBlock", "Storage block (9 → 1)"], ["tools", "5 tools with recipes"], ["armor", "Armor set with recipes"]] as const).map(([k, label]) => (
          <label key={k} className="toggle"><input type="checkbox" checked={o[k]} onChange={(e) => set({ [k]: e.target.checked })} /><span className="toggle-track" aria-hidden /><span className="toggle-text"><span>{label}</span></span></label>
        ))}
      </div>
      {clash && <p className="warn-text">This project already has a “{o.name}” material. Pick a different name.</p>}
    </Modal>
  );
}
