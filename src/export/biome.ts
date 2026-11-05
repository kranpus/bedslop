// Custom biomes. Bedrock places custom biomes by replacing part of Minecraft's biomes
// (minecraft:replace_biomes). The behavior pack defines terrain, weather and tags; the resource pack's
// client_biome file sets its colours, sky and fog.

import type { BiomeElement } from "../model/types";
import { FEATURE_STYLES, NETHER_BIOMES, OVERWORLD_BIOMES } from "../model/vanilla";
import type { GenContext } from "./context";
import { round } from "./content";

const block = (id: string, fallback: string) => (!id ? fallback : id.includes(":") ? id : `minecraft:${id}`);
const hex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : "");
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : lo));

/** The tag every custom biome gets, so mobs, structures and features can target it: "<ns>_<name>". */
export const biomeTag = (ns: string, name: string) => `${ns}_${name}`;

export function genBiome(ctx: GenContext, b: BiomeElement) {
  const id = ctx.id(b.name);
  const nether = b.dimension === "nether";
  const known = new Set(nether ? NETHER_BIOMES : OVERWORLD_BIOMES);
  const targets = b.replaces.map((t) => t.replace(/^minecraft:/, "")).filter((t, i, a) => t && a.indexOf(t) === i);
  for (const t of targets) if (!known.has(t)) ctx.warn(b, `replaces "${t}", which isn't a Minecraft ${nether ? "Nether" : "Overworld"} biome.`, "error");
  if (!targets.length) ctx.warn(b, "doesn't replace any biome yet, so it never generates. Pick at least one.", "error");
  ctx.requires.push({ engine: "1.21.110", reason: `${b.displayName}: custom biomes`, elementId: b.id });

  const tags = [
    b.dimension, biomeTag(ctx.ns, b.name),
    ...(b.featuresLike && FEATURE_STYLES.includes(b.featuresLike) ? [b.featuresLike] : []),
    ...(b.animals ? ["animal"] : []), ...(b.monsters ? ["monster"] : []),
    ...b.tags.map((t) => t.trim().toLowerCase()).filter((t) => /^[a-z0-9_.:-]+$/.test(t)),
  ].filter((t, i, a) => a.indexOf(t) === i);

  const grass = hex(b.grassColor), foliage = hex(b.foliageColor);
  ctx.bp(`biomes/${b.name}.biome.json`, {
    format_version: "1.21.110",
    "minecraft:biome": {
      description: { identifier: id },
      components: {
        "minecraft:climate": { temperature: round(clamp(b.temperature, -1, 2)), downfall: round(clamp(b.downfall, 0, 1)), snow_accumulation: [0, 0.125] },
        "minecraft:surface_builder": { builder: {
          type: "minecraft:overworld",
          top_material: block(b.topBlock, nether ? "minecraft:netherrack" : "minecraft:grass_block"),
          mid_material: block(b.midBlock, nether ? "minecraft:netherrack" : "minecraft:dirt"),
          foundation_material: block(b.foundationBlock, nether ? "minecraft:netherrack" : "minecraft:stone"),
          sea_floor_material: block(b.seaFloorBlock, nether ? "minecraft:netherrack" : "minecraft:gravel"),
          sea_material: block(b.seaBlock, nether ? "minecraft:lava" : "minecraft:water"),
          sea_floor_depth: nether ? 1 : 7,
        } },
        // A bigger area size means a lower noise frequency: bigger, rarer areas (size 1 = 4.0 ... size 10 = 0.3).
        "minecraft:replace_biomes": { replacements: [{
          dimension: `minecraft:${b.dimension}`, targets: targets.length ? targets : [nether ? "hell" : "plains"],
          amount: round(clamp(b.amount, 0.01, 1)), noise_frequency_scale: round(4 * 0.75 ** (clamp(b.patchSize, 1, 10) - 1)),
        }] },
        ...(grass || foliage ? { "minecraft:map_tints": { ...(foliage ? { foliage } : {}), ...(grass ? { grass: { tint: grass } } : {}) } } : {}),
        "minecraft:tags": { tags },
      },
    },
  });

  // Colours, sky and fog.
  const components: Record<string, unknown> = {};
  if (hex(b.waterColor)) components["minecraft:water_appearance"] = { surface_color: hex(b.waterColor) };
  if (hex(b.skyColor)) components["minecraft:sky_color"] = { sky_color: hex(b.skyColor) };
  if (grass) components["minecraft:grass_appearance"] = { color: grass };
  if (foliage) components["minecraft:foliage_appearance"] = { color: foliage };
  if (b.fog) components["minecraft:fog_appearance"] = { fog_identifier: `minecraft:fog_${b.fog.replace(/^minecraft:(fog_)?/, "")}` };
  ctx.rp(`biomes/${b.name}.client_biome.json`, {
    format_version: "1.21.70",
    "minecraft:client_biome": { description: { identifier: id }, components },
  });
  ctx.lang.push(`biome.${id}.name=${b.displayName}`);
}
