import type { CreativeGroup, ModElement } from "../model/types";
import { identifiersOf, uid } from "../model/registry";
import { IdInput, Section, Select, Text, Field } from "./fields";
import { Thumb } from "./Thumb";
import { useStore } from "../store/store";

const CATEGORIES = [
  { value: "construction", label: "Construction" }, { value: "nature", label: "Nature" },
  { value: "equipment", label: "Equipment" }, { value: "items", label: "Items" },
] as const;

/** Elements that end up as items or blocks in the creative inventory. */
export const placeable = (e: ModElement, ns: string) => e.kind !== "entity" && identifiersOf(e, ns).length > 0;

/** Settings section: your own collapsible creative inventory groups. */
export function CreativeGroupsSection() {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const groups = project.creativeGroups ?? [];
  const setGroups = (creativeGroups: CreativeGroup[], key?: string) => update((p) => ({ ...p, creativeGroups }), key);
  const set = (i: number, g: Partial<CreativeGroup>, key?: string) => setGroups(groups.map((x, k) => (k === i ? { ...x, ...g } : x)), key);
  const inAnyGroup = new Set(groups.flatMap((g) => g.members));
  const candidates = project.elements.filter((e) => placeable(e, project.namespace) && !inAnyGroup.has(e.id));

  return (
    <Section title="Creative inventory groups" hint="Fold your items and blocks into their own groups, each with an icon, in any of the four creative tabs. Needs Minecraft 1.21.60 or newer.">
      {groups.map((g, i) => (
        <div className="card tag-card" key={g.id}>
          <div className="row wrap">
            <Text label="Group name" value={g.title} onChange={(title) => set(i, { title }, `g-title-${i}`)} />
            <Select label="Tab" value={g.category} onChange={(category) => set(i, { category })} options={CATEGORIES.map((c) => ({ ...c }))} />
            <Field label="Icon (optional)"><IdInput value={g.icon} onChange={(icon) => set(i, { icon }, `g-icon-${i}`)} placeholder="first item" /></Field>
            <button type="button" className="btn ghost small" onClick={() => setGroups(groups.filter((_, k) => k !== i))}>Remove group</button>
          </div>
          <div className="tag-members">
            {g.members.map((id) => {
              const e = project.elements.find((x) => x.id === id);
              if (!e) return null;
              return (
                <span className="tag-member" key={id}>
                  <span className="linklike"><Thumb el={e} project={project} size={20} /> {e.displayName}</span>
                  <button type="button" className="chip-x" aria-label={`Remove ${e.displayName}`} onClick={() => set(i, { members: g.members.filter((m) => m !== id) })}>×</button>
                </span>
              );
            })}
            {!g.members.length && <span className="muted">Empty groups are left out.</span>}
          </div>
          {candidates.length > 0 && (
            <select value="" onChange={(ev) => ev.target.value && set(i, { members: [...g.members, ev.target.value] })} aria-label={`Add to ${g.title}`}>
              <option value="">Add an item or block…</option>
              {candidates.map((e) => <option key={e.id} value={e.id}>{e.displayName}</option>)}
            </select>
          )}
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => setGroups([...groups, { id: uid(), title: `${project.name} items`, category: "items", icon: "", members: [] }])}>Add group</button>
    </Section>
  );
}
