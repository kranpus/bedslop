import { describe, expect, it } from "vitest";
import { convertBbmodel, isBbmodel } from "../src/export/bbmodel";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { PNG } from "./fixture";

// A small hunched creature, shaped like a typical Blockbench "Bedrock Entity" project.
const bb = {
  meta: { format_version: "4.10", model_format: "bedrock", box_uv: true },
  name: "ghoul",
  model_identifier: "ghoul",
  resolution: { width: 64, height: 64 },
  elements: [
    { uuid: "c-body", name: "body", from: [-4, 12, -2], to: [4, 24, 2], origin: [0, 0, 0], uv_offset: [16, 16] },
    { uuid: "c-head", name: "head", from: [-5, 22, -8], to: [5, 32, 2], origin: [0, 0, 0], uv_offset: [0, 0] },
    { uuid: "c-ear", name: "ear", from: [5, 28, -4], to: [9, 31, -3], origin: [5, 28, -4], rotation: [0, 0, 22.5], uv_offset: [40, 0] },
    { uuid: "c-arm", name: "arm", from: [4, 4, -2], to: [7, 22, 1], origin: [0, 0, 0], uv_offset: [40, 16], mirror_uv: true },
    { uuid: "c-leg", name: "leg", from: [-4, 0, -2], to: [0, 12, 2], origin: [0, 0, 0], uv_offset: [0, 16] },
    { uuid: "c-rock", name: "rock", from: [8, 0, 8], to: [10, 2, 10], origin: [0, 0, 0], box_uv: false,
      faces: { north: { uv: [0, 32, 2, 34], texture: 0 }, up: { uv: [2, 32, 4, 34], texture: 0 }, down: { uv: [4, 32, 6, 34], texture: null } } },
  ],
  outliner: [
    { uuid: "g-body", name: "body", origin: [0, 12, 0], rotation: [25, 0, 0], children: [
      "c-body",
      { uuid: "g-head", name: "head", origin: [0, 24, 0], children: ["c-head", "c-ear"] },
      { uuid: "g-larm", name: "leftArm", origin: [5, 22, 0], mirror_uv: true, children: ["c-arm"] },
    ] },
    { uuid: "g-rleg", name: "RightLeg", origin: [-2, 12, 0], rotation: [-10, 5, 0], children: ["c-leg"] },
    "c-rock",
  ],
  textures: [{ name: "ghoul.png", source: PNG, width: 64, height: 64 }],
  animations: [{
    name: "idle", loop: "loop", length: 2,
    animators: { "g-head": { name: "head", type: "bone", keyframes: [
      { channel: "rotation", time: 0, data_points: [{ x: "0", y: "0", z: "0" }] },
      { channel: "rotation", time: 1, data_points: [{ x: "math.sin(q.anim_time * 90) * 5", y: "0", z: "0" }], interpolation: "catmullrom" },
    ] } },
  }],
};

describe("convertBbmodel", () => {
  const text = JSON.stringify(bb);
  const c = convertBbmodel(text);
  const geo = JSON.parse(c.geometry)["minecraft:geometry"][0];
  const bone = (n: string) => geo.bones.find((b: { name: string }) => b.name === n);

  it("detects .bbmodel files", () => {
    expect(isBbmodel(text)).toBe(true);
    expect(isBbmodel(JSON.stringify({ format_version: "1.12.0", "minecraft:geometry": [] }))).toBe(false);
  });

  it("keeps the bone hierarchy and pose, mirrored to Bedrock's X axis", () => {
    expect(c.geometryId).toBe("geometry.ghoul");
    expect(geo.description.texture_width).toBe(64);
    expect(bone("body")).toMatchObject({ pivot: [0, 12, 0], rotation: [-25, 0, 0] });
    expect(bone("head")).toMatchObject({ parent: "body", pivot: [0, 24, 0] });
    expect(bone("leftArm")).toMatchObject({ parent: "body", pivot: [-5, 22, 0], mirror: true });
    expect(bone("RightLeg").rotation).toEqual([10, -5, 0]);
    expect(bone("bb_main").cubes).toHaveLength(1);
  });

  it("converts cubes: origin, box UV, rotation pivot and per-face UV", () => {
    expect(bone("body").cubes[0]).toEqual({ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] });
    const arm = bone("leftArm").cubes[0];
    expect(arm.origin).toEqual([-7, 4, -2]);
    expect(arm.mirror).toBeUndefined(); // same as the bone's mirror flag
    const ear = bone("head").cubes[1];
    expect(ear).toMatchObject({ origin: [-9, 28, -4], pivot: [-5, 28, -4], rotation: [0, 0, 22.5] });
    const rock = bone("bb_main").cubes[0];
    expect(rock.uv.north).toEqual({ uv: [0, 32], uv_size: [2, 2] });
    expect(rock.uv.up).toEqual({ uv: [4, 34], uv_size: [-2, -2] });
    expect(rock.uv.down).toBeUndefined();
  });

  it("extracts the embedded texture and animations", () => {
    expect(c.texture).toMatchObject({ name: "ghoul", width: 64, height: 64 });
    const anim = JSON.parse(c.animations).animations["animation.ghoul.idle"];
    expect(anim.loop).toBe(true);
    expect(anim.bones.head.rotation["0"]).toEqual([0, 0, 0]);
    expect(anim.bones.head.rotation["1"]).toEqual({ post: ["math.sin(q.anim_time * 90) * 5", 0, 0], lerp_mode: "catmullrom" });
  });

  it("rejects Java block models with a helpful message", () => {
    expect(() => convertBbmodel(JSON.stringify({ ...bb, meta: { model_format: "java_block" } }))).toThrow(/Bedrock Entity/);
  });
});

describe("custom mob export", () => {
  const project = () => {
    const p = createProject("Mobs");
    p.namespace = "mobs";
    p.textures.push({ id: "t", name: "ghoul", kind: "entity", width: 64, height: 64, dataUrl: PNG });
    const mob = createElement("entity", "ghoul", "Ghoul");
    mob.texture = "t";
    mob.model = "custom";
    p.elements.push(mob);
    return { p, mob };
  };

  it("is an error, not a silent humanoid, when the model is missing", () => {
    const { p } = project();
    const errs = generateAddon(p).warnings.filter((w) => w.level === "error");
    expect(errs.some((w) => w.message.includes("no model file"))).toBe(true);
  });

  it("uses the imported model and adds walk + look animations from bone names", () => {
    const { p, mob } = project();
    mob.customGeometry = convertBbmodel(JSON.stringify({ ...bb, animations: [] })).geometry;
    const { files, warnings } = generateAddon(p);
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    const client = JSON.parse(files.get("RP/entity/ghoul.entity.json") as string)["minecraft:client_entity"].description;
    expect(client.geometry.default).toBe("geometry.ghoul");
    expect(client.scripts.animate).toEqual([{ auto_walk: "query.is_moving" }, "auto_look"]);
    const auto = JSON.parse(files.get("RP/animations/mobs_ghoul.auto.animation.json") as string).animations;
    expect(Object.keys(auto["animation.mobs.ghoul.auto_walk"].bones).sort()).toEqual(["RightLeg", "leftArm"]);
    expect(auto["animation.mobs.ghoul.auto_look"].bones.head).toBeDefined();
  });

  it("warns when a preset model gets a texture that isn't 64×64", () => {
    const { p, mob } = project();
    mob.model = "humanoid";
    p.textures[0].width = 128;
    expect(generateAddon(p).warnings.some((w) => w.message.includes("expects a 64×64"))).toBe(true);
  });
});
