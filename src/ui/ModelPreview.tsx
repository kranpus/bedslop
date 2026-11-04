import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { geometryIdentifier } from "../export/context";
import { buildModel, loadTexture } from "../preview/model";

/** Static 3D view of a block model, with a 1×1×1 outline for scale and its hitbox. */
export function ModelPreview({ geometry, texture, box, hideBones }: {
  /** Bones to hide, e.g. a door's "open" panel. */
  hideBones?: string[];
  geometry: string;
  texture: string;
  /** Collision box in block pixels, drawn as a green outline. */
  box?: { origin: number[]; size: number[] } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
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
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
    camera.position.set(-1.5, 1.4, -1.9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.5, 0);
    // A block-sized outline (x/z -0.5..0.5, y 0..1) for scale.
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x8a9480, transparent: true, opacity: 0.6 }));
    outline.position.set(0, 0.5, 0);
    scene.add(outline);
    const grid = new THREE.GridHelper(3, 3, 0x9aa48f, 0xc4cbb9);
    scene.add(grid);

    let model: THREE.Object3D | null = null, hitbox: THREE.Object3D | null = null, disposed = false;
    const id = geometryIdentifier(geometry);
    if (id) {
      loadTexture(texture).then((tex) => {
        if (disposed) return;
        try {
          const m = buildModel(JSON.parse(geometry), id, tex);
          for (const name of hideBones ?? []) { const b = m.bones.get(name); if (b) b.group.visible = false; }
          model = m.root;
          scene.add(model);
          setError("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "The model couldn't be drawn.");
        }
      });
    }
    if (box) {
      // Bedrock block pixels → preview units (X mirrored like the model).
      const [ox, oy, oz] = box.origin, [sx, sy, sz] = box.size;
      hitbox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx / 16, sy / 16, sz / 16)), new THREE.LineBasicMaterial({ color: 0x3fa34d }));
      hitbox.position.set(-(ox + sx / 2) / 16, (oy + sy / 2) / 16, (oz + sz / 2) / 16);
      scene.add(hitbox);
    }

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
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [geometry, texture, box?.origin.join(), box?.size.join(), hideBones?.join()]);

  return (
    <div className="model-preview checker-soft" ref={host} aria-label="3D model preview">
      {error && <p className="muted pad">{error}</p>}
      <span className="preview-hint">Drag to orbit · green = hitbox</span>
    </div>
  );
}
