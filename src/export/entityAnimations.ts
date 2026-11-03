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
export function defaultSlots(e: Pick<EntityElement, "customGeometry" | "customAnimations" | "autoRig">): AnimationSlot[] {
  const slots = listAnimations(e.customAnimations).map((a) => {
    const g = guessWhen(a.short, a.loop);
    return slot(a.id, g.when, g.mode);
  });
  const rig = resolveRig(listBones(e.customGeometry), e.autoRig);
  if (!slots.some((s) => s.when === "moving") && (rig.leftLeg || rig.rightLeg || rig.leftArm || rig.rightArm)) slots.push(slot(AUTO_WALK, "moving", "loop"));
  if (!slots.some((s) => /look/i.test(s.animation) && s.when !== "never") && rig.head) slots.push(slot(AUTO_LOOK, "always", "loop"));
  return slots;
}

export function activeSlots(e: EntityElement): AnimationSlot[] {
  return e.animationMode === "manual" && e.animationSlots ? e.animationSlots : defaultSlots(e);
}

export function animationLabel(id: string) {
  if (id === AUTO_WALK) return "Generated walk (swings arms and legs)";
  if (id === AUTO_LOOK) return "Generated head look (follows players)";
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

  activeSlots(e).forEach((s, i) => {
    if (s.when === "never") return;
    const speed = Number(s.speed) > 0 ? Number(s.speed) : 1;
    let def: Record<string, unknown> | null;
    if (s.animation === AUTO_WALK) {
      def = autoWalkDef(rig, e.autoRig, speed);
      if (!def) return out.problems.push("the generated walk needs at least one arm or leg bone. Pick them under Body parts.");
    } else if (s.animation === AUTO_LOOK) {
      def = rig.head ? { loop: true, bones: { [rig.head]: { rotation: ["query.target_x_rotation", "query.target_y_rotation", 0] } } } : null;
      if (!def) return out.problems.push("the generated head look needs a head bone. Pick it under Body parts.");
    } else {
      const a = imported.get(s.animation);
      if (!a) return out.problems.push(`animation "${animationLabel(s.animation)}" isn't in the imported animation file any more.`);
      def = structuredClone(a.def);
      if (s.matchMovement) def.anim_time_update = `query.modified_distance_moved * ${round(0.4 * speed)}`;
      else if (speed !== 1) def.anim_time_update = `query.anim_time + query.delta_time * ${round(speed)}`;
    }
    if (s.mode === "loop") def.loop = true;
    else delete def.loop;

    const short = `slot${i}`;
    const id = `animation.${ns}.${e.name}.${short}`;
    defs[id] = def;
    out.animations[short] = id;
    const molang = s.when === "custom" ? s.condition.trim() : WHEN.find((w) => w.value === s.when)!.molang;
    if (s.when === "custom" && !molang) out.problems.push(`slot ${i + 1} uses a custom rule but the rule is empty, so it plays all the time.`);

    if (s.mode === "loop") {
      out.animate.push(molang ? { [short]: molang } : short);
    } else {
      // One-shot animations need a controller so they restart each time the condition becomes true.
      const ctrlId = `controller.animation.${ns}.${e.name}.${short}`;
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
      out.animations[`${short}_ctrl`] = ctrlId;
      out.animate.push(`${short}_ctrl`);
    }
  });

  if (Object.keys(defs).length) out.animationFile = { format_version: "1.8.0", animations: defs };
  if (Object.keys(controllers).length) out.controllerFile = { format_version: "1.10.0", animation_controllers: controllers };
  return out;
}
