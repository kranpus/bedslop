import { useEffect, useMemo, useState } from "react";
import type { LootElement, StructureElement } from "../../model/types";
import { createElement } from "../../model/registry";
import { BIOME_TAGS } from "../../model/vanilla";
import { dataUrlToBytes } from "../../export/context";
import { VANILLA_CHEST_LOOT, parseStructure, structureId, type StructureContainer, type StructureInfo } from "../../export/structure";
import { ChipList, Field, Grid, Num, Section, Segmented, Select, Slider, Toggle } from "../fields";
import { StructurePreview } from "../StructurePreview";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

const lootLabel = (path: string) => path.replace(/^loot_tables\/chests\//, "").replace(/\.json$/, "").replace(/[/_]/g, " ");
const blockLabel = (id: string) => id.replace(/^minecraft:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Average colour of an image (ignoring transparent pixels). */
function averageColor(dataUrl: string): Promise<[number, number, number] | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.min(32, img.width) || 1;
      c.height = Math.min(32, img.height) || 1;
      const g = c.getContext("2d");
      if (!g) return res(null);
      g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let r = 0, gr = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
      res(n ? [r / n, gr / n, b / n] : null);
    };
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}

function readFile(f: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("The file couldn't be read."));
    r.readAsDataURL(f);
  });
}

function LootPicker({ value, onChange, loots, label, keepLabel = "Keep what's in it" }: {
  value: string; onChange: (v: string) => void; loots: LootElement[]; label: string; keepLabel?: string;
}) {
  const known = !value || value.startsWith("loot_tables/") || loots.some((l) => l.name === value);
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{keepLabel}</option>
        {loots.length > 0 && (
          <optgroup label="Your loot tables">
            {loots.map((l) => <option key={l.id} value={l.name}>{l.displayName}</option>)}
          </optgroup>
        )}
        <optgroup label="Minecraft's">
          {VANILLA_CHEST_LOOT.map((p) => <option key={p} value={p}>{lootLabel(p)}</option>)}
        </optgroup>
        {!known && <option value={value}>{value} (missing)</option>}
      </select>
    </Field>
  );
}

