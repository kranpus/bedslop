import { useMemo, useState } from "react";
import type { ModElement } from "../model/types";
import { COMMON_BLOCK_TAGS, COMMON_ITEM_TAGS } from "../model/vanilla";
import { useStore } from "../store/store";
import { Thumb } from "./Thumb";
import { type TagKind, projectTags, tagKindOf, tagsOf } from "./TagField";

/** All item and block tags in the project: who has them, add or remove members, and which recipes use them. */
export function TagsView() {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  const [draft, setDraft] = useState<{ kind: TagKind; name: string }>({ kind: "item", name: `${project.namespace}:` });
  const [extra, setExtra] = useState<{ kind: TagKind; name: string }[]>([]);
  const tags = useMemo(() => projectTags(project), [project]);

  const setTags = (e: ModElement, next: string[]) =>
    update((p) => ({ ...p, elements: p.elements.map((x) => (x.id === e.id ? ({ ...x, tags: next } as ModElement) : x)) }));
  const addMember = (tag: string, id: string) => {
    const e = project.elements.find((x) => x.id === id);
    if (e && !tagsOf(e).includes(tag)) setTags(e, [...tagsOf(e), tag]);
  };
  const removeMember = (tag: string, e: ModElement) => setTags(e, tagsOf(e).filter((t) => t.replace(/^#/, "") !== tag));
  const recipesUsing = (tag: string) => project.elements.filter((e) => e.kind === "recipe" && e.grid.includes(`#${tag}`));

  const rows = [
    ...[...tags.entries()].map(([key, v]) => ({ kind: v.kind, name: key.split("|")[1], members: v.members })),
    ...extra.filter((x) => !tags.has(`${x.kind}|${x.name}`)).map((x) => ({ ...x, members: [] as ModElement[] })),
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  const create = () => {
    const name = draft.name.trim().replace(/^#/, "");
    if (!name || name.endsWith(":")) return;
    setExtra((x) => [...x, { kind: draft.kind, name }]);
    setDraft({ ...draft, name: `${project.namespace}:` });
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Tags</h1>
          <p className="muted">Group your items and blocks. Recipes can use <span className="mono">#tag</span> to accept any item with a tag, and procedures can check tags. Bedrock only lets you tag your own items and blocks, not Minecraft's.</p>
        </div>
      </header>

      <div className="card tag-new">
        <strong>New tag</strong>
        <div className="row wrap">
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TagKind })} aria-label="Tag for">
            <option value="item">Item tag</option>
            <option value="block">Block tag</option>
          </select>
          <input className="mono" list="tag-suggestions" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && create()} aria-label="Tag name" />
          <datalist id="tag-suggestions">{(draft.kind === "item" ? COMMON_ITEM_TAGS : COMMON_BLOCK_TAGS).map((t) => <option key={t} value={t} />)}</datalist>
          <button type="button" className="btn small primary" onClick={create}>Add</button>
        </div>
      </div>

      {!rows.length && <p className="muted">No tags yet. Add one above, or in the Tags field on any item or block.</p>}
      {rows.map((r) => {
        const candidates = project.elements.filter((e) => tagKindOf(e) === r.kind && !r.members.includes(e));
        const recipes = r.kind === "item" ? recipesUsing(r.name) : [];
        return (
          <div className="card tag-card" key={`${r.kind}|${r.name}`}>
            <div className="row between wrap">
              <div className="stack tight">
                <strong className="mono">{r.name}</strong>
                <span className="field-help">{r.kind === "item" ? "Item tag" : "Block tag"} · {r.members.length} {r.members.length === 1 ? "member" : "members"}
                  {recipes.length > 0 && <> · used by {recipes.map((x) => x.displayName).join(", ")}</>}</span>
              </div>
              {candidates.length > 0 && (
                <select value="" onChange={(e) => e.target.value && addMember(r.name, e.target.value)} aria-label={`Add to ${r.name}`}>
                  <option value="">Add {r.kind === "item" ? "an item" : "a block"}…</option>
                  {candidates.map((e) => <option key={e.id} value={e.id}>{e.displayName}</option>)}
                </select>
              )}
            </div>
            <div className="tag-members">
              {r.members.map((e) => (
                <span className="tag-member" key={e.id}>
                  <button type="button" className="linklike" onClick={() => select(e.id)}><Thumb el={e} project={project} size={20} /> {e.displayName}</button>
                  <button type="button" className="chip-x" aria-label={`Remove ${e.displayName} from ${r.name}`} onClick={() => removeMember(r.name, e)}>×</button>
                </span>
              ))}
              {!r.members.length && <span className="muted">Nothing has this tag yet.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
