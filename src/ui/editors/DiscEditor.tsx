import { useState } from "react";
import type { DiscElement } from "../../model/types";
import { DISC_SLOTS } from "../../model/vanilla";
import { discSlots, slotLabel } from "../../export/disc";
import { Field, Grid, Num, Section, Slider } from "../fields";
import { TexturePicker } from "../TexturePicker";
import { useStore } from "../../store/store";
import type { Patch } from "./types";

const fmt = (s: number) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

/** Reads an audio file's length, or 0 if this browser can't decode it. */
function audioLength(url: string): Promise<number> {
  return new Promise((res) => {
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => res(0);
    a.src = url;
    setTimeout(() => res(0), 8000);
  });
}

export function DiscEditor({ el, patch }: { el: DiscElement; patch: Patch<DiscElement> }) {
  const project = useStore((s) => s.project!);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const slots = discSlots(project);
  const slot = slots.get(el.id) ?? DISC_SLOTS[0];
  const usedBy = (s: string) => project.elements.filter((e) => e.kind === "disc" && e.id !== el.id && slots.get(e.id) === s).map((e) => e.displayName);

  const load = async (f: File) => {
    setMsg(null);
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    if (String.fromCharCode(...head) !== "OggS") {
      setMsg({ ok: false, text: `${f.name} isn't an .ogg file. Minecraft only plays Ogg Vorbis; Audacity can export it (File → Export → Ogg).` });
      return;
    }
    const file = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    const duration = Math.round((await audioLength(file)) * 10) / 10;
    patch({ file, fileName: f.name, ...(duration > 0 ? { duration } : {}) });
    setMsg(duration > 0
      ? { ok: true, text: `Loaded ${f.name} (${fmt(duration)}).` }
      : { ok: true, text: `Loaded ${f.name}. This browser couldn't read its length, so type it in below.` });
  };

  return (
    <>
      <Section title="Song" hint="Any length works. Long songs make the add-on bigger.">
        <div className="row wrap">
          <label className={`btn${el.file ? "" : " primary"}`}>
            {el.file ? "Replace song…" : "Choose .ogg song…"}
            <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) load(f); }} />
          </label>
          {el.file && <span className="mono">{el.fileName}</span>}
        </div>
        {msg && <p className={msg.ok ? "ok-text" : "warn-text"} role="status">{msg.text}</p>}
        {el.file && <audio controls src={el.file} className="audio" />}
        <Grid>
          <Num label="Length" suffix="seconds" min={0} step={0.1} value={el.duration} onChange={(duration) => patch({ duration }, "dur")}
            help={el.duration > 0 ? `${fmt(el.duration)}. Filled in when you load the song.` : "Filled in when you load the song."} />
          <Slider label="Volume" min={10} max={100} value={el.volume} onChange={(volume) => patch({ volume }, "vol")} format={(v) => `${v}%`} help="Vanilla discs play at 50%." />
          <Slider label="Comparator signal" min={1} max={15} value={el.comparator} onChange={(comparator) => patch({ comparator }, "cmp")} help="What a comparator reads from a jukebox playing this disc." />
        </Grid>
      </Section>

      <Section title="Disc">
        <TexturePicker label="Icon" kind="item" template="disc" value={el.texture || undefined} suggestedName={el.name} onChange={(texture) => patch({ texture })} />
        <Field label="Plays through" help="Bedrock discs can only use the built-in disc sounds, so your song takes over one of them. That vanilla disc will play your song too while the add-on is on, so pick one you don't mind losing.">
          <select value={el.replaces || ""} onChange={(e) => patch({ replaces: e.target.value })}>
            <option value="">Automatic ({slotLabel(slot)})</option>
            {DISC_SLOTS.map((s) => {
              const users = usedBy(s);
              return <option key={s} value={s}>Disc {slotLabel(s)}{users.length ? ` (used by ${users.join(", ")})` : ""}</option>;
            })}
          </select>
        </Field>
      </Section>
    </>
  );
}
