import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { blockColor, type StructureInfo } from "../export/structure";

const HIDDEN = new Set(["minecraft:air", "minecraft:structure_void", "minecraft:light_block", "minecraft:barrier"]);
/** Above this many blocks only the outer shell is drawn, to keep the preview fast. */
const MAX_CUBES = 120_000;

/** Coloured-cube 3D view of a structure (colours are guessed from block names). */
/** Size and offset (in block units) for blocks that aren't full cubes. */
function shapeOf(name: string): { h: number; w: number } {
  const n = name.replace(/^[^:]+:/, "");
  if (/slab/.test(n) && !/double/.test(n)) return { h: 0.5, w: 1 };
  if (/carpet|pressure_plate|rail|snow_layer|trapdoor|lily_pad|moss_carpet/.test(n)) return { h: 0.1, w: 1 };
  if (/torch|lantern|candle|flower_pot|button|lever/.test(n)) return { h: 0.6, w: 0.25 };
  if (/fence|wall|pane|bars|chain/.test(n) && !/wall_banner|wall_sign/.test(n)) return { h: 1, w: 0.3 };
  return { h: 1, w: 1 };
}

export function StructurePreview({ info, highlight, colors }: {
  info: StructureInfo;
  highlight?: number | null;
  /** Colour overrides by block name, e.g. the average colour of a custom block's texture. */
  colors?: Record<string, [number, number, number]>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("3D preview needs WebGL, which this browser has turned off.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 8, -3);
    scene.add(sun);

    const [sx, sy, sz] = info.size;
    const { blocks, palette } = info;
    const hidden = palette.map((n) => HIDDEN.has(n));
    const visible = (x: number, y: number, z: number) => {
      if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return false;
      const p = blocks[(x * sy + y) * sz + z];
      return p >= 0 && !hidden[p];
    };
    let total = 0;
    for (const p of blocks) if (p >= 0 && !hidden[p]) total++;
    const shellOnly = total > MAX_CUBES;
    setNote(shellOnly ? `Large structure: showing its outside only (${total.toLocaleString()} blocks).` : "");

    // Group cube positions by palette entry, then one instanced mesh per colour.
    const groups = new Map<number, number[]>();
    for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
      const p = blocks[(x * sy + y) * sz + z];
      if (p < 0 || hidden[p]) continue;
      if (shellOnly && visible(x + 1, y, z) && visible(x - 1, y, z) && visible(x, y + 1, z) && visible(x, y - 1, z) && visible(x, y, z + 1) && visible(x, y, z - 1)) continue;
      let g = groups.get(p);
      if (!g) groups.set(p, (g = []));
      g.push(x, y, z);
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const root = new THREE.Group();
    // Bedrock's +x is to the east; mirror x so the view matches the game like other previews.
    root.position.set(sx / 2 - 0.5, 0.5, -sz / 2 + 0.5);
    root.scale.set(-1, 1, 1);
    const m4 = new THREE.Matrix4();
    const disposables: { dispose(): void }[] = [box];
    for (const [p, pos] of groups) {
      const own = colors?.[palette[p]];
      const [r, g, b, a] = own ? [...own, 1] : blockColor(palette[p]);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(r / 255, g / 255, b / 255), transparent: a < 1, opacity: a, depthWrite: a >= 1 });
      const mesh = new THREE.InstancedMesh(box, mat, pos.length / 3);
      const { h, w } = shapeOf(palette[p]);
      const scale = new THREE.Matrix4().makeScale(w, h, w);
      for (let i = 0; i < pos.length; i += 3) {
        mesh.setMatrixAt(i / 3, m4.makeTranslation(pos[i], pos[i + 1] - (1 - h) / 2, pos[i + 2]).multiply(scale));
      }
      root.add(mesh);
      disposables.push(mat, mesh);
    }
    if (highlight != null) {
      const [hx, hy, hz] = [Math.floor(highlight / (sy * sz)), Math.floor(highlight / sz) % sy, highlight % sz];
      const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.12, 1.12, 1.12)), new THREE.LineBasicMaterial({ color: 0xffd400, depthTest: false }));
      ring.position.set(hx, hy, hz);
      ring.renderOrder = 2;
      root.add(ring);
    }
    scene.add(root);
    const bounds = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), new THREE.LineBasicMaterial({ color: 0x8a9480, transparent: true, opacity: 0.5 }));
    bounds.position.set(0, sy / 2, 0);
    scene.add(bounds);
    const grid = new THREE.GridHelper(Math.max(sx, sz) + 4, Math.max(sx, sz) + 4, 0x9aa48f, 0xc4cbb9);
    scene.add(grid);

    const radius = Math.max(3, Math.hypot(sx, sy, sz) / 2);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, radius * 30);
    // Far enough that the bounding sphere fits the 38° view, from above the south-west corner.
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(19)) * 1.05;
    camera.position.set(-0.55, 0.5, -0.67).normalize().multiplyScalar(dist).add(new THREE.Vector3(0, sy / 2, 0));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, sy / 2, 0);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [info, highlight, colors]);

  return (
    <div className="stack tight">
      <div className="model-preview structure-preview checker-soft" ref={host} aria-label="3D structure preview">
        {error && <p className="muted pad">{error}</p>}
        <span className="preview-hint">Drag to orbit · scroll to zoom · colours are approximate</span>
      </div>
      {note && <span className="field-help shape-help">{note}</span>}
    </div>
  );
}
