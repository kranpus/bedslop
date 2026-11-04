import { useMemo } from "react";
import type { ModElement, Project } from "../model/types";
import { COMMON_BLOCK_TAGS, COMMON_ITEM_TAGS } from "../model/vanilla";
import { ChipList } from "./fields";
import { useStore } from "../store/store";

export type TagKind = "item" | "block";

/** Which elements carry item tags and which carry block tags. */
export const tagKindOf = (e: ModElement): TagKind | null =>
  e.kind === "item" || e.kind === "tool" || e.kind === "food" || e.kind === "armor" ? "item"
    : e.kind === "block" || e.kind === "plant" || e.kind === "crop" ? "block" : null;

export const tagsOf = (e: ModElement): string[] => ("tags" in e ? (e.tags as string[] | undefined) ?? [] : []);

/** Every tag used in the project, by kind, with the elements that have it. */
export function projectTags(p: Project): Map<string, { kind: TagKind; members: ModElement[] }> {
  const out = new Map<string, { kind: TagKind; members: ModElement[] }>();
  for (const e of p.elements) {
    const kind = tagKindOf(e);
    if (!kind) continue;
    for (const raw of tagsOf(e)) {
      const t = raw.replace(/^#/, "").trim();
      if (!t) continue;
      const key = `${kind}|${t}`;
      if (!out.has(key)) out.set(key, { kind, members: [] });
      out.get(key)!.members.push(e);
    }
  }
  return out;
}

export function TagField({ kind, values, onChange }: { kind: TagKind; values: string[]; onChange: (v: string[]) => void }) {
  const project = useStore((s) => s.project!);
  const suggestions = useMemo(() => {
    const own = [...projectTags(project).entries()].filter(([, v]) => v.kind === kind).map(([k]) => k.split("|")[1]);
    return Array.from(new Set([...own, `${project.namespace}:`, ...(kind === "item" ? COMMON_ITEM_TAGS : COMMON_BLOCK_TAGS)]));
  }, [project, kind]);
  return (
    <ChipList label="Tags" values={values} onChange={onChange} suggestions={suggestions}
      help={kind === "item"
        ? "Recipes can use “#tag” for any item with it; procedures can check it. See all tags on the Tags tab."
        : "Procedures can check a block's tags; some vanilla tags change how tools mine it. See all tags on the Tags tab."} />
  );
}
