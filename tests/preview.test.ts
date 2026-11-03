import { describe, expect, it } from "vitest";
import { molang, type MolangEnv } from "../src/preview/molang";
import { buildModel } from "../src/preview/model";
import { Animator, type PreviewSpec } from "../src/preview/animator";
import { humanoidGeometry } from "../src/export/entity";

const env = (): MolangEnv => ({ query: { anim_time: 0.5, is_moving: 1, life_time: 2 }, variable: { attack_time: 0.25 } });

describe("molang", () => {
  it("evaluates math, queries, variables and operators", () => {
    const e = env();
    expect(molang("math.cos(90)", e)).toBeCloseTo(0);
    expect(molang("math.sin(q.anim_time * 180) * 10", e)).toBeCloseTo(10);
    expect(molang("query.is_moving ? 5 : -5", e)).toBe(5);
    expect(molang("!q.is_moving", e)).toBe(0);
    expect(molang("v.attack_time > 0 && q.life_time >= 2", e)).toBe(1);
    expect(molang("-v.attack_time * 4 + 1", e)).toBe(0);
    expect(molang("v.missing ?? 7", e)).toBe(7);
    expect(molang("math.clamp(q.life_time * 10, 0, 15)", e)).toBe(15);
    expect(molang("1.5f * 2", e)).toBe(3);
  });

  it("runs statements with assignments and return", () => {
    const e = env();
    expect(molang("v.a = 3; v.b = v.a * 2; return v.b + 1;", e)).toBe(7);
    expect(e.variable.a).toBe(3);
    expect(molang("t.x = 2; return t.x * q.anim_time;", e)).toBe(1);
  });

  it("treats unknown names and bad expressions as 0", () => {
    const errs: string[] = [];
    expect(molang("q.something_new + 1", env())).toBe(1);
    expect(molang("1 + * 2", env(), (m) => errs.push(m))).toBe(0);
    expect(errs).toHaveLength(1);
  });
});

describe("preview model", () => {
  const model = buildModel(humanoidGeometry("t"), "geometry.t.humanoid", null);

  it("builds every bone with Blockbench's mirrored X axis", () => {
    expect([...model.bones.keys()]).toEqual(["root", "body", "head", "rightArm", "leftArm", "rightLeg", "leftLeg"]);
    // Bedrock pivot x=-5 for the right arm shows at +5 (Blockbench space), relative to its parent body at y=24.
    expect(model.bones.get("rightArm")!.group.position.toArray()).toEqual([5, -2, 0]);
    expect(model.size.y).toBeCloseTo(2.03, 1); // 32 px tall plus the inflated hat layer, in blocks
  });

  it("maps the player-skin face onto the front (north) of the head", () => {
    const head = model.bones.get("head")!.group.children[0] as import("three").Mesh;
    const pos = head.geometry.getAttribute("position");
    const uv = head.geometry.getAttribute("uv");
    // First face written is north (-z): its top-left corner samples texture pixel (8, 8) of a 64x64 skin.
    expect(pos.getZ(0)).toBeLessThan(pos.getZ(4 * 1) + 0.001);
    expect([uv.getX(0) * 64, (1 - uv.getY(0)) * 64]).toEqual([8, 8]);
    expect([uv.getX(3) * 64, (1 - uv.getY(3)) * 64]).toEqual([16, 16]);
  });
});

describe("animator", () => {
  const spec = (over: Partial<PreviewSpec>): PreviewSpec => ({ animations: {}, animate: [], preAnimation: [], initialize: [], defs: {}, controllers: {}, ...over });
  const setup = (s: PreviewSpec) => {
    const model = buildModel(humanoidGeometry("t"), "geometry.t.humanoid", null);
    const e: MolangEnv = { query: {}, variable: {} };
    return { model, e, anim: new Animator(s, model, e), rot: (b: string) => model.bones.get(b)!.group.rotation.x / (Math.PI / 180) };
  };

  it("interpolates keyframes, loops, and applies rotation like Blockbench (x negated)", () => {
    const { anim, rot } = setup(spec({
      animations: { swing: "a.swing" }, animate: ["swing"],
      defs: { "a.swing": { loop: true, animation_length: 1, bones: { rightArm: { rotation: { "0": [0, 0, 0], "0.5": [40, 0, 0], "1": [0, 0, 0] } } } } },
    }));
    anim.update(0.25);
    expect(rot("rightArm")).toBeCloseTo(-20);
    anim.update(0.25);
    expect(rot("rightArm")).toBeCloseTo(-40);
    anim.update(0.75); // wraps to 0.25
    expect(rot("rightArm")).toBeCloseTo(-20);
  });

  it("supports step keyframes, smooth keyframes and Molang channels", () => {
    const { anim, rot, e } = setup(spec({
      animations: { a: "a", b: "b", c: "c" }, animate: ["a", "b", "c"],
      defs: {
        a: { loop: true, animation_length: 1, bones: { head: { rotation: { "0": { post: [10, 0, 0], lerp_mode: "step" }, "1": [90, 0, 0] } } } },
        b: { loop: true, animation_length: 2, bones: { leftArm: { rotation: { "0": { post: [0, 0, 0], lerp_mode: "catmullrom" }, "1": { post: [30, 0, 0], lerp_mode: "catmullrom" }, "2": { post: [0, 0, 0], lerp_mode: "catmullrom" } } } } },
        c: { loop: true, bones: { leftLeg: { rotation: ["math.sin(q.life_time * 90) * 10", 0, 0] } } },
      },
    }));
    e.query.life_time = 1;
    anim.update(0.5);
    expect(rot("head")).toBeCloseTo(-10);
    expect(rot("leftArm")).toBeLessThan(-15);
    expect(rot("leftLeg")).toBeCloseTo(-10);
  });

  it("only plays animate entries whose condition is true, and restarts them", () => {
    const { anim, rot, e } = setup(spec({
      animations: { walk: "w" }, animate: [{ walk: "query.is_moving" }],
      defs: { w: { loop: true, animation_length: 1, bones: { rightLeg: { rotation: { "0": [0, 0, 0], "1": [100, 0, 0] } } } } },
    }));
    e.query.is_moving = 0;
    anim.update(0.5);
    expect(rot("rightLeg")).toBeCloseTo(0);
    e.query.is_moving = 1;
    anim.update(0.3);
    expect(rot("rightLeg")).toBeCloseTo(-30);
  });

  it("runs animation controllers with transitions and all_animations_finished", () => {
    const { anim, rot, e } = setup(spec({
      animations: { ctrl: "controller.x", hit: "hit" }, animate: ["ctrl"],
      defs: { hit: { animation_length: 0.5, bones: { rightArm: { rotation: { "0": [0, 0, 0], "0.5": [80, 0, 0] } } } } },
      controllers: {
        "controller.x": {
          initial_state: "default",
          states: {
            default: { transitions: [{ attack: "v.attack_time > 0" }] },
            attack: { animations: ["hit"], transitions: [{ default: "q.all_animations_finished" }] },
          },
        },
      },
    }));
    anim.update(0.1);
    expect(rot("rightArm")).toBeCloseTo(0);
    e.variable.attack_time = 0.5;
    anim.update(0.1); // transition happens at the end of this frame
    e.variable.attack_time = 0;
    anim.update(0.25);
    expect(rot("rightArm")).toBeCloseTo(-40);
    anim.update(0.3); // finishes, then returns to default
    anim.update(0.1);
    expect(rot("rightArm")).toBeCloseTo(0);
  });
});
