import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { EntityElement } from "../model/types";
import { useStore } from "../store/store";
import { mobPreviewData } from "../preview/data";
import { buildModel, loadTexture, type PreviewModel } from "../preview/model";
import { Animator, animationLength } from "../preview/animator";
import type { MolangEnv } from "../preview/molang";

interface Sim {
  walking: boolean;
  inWater: boolean;
  onFire: boolean;
  dead: boolean;
  look: boolean;
  paused: boolean;
  speed: number;
  mode: "game" | "single";
  solo: string;
  soloTime: number;
  soloPlaying: boolean;
}

export function MobPreview({ el }: { el: EntityElement }) {
  const project = useStore((s) => s.project!);
  const textureUrl = project.textures.find((t) => t.id === el.texture)?.dataUrl ?? "";
  // Rebuild only when this mob, its texture or the namespace changes.
  const data = useMemo(() => {
    try { return mobPreviewData(project, el); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, textureUrl, project.namespace]);

  const mount = useRef<HTMLDivElement>(null);
  const three = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);
  const live = useRef<{ model: PreviewModel; animator: Animator; env: MolangEnv } | null>(null);
  const [sim, setSim] = useState<Sim>({
    walking: false, inWater: false, onFire: false, dead: false, look: true,
    paused: false, speed: 1, mode: "game", solo: "", soloTime: 0, soloPlaying: true,
  });
  const simRef = useRef(sim);
  simRef.current = sim;
  // One-off events from buttons, consumed by the render loop.
  const events = useRef({ attack: false, hurt: false, attackAt: -9, hurtAt: -9 });
  const speedRef = useRef(el.speed);
  speedRef.current = el.speed;
  const [problems, setProblems] = useState<string[]>([]);
  const [soloLength, setSoloLength] = useState(1);
  const [webglError, setWebglError] = useState("");

  const soloChoices = useMemo(() => {
    if (!data) return [];
    // Prefer the names used in the mob's animation list.
    const byId = new Map(Object.entries(data.spec.animations).filter(([, id]) => !id.startsWith("controller.")).map(([short, id]) => [id, short]));
    return Object.keys(data.spec.defs).map((id) => ({ id, label: byId.get(id) ?? id.split(".").pop() ?? id }));
  }, [data]);

  // Renderer, camera and loop: created once.
  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglError("3D preview needs WebGL, which this browser or device has turned off.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-3, 6, -4);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(4, 2, 5);
    scene.add(fill);
    const grid = new THREE.GridHelper(6, 6, 0x6c7a62, 0x9aa48f);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    camera.position.set(-2.4, 1.8, -3.2); // in front of the mob (mobs face north / -z)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.9, 0);
    three.current = { renderer, scene, camera, controls };

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);

    let last = performance.now(), simTime = 0, distance = 0, raf = 0, reported = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const realDt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible) return;
      const s = simRef.current;
      const L = live.current;
      if (L && !s.paused) {
        const dt = realDt * s.speed;
        simTime += dt;
        const blocksPerSecond = 2 + speedRef.current * 8;
        // Like Java's limb swing: grows ~4 units per block walked, at most 20 per second.
        if (s.walking) distance += dt * Math.min(20, blocksPerSecond * 4);
        const ev = events.current;
        if (ev.attack) { ev.attack = false; ev.attackAt = simTime; }
        if (ev.hurt) { ev.hurt = false; ev.hurtAt = simTime; }
        const q = L.env.query as Record<string, unknown>;
        Object.assign(q, {
          life_time: simTime, delta_time: dt, is_moving: s.walking ? 1 : 0, modified_move_speed: s.walking ? 0.8 : 0,
          modified_distance_moved: distance, ground_speed: s.walking ? blocksPerSecond : 0, walk_distance: distance,
          is_on_ground: 1, is_alive: s.dead ? 0 : 1, is_in_water: s.inWater ? 1 : 0, is_on_fire: s.onFire ? 1 : 0,
          hurt_time: Math.max(0, 10 - (simTime - ev.hurtAt) * 20),
          target_x_rotation: s.look ? Math.sin(simTime * 0.9) * 18 : 0, target_y_rotation: s.look ? Math.sin(simTime * 0.6) * 45 : 0,
          health: s.dead ? 0 : 20, max_health: 20, is_sneaking: 0, is_baby: 0, is_swimming: s.inWater ? 1 : 0, variant: 0, mark_variant: 0,
        });
        // Like the game: attack_time ramps 0 → 1 during a melee swing, otherwise 0.
        const since = simTime - ev.attackAt;
        L.env.variable.attack_time = since >= 0 && since < 0.35 ? Math.max(0.001, since / 0.35) : 0;
        if (s.mode === "single" && s.solo) {
          const len = Math.max(0.05, animationLength(data?.spec.defs[s.solo] ?? {}));
          if (s.soloPlaying) {
            simRef.current.soloTime = (s.soloTime + dt) % (len + 0.4);
            if (Math.round(simRef.current.soloTime * 10) !== Math.round(s.soloTime * 10)) setSim((x) => ({ ...x, soloTime: simRef.current.soloTime }));
          }
          L.animator.pose(s.solo, Math.min(len, simRef.current.soloTime));
        } else {
          L.animator.update(dt);
        }
        if (now - reported > 1000) {
          reported = now;
          setProblems((p) => (p.length === L.animator.errors.size ? p : [...L.animator.errors]));
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      three.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Model + animator: rebuilt when the mob's data changes.
  useEffect(() => {
    const t = three.current;
    if (!t || !data) return;
    let cancelled = false;
    let model: PreviewModel | null = null;
    loadTexture(data.texture).then((tex) => {
      if (cancelled) return;
      try {
        model = buildModel(data.geometry, data.geometryId, tex);
      } catch (e) {
        setProblems([e instanceof Error ? e.message : "The model couldn't be drawn."]);
        return;
      }
      t.scene.add(model.root);
      const env: MolangEnv = { query: {}, variable: {} };
      const animator = new Animator(data.spec, model, env);
      const prev = live.current;
      live.current = { model, animator, env };
      setProblems([]);
      // Frame the camera on first build only, so edits don't reset the user's view.
      if (!prev) {
        const h = Math.max(0.5, model.size.y), w = Math.max(model.size.x, model.size.z);
        t.controls.target.set(0, model.center.y, 0);
        const dist = Math.max(h, w) * 2.1 + 0.6;
        t.camera.position.set(-dist * 0.55, model.center.y + h * 0.35, -dist * 0.8);
      }
    });
    return () => {
      cancelled = true;
      if (model) {
        t.scene.remove(model.root);
        model.root.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
      }
    };
  }, [data]);

  useEffect(() => {
    if (sim.mode === "single" && !soloChoices.some((c) => c.id === sim.solo) && soloChoices[0]) setSim((s) => ({ ...s, solo: soloChoices[0].id, soloTime: 0 }));
  }, [sim.mode, sim.solo, soloChoices]);
  useEffect(() => {
    setSoloLength(Math.max(0.05, animationLength(data?.spec.defs[sim.solo] ?? {})));
  }, [data, sim.solo]);

  const set = (p: Partial<Sim>) => setSim((s) => ({ ...s, ...p }));
  const view = (dir: "front" | "side" | "back" | "top") => {
    const t = three.current, m = live.current?.model;
    if (!t || !m) return;
    const d = Math.max(m.size.y, m.size.x, m.size.z) * 2.2 + 0.6, y = m.center.y;
    t.controls.target.set(0, y, 0);
    // Mobs face north (-z), so "front" looks at them from -z.
    const pos = { front: [0, y, -d], side: [-d, y, 0], back: [0, y, d], top: [0.001, y + d, -0.001] }[dir];
    t.camera.position.set(pos[0], pos[1], pos[2]);
  };
  const toggle = (k: "walking" | "inWater" | "onFire" | "dead" | "look", label: string) => (
    <button type="button" className={`btn small tool${sim[k] ? " on" : ""}`} aria-pressed={sim[k]} onClick={() => set({ [k]: !sim[k] })}>{label}</button>
  );

  return (
    <div className="mob-preview">
      <div className="preview-stage checker-soft" ref={mount}>
        {webglError && <p className="muted pad">{webglError}</p>}
        {!data && !webglError && <p className="muted pad preview-empty">Nothing to show yet. Pick a model above.</p>}
        <span className="preview-hint">Drag to orbit · scroll to zoom</span>
      </div>
      <div className="preview-controls">
        <div className="row between">
          <div className="segmented" role="radiogroup" aria-label="Preview mode">
            <button type="button" role="radio" aria-checked={sim.mode === "game"} className={sim.mode === "game" ? "on" : ""} onClick={() => set({ mode: "game" })}>As in game</button>
            <button type="button" role="radio" aria-checked={sim.mode === "single"} className={sim.mode === "single" ? "on" : ""} onClick={() => set({ mode: "single", soloTime: 0 })} disabled={!soloChoices.length}>Single animation</button>
          </div>
          <div className="row">
            {(["front", "side", "back", "top"] as const).map((v) => (
              <button key={v} type="button" className="btn small ghost" onClick={() => view(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
            <button type="button" className="btn small" onClick={() => set({ paused: !sim.paused })}>{sim.paused ? "Play" : "Pause"}</button>
            <select value={sim.speed} onChange={(e) => set({ speed: Number(e.target.value) })} aria-label="Playback speed" className="small-select">
              {[0.1, 0.25, 0.5, 1, 2].map((v) => <option key={v} value={v}>{v}×</option>)}
            </select>
          </div>
        </div>
        {sim.mode === "game" ? (
          <div className="row wrap">
            {toggle("walking", "Walking")}
            <button type="button" className="btn small" onClick={() => (events.current.attack = true)}>Attack</button>
            <button type="button" className="btn small" onClick={() => (events.current.hurt = true)}>Hurt</button>
            {toggle("inWater", "In water")}
            {toggle("onFire", "On fire")}
            {toggle("dead", "Dying")}
            {toggle("look", "Looks around")}
          </div>
        ) : (
          <div className="row wrap">
            <select value={sim.solo} onChange={(e) => set({ solo: e.target.value, soloTime: 0 })} aria-label="Animation">
              {soloChoices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <button type="button" className="btn small" onClick={() => set({ soloPlaying: !sim.soloPlaying })}>{sim.soloPlaying ? "Stop" : "Loop"}</button>
            <span className="slider grow">
              <input type="range" min={0} max={soloLength} step={0.01} value={Math.min(sim.soloTime, soloLength)} aria-label="Animation time"
                onChange={(e) => { const v = Number(e.target.value); simRef.current.soloTime = v; set({ soloTime: v, soloPlaying: false }); }} />
              <output>{Math.min(sim.soloTime, soloLength).toFixed(2)}s / {soloLength.toFixed(2)}s</output>
            </span>
          </div>
        )}
        {problems.length > 0 && (
          <ul className="problems">{problems.slice(0, 4).map((p) => <li key={p} className="warning">{p}</li>)}</ul>
        )}
      </div>
    </div>
  );
}
