import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ParticleElement } from "../model/types";
import { SPRITE_SIZE, spritePixels } from "../model/particleSprites";

const MAX = 3000;

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; rot: number; spin: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const hexRgb = (hex: string) => {
  const n = parseInt((hex || "#ffffff").replace("#", "").padEnd(6, "f").slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function spawnPoint(e: ParticleElement): [number, number, number] {
  const r = Math.max(0, e.radius);
  if (e.shape === "box") {
    const p = [rand(-r, r), rand(-r, r), rand(-r, r)];
    if (e.surfaceOnly) { const ax = Math.floor(Math.random() * 3); p[ax] = Math.random() < 0.5 ? -r : r; }
    return p as [number, number, number];
  }
  if (e.shape === "disc") {
    const a = Math.random() * Math.PI * 2, d = e.surfaceOnly ? r : r * Math.sqrt(Math.random());
    return [Math.cos(a) * d, 0, Math.sin(a) * d];
  }
  // Sphere: random direction, radius uniform by volume (or on the surface).
  const u = rand(-1, 1), t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  const d = e.surfaceOnly ? r : r * Math.cbrt(Math.random());
  return [s * Math.cos(t) * d, u * d, s * Math.sin(t) * d];
}

function direction(e: ParticleElement, p: [number, number, number]): [number, number, number] {
  let d: number[];
  if (e.direction === "up") { const s = Math.max(0, Math.min(1, e.spread)); d = [rand(-s, s), 1, rand(-s, s)]; }
  else {
    d = Math.hypot(...p) > 1e-4 ? p : [rand(-1, 1), rand(-1, 1), rand(-1, 1)];
    if (e.direction === "inwards") d = d.map((v) => -v);
  }
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / len, d[1] / len, d[2] / len];
}

const VERT = `
attribute vec3 iPos; attribute float iSize; attribute vec4 iColor; attribute float iRot; attribute float iFrame;
uniform float frames;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vUv = vec2((uv.x + iFrame) / frames, uv.y); vColor = iColor;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iRot), s = sin(iRot);
  vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  mv.xy += p * iSize;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map; uniform float cutout;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv) * vColor;
  if (cutout > 0.5 ? t.a < 0.5 : t.a < 0.01) discard;
  gl_FragColor = cutout > 0.5 ? vec4(t.rgb, 1.0) : t;
}`;

/** Live preview of a particle effect, simulated with the same motion rules as the game. */
export function ParticlePreview({ el, texture, replay }: { el: ParticleElement; texture?: string; replay: number }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(el);
  live.current = el;
  const [error, setError] = useState("");
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const node = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("The preview needs WebGL, which this browser has turned off.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    node.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const grid = new THREE.GridHelper(6, 6, 0x6d7a68, 0x48524a);
    scene.add(grid);
    const block = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x8a9480, transparent: true, opacity: 0.4 }));
    block.position.set(0, 0.5, 0);
    scene.add(block);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    camera.position.set(-3.2, 2.6, -3.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    // Instanced camera-facing quads.
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute("position", plane.getAttribute("position"));
    geo.setAttribute("uv", plane.getAttribute("uv"));
    const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    const iSize = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    const iColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    const iRot = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    const iFrame = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    for (const a of [iPos, iSize, iColor, iRot, iFrame]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iFrame", iFrame);
    geo.setAttribute("iPos", iPos); geo.setAttribute("iSize", iSize); geo.setAttribute("iColor", iColor); geo.setAttribute("iRot", iRot);
    geo.instanceCount = 0;
    const map = new THREE.DataTexture(spritePixels("dot"), SPRITE_SIZE, SPRITE_SIZE, THREE.RGBAFormat);
    map.magFilter = THREE.NearestFilter;
    map.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { map: { value: map }, cutout: { value: 0 }, frames: { value: 1 } }, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);

    let parts: P[] = [], clock = 0, carry = 0, last = performance.now(), raf = 0;
    const emit = (n: number) => {
      const e = live.current;
      for (let i = 0; i < n && parts.length < MAX; i++) {
        const sp = spawnPoint(e);
        const d = direction(e, sp);
        const speed = rand(Math.min(e.speedMin, e.speedMax), Math.max(e.speedMin, e.speedMax));
        parts.push({
          x: sp[0], y: sp[1] + 1, z: sp[2], vx: d[0] * speed, vy: d[1] * speed, vz: d[2] * speed, age: 0,
          life: Math.max(0.05, rand(Math.min(e.lifetimeMin, e.lifetimeMax), Math.max(e.lifetimeMin, e.lifetimeMax))),
          rot: e.spin > 0 ? Math.random() * Math.PI * 2 : 0, spin: e.spin > 0 ? rand(-e.spin, e.spin) * Math.PI / 180 : 0,
        });
      }
    };
    const restart = () => { parts = []; clock = 0; carry = 0; if (live.current.mode === "burst") emit(Math.max(1, Math.min(1000, Math.round(live.current.count)))); };
    restart();
    (node as HTMLDivElement & { restart?: () => void }).restart = restart;

    const resize = () => {
      const w = node.clientWidth, h = node.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(node);
    resize();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const e = live.current;
      clock += dt;
      const lifeMax = Math.max(e.lifetimeMin, e.lifetimeMax);
      if (e.mode === "stream") {
        if (clock <= Math.max(0.05, e.duration)) { carry += Math.max(0, Math.min(500, e.rate)) * dt; const n = Math.floor(carry); carry -= n; emit(n); }
        if (clock > e.duration + lifeMax + 0.5) restart();
      } else if (clock > lifeMax + 0.7) restart();

      const frameCount = e.sprite === "custom" ? Math.max(1, Math.round(e.frames ?? 1)) : 1;
      mat.uniforms.frames.value = frameCount;
      const [r0, g0, b0] = hexRgb(e.colorStart), [r1, g1, b1] = hexRgb(e.colorEnd);
      const a0 = e.alphaStart / 100, a1 = e.alphaEnd / 100;
      let n = 0;
      const keep: P[] = [];
      for (const p of parts) {
        p.age += dt;
        if (p.age >= p.life) continue;
        // Same as the game: acceleration minus drag × velocity.
        p.vx += (-e.drag * p.vx) * dt;
        p.vy += (-e.gravity - e.drag * p.vy) * dt;
        p.vz += (-e.drag * p.vz) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rot += p.spin * dt;
        if (e.collide !== "none" && p.y < 0) {
          if (e.collide === "vanish") continue;
          p.y = 0; p.vy = -p.vy * Math.max(0, Math.min(1, e.bounce));
        }
        keep.push(p);
        const t = p.age / p.life;
        iPos.setXYZ(n, -p.x, p.y, p.z);
        iSize.setX(n, Math.max(0.005, e.sizeStart + (e.sizeEnd - e.sizeStart) * t));
        iColor.setXYZW(n, r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, a0 + (a1 - a0) * t);
        iRot.setX(n, p.rot);
        iFrame.setX(n, Math.min(frameCount - 1, Math.floor(t * frameCount)));
        n++;
      }
      parts = keep;
      geo.instanceCount = n;
      for (const a of [iPos, iSize, iColor, iRot, iFrame]) a.needsUpdate = true;
      mat.uniforms.cutout.value = e.blend === "alpha" ? 1 : 0;
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    // Texture for this sprite.
    let disposed = false;
    const setMap = (t: THREE.Texture) => { if (disposed) return; t.magFilter = THREE.NearestFilter; t.needsUpdate = true; mat.uniforms.map.value = t; };
    const sprite = live.current.sprite;
    if (sprite === "custom") {
      if (texture) new THREE.TextureLoader().load(texture, (t) => { t.colorSpace = THREE.NoColorSpace; setMap(t); });
    } else {
      setMap(new THREE.DataTexture(spritePixels(sprite), SPRITE_SIZE, SPRITE_SIZE, THREE.RGBAFormat));
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      geo.dispose(); plane.dispose(); mat.dispose(); map.dispose();
      renderer.dispose();
      node.removeChild(renderer.domElement);
    };
  }, [el.sprite, texture]);

  // Replay when asked, and when the emission settings change shape.
  useEffect(() => { (host.current as (HTMLDivElement & { restart?: () => void }) | null)?.restart?.(); }, [replay, el.mode, el.count]);

  return (
    <div className="stack tight">
      <div className={`model-preview particle-preview${dark ? " dark" : ""}`} ref={host} aria-label="Particle preview">
        {error && <p className="muted pad">{error}</p>}
        <span className="preview-hint">Drag to orbit · outline = one block</span>
      </div>
      <button type="button" className="btn ghost small" onClick={() => setDark(!dark)}>{dark ? "Light background" : "Dark background"}</button>
    </div>
  );
}
