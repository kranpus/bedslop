import { useState } from "react";
import { applyTemplate, ELEMENT_TEMPLATES, STARTER_TEMPLATES, type ElementTemplate } from "../model/templates";
import { useStore } from "../store/store";
import { Modal } from "./Modal";

/** Starter add-ons on the home screen. */
export function StarterGallery({ name, author }: { name: string; author: string }) {
  const newProject = useStore((s) => s.newProject);
  return (
    <div className="template-grid starters">
      {STARTER_TEMPLATES.map((t) => (
        <button key={t.id} className="template-card" onClick={() => newProject(t.id === "blank" ? name.trim() || "My Add-on" : t.title, author.trim(), t.build)}>
          <span className="glyph" style={{ background: t.color }} aria-hidden>{t.glyph}</span>
          <span className="template-text">
            <strong>{t.title}</strong>
            <span>{t.blurb}</span>
            <span className="template-inside">{t.inside.join(" · ")}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Element templates: add ready-made combos to the open project. */
export function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  const [query, setQuery] = useState("");
  const [done, setDone] = useState<{ title: string; notes: string[] } | null>(null);
  const q = query.trim().toLowerCase();
  const list = ELEMENT_TEMPLATES.filter((t) => !q || `${t.title} ${t.blurb} ${t.tags.join(" ")}`.toLowerCase().includes(q));

  const add = (t: ElementTemplate) => {
    const before = project;
    const { project: next, renamed } = applyTemplate(before, t.build(before.namespace));
    update(() => next);
    const first = next.elements[before.elements.length];
    if (first) select(first.id);
    const notes = Object.entries(renamed).map(([a, b]) => `“${a}” was already used, so it's called “${b}”.`);
    if (next.minEngine.join(".") !== before.minEngine.join(".")) notes.push(`The project now targets Minecraft ${next.minEngine.join(".")} (Script API ${next.scriptApi}), which this template needs.`);
    setDone({ title: t.title, notes });
  };

  return (
    <Modal title="Templates" onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Done</button>}>
      <p className="muted">Ready-made combos of elements. Adding one puts editable copies in your project: change anything you like afterwards.</p>
      <input className="search" type="search" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search templates" />
      {done && (
        <div className="template-done" role="status">
          <strong>Added “{done.title}”.</strong>
          {done.notes.map((n, i) => <span key={i}>{n}</span>)}
        </div>
      )}
      <div className="template-grid">
        {list.map((t) => (
          <div key={t.id} className="template-card static">
            <span className="glyph" style={{ background: t.color }} aria-hidden>{t.glyph}</span>
            <span className="template-text">
              <strong>{t.title}</strong>
              <span>{t.blurb}</span>
              <ul className="template-list">{t.inside.map((x) => <li key={x}>{x}</li>)}</ul>
              <span className="template-tags">{t.tags.map((x) => <span key={x} className="chip">{x}</span>)}</span>
            </span>
            <button className="btn small primary" onClick={() => add(t)} aria-label={`Add ${t.title}`}>Add</button>
          </div>
        ))}
        {!list.length && <p className="muted">No templates match.</p>}
      </div>
    </Modal>
  );
}
