// Animation assignment for custom-model mobs: which animation plays when.
// Pure functions shared by the mob editor (to show what will play) and the exporter.
import type { AnimationSlot, AnimWhen, AutoRig, EntityElement, RigRole } from "../model/types";

export const AUTO_WALK = "@auto_walk";
export const AUTO_LOOK = "@auto_look";

export const WHEN: { value: AnimWhen; label: string; molang: string }[] = [
  { value: "moving", label: "While walking", molang: "query.is_moving" },
  { value: "idle", label: "While standing still", molang: "!query.is_moving" },
  { value: "always", label: "All the time", molang: "" },
  { value: "attacking", label: "When attacking", molang: "variable.attack_time > 0" },
  { value: "hurt", label: "When hurt", molang: "query.hurt_time > 0" },
  { value: "in_water", label: "While in water", molang: "query.is_in_water" },
  { value: "on_fire", label: "While on fire", molang: "query.is_on_fire" },
  { value: "dying", label: "When dying", molang: "!query.is_alive" },
  { value: "custom", label: "Custom rule (Molang)", molang: "" },
  { value: "never", label: "Never (off)", molang: "" },
];

export const RIG_ROLES: { role: RigRole; label: string }[] = [
  { role: "head", label: "Head" },
  { role: "rightArm", label: "Right arm" },
  { role: "leftArm", label: "Left arm" },
  { role: "rightLeg", label: "Right leg" },
  { role: "leftLeg", label: "Left leg" },
];

export interface ImportedAnimation { id: string; short: string; loop: boolean; def: Record<string, unknown> }

export function listBones(geometryJson: string): string[] {
  try {
    const bones = JSON.parse(geometryJson)["minecraft:geometry"]?.[0]?.bones ?? [];
    return bones.map((b: { name: string }) => b.name).filter(Boolean);
  } catch {
    return [];
  }
}

