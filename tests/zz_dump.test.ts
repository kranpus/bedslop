import { it } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
it("dump", () => {
  const p = createProject("B"); p.namespace = "bld";
  p.textures.push({ id: "t", name: "t", kind: "block", width: 16, height: 16, dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" });
  for (const s of ["slab","stairs","fence","door"] as const) { const b = createElement("block", `oak_${s}`, s); b.shape = s; b.textures.all = "t"; p.elements.push(b); }
  const { files } = generateAddon(p);
  const out = "/tmp/claude-0/-home-user/ea97806c-37a1-5c31-961e-a95741dee63b/scratchpad/dump";
  mkdirSync(out, { recursive: true });
  for (const [k, v] of files) if (/blocks\/|terrain|manifest/.test(k)) writeFileSync(`${out}/${k.replace(/\//g, "__")}`, typeof v === "string" ? v : Buffer.from(v));
});
