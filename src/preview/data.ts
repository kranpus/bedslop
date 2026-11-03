// Collects exactly what the exporter would write for a mob, so the preview matches the add-on.
import { GenContext } from "../export/context";
import { genEntity } from "../export/entity";
import type { EntityElement, Project } from "../model/types";
import type { AnimDef, ControllerDef, PreviewSpec } from "./animator";

export interface MobPreviewData {
  geometry: unknown;
  geometryId: string;
  texture: string;
  spec: PreviewSpec;
}

const parse = (c: unknown) => {
  try { return typeof c === "string" ? JSON.parse(c) : null; } catch { return null; }
};

export function mobPreviewData(project: Project, el: EntityElement): MobPreviewData | null {
  const ctx = new GenContext(project);
  genEntity(ctx, el);
  const client = parse(ctx.files.get(`RP/entity/${el.name}.entity.json`))?.["minecraft:client_entity"]?.description;
  if (!client) return null;
  const geometryId: string = client.geometry?.default ?? "";
  let geometry: unknown = null;
  const defs: Record<string, AnimDef> = {};
  const controllers: Record<string, ControllerDef> = {};
  for (const [path, content] of ctx.files) {
    if (path.startsWith("RP/models/entity/")) {
      const g = parse(content);
      if (g?.["minecraft:geometry"]?.some((x: { description?: { identifier?: string } }) => x.description?.identifier === geometryId)) geometry = g;
    } else if (path.startsWith("RP/animations/")) Object.assign(defs, parse(content)?.animations ?? {});
    else if (path.startsWith("RP/animation_controllers/")) Object.assign(controllers, parse(content)?.animation_controllers ?? {});
  }
  if (!geometry) return null;
  const scripts = client.scripts ?? {};
  return {
    geometry,
    geometryId,
    texture: project.textures.find((t) => t.id === el.texture)?.dataUrl ?? "",
    spec: {
      animations: client.animations ?? {},
      animate: scripts.animate ?? [],
      preAnimation: scripts.pre_animation ?? [],
      initialize: scripts.initialize ?? [],
      defs,
      controllers,
    },
  };
}
