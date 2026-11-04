import { CreativeGroupsSection } from "./CreativeGroups";
import { useMemo, useRef, useState } from "react";
import { useStore } from "../store/store";
import { exampleProject } from "../model/packs";
import { PARITY, type ParityStatus } from "../model/parity";
import { SCRIPT_API_VERSIONS } from "../model/project";
import { generateAddon } from "../export/generate";
import { buildMcaddon, buildMcpack, fileSafe, isHostedPreview, saveFile } from "../export/zip";
import { packIconFrom } from "../textures/procedural";
import { Field, Grid, Section, Select, Text } from "./fields";
import { TexturePicker, readImageFile } from "./TexturePicker";
import { TextureEditor } from "./TextureEditor";
import type { GlobalVariable, TextureAsset } from "../model/types";
import { uid } from "../model/registry";
import { elementTexture } from "./Thumb";

// ---------- Home ----------

export function Home() {
  const { index, newProject, openProject, importProject, deleteProject } = useStore();
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const onImport = async (f: File) => {
    try {
      await importProject(JSON.parse(await f.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be read.");
    }
  };

  return (
    <div className="home">
      <header className="home-hero">
        <span className="logo big">Bedrock Creator</span>
        <h1>Make Minecraft Bedrock add-ons without writing code.</h1>
        <p>Blocks, items, tools, armor, food, mobs, recipes, ore generation and scripted behaviour. Export a ready-to-import <span className="mono">.mcaddon</span> for Windows, mobile, consoles and servers.</p>
      </header>

      <div className="home-grid">
        <section className="card">
          <h2>Start a new add-on</h2>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); newProject(name.trim() || "My Add-on", author.trim()); }}>
            <Text label="Add-on name" value={name} onChange={setName} placeholder="My Add-on" />
            <Text label="Your name (optional)" value={author} onChange={setAuthor} placeholder="Shown as the author" />
            <div className="row">
              <button className="btn primary" type="submit">Create add-on</button>
              <button className="btn" type="button" onClick={() => newProject("Ruby Expansion", author.trim(), exampleProject)}>Open the example</button>
            </div>
          </form>
          <p className="muted small">The example is a complete add-on: a ruby material set, two mobs, a plant, food, a scripted wand and a custom command.</p>
        </section>

        <section className="card">
          <div className="row between">
            <h2>Your add-ons</h2>
            <button className="btn small" onClick={() => file.current?.click()}>Import project…</button>
            <input ref={file} type="file" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </div>
          {error && <p className="warn-text">{error}</p>}
          {index.length ? (
            <ul className="project-list">
              {index.map((m) => (
                <li key={m.id}>
                  <button className="project-row" onClick={() => openProject(m.id)}>
                    <strong>{m.name}</strong>
                    <span className="muted mono">{m.namespace} · {m.elementCount} elements · {new Date(m.updatedAt).toLocaleDateString()}</span>
                  </button>
                  {confirm === m.id ? (
                    <span className="confirm">
                      <button className="btn small danger" onClick={() => { deleteProject(m.id); setConfirm(null); }}>Delete</button>
                      <button className="btn small ghost" onClick={() => setConfirm(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="btn small ghost" onClick={() => setConfirm(m.id)} aria-label={`Delete ${m.name}`}>Delete</button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing here yet. Projects save automatically in this browser.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- Top bar ----------

export function TopBar() {
  const { project, view, setView, saveState, undo, redo, past, future, closeProject } = useStore();
  if (!project) return null;
  const tab = (v: typeof view, label: string) => (
    <button className={`tab${view === v ? " on" : ""}`} onClick={() => setView(v)} aria-current={view === v ? "page" : undefined}>{label}</button>
  );
  return (
    <header className="topbar">
      <button className="logo" onClick={closeProject} title="All add-ons">Bedrock Creator</button>
      <div className="project-name">
        <strong>{project.name}</strong>
        <span className={`save ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}</span>
      </div>
      <nav className="tabs" aria-label="Workspace">
        {tab("element", "Elements")}
        {tab("textures", "Textures")}
        {tab("variables", "Variables")}
        {tab("tags", "Tags")}
        {tab("languages", "Languages")}
        {tab("settings", "Settings")}
        {tab("roadmap", "Roadmap")}
      </nav>
      <span className="spacer" />
      <button className="btn ghost small" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">Undo</button>
      <button className="btn ghost small" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">Redo</button>
      <button className={`btn primary${view === "export" ? " on" : ""}`} onClick={() => setView("export")}>Export add-on</button>
    </header>
  );
}

// ---------- Textures ----------

export function TexturesView() {
  const project = useStore((s) => s.project!);
  const { addTexture, patchTexture, removeTexture } = useStore.getState();
  const [editing, setEditing] = useState<TextureAsset | "new" | null>(null);
  const [filter, setFilter] = useState<"all" | TextureAsset["kind"]>("all");
  const file = useRef<HTMLInputElement>(null);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    const bump = (id?: string) => id && m.set(id, (m.get(id) ?? 0) + 1);
    for (const el of project.elements) {
      if (el.kind === "block") Object.values(el.textures).forEach(bump);
      else if (el.kind === "armor") { Object.values(el.pieces).forEach((p) => bump(p.texture)); bump(el.layer1); bump(el.layer2); }
      else bump(elementTexture(el));
    }
    bump(project.packIcon);
    return m;
  }, [project]);
  const list = project.textures.filter((t) => filter === "all" || t.kind === filter);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Textures</h1>
          <p className="muted">{project.textures.length} textures. Editing one updates every element that uses it.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => file.current?.click()}>Upload PNGs…</button>
          <button className="btn primary" onClick={() => setEditing("new")}>New texture</button>
          <input ref={file} type="file" accept="image/png" multiple hidden onChange={async (e) => {
            for (const f of Array.from(e.target.files ?? [])) addTexture({ name: f.name.replace(/\.png$/i, ""), kind: filter === "all" ? "block" : filter, ...(await readImageFile(f)) });
          }} />
        </div>
      </header>
      <div className="segmented">
        {(["all", "block", "item", "entity", "armor", "other"] as const).map((k) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}</button>
        ))}
      </div>
      <div className="texture-library">
        {list.map((t) => (
          <div key={t.id} className="texture-card">
            <button className="checker" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}><img className="pixel" src={t.dataUrl} alt="" /></button>
            <span className="mono">{t.name}</span>
            <span className="muted small">{t.width}×{t.height} · {usage.get(t.id) ? `used ${usage.get(t.id)}×` : "unused"}</span>
            <div className="row">
              <select value={t.kind} onChange={(e) => patchTexture(t.id, { kind: e.target.value as TextureAsset["kind"] })} aria-label="Texture kind">
                {["block", "item", "entity", "armor", "other"].map((k) => <option key={k}>{k}</option>)}
              </select>
              {!usage.get(t.id) && <button className="btn small ghost" onClick={() => removeTexture(t.id)}>Delete</button>}
            </div>
          </div>
        ))}
        {!list.length && <p className="muted">No textures here yet.</p>}
      </div>
      {editing && (
        <TextureEditor kind={editing === "new" ? (filter === "all" ? "block" : filter) : editing.kind} suggestedName="texture"
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(d) => { if (editing === "new") addTexture(d); else patchTexture(editing.id, { dataUrl: d.dataUrl, width: d.width, height: d.height, name: d.name }); setEditing(null); }} />
      )}
    </div>
  );
}

// ---------- Settings ----------

export function SettingsView() {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const set = (p: Partial<typeof project>, key?: string) => update((x) => ({ ...x, ...p }), key);
  const api = SCRIPT_API_VERSIONS.find((v) => v.api === project.scriptApi);
  const download = () => {
    const blob = new Blob([JSON.stringify(project)], { type: "application/json" });
    saveFile(blob, `${fileSafe(project.name)}.bcproject.json`);
  };
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Project settings</h1></header>
      <Section title="Add-on">
        <Grid>
          <Text label="Name" value={project.name} onChange={(name) => set({ name }, "name")} />
          <Text label="Namespace" mono value={project.namespace} onChange={(namespace) => set({ namespace: namespace.toLowerCase().replace(/[^a-z0-9_]/g, "") }, "ns")}
            help="Prefix for every identifier, e.g. ruby:ruby_ore. Pick something unique to you." />
          <Text label="Author" value={project.author} onChange={(author) => set({ author }, "author")} />
          <Field label="Version">
            <span className="row">
              {[0, 1, 2].map((i) => (
                <input key={i} type="number" min={0} className="version" aria-label={["Major", "Minor", "Patch"][i]} value={project.version[i]}
                  onChange={(e) => { const v = [...project.version] as [number, number, number]; v[i] = Math.max(0, Number(e.target.value)); set({ version: v }, "ver"); }} />
              ))}
            </span>
          </Field>
        </Grid>
        <Text label="Description" wide value={project.description} onChange={(description) => set({ description }, "desc")} />
        <TexturePicker label="Pack icon" kind="other" value={project.packIcon} suggestedName="pack_icon" onChange={(packIcon) => set({ packIcon })}
          help="Shown in Minecraft's pack list. Empty = uses your first item or block texture." />
      </Section>
      <Section title="Minecraft version" hint="Newer versions unlock more features but won't load on older game versions.">
        <Grid>
          <Select label="Script API" value={project.scriptApi} onChange={(scriptApi) => {
            const v = SCRIPT_API_VERSIONS.find((x) => x.api === scriptApi)!;
            set({ scriptApi, minEngine: v.engine });
          }} options={SCRIPT_API_VERSIONS.map((v) => ({ value: v.api, label: `${v.api} (Minecraft ${v.game}+)` }))} />
          <Field label="Minimum game version">
            <span className="row">
              {[0, 1, 2].map((i) => (
                <input key={i} type="number" min={0} className="version" aria-label={`Engine part ${i + 1}`} value={project.minEngine[i]}
                  onChange={(e) => { const v = [...project.minEngine] as [number, number, number]; v[i] = Math.max(0, Number(e.target.value)); set({ minEngine: v }, "eng"); }} />
              ))}
            </span>
          </Field>
        </Grid>
        {api && <p className="field-help">Players need Minecraft Bedrock {api.game} or newer. Custom commands need Script API 2.1.0+.</p>}
      </Section>
      <CreativeGroupsSection />
      <Section title="Back up">
        <p className="muted">Projects live in this browser's storage. Download a backup to move it to another device or share it.</p>
        <button className="btn" onClick={download}>Download project file</button>
      </Section>
    </div>
  );
}

// ---------- Export ----------

export function ExportView() {
  const project = useStore((s) => s.project!);
  const select = useStore((s) => s.select);
  const result = useMemo(() => generateAddon(project), [project]);
  const [selected, setSelected] = useState<string>("BP/manifest.json");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const errors = result.warnings.filter((w) => w.level === "error");
  const warns = result.warnings.filter((w) => w.level === "warning");
  const paths = [...result.files.keys()].sort();
  const content = result.files.get(selected);

  const iconBytes = async () => {
    const id = project.packIcon || project.elements.map(elementTexture).find((t) => project.textures.some((x) => x.id === t && x.width <= 32));
    const tex = project.textures.find((t) => t.id === id);
    return tex ? packIconFrom(tex.dataUrl) : undefined;
  };
  const imageUrl = useMemo(
    () => (content instanceof Uint8Array && selected.endsWith(".png") ? URL.createObjectURL(new Blob([new Uint8Array(content)], { type: "image/png" })) : ""),
    [content, selected],
  );

  const exportAs = async (kind: "mcaddon" | "BP" | "RP") => {
    setBusy(true);
    try {
      const { files } = generateAddon(project, await iconBytes());
      const name = fileSafe(project.name);
      setNote(kind === "mcaddon"
        ? await saveFile(await buildMcaddon(files, project.name), `${name}.mcaddon`)
        : await saveFile(await buildMcpack(files, kind), `${name}_${kind}.mcpack`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Export</h1>
          <p className="muted">{paths.length} files · behavior pack + resource pack{result.usesScripts ? " + scripts" : ""}</p>
        </div>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => exportAs("BP")}>Behavior .mcpack</button>
          <button className="btn" disabled={busy} onClick={() => exportAs("RP")}>Resource .mcpack</button>
          <button className="btn primary" disabled={busy} onClick={() => exportAs("mcaddon")}>{busy ? "Packing…" : "Download .mcaddon"}</button>
        </div>
      </header>

      {isHostedPreview() && !note && <p className="muted">In this hosted preview, add-ons save as <span className="mono">.mcaddon.zip</span>. Remove “.zip” from the file name before opening it.</p>}
      {note && <p className="status-banner ok" role="status">{note}</p>}
      <div className={`status-banner ${errors.length ? "error" : warns.length ? "warning" : "ok"}`}>
        {errors.length ? `${errors.length} problem${errors.length > 1 ? "s" : ""} will stop parts of the add-on from working.` : warns.length ? `Ready, with ${warns.length} thing${warns.length > 1 ? "s" : ""} to check.` : "Ready to export. No problems found."}
      </div>
      {result.warnings.length > 0 && (
        <ul className="problems">
          {result.warnings.map((w, i) => (
            <li key={i} className={w.level}>
              {w.message}
              {w.elementId && <button className="btn small ghost" onClick={() => select(w.elementId!)}>Fix</button>}
            </li>
          ))}
        </ul>
      )}

      <details className="howto">
        <summary>How to install</summary>
        <ol>
          <li><strong>Windows, Android, iOS:</strong> open the downloaded <span className="mono">.mcaddon</span>. Minecraft imports both packs.</li>
          <li>Create or edit a world → <em>Behavior Packs</em> → activate this add-on (the resource pack is added for you).</li>
          {result.usesScripts && <li>Scripts are included. No experimental toggles are needed for Script API {project.scriptApi}.</li>}
          <li><strong>Dedicated server:</strong> unzip the .mcaddon, copy the two folders into <span className="mono">behavior_packs</span> and <span className="mono">resource_packs</span>, and list them in the world's pack json files.</li>
          <li>Changed something? Bump the version in Settings before re-exporting so Minecraft replaces the old copy.</li>
        </ol>
      </details>

      <div className="file-browser">
        <ul className="file-tree" aria-label="Generated files">
          {paths.map((p) => (
            <li key={p}><button className={p === selected ? "on" : ""} onClick={() => setSelected(p)}><span className="mono">{p}</span></button></li>
          ))}
        </ul>
        <div className="file-view">
          <div className="file-view-head mono">{selected}</div>
          {typeof content === "string" ? (
            <pre className="code-block"><code>{content}</code></pre>
          ) : imageUrl ? (
            <div className="checker file-image"><img className="pixel" src={imageUrl} alt={selected} /></div>
          ) : (
            <p className="muted pad">{content ? `${content.byteLength} bytes` : "Select a file."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Roadmap ----------

const STATUS: Record<ParityStatus, string> = {
  done: "Ready", partial: "Partly ready", planned: "Planned", workaround: "Via scripting", impossible: "Not possible on Bedrock",
};

export function RoadmapView() {
  const done = PARITY.filter((r) => r.status === "done").length;
  const portable = PARITY.filter((r) => r.status !== "impossible").length;
  const phases = [
    { n: 1, title: "Core content", text: "Everything a typical content add-on needs, plus no-code procedures and texture tools." },
    { n: 2, title: "Visual scripting & advanced content", text: "Blockly procedures with variables, forms (GUIs), projectiles, structures, particles, crops, special block shapes, entity taming/riding/trading." },
    { n: 3, title: "Closing Bedrock gaps", text: "Script-simulated enchantments, effects, achievements and overlays, plus biomes where Bedrock allows it." },
    { n: 4, title: "Platform", text: "3D previews, multi-language editor, cloud sync and sharing, templates gallery, AI-assisted element and texture generation." },
  ];
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>MCreator → Bedrock roadmap</h1>
          <p className="muted">{done} of {portable} portable MCreator features are fully ready. Everything else is planned, partly ready or simulated with scripts.</p>
        </div>
      </header>
      <ol className="phases">
        {phases.map((p) => (
          <li key={p.n} className={p.n === 1 ? "current" : ""}>
            <span className="phase-n mono">Phase {p.n}</span>
            <strong>{p.title}</strong>
            <span className="muted">{p.text}</span>
          </li>
        ))}
      </ol>
      <div className="table-wrap">
        <table className="parity">
          <thead><tr><th>MCreator feature</th><th>Bedrock equivalent</th><th>Status</th><th>Phase</th><th>Notes</th></tr></thead>
          <tbody>
            {PARITY.map((r) => (
              <tr key={r.mcreator}>
                <td><strong>{r.mcreator}</strong></td>
                <td>{r.bedrock}</td>
                <td><span className={`pill ${r.status}`}>{STATUS[r.status]}</span></td>
                <td className="mono">{r.phase || "–"}</td>
                <td className="muted">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ---------- Variables ----------

export function VariablesView() {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const vars = project.variables ?? [];
  const setVars = (variables: GlobalVariable[], key?: string) => update((p) => ({ ...p, variables }), key);
  const set = (i: number, patch: Partial<GlobalVariable>, key?: string) => setVars(vars.map((v, k) => (k === i ? { ...v, ...patch } : v)), key);
  const usedIn = (name: string) => project.elements.filter((e) => JSON.stringify(e).includes(`"${name}"`) || JSON.stringify(e).includes(`{${name}}`)).length;
  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Global variables</h1>
          <p className="muted">Values saved in the world that procedures, commands and forms can read and change, like MCreator's global variables.</p>
        </div>
        <button className="btn primary" onClick={() => setVars([...vars, { id: uid(), name: `var${vars.length + 1}`, scope: "player", type: "number", initial: "0" }])}>Add variable</button>
      </header>
      {vars.length ? (
        <div className="table-wrap">
          <table className="parity vars">
            <thead><tr><th>Name</th><th>Belongs to</th><th>Type</th><th>Starts as</th><th>Used in</th><th /></tr></thead>
            <tbody>
              {vars.map((v, i) => (
                <tr key={v.id}>
                  <td><input className="mono" value={v.name} aria-label="Variable name" onChange={(e) => set(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }, `name-${v.id}`)} /></td>
                  <td><select value={v.scope} aria-label="Belongs to" onChange={(e) => set(i, { scope: e.target.value as GlobalVariable["scope"] })}><option value="player">Each player</option><option value="world">The world</option></select></td>
                  <td><select value={v.type} aria-label="Type" onChange={(e) => set(i, { type: e.target.value as GlobalVariable["type"], initial: e.target.value === "number" ? "0" : e.target.value === "boolean" ? "false" : "" })}><option value="number">Number</option><option value="text">Text</option><option value="boolean">True / false</option></select></td>
                  <td>{v.type === "boolean"
                    ? <select value={v.initial} aria-label="Starting value" onChange={(e) => set(i, { initial: e.target.value })}><option value="false">false</option><option value="true">true</option></select>
                    : <input className="mono" value={v.initial} aria-label="Starting value" onChange={(e) => set(i, { initial: e.target.value }, `init-${v.id}`)} />}</td>
                  <td className="muted">{usedIn(v.name) || "–"}</td>
                  <td><button className="btn small ghost" onClick={() => setVars(vars.filter((_, k) => k !== i))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state"><h2>No variables yet</h2><p>Add one to count kills, store a player's coins, remember if a boss was beaten, or save form answers.</p></div>
      )}
      <ul className="hint-list">
        <li><strong>Each player</strong> variables are kept per player (like coins). <strong>The world</strong> variables are shared (like “boss defeated”).</li>
        <li>Change them with the “Change a variable” step, check them with “Variable compares to”, or use the variable blocks.</li>
        <li>Show them in any text as <span className="mono">{"{name}"}</span>, e.g. “You have {"{coins}"} coins”.</li>
      </ul>
    </div>
  );
}
