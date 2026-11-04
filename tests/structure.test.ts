import { describe, expect, it } from "vitest";
import * as pnbt from "prismarine-nbt";
import { T, nbt, readNbt, writeNbt, type NbtTag } from "../src/export/nbt";
import { parseStructure, withLoot } from "../src/export/structure";
import { generateAddon } from "../src/export/generate";
import { createElement } from "../src/model/registry";
import { createProject } from "../src/model/project";
import { typecheckScript } from "./typecheck";

/** A 3 × 2 × 2 structure: stone floor, a chest with two items and a barrel on top, the rest air. */
function makeStructure(): Uint8Array {
  const size = [3, 2, 2];
  const palette = ["minecraft:stone", "minecraft:air", "minecraft:chest", "minecraft:barrel"];
  const idx = (x: number, y: number, z: number) => (x * size[1] + y) * size[2] + z;
  const blocks = new Array(12).fill(1);
  for (let x = 0; x < 3; x++) for (let z = 0; z < 2; z++) blocks[idx(x, 0, z)] = 0;
  blocks[idx(1, 1, 0)] = 2;
  blocks[idx(2, 1, 1)] = 3;
  const item = (name: string, count: number) => nbt.compound({ Name: nbt.str(name), Count: nbt.byte(count), Slot: nbt.byte(0), Damage: { type: T.Short, value: 0 } });
  const be = (id: string, items: NbtTag[]) => nbt.compound({ block_entity_data: nbt.compound({ id: nbt.str(id), Items: nbt.list(T.Compound, items), x: nbt.int(0), y: nbt.int(0), z: nbt.int(0) }) });
  const root = nbt.compound([
    ["format_version", nbt.int(1)],
    ["size", nbt.ints(size)],
    ["structure", nbt.compound({
      block_indices: nbt.list(T.List, [nbt.ints(blocks), nbt.ints(new Array(12).fill(-1))]),
      entities: nbt.list(T.Compound, [nbt.compound({ identifier: nbt.str("minecraft:pig") })]),
      palette: nbt.compound({
        default: nbt.compound({
          block_palette: nbt.list(T.Compound, palette.map((name) => nbt.compound({ name: nbt.str(name), states: nbt.compound({}), version: nbt.int(18090528) }))),
          block_position_data: nbt.compound({
            [String(idx(1, 1, 0))]: be("Chest", [item("minecraft:diamond", 2), item("minecraft:apple", 5)]),
            [String(idx(2, 1, 1))]: be("Barrel", []),
          }),
        }),
      }),
    })],
    ["structure_world_origin", nbt.ints([0, 64, 0])],
  ]);
  return writeNbt({ name: "", tag: root });
}

describe("NBT", () => {
  const bytes = makeStructure();

  it("reads and writes back byte for byte", () => {
    expect(writeNbt(readNbt(bytes))).toEqual(bytes);
  });

  it("matches prismarine-nbt in both directions", async () => {
    const theirs = pnbt.simplify((await pnbt.parse(Buffer.from(bytes), "little")).parsed) as any;
    expect(theirs.size).toEqual([3, 2, 2]);
    expect(theirs.structure.palette.default.block_palette[2].name).toBe("minecraft:chest");
    expect(theirs.structure.palette.default.block_position_data["6"].block_entity_data.Items[0].Count).toBe(2);
    // Their writer → our reader.
    const back = pnbt.writeUncompressed((await pnbt.parse(Buffer.from(bytes), "little")).parsed, "little");
    expect(parseStructure(new Uint8Array(back)).containers.map((c) => c.entity)).toEqual(["Chest", "Barrel"]);
  });

  it("rejects files that aren't Bedrock structures", () => {
    expect(() => readNbt(new Uint8Array([0x1f, 0x8b, 8, 0]))).toThrow(/Java|Bedrock/);
    expect(() => readNbt(bytes.slice(0, 40))).toThrow(/ends too early/);
  });
});

