// Plays Bedrock animations and animation controllers on a preview model.
import type { PreviewModel } from "./model";
import { molang, type MolangEnv } from "./molang";

type Val = unknown;
type Frame = Val[] | { pre?: Val; post?: Val; lerp_mode?: string } | Val;
type Channel = Val[] | Record<string, Frame> | Val;
export interface AnimDef {
  loop?: boolean | string;
  animation_length?: number;
  anim_time_update?: string | number;
  blend_weight?: string | number;
  start_delay?: string | number;
  loop_delay?: string | number;
  override_previous_animation?: boolean;
  bones?: Record<string, { rotation?: Channel; position?: Channel; scale?: Channel }>;
}
interface CtrlState {
  animations?: (string | Record<string, Val>)[];
  transitions?: Record<string, string>[];
  on_entry?: string[];
  on_exit?: string[];
}
export interface ControllerDef { initial_state?: string; states?: Record<string, CtrlState> }

export interface PreviewSpec {
  animations: Record<string, string>; // short -> id
  animate: (string | Record<string, Val>)[];
  preAnimation: string[];
  initialize: string[];
  defs: Record<string, AnimDef>;
  controllers: Record<string, ControllerDef>;
}

interface PlayState { time: number; done: boolean; cycles: number }
type Acc = { rot: number[]; pos: number[]; scale: number[] };

const isFrameObj = (f: Frame): f is { pre?: Val; post?: Val; lerp_mode?: string } =>
  !!f && typeof f === "object" && !Array.isArray(f) && ("pre" in (f as object) || "post" in (f as object));
const isKeyframes = (c: Channel): c is Record<string, Frame> =>
  !!c && typeof c === "object" && !Array.isArray(c) && Object.keys(c as object).every((k) => !Number.isNaN(parseFloat(k)));

export function animationLength(def: AnimDef): number {
  if (def.animation_length) return Number(def.animation_length) || 0;
  let max = 0;
  for (const b of Object.values(def.bones ?? {}))
    for (const ch of [b.rotation, b.position, b.scale]) if (isKeyframes(ch)) for (const k of Object.keys(ch)) max = Math.max(max, parseFloat(k));
  return max;
}

export class Animator {
  private plays = new Map<string, PlayState>();
  private ctrl = new Map<string, string>();
  private wasActive = new Set<string>();
  readonly errors = new Set<string>();
  private acc = new Map<string, Acc>();

  constructor(private spec: PreviewSpec, private model: PreviewModel, private env: MolangEnv) {
    for (const s of spec.initialize) this.m(s);
  }

  private m(v: unknown) {
    return molang(v, this.env, (e) => this.errors.add(e));
  }

  reset() {
    this.plays.clear();
    this.ctrl.clear();
    this.wasActive.clear();
  }

  private vec(v: Val, fallback: number): number[] {
    if (Array.isArray(v)) return [0, 1, 2].map((i) => (v[i] === undefined ? fallback : this.m(v[i])));
    if (v === undefined || v === null) return [fallback, fallback, fallback];
    const x = this.m(v);
    return [x, x, x];
  }

