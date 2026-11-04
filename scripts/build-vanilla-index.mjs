// Builds src/vanilla/index.json from a local checkout of Mojang/bedrock-samples.
// Only ids and file names are stored; the files themselves are downloaded by users from Mojang's repo.
// Usage: node scripts/build-vanilla-index.mjs <path to bedrock-samples>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Pass the path to a bedrock-samples checkout.");
const parse = (t) => {
  let out = "", s = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1];
    if (s) { out += c; if (c === "\\") { out += n ?? ""; i++; } else if (c === '"') s = false; continue; }
    if (c === '"') { s = true; out += c; continue; }
    if (c === "/" && n === "/") { while (i < t.length && t[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < t.length && !(t[i] === "*" && t[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
};
const read = (...p) => parse(readFileSync(join(root, ...p), "utf8"));
const ver = (v) => String(v ?? "0").split(".").map(Number);
const newer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 4; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

const geometryFile = new Map();
for (const f of readdirSync(join(root, "resource_pack/models/entity"))) {
  const g = read("resource_pack/models/entity", f);
  for (const x of g["minecraft:geometry"] ?? []) geometryFile.set(x.description?.identifier, f);
  for (const k of Object.keys(g)) if (k.startsWith("geometry.")) geometryFile.set(k.split(":")[0], f);
}
const clients = new Map();
for (const f of readdirSync(join(root, "resource_pack/entity"))) {
  const d = read("resource_pack/entity", f);
  const id = d["minecraft:client_entity"]?.description?.identifier;
  if (!id) continue;
  const cur = clients.get(id);
  // Several files can describe one mob (older engine versions); keep the newest.
  // Ties: prefer current files over "v1.0" legacy ones, and higher variants (horse_v3 over horse_v1).
  const better = !cur || newer(d.format_version, cur.format) ||
    (!newer(cur.format, d.format_version) && !f.includes("v1.0") && (cur.file.includes("v1.0") || f > cur.file));
  if (better) clients.set(id, { file: f, format: d.format_version, desc: d["minecraft:client_entity"].description });
}
const mobs = [];
for (const f of readdirSync(join(root, "behavior_pack/entities"))) {
  const e = read("behavior_pack/entities", f)["minecraft:entity"];
  const id = e?.description?.identifier;
  const client = clients.get(id);
  if (!id || !client || !e.components?.["minecraft:health"]) continue;
  const geo = client.desc.geometry?.default;
  const textures = client.desc.textures ?? {};
  const tex = textures.default ?? Object.values(textures)[0];
  mobs.push({ id, bp: f, rp: client.file, geometry: geo, geometryFile: geometryFile.get(geo) ?? null, texture: tex ?? null });
}
mobs.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync("src/vanilla/index.json", JSON.stringify({ tag: process.env.TAG ?? "v1.26.60.5", mobs }, null, 1) + "\n");
console.log(`${mobs.length} mobs, ${mobs.filter((m) => m.geometryFile).length} with a model file`);