describe("structures", () => {
  const bytes = makeStructure();

  it("summarises size, blocks, containers and entities", () => {
    const s = parseStructure(bytes);
    expect(s.size).toEqual([3, 2, 2]);
    expect(s.counts).toEqual([["minecraft:stone", 6], ["minecraft:chest", 1], ["minecraft:barrel", 1]]);
    expect(s.containers).toEqual([
      { index: 6, pos: [1, 1, 0], block: "minecraft:chest", entity: "Chest", items: 2, loot: "" },
      { index: 11, pos: [2, 1, 1], block: "minecraft:barrel", entity: "Barrel", items: 0, loot: "" },
    ]);
    expect(s.entities).toEqual(["minecraft:pig"]);
  });

  it("puts loot tables in containers", () => {
    const out = parseStructure(withLoot(parseStructure(bytes), { 6: "loot_tables/chests/simple_dungeon.json" }));
    expect(out.containers[0]).toMatchObject({ loot: "loot_tables/chests/simple_dungeon.json", items: 0 });
    expect(out.containers[1].loot).toBe("");
  });

  const project = () => {
    const p = createProject("Builder");
    p.namespace = "bld";
    const s = createElement("structure", "shrine", "Shrine");
    s.file = `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
    s.fileName = "shrine.mcstructure";
    s.loot = { 6: "shrine_loot", 11: "loot_tables/chests/simple_dungeon.json" };
    s.biomeTags = ["plains", "forest"];
    s.rarity = 50;
    s.sink = 1;
    s.canReplace = ["minecraft:air", "minecraft:tall_grass"];
    const loot = createElement("loot", "shrine_loot", "Shrine loot");
    loot.lootType = "chests";
    loot.pools = [{ rollsMin: 2, rollsMax: 4, entries: [{ item: "minecraft:emerald", weight: 1, min: 1, max: 3 }] }];
    const proc = createElement("procedure", "summon_shrine", "Summon shrine");
    proc.trigger = "item_use";
    proc.filter = "minecraft:stick";
    proc.actions = [{ id: "a", type: "place_structure", params: { structure: "shrine", at: "player", rotation: "90", centered: true }, chance: 100 }];
    p.elements.push(s, loot, proc);
    return p;
  };

  it("exports the structure with loot, a feature and a feature rule", () => {
    const { files, warnings } = generateAddon(project());
    expect(warnings.filter((w) => w.level === "error")).toEqual([]);
    const file = files.get("BP/structures/bld/shrine.mcstructure") as Uint8Array;
    const loot = parseStructure(file).containers.map((c) => c.loot);
    expect(loot).toEqual(["loot_tables/chests/bld_shrine_loot.json", "loot_tables/chests/simple_dungeon.json"]);
    const feature = JSON.parse(files.get("BP/features/shrine_feature.json") as string)["minecraft:structure_template_feature"];
    expect(feature).toMatchObject({ structure_name: "bld:shrine", facing_direction: "random", constraints: { grounded: {}, unburied: {}, block_intersection: { block_allowlist: ["minecraft:air", "minecraft:tall_grass"] } } });
    const rule = JSON.parse(files.get("BP/feature_rules/shrine_rule.json") as string)["minecraft:feature_rules"];
    expect(rule.description.places_feature).toBe("bld:shrine_feature");
    expect(rule.conditions["minecraft:biome_filter"][1].any_of.map((f: any) => f.value)).toEqual(["plains", "forest"]);
    expect(rule.distribution.scatter_chance).toEqual({ numerator: 1, denominator: 50 });
    expect(rule.distribution.y).toBe("query.heightmap(variable.worldx, variable.worldz) - 1");
  });

  it("places structures from procedures with a script that type-checks", () => {
    const js = generateAddon(project()).files.get("BP/scripts/main.js") as string;
    expect(js).toContain(`BC.structure(ctx, "shrine", "player", 90, true);`);
    expect(typecheckScript(js)).toEqual([]);
  });

  it("reports missing files, loot tables and structures", () => {
    const p = project();
    p.elements = p.elements.filter((e) => e.kind !== "loot");
    p.elements.push(Object.assign(createElement("structure", "empty", "Empty")));
    const proc = p.elements.find((e) => e.kind === "procedure")!;
    if (proc.kind === "procedure") proc.actions[0].params.structure = "gone";
    const msgs = generateAddon(p).warnings.filter((w) => w.level === "error").map((w) => w.message);
    expect(msgs.some((m) => m.includes("shrine_loot"))).toBe(true);
    expect(msgs.some((m) => m.includes(".mcstructure"))).toBe(true);
    expect(msgs.some((m) => m.includes(`"gone"`))).toBe(true);
  });
});