  private channel(c: Channel, t: number, fallback: number): number[] {
    if (!isKeyframes(c)) return this.vec(c, fallback);
    const keys = Object.keys(c).map((k) => ({ t: parseFloat(k), f: c[k] })).sort((a, b) => a.t - b.t);
    const pre = (f: Frame) => this.vec(isFrameObj(f) ? (f.pre ?? f.post) : f, fallback);
    const post = (f: Frame) => this.vec(isFrameObj(f) ? (f.post ?? f.pre) : f, fallback);
    if (t <= keys[0].t) return pre(keys[0].f);
    const last = keys[keys.length - 1];
    if (t >= last.t) return post(last.f);
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1];
    const mode = isFrameObj(a.f) ? a.f.lerp_mode : undefined;
    if (mode === "step") return post(a.f);
    const alpha = (t - a.t) / (b.t - a.t || 1);
    const p1 = post(a.f), p2 = pre(b.f);
    const smooth = mode === "catmullrom" || (isFrameObj(b.f) && b.f.lerp_mode === "catmullrom");
    if (!smooth) return p1.map((v, k) => v + (p2[k] - v) * alpha);
    const p0 = i > 0 ? post(keys[i - 1].f) : p1;
    const p3 = i + 2 < keys.length ? pre(keys[i + 2].f) : p2;
    const t2 = alpha * alpha, t3 = t2 * alpha;
    return p1.map((_, k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * alpha + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }

  private accFor(bone: string): Acc {
    let a = this.acc.get(bone);
    if (!a) this.acc.set(bone, (a = { rot: [0, 0, 0], pos: [0, 0, 0], scale: [1, 1, 1] }));
    return a;
  }

  /** Advances and applies one animation. Returns whether it has played through at least once. */
  private playAnim(key: string, def: AnimDef, weight: number, dt: number): boolean {
    let st = this.plays.get(key);
    if (!st) this.plays.set(key, (st = { time: 0, done: false, cycles: 0 }));
    this.wasActive.add(key);
    const length = animationLength(def);
    const q = this.env.query as Record<string, unknown>;
    q.anim_time = st.time;
    q.anim_length = length;
    if (def.anim_time_update !== undefined) st.time = this.m(def.anim_time_update);
    else st.time += dt;
    if (def.loop === true && length > 0) {
      if (st.time >= length) { st.cycles += Math.floor(st.time / length); st.time %= length; }
    } else if (length > 0 && st.time >= length) {
      st.done = true;
      st.cycles = Math.max(1, st.cycles);
      if (def.loop === "hold_on_last_frame") st.time = length;
    }
    q.anim_time = st.time;
    if (st.done && def.loop !== "hold_on_last_frame" && def.loop !== true) return true;
    const w = weight * (def.blend_weight !== undefined ? this.m(def.blend_weight) : 1);
    if (w > 0) {
      for (const [bone, chans] of Object.entries(def.bones ?? {})) {
        if (!this.model.bones.has(bone)) continue;
        const a = this.accFor(bone);
        if (chans.rotation !== undefined) this.channel(chans.rotation, st.time, 0).forEach((v, k) => (a.rot[k] += v * w));
        if (chans.position !== undefined) this.channel(chans.position, st.time, 0).forEach((v, k) => (a.pos[k] += v * w));
        if (chans.scale !== undefined) this.channel(chans.scale, st.time, 1).forEach((v, k) => (a.scale[k] *= 1 + (v - 1) * w));
      }
    }
    return st.cycles > 0 || st.done;
  }

  private run(short: string, weight: number, dt: number, prefix = ""): boolean {
    const id = this.spec.animations[short];
    if (!id) {
      this.errors.add(`"${short}" isn't defined in the mob's animation list.`);
      return true;
    }
    if (id.startsWith("controller.")) return this.runController(short, id, weight, dt);
    const def = this.spec.defs[id];
    if (!def) {
      this.errors.add(`Animation ${id} isn't in any animation file.`);
      return true;
    }
    return this.playAnim(prefix + short, def, weight, dt);
  }

  private runController(short: string, id: string, weight: number, dt: number): boolean {
    const def = this.spec.controllers[id];
    if (!def?.states) {
      this.errors.add(`Controller ${id} isn't in any controller file.`);
      return true;
    }
    let name = this.ctrl.get(short);
    if (!name || !def.states[name]) {
      name = def.initial_state && def.states[def.initial_state] ? def.initial_state : Object.keys(def.states)[0];
      this.ctrl.set(short, name);
      for (const s of def.states[name].on_entry ?? []) this.m(s);
    }
    const state = def.states[name];
    let all = true, any = false;
    for (const entry of state.animations ?? []) {
      const [anim, w] = typeof entry === "string" ? [entry, 1] : [Object.keys(entry)[0], this.m(Object.values(entry)[0])];
      if (!anim) continue;
      const finished = this.run(anim, weight * w, dt, `${short}/${name}/`);
      all &&= finished;
      any ||= finished;
    }
    const q = this.env.query as Record<string, unknown>;
    q.all_animations_finished = all ? 1 : 0;
    q.any_animation_finished = any ? 1 : 0;
    for (const tr of state.transitions ?? []) {
      const [target, cond] = Object.entries(tr)[0] ?? [];
      if (target && def.states[target] && this.m(cond)) {
        for (const s of state.on_exit ?? []) this.m(s);
        for (const s of def.states[target].on_entry ?? []) this.m(s);
        // Restart the animations of the state being entered.
        for (const k of [...this.plays.keys()]) if (k.startsWith(`${short}/${target}/`)) this.plays.delete(k);
        this.ctrl.set(short, target);
        break;
      }
    }
    q.all_animations_finished = 0;
    q.any_animation_finished = 0;
    return false;
  }

  /** Runs the mob's animate list, the way the game does. */
  update(dt: number) {
    for (const s of this.spec.preAnimation) this.m(s);
    this.acc.clear();
    this.wasActive.clear();
    for (const entry of this.spec.animate) {
      const [short, cond] = typeof entry === "string" ? [entry, undefined] : [Object.keys(entry)[0], Object.values(entry)[0]];
      if (!short) continue;
      const w = cond === undefined ? 1 : this.m(cond);
      if (w <= 0) continue;
      this.run(short, w, dt);
    }
    this.forgetInactive();
    this.apply();
  }

  /** Plays one animation on its own, at a fixed time (for scrubbing). */
  pose(id: string, time: number) {
    const def = this.spec.defs[id];
    this.acc.clear();
    if (def) {
      this.plays.set("solo", { time, done: false, cycles: 0 });
      this.playAnim("solo", { ...def, anim_time_update: undefined, loop: "hold_on_last_frame" }, 1, 0);
    }
    this.apply();
  }

  private forgetInactive() {
    // Animations that stopped playing restart from the beginning next time.
    for (const k of [...this.plays.keys()]) if (!this.wasActive.has(k)) this.plays.delete(k);
  }

  private apply() {
    const RAD = Math.PI / 180;
    for (const b of this.model.bones.values()) {
      const a = this.acc.get(b.name);
      b.group.position.copy(b.rest.position);
      b.group.rotation.copy(b.rest.rotation);
      b.group.scale.set(1, 1, 1);
      if (!a) continue;
      b.group.rotation.x -= a.rot[0] * RAD;
      b.group.rotation.y -= a.rot[1] * RAD;
      b.group.rotation.z += a.rot[2] * RAD;
      b.group.position.x -= a.pos[0];
      b.group.position.y += a.pos[1];
      b.group.position.z += a.pos[2];
      b.group.scale.set(a.scale[0], a.scale[1], a.scale[2]);
    }
  }
}