export function listAnimations(animJson: string): ImportedAnimation[] {
  try {
    const anims = JSON.parse(animJson).animations ?? {};
    return Object.entries(anims).map(([id, def]) => ({
      id,
      short: id.split(".").pop() ?? id,
      loop: (def as { loop?: unknown }).loop === true,
      def: def as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}

export function listControllers(json: string | undefined): string[] {
  if (!json?.trim()) return [];
  try {
    return Object.keys(JSON.parse(json).animation_controllers ?? {});
  } catch {
    return [];
  }
}

/** Animation short names that uploaded controllers play themselves. */
export function controlledNames(json: string | undefined): Set<string> {
  const names = new Set<string>();
  if (!json?.trim()) return names;
  try {
    for (const c of Object.values(JSON.parse(json).animation_controllers ?? {}) as { states?: Record<string, { animations?: unknown[] }> }[]) {
      for (const st of Object.values(c.states ?? {})) {
        for (const a of st.animations ?? []) {
          if (typeof a === "string") names.add(a);
          else if (a && typeof a === "object") Object.keys(a).forEach((k) => names.add(k));
        }
      }
    }
  } catch { /* unreadable: nothing controlled */ }
  return names;
}

/** Short names for uploaded animations/controllers, so uploaded controllers can find them by name. */
export function shortNames(ids: string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const id of ids) {
    const base = (id.split(".").pop() || "anim").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    let name = /^slot\d/.test(base) ? `${base}_` : base, i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    out.set(id, name);
  }
  return out;
}

/** Detects head/arms/legs by bone name; explicit choices in `rig.bones` win. */
export function resolveRig(bones: string[], rig?: AutoRig): Partial<Record<RigRole, string>> {
  const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pick = (test: (n: string) => boolean) => bones.filter((b) => test(norm(b))).sort((a, b) => a.length - b.length)[0];
  const side = (n: string, s: "left" | "right") => n.includes(s) || new RegExp(`^${s[0]}(arm|leg)|(arm|leg)${s[0]}$`).test(n);
  const limb = (kind: "arm" | "leg", s: "left" | "right") =>
    pick((n) => n.includes(kind) && !n.includes("armor") && side(n, s) && !/lower|fore|hand|foot|claw|finger/.test(n));
  const detected: Record<RigRole, string | undefined> = {
    head: pick((n) => n === "head" || n.startsWith("head")),
    rightArm: limb("arm", "right"),
    leftArm: limb("arm", "left"),
    rightLeg: limb("leg", "right"),
    leftLeg: limb("leg", "left"),
  };
  const out: Partial<Record<RigRole, string>> = {};
  for (const { role } of RIG_ROLES) {
    const chosen = rig?.bones[role];
    const bone = chosen === undefined ? detected[role] : chosen;
    if (bone && bones.includes(bone)) out[role] = bone;
  }
  return out;
}

const guessWhen = (short: string, loop: boolean): { when: AnimWhen; mode: "loop" | "once" } => {
  const n = short.toLowerCase();
  if (/death|die|dying/.test(n)) return { when: "dying", mode: "once" };
  if (/attack|bite|swing|slash|hit$/.test(n)) return { when: "attacking", mode: "once" };
  if (/hurt|damage|flinch/.test(n)) return { when: "hurt", mode: "once" };
  if (/swim/.test(n)) return { when: "in_water", mode: "loop" };
  if (/walk|move|run|gallop/.test(n)) return { when: "moving", mode: "loop" };
  if (/idle|breath|stand/.test(n)) return { when: "idle", mode: "loop" };
  if (/look/.test(n)) return { when: "always", mode: "loop" };
  return loop ? { when: "always", mode: "loop" } : { when: "never", mode: "once" };
};

let slotSeq = 0;
const slot = (animation: string, when: AnimWhen, mode: "loop" | "once"): AnimationSlot => ({
  id: `s${Date.now().toString(36)}${(slotSeq++).toString(36)}`, animation, when, condition: "", mode, speed: 1, matchMovement: false,
});

/** The automatic assignment, also used to pre-fill manual mode. */
export function defaultSlots(e: Pick<EntityElement, "customGeometry" | "customAnimations" | "customControllers" | "autoRig">): AnimationSlot[] {
  const imported = listAnimations(e.customAnimations);
  const names = shortNames(imported.map((a) => a.id));
  const controlled = controlledNames(e.customControllers);
  const slots = imported.map((a) => {
    // Already played by an uploaded controller: leave it to the controller.
    if (controlled.has(names.get(a.id)!)) return slot(a.id, "never", a.loop ? "loop" : "once");
    const g = guessWhen(a.short, a.loop);
    // Keep each animation's own loop setting so it plays exactly as authored.
    return slot(a.id, g.when, a.loop ? "loop" : "once");
  });
  for (const c of listControllers(e.customControllers)) slots.push(slot(c, "always", "loop"));
  const rig = resolveRig(listBones(e.customGeometry), e.autoRig);
  const hasControllers = listControllers(e.customControllers).length > 0;
  if (!hasControllers && !slots.some((s) => s.when === "moving") && (rig.leftLeg || rig.rightLeg || rig.leftArm || rig.rightArm)) slots.push(slot(AUTO_WALK, "moving", "loop"));
  if (!slots.some((s) => /look/i.test(s.animation) && s.when !== "never") && rig.head) slots.push(slot(AUTO_LOOK, "always", "loop"));
  return slots;
}

export function activeSlots(e: EntityElement): AnimationSlot[] {
  return e.animationMode === "manual" && e.animationSlots ? e.animationSlots : defaultSlots(e);
}

export function animationLabel(id: string) {
  if (id === AUTO_WALK) return "Generated walk (swings arms and legs)";
  if (id === AUTO_LOOK) return "Generated head look (follows players)";
  if (id.startsWith("controller.")) return `${id.split(".").pop()} (controller)`;
  return id.split(".").pop() ?? id;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function autoWalkDef(rig: Partial<Record<RigRole, string>>, r: AutoRig | undefined, speed: number) {
  const amp = r?.swing ?? 50;
  const dir = r?.reverse ? -1 : 1;
  const wave = (k: number) => `math.cos(query.modified_distance_moved * ${round(38.17 * speed)}) * ${round(amp * k * dir)} * query.modified_move_speed`;
  const bones: Record<string, unknown> = {};
  if (rig.rightLeg) bones[rig.rightLeg] = { rotation: [`-${wave(1.15)}`, 0, 0] };
  if (rig.leftLeg) bones[rig.leftLeg] = { rotation: [wave(1.15), 0, 0] };
  if (rig.rightArm) bones[rig.rightArm] = { rotation: [wave(0.8), 0, 0] };
  if (rig.leftArm) bones[rig.leftArm] = { rotation: [`-${wave(0.8)}`, 0, 0] };
  return Object.keys(bones).length ? { loop: true, bones } : null;
}

export interface BuiltAnimations {
  animations: Record<string, string>;
  animate: unknown[];
  animationFile?: object;
  controllerFile?: object;
  problems: string[];
}

/** Turns slots into an animation file, optional animation controllers and the client entity's animate list. */
export function buildAnimations(ns: string, e: EntityElement): BuiltAnimations {
  const imported = new Map(listAnimations(e.customAnimations).map((a) => [a.id, a]));
  const rig = resolveRig(listBones(e.customGeometry), e.autoRig);
  const out: BuiltAnimations = { animations: {}, animate: [], problems: [] };
  const defs: Record<string, unknown> = {};
  const controllers: Record<string, unknown> = {};

  // Register every uploaded animation and controller under a short name; they're written to the pack unchanged.
  const ctrlIds = listControllers(e.customControllers);
  const names = shortNames([...imported.keys(), ...ctrlIds]);
  for (const [id, short] of names) out.animations[short] = id;

  activeSlots(e).forEach((s, i) => {
    if (s.when === "never") return;
    const speed = Number(s.speed) > 0 ? Number(s.speed) : 1;
    const molang = s.when === "custom" ? s.condition.trim() : WHEN.find((w) => w.value === s.when)!.molang;
    if (s.when === "custom" && !molang) out.problems.push(`slot ${i + 1} uses a custom rule but the rule is empty, so it plays all the time.`);

    // Uploaded controller: just switch it on (optionally under a condition).
    if (s.animation.startsWith("controller.")) {
      const short = names.get(s.animation);
      if (!short) return out.problems.push(`controller "${animationLabel(s.animation)}" isn't in the uploaded controllers file any more.`);
      out.animate.push(molang ? { [short]: molang } : short);
      return;
    }

    let def: Record<string, unknown> | null;
    let short = `slot${i}`;
    let reuse = false;
    if (s.animation === AUTO_WALK) {
      def = autoWalkDef(rig, e.autoRig, speed);
      if (!def) return out.problems.push("the generated walk needs at least one arm or leg bone. Pick them under Body parts.");
    } else if (s.animation === AUTO_LOOK) {
      def = rig.head ? { loop: true, bones: { [rig.head]: { rotation: ["query.target_x_rotation", "query.target_y_rotation", 0] } } } : null;
      if (!def) return out.problems.push("the generated head look needs a head bone. Pick it under Body parts.");
    } else {
      const a = imported.get(s.animation);
      if (!a) return out.problems.push(`animation "${animationLabel(s.animation)}" isn't in the imported animation file any more.`);
      // Unchanged settings: play the uploaded animation exactly as authored.
      reuse = speed === 1 && !s.matchMovement && (s.mode === "loop") === a.loop;
      if (reuse) short = names.get(a.id)!;
      def = structuredClone(a.def);
      if (s.matchMovement) def.anim_time_update = `query.modified_distance_moved * ${round(0.4 * speed)}`;
      else if (speed !== 1) def.anim_time_update = `query.anim_time + query.delta_time * ${round(speed)}`;
    }
    if (reuse) {
      addSlot(short, s, molang, i);
      return;
    }
    if (s.mode === "loop") def.loop = true;
    else if (def.loop === true) delete def.loop;
    const id = `animation.${ns}.${e.name}.${short}`;
    defs[id] = def;
    out.animations[short] = id;
    addSlot(short, s, molang, i);
  });

  function addSlot(short: string, s: AnimationSlot, molang: string, i: number) {
    if (s.mode === "loop") {
      out.animate.push(molang ? { [short]: molang } : short);
      return;
    }
    // One-shot animations need a controller so they restart each time the condition becomes true.
    const ctrlId = `controller.animation.${ns}.${e.name}.slot${i}`;
    const cond = molang || "1.0";
    controllers[ctrlId] = {
      initial_state: "default",
      states: {
        default: { transitions: [{ play: cond }] },
        play: {
          animations: [short],
          blend_transition: 0.1,
          transitions: [{ default: molang ? `query.all_animations_finished && !(${molang})` : "0.0" }],
        },
      },
    };
    out.animations[`slot${i}_ctrl`] = ctrlId;
    out.animate.push(`slot${i}_ctrl`);
  }

  if (Object.keys(defs).length) out.animationFile = { format_version: "1.8.0", animations: defs };
  if (Object.keys(controllers).length) out.controllerFile = { format_version: "1.10.0", animation_controllers: controllers };
  return out;
}
