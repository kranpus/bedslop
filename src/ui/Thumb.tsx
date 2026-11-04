import type { ModElement, Project } from "../model/types";
import { kindInfo } from "../model/registry";

/** First texture an element uses, for list thumbnails. */
export function elementTexture(el: ModElement): string | undefined {
  switch (el.kind) {
    case "block": return el.textures.all ?? el.textures.side ?? el.textures.top ?? el.textures.north;
    case "plant": case "item": case "tool": case "food": case "entity": return el.texture;
    case "projectile": return el.look === "sprite" ? el.texture : undefined;
    case "crop": return el.stageTextures[el.stageTextures.length - 1] || el.seedsTexture || undefined;
    case "armor": return el.pieces.chestplate.texture || el.pieces.helmet.texture;
    default: return undefined;
  }
}

export function Thumb({ el, project, size = 28 }: { el: ModElement; project: Project; size?: number }) {
  const texId = elementTexture(el);
  const tex = texId ? project.textures.find((t) => t.id === texId) : undefined;
  const info = kindInfo(el.kind);
  if (tex) {
    // Mobs: show the face region of the skin.
    if (el.kind === "entity") {
      const scale = size / 8;
      return (
        <span className="thumb" style={{ width: size, height: size }}>
          <span className="pixel" style={{ display: "block", width: size, height: size, backgroundImage: `url(${tex.dataUrl})`, backgroundSize: `${tex.width * scale}px ${tex.height * scale}px`, backgroundPosition: `${-8 * scale}px ${-8 * scale}px` }} />
        </span>
      );
    }
    return <img className="thumb pixel" src={tex.dataUrl} width={size} height={size} alt="" />;
  }
  return (
    <span className="thumb glyph" style={{ width: size, height: size, background: info.color, fontSize: size * 0.5 }} aria-hidden>
      {info.glyph}
    </span>
  );
}
