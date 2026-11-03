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

type DownloadsApi = { save(r: { filename: string; data: Blob }): Promise<unknown> };
type ClaudeHost = { use(name: string): Promise<unknown> };

/** True when running inside a claude.ai artifact, where downloads go through the host. */
export function isHostedPreview() {
  return typeof window !== "undefined" && typeof (window as unknown as { claude?: ClaudeHost }).claude?.use === "function";
}

/** Hosted previews only allow common extensions, so add packs get a .zip suffix there. */
export function hostedName(fileName: string) {
  return /\.(mcaddon|mcpack)$/i.test(fileName) ? `${fileName}.zip` : fileName;
}

/** Saves a file. Returns a short message for the UI, or "" on a normal browser download. */
export async function saveFile(blob: Blob, fileName: string): Promise<string> {
  if (isHostedPreview()) {
    const host = (window as unknown as { claude: ClaudeHost }).claude;
    const downloads = (await host.use("downloads")) as DownloadsApi | null;
    if (!downloads) return "Downloads aren't available in this view. Run Bedrock Creator locally to export.";
    try {
      await downloads.save({ filename: hostedName(fileName), data: blob });
      return /\.(mcaddon|mcpack)$/i.test(fileName) ? `Saved ${hostedName(fileName)}. Remove ".zip" from the name, then open it to import.` : `Saved ${fileName}.`;
    } catch (e) {
      const code = (e as { code?: string }).code;
      return code === "declined" ? "" : "The file couldn't be saved here.";
    }
  }
  downloadBlob(blob, fileName);
  return "";
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
