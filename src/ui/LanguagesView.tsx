import { useDeferredValue, useMemo, useState } from "react";
import { GAME_LANGUAGES } from "../model/vanilla";
import { englishTexts, parseLang } from "../export/generate";
import { useStore } from "../store/store";
import { saveFile } from "../export/zip";

/** What a lang key is, in plain words. */
function describe(key: string): string {
  if (key === "pack.name") return "Add-on name";
  if (key === "pack.description") return "Add-on description";
  if (key.startsWith("tile.")) return "Block name";
  if (key.startsWith("item.spawn_egg.")) return "Spawn egg name";
  if (key.startsWith("item.")) return "Item name";
  if (key.startsWith("entity.")) return "Mob name";
  if (key.includes("itemGroup.name.")) return "Creative group";
  return "Text";
}

export function LanguagesView() {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const deferred = useDeferredValue(project);
  const english = useMemo(() => englishTexts(deferred), [deferred]);
  const langs = project.languages ?? [];
  const [current, setCurrent] = useState(langs[0] ?? "");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [msg, setMsg] = useState("");
  const tr = project.translations?.[current] ?? {};
  const done = english.filter(([k]) => tr[k]?.trim()).length;

  const setTr = (key: string, value: string) => update((p) => ({
    ...p, translations: { ...p.translations, [current]: { ...(p.translations?.[current] ?? {}), [key]: value } },
  }), `tr-${current}-${key}`);
  const addLang = (code: string) => {
    if (!code || langs.includes(code)) return;
    update((p) => ({ ...p, languages: [...(p.languages ?? []), code] }));
    setCurrent(code);
  };
  const removeLang = (code: string) => {
    update((p) => ({ ...p, languages: (p.languages ?? []).filter((l) => l !== code) }));
    setCurrent(langs.filter((l) => l !== code)[0] ?? "");
  };
  const download = () => {
    const text = english.map(([k, en]) => `${k}=${tr[k]?.trim() || en}`).join("\n") + "\n";
    saveFile(new Blob([text], { type: "text/plain" }), `${current}.lang`);
  };
  const upload = async (f: File) => {
    const known = new Set(english.map(([k]) => k));
    const lines = parseLang(await f.text()).filter(([k]) => known.has(k));
    const en = Object.fromEntries(english);
    const changed = Object.fromEntries(lines.filter(([k, v]) => v.trim() && v !== en[k]));
    update((p) => ({ ...p, translations: { ...p.translations, [current]: { ...(p.translations?.[current] ?? {}), ...changed } } }));
    setMsg(`Read ${f.name}: ${Object.keys(changed).length} translated line${Object.keys(changed).length === 1 ? "" : "s"}${lines.length ? "" : ". No matching lines were found"}.`);
  };
  const rows = english.filter(([k]) => !onlyMissing || !tr[k]?.trim());

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Languages</h1>
          <p className="muted">Translate the names and descriptions your add-on shows in game. Players see them when Minecraft is set to that language; anything not translated stays in English.</p>
        </div>
      </header>

      <div className="card">
        <div className="row wrap">
          {langs.map((l) => (
            <button type="button" key={l} className={`btn small${l === current ? " primary" : ""}`} onClick={() => setCurrent(l)}>{GAME_LANGUAGES[l] ?? l}</button>
          ))}
          <select value="" onChange={(e) => addLang(e.target.value)} aria-label="Add a language">
            <option value="">Add a language…</option>
            {Object.entries(GAME_LANGUAGES).filter(([c]) => !langs.includes(c)).map(([c, name]) => <option key={c} value={c}>{name} ({c})</option>)}
          </select>
        </div>
        {!langs.length && <p className="muted">English (en_US) is always included. Add another language to start translating.</p>}
      </div>

      {current && langs.includes(current) && (
        <div className="card">
          <div className="row between wrap">
            <div className="stack tight">
              <strong>{GAME_LANGUAGES[current] ?? current} <span className="mono muted">{current}</span></strong>
              <span className="field-help">{done} of {english.length} translated</span>
              <div className="progress"><span style={{ width: `${english.length ? (done / english.length) * 100 : 0}%` }} /></div>
            </div>
            <div className="row wrap">
              <label className="inline-check"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only untranslated</label>
              <button type="button" className="btn small ghost" onClick={download} title="Translate it elsewhere, then upload it back">Download .lang</button>
              <label className="btn small ghost">
                Upload .lang…
                <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
              </label>
              <button type="button" className="btn small ghost" onClick={() => removeLang(current)}>Remove language</button>
            </div>
          </div>
          {msg && <p className="ok-text" role="status">{msg}</p>}
          <div className="tr-table">
            {rows.map(([key, en]) => (
              <label className="tr-row" key={key}>
                <span className="stack tight">
                  <span>{en}</span>
                  <span className="field-help">{describe(key)} · <span className="mono">{key}</span></span>
                </span>
                <input value={tr[key] ?? ""} placeholder={en} onChange={(e) => setTr(key, e.target.value)} aria-label={`${current} for ${key}`} />
              </label>
            ))}
            {!rows.length && <p className="muted">Everything is translated.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
