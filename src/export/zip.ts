import JSZip from "jszip";
import type { FileMap } from "./context";

const safe = (s: string) => s.replace(/[^\w\- ]+/g, "").trim() || "addon";

/**
 * .mcaddon = a zip with one folder per pack. Minecraft imports both packs on open.
 * Each pack can also be downloaded alone as .mcpack (a zip with the pack at its root).
 */
export async function buildMcaddon(files: FileMap, packName: string): Promise<Blob> {
  const zip = new JSZip();
  const name = safe(packName);
  for (const [path, content] of files) {
    const [side, ...rest] = path.split("/");
    zip.file(`${name} ${side}/${rest.join("/")}`, content);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/zip" });
}

export async function buildMcpack(files: FileMap, side: "BP" | "RP"): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of files) {
    if (path.startsWith(`${side}/`)) zip.file(path.slice(3), content);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/zip" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fileSafe = safe;