export function StructureEditor({ el, patch }: { el: StructureElement; patch: Patch<StructureElement> }) {
  const project = useStore((s) => s.project!);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);

  const parsed = useMemo((): { info?: StructureInfo; error?: string } => {
    if (!el.file) return {};
    try {
      return { info: parseStructure(dataUrlToBytes(el.file)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "This file couldn't be read." };
    }
  }, [el.file]);
  const info = parsed.info;

  // Colour this add-on's own blocks from their textures; name them by their display names.
  const ownBlocks = useMemo(() => {
    const m = new Map<string, { label: string; texture?: string }>();
    for (const e of project.elements) {
      const tex = e.kind === "block" ? e.textures.all ?? e.textures.side ?? e.textures.top : e.kind === "plant" ? e.texture : undefined;
      if (e.kind === "block" || e.kind === "plant") m.set(`${project.namespace}:${e.name}`, { label: e.displayName, texture: project.textures.find((t) => t.id === tex)?.dataUrl });
    }
    return m;
  }, [project.elements, project.textures, project.namespace]);
  const [colors, setColors] = useState<Record<string, [number, number, number]>>({});
  useEffect(() => {
    if (!info) return;
    let live = true;
    const wanted = info.palette.filter((n) => ownBlocks.get(n)?.texture);
    Promise.all(wanted.map(async (n) => [n, await averageColor(ownBlocks.get(n)!.texture!)] as const)).then((pairs) => {
      if (live) setColors(Object.fromEntries(pairs.filter((p): p is readonly [string, [number, number, number]] => !!p[1])));
    });
    return () => { live = false; };
  }, [info, ownBlocks]);
  const nameOf = (id: string) => ownBlocks.get(id)?.label ?? blockLabel(id);
  const loots = project.elements.filter((e): e is LootElement => e.kind === "loot");
  const sortedLoots = [...loots.filter((l) => l.lootType === "chests"), ...loots.filter((l) => l.lootType !== "chests")];

  const load = async (f: File) => {
    setError("");
    try {
      const file = await readFile(f);
      const s = parseStructure(dataUrlToBytes(file)); // validate before saving
      // Keep loot choices for containers that are still in the same place.
      const loot = Object.fromEntries(Object.entries(el.loot).filter(([k]) => s.containers.some((c) => String(c.index) === k)));
      patch({ file, fileName: f.name, loot });
    } catch (e) {
      setError(`${f.name}: ${e instanceof Error ? e.message : "couldn't be read."}`);
    }
  };

  const setLoot = (c: StructureContainer, v: string) => patch({ loot: { ...el.loot, [c.index]: v } });
  const setAll = (v: string) => info && patch({ loot: Object.fromEntries(info.containers.map((c) => [c.index, v])) });
  const makeLootTable = () => {
    if (!info) return;
    let name = `${el.name}_loot`, n = 2;
    while (project.elements.some((e) => e.name === name)) name = `${el.name}_loot_${n++}`;
    const l = createElement("loot", name, `${el.displayName} loot`);
    l.lootType = "chests";
    l.pools = [{ rollsMin: 2, rollsMax: 5, entries: [
      { item: "minecraft:iron_ingot", weight: 10, min: 1, max: 4 }, { item: "minecraft:bread", weight: 15, min: 1, max: 3 },
      { item: "minecraft:gold_ingot", weight: 5, min: 1, max: 3 }, { item: "minecraft:diamond", weight: 1, min: 1, max: 1 },
    ] }];
    const all = Object.fromEntries(info.containers.map((c) => [c.index, name]));
    update((p) => ({ ...p, elements: [...p.elements.map((e) => (e.id === el.id ? { ...el, loot: all } : e)), l] }));
  };

  const id = structureId(project.namespace, el.name);
  const [sx, sy, sz] = info?.size ?? [0, 0, 0];
  const allSame = info?.containers.length ? info.containers.every((c) => (el.loot[c.index] ?? "") === (el.loot[info.containers[0].index] ?? "")) : false;

  return (
    <>
      <Section title="Structure file" hint="Build it in Minecraft, then save it with a Structure Block: Save mode → Export. That gives you a .mcstructure file.">
        <div className="row wrap">
          <label className={`btn${el.file ? "" : " primary"}`}>
            {el.file ? "Replace .mcstructure…" : "Choose .mcstructure…"}
            <input type="file" accept=".mcstructure" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) load(f); }} />
          </label>
          {el.file && <span className="mono">{el.fileName}</span>}
        </div>
        {error && <p className="warn-text" role="alert">{error}</p>}
        {parsed.error && <p className="warn-text" role="alert">{parsed.error}</p>}
        {info && (
          <div className="structure-summary">
            <StructurePreview info={info} highlight={highlight} colors={colors} />
            <div className="stack tight">
              <p><strong>{sx} × {sy} × {sz}</strong> <span className="muted">(width × height × depth)</span></p>
              <p className="muted">
                {info.counts.reduce((n, [, c]) => n + c, 0).toLocaleString()} blocks
                {info.containers.length ? ` · ${info.containers.length} container${info.containers.length === 1 ? "" : "s"}` : ""}
                {info.entities.length ? ` · ${info.entities.length} mob${info.entities.length === 1 ? "" : "s"} (placed by procedures only)` : ""}
              </p>
              <ul className="block-counts">
                {info.counts.slice(0, 8).map(([n, c]) => <li key={n}><span>{nameOf(n)}</span><span className="mono">{c}</span></li>)}
                {info.counts.length > 8 && <li className="muted">and {info.counts.length - 8} more kinds</li>}
              </ul>
              <p className="field-help">Its id is <span className="mono">{id}</span>. Try it in game with <span className="mono">/structure load {id} ~ ~ ~</span></p>
            </div>
          </div>
        )}
      </Section>

      {info && info.containers.length > 0 && (
        <Section title="Chest loot" hint="Fill chests, barrels and other containers with a loot table each time the structure appears. Their saved items are replaced.">
          <div className="row wrap">
            {info.containers.length > 1 && (
              <LootPicker label="Set all containers to" value={allSame ? el.loot[info.containers[0].index] ?? "" : ""} onChange={setAll} loots={sortedLoots} keepLabel={allSame ? "Keep what's in them" : "(mixed)"} />
            )}
            <button type="button" className="btn small" onClick={makeLootTable}>Make a loot table for these</button>
          </div>
          <div className="container-list">
            {info.containers.map((c) => {
              const ref = el.loot[c.index] ?? "";
              const own = loots.find((l) => l.name === ref);
              return (
                <div className="container-row" key={c.index} onMouseEnter={() => setHighlight(c.index)} onMouseLeave={() => setHighlight(null)} onFocus={() => setHighlight(c.index)}>
                  <div className="stack tight">
                    <strong>{nameOf(c.block)}</strong>
                    <span className="field-help">at {c.pos.join(", ")} · {c.loot ? `loot: ${lootLabel(c.loot)}` : `${c.items} item stack${c.items === 1 ? "" : "s"} saved`}</span>
                  </div>
                  <LootPicker label="Loot" value={ref} onChange={(v) => setLoot(c, v)} loots={sortedLoots} />
                  {own && <button type="button" className="btn ghost small" onClick={() => select(own.id)}>Edit loot table</button>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="World generation">
        <Toggle label="Generates naturally" value={el.generate} onChange={(generate) => patch({ generate })} help="Off: it's only placed by procedures or the /structure command." />
        {el.generate && (
          <>
            <Grid>
              <Select label="Dimension" value={el.dimension} onChange={(dimension) => patch(dimension === "nether" ? { dimension, placement: "underground", minY: 32, maxY: 90 } : { dimension })}
                options={[{ value: "overworld", label: "Overworld" }, { value: "nether", label: "Nether" }, { value: "the_end", label: "The End" }]} />
              <Num label="Rarity: about 1 in" suffix="chunks" min={1} value={el.rarity} onChange={(rarity) => patch({ rarity }, "rarity")}
                help="1 = every chunk. Villages are roughly 1 in 50, desert temples 1 in 200." />
              <Select label="Facing" value={el.facing} onChange={(facing) => patch({ facing })}
                options={[{ value: "random", label: "Random" }, { value: "north", label: "North" }, { value: "south", label: "South" }, { value: "east", label: "East" }, { value: "west", label: "West" }]} />
            </Grid>
            <Field label="Where">
              <Segmented value={el.placement} onChange={(placement) => patch({ placement })} options={[
                { value: "surface", label: "On the surface" }, { value: "underground", label: "Underground / at a height" },
              ]} />
            </Field>
            <Grid>
              {el.placement === "surface"
                ? <Slider label="Sink into the ground" min={0} max={Math.max(8, sy)} value={el.sink} onChange={(sink) => patch({ sink }, "sink")} format={(v) => `${v} block${v === 1 ? "" : "s"}`}
                    help="Lower it so floors sit level with the ground." />
                : <>
                    <Num label="Lowest Y" value={el.minY} onChange={(minY) => patch({ minY }, "miny")} />
                    <Num label="Highest Y" value={el.maxY} onChange={(maxY) => patch({ maxY }, "maxy")} />
                  </>}
              <Slider label="Can shift to fit" min={0} max={16} value={el.adjustmentRadius} onChange={(adjustmentRadius) => patch({ adjustmentRadius }, "adj")} format={(v) => `${v} blocks`}
                help="How far it may move to find a spot that meets the rules below." />
            </Grid>
            <ChipList label="Only in biomes tagged" values={el.biomeTags} onChange={(biomeTags) => patch({ biomeTags })} suggestions={BIOME_TAGS} placeholder="any biome"
              help="Empty = anywhere in the dimension. Any one matching tag is enough." />
            <Toggle label="Must sit on the ground" value={el.grounded} onChange={(grounded) => patch({ grounded })} help="No floating over cliffs or water." />
            <Toggle label="Must have open sky above" value={el.unburied} onChange={(unburied) => patch({ unburied })} />
            <ChipList label="May only overlap" values={el.canReplace} onChange={(canReplace) => patch({ canReplace })} kind="block"
              suggestions={["minecraft:air", "minecraft:short_grass", "minecraft:tall_grass", "minecraft:snow_layer", "minecraft:water"]}
              help="Skip spots where it would cut into anything else. Empty = no check." />
          </>
        )}
      </Section>

      <Section title="Place it from logic">
        <p className="field-help">Add the <strong>Place structure</strong> step to any procedure, command or form button (World group). It can rotate the structure and centre it on the player, target or block.</p>
      </Section>
    </>
  );
}
