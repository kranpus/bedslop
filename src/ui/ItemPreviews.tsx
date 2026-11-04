import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ArmorElement } from "../model/types";
import { buildModel, loadTexture } from "../preview/model";
import { generateTexture } from "../textures/procedural";

/** A small orbiting three.js stage; `fill` adds the scene's contents and returns a cleanup. */
function useStage(host: React.RefObject<HTMLDivElement | null>, deps: unknown[], opts: { camera: [number, number, number]; target: [number, number, number]; spin?: boolean },
  fill: (scene: THREE.Scene, alive: () => boolean) => (() => void) | void) {
  const [error, setError] = useState("");
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
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-3, 6, -4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 50);
    camera.position.set(...opts.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(...opts.target);
    controls.autoRotate = !!opts.spin;
    controls.autoRotateSpeed = 2.5;
    let alive = true;
    const cleanup = fill(scene, () => alive);
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
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    return () => {
      alive = false;
      cleanup?.();
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, deps);
  return error;
}

/** A 16×16 icon given thickness, the way Minecraft draws items in the hand and on the ground. */
export function ItemModelPreview({ texture }: { texture?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const error = useStage(host, [texture], { camera: [1.1, 0.5, 1.4], target: [0, 0, 0], spin: true }, (scene, alive) => {
    if (!texture) return;
    const img = new Image();
    let mesh: THREE.InstancedMesh | null = null;
    img.onload = () => {
      if (!alive()) return;
      const w = Math.min(64, img.width), h = Math.min(64, img.height);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      if (!g) return;
      g.drawImage(img, 0, 0, w, h);
      const px = g.getImageData(0, 0, w, h).data;
      const count = Array.from({ length: w * h }, (_, i) => px[i * 4 + 3] > 20).filter(Boolean).length;
      const size = 1 / Math.max(w, h);
      mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size * 1.2), new THREE.MeshLambertMaterial(), count);
      const m = new THREE.Matrix4(), col = new THREE.Color();
      let k = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i + 3] <= 20) continue;
        mesh.setMatrixAt(k, m.makeTranslation((x - w / 2 + 0.5) * size, (h / 2 - y - 0.5) * size, 0));
        mesh.setColorAt(k, col.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace));
        k++;
      }
      scene.add(mesh);
    };
    img.src = texture;
    return () => { mesh?.geometry.dispose(); (mesh?.material as THREE.Material | undefined)?.dispose(); };
  });
  return (
    <div className="model-preview item-preview checker-soft" ref={host} aria-label="3D item preview">
      {error ? <p className="muted pad">{error}</p> : !texture && <p className="muted pad">Add an icon to see it in 3D.</p>}
    </div>
  );
}

// ---------- Armour on a player ----------

type Cube = { origin: number[]; size: number[]; uv: number[]; inflate: number; mirror?: boolean };
const geometry = (id: string, w: number, h: number, bones: { name: string; pivot: number[]; cubes: Cube[] }[]) => ({
  format_version: "1.12.0",
  "minecraft:geometry": [{ description: { identifier: id, texture_width: w, texture_height: h }, bones }],
});

/** Vanilla armour layout (64×32): layer 1 = helmet, chestplate, boots; layer 2 = leggings. */
export function armorGeometry(layer: 1 | 2, on: (slot: keyof ArmorElement["pieces"]) => boolean) {
  const bones: { name: string; pivot: number[]; cubes: Cube[] }[] = [];
  const add = (name: string, pivot: number[], cubes: Cube[]) => { if (cubes.length) bones.push({ name, pivot, cubes }); };
  if (layer === 1) {
    add("head", [0, 24, 0], on("helmet") ? [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0], inflate: 1 }] : []);
    if (on("chestplate")) {
      add("body", [0, 24, 0], [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16], inflate: 1 }]);
      add("rightArm", [-5, 22, 0], [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16], inflate: 1 }]);
      add("leftArm", [5, 22, 0], [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [40, 16], inflate: 1, mirror: true }]);
    }
    if (on("boots")) {
      add("rightLeg", [-1.9, 12, 0], [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16], inflate: 1 }]);
      add("leftLeg", [1.9, 12, 0], [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [0, 16], inflate: 1, mirror: true }]);
    }
  } else if (on("leggings")) {
    add("body", [0, 24, 0], [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16], inflate: 0.5 }]);
    add("rightLeg", [-1.9, 12, 0], [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16], inflate: 0.5 }]);
    add("leftLeg", [1.9, 12, 0], [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [0, 16], inflate: 0.5, mirror: true }]);
  }
  return geometry(`geometry.preview.armor_${layer}`, 64, 32, bones);
}

const MANNEQUIN = geometry("geometry.preview.mannequin", 64, 64, [
  { name: "head", pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0], inflate: 0 }] },
  { name: "body", pivot: [0, 24, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16], inflate: 0 }] },
  { name: "rightArm", pivot: [-5, 22, 0], cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16], inflate: 0 }] },
  { name: "leftArm", pivot: [5, 22, 0], cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [32, 48], inflate: 0 }] },
  { name: "rightLeg", pivot: [-1.9, 12, 0], cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16], inflate: 0 }] },
  { name: "leftLeg", pivot: [1.9, 12, 0], cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48], inflate: 0 }] },
]);

let mannequinSkin = "";

/** A plain player figure wearing the enabled armour pieces with their layer textures. */
export function ArmorPreview({ el, layer1, layer2 }: { el: ArmorElement; layer1?: string; layer2?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const on = (s: keyof ArmorElement["pieces"]) => el.pieces[s].enabled;
  const key = (["helmet", "chestplate", "leggings", "boots"] as const).map((s) => (on(s) ? 1 : 0)).join("");
  const error = useStage(host, [layer1, layer2, key], { camera: [-2.3, 1.9, -3.8], target: [0, 1, 0] }, (scene, alive) => {
    if (!mannequinSkin) { try { mannequinSkin = generateTexture("mob_humanoid", "#9a8a78", 3).dataUrl; } catch { /* no canvas */ } }
    const parts: [unknown, string, string][] = [[MANNEQUIN, "geometry.preview.mannequin", mannequinSkin]];
    if (layer1) parts.push([armorGeometry(1, on), "geometry.preview.armor_1", layer1]);
    if (layer2) parts.push([armorGeometry(2, on), "geometry.preview.armor_2", layer2]);
    const roots: THREE.Object3D[] = [];
    for (const [geo, id, tex] of parts) {
      loadTexture(tex).then((t) => {
        if (!alive()) return;
        try {
          const m = buildModel(geo, id, t);
          roots.push(m.root);
          scene.add(m.root);
        } catch { /* nothing to draw */ }
      });
    }
    return () => roots.forEach((r) => scene.remove(r));
  });
  return (
    <div className="model-preview armor-preview checker-soft" ref={host} aria-label="Armour on a player">
      {error && <p className="muted pad">{error}</p>}
      <span className="preview-hint">Drag to orbit</span>
    </div>
  );
}
