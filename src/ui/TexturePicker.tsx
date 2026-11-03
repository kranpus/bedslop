import { useRef, useState } from "react";
import type { TextureAsset } from "../model/types";
import { useStore } from "../store/store";
import { loadImage } from "../textures/procedural";
import { TextureEditor, type TextureDraft } from "./TextureEditor";

export async function readImageFile(f: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(f);
  });
  const img = await loadImage(dataUrl);
  return { dataUrl, width: img.width, height: img.height };
}

/** Pick, upload, draw or generate a texture for an element slot. */
export function TexturePicker({ label, value, onChange, kind, suggestedName, help, template }: {
  template?: string;
  label: string; value: string | undefined; onChange: (id: string) => void; kind: TextureAsset["kind"]; suggestedName: string; help?: string;
}) {
  const textures = useStore((s) => s.project!.textures);
  const addTexture = useStore((s) => s.addTexture);
  const patchTexture = useStore((s) => s.patchTexture);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | "new" | TextureAsset>(null);
  const [showAll, setShowAll] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const current = textures.find((t) => t.id === value);
  const list = textures.filter((t) => showAll || t.kind === kind);

  const upload = async (f: File) => {
    const img = await readImageFile(f);
    const t = addTexture({ name: f.name.replace(/\.png$/i, ""), kind, ...img });
    onChange(t.id);
    setOpen(false);
  };

  const save = (d: TextureDraft) => {
    if (editing && editing !== "new") {
      patchTexture(editing.id, { dataUrl: d.dataUrl, width: d.width, height: d.height });
    } else {
      const t = addTexture(d);
      onChange(t.id);
    }
    setEditing(null);
    setOpen(false);
  };

  return (
    <div className="field tex-picker">
      <span className="field-label">{label}</span>
      <div className="tex-slot">
        <button type="button" className={`tex-swatch checker${current ? "" : " empty"}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Choose ${label}`}>
          {current ? <img className="pixel" src={current.dataUrl} alt="" /> : <span>+</span>}
        </button>
        <div className="tex-slot-info">
          <span className="mono">{current ? current.name : "No texture"}</span>
          <span className="row">
            <button type="button" className="btn small" onClick={() => setEditing(current ?? "new")}>{current ? "Edit" : "Draw / generate"}</button>
            <button type="button" className="btn small" onClick={() => file.current?.click()}>Upload</button>
            {current && <button type="button" className="btn small ghost" onClick={() => onChange("")}>Clear</button>}
          </span>
        </div>
      </div>
      {help && <span className="field-help">{help}</span>}
      <input ref={file} type="file" accept="image/png" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {open && (
        <div className="tex-popover">
          <div className="row between">
            <strong>Choose a texture</strong>
            <label className="inline-check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all kinds</label>
          </div>
          {list.length ? (
            <div className="tex-list">
              {list.map((t) => (
                <button type="button" key={t.id} className={`tex-option${t.id === value ? " on" : ""}`} onClick={() => { onChange(t.id); setOpen(false); }} title={t.name}>
                  <span className="checker"><img className="pixel" src={t.dataUrl} alt="" /></span>
                  <span className="mono">{t.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No {kind} textures yet. Draw one or upload a PNG.</p>
          )}
          <div className="row">
            <button type="button" className="btn primary small" onClick={() => setEditing("new")}>New texture…</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {editing && (
        <TextureEditor
          kind={kind}
          template={template}
          suggestedName={suggestedName}
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
