# Bedrock Creator: development plan

**Goal:** the most capable no-code creator for Minecraft Bedrock add-ons. Start with every MCreator feature that can exist on Bedrock, then go further where Bedrock's scripting allows.

This file is updated as work lands. The in-app **Roadmap** tab shows the same parity matrix (`src/model/parity.ts`).

Status: ✅ done · 🟡 partly done · ⬜ planned · 🔧 simulated with scripts · ⛔ impossible on Bedrock

---

## Architecture

```
src/
  model/       Plain-JSON data model, element registry, vanilla ids, trigger/condition/action catalog,
               material-pack wizard, MCreator parity matrix
  export/      Pure functions: Project -> Map<path, file>. No DOM. Fully unit-tested.
    generate.ts   orchestrator, manifests, lang, atlases, validation
    content.ts    blocks, plants, items, tools, armor, food
    entity.ts     mobs (BP + RP), preset models and animations, spawn rules
    data.ts       recipes, loot tables, ore features, functions, sounds
    scripts.ts    Script API code generation (procedures, commands, tool durability, food effects)
    zip.ts        .mcaddon / .mcpack packaging
  textures/    Procedural pixel-art generator (templates for blocks, items, tools, armor, mobs)
  store/       Zustand store, IndexedDB autosave, undo/redo with typing coalescing
  ui/          React UI: workspace, editors per element kind, texture editor, export, roadmap
tests/         Generator tests, including type-checking generated JS against @minecraft/server typings
```

Key decisions:

- **Client-only web app.** No server, no account. Projects autosave to IndexedDB and can be backed up as a `.bcproject.json` file. Works offline once loaded.
- **The export engine is pure TypeScript with no DOM.** It can later run in a CLI, a VS Code extension or a server without changes.
- **Generated scripts are type-checked in CI** against the official `@minecraft/server` typings, so API misuse fails the build instead of failing in game.
- **Targets:** Script API 2.1.0 / Minecraft 1.21.100 by default. Users can pick any version from 2.0.0 (1.21.90) to 2.11.0 (1.26.60). Format versions live in `src/export/context.ts` (`FORMATS`).
- **Stable UUIDs per project**, so re-exports replace the old pack in game instead of duplicating it.

---

## Phase 0: foundation ✅

- ✅ Data model, element registry, project factory, schema version for migrations
- ✅ Export pipeline: BP + RP manifests (linked), `texts/en_US.lang`, terrain/item atlases, `blocks.json`, pack icon
- ✅ `.mcaddon` and separate `.mcpack` downloads
- ✅ Validation: namespace rules, reserved namespaces, duplicate identifiers, missing references, missing textures
- ✅ IndexedDB autosave, multiple projects, import/export project file, undo/redo
- ✅ Unit tests (11) + script type-check against `@minecraft/server@2.1.0`

## Phase 1: core content ✅ (this release)

| MCreator | Bedrock Creator | Status |
|---|---|---|
| Block | Per-face textures (all / pillar / six), transparency, light, friction, hardness, resistance, best tool, sounds, map colour, rotation (facing / axis), custom Blockbench geometry, drops (self / loot / nothing), creative category | ✅ |
| Plant | Cross-model plant, placement rules, natural generation (scatter feature) | ✅ |
| Item | Icon, stack size, glint, hand-equipped, fuel, tags, creative category | ✅ |
| Tool | 5 types, tier presets, damage, durability, speed, enchantability, repair item; durability loss via generated script | ✅ |
| Armor | 4 pieces, icons, worn layers (attachables), protection, durability multiplier, repair | ✅ |
| Food | Hunger, saturation, eat/drink, leftover item, effects with chance (script) | ✅ |
| Living entity | Humanoid / quadruped presets with walk + look animations, or Blockbench import (`.bbmodel` with embedded texture and animations, or `.geo.json` + `.animation.json`), with automatic walk/look from bone names; passive / neutral / hostile AI; drops; spawn egg; natural spawning by biome tag, light, herd size | ✅ |
| Recipe | Shaped (paint-on grid), shapeless, furnace/blast/smoker/campfire, stonecutter, smithing | ✅ |
| Loot table | Pools, weighted entries, counts, live % per entry | ✅ |
| Feature (ore) | Vein size, frequency, height range with visual bar, dimension, replace list | ✅ |
| Procedure | When → Only if → Do builder. 12 triggers, 10 conditions, 25 actions, per-step chance, `{player}`/`{target}` text, live JS preview | 🟡 (Blockly in phase 2) |
| Command | `/namespace:name` custom commands with permission levels and conditions | 🟡 (arguments in phase 2) |
| Function | `.mcfunction` editor, run every tick | ✅ |
| Sound | `.ogg` import, category, volume, pitch; usable from procedures | ✅ |
| Texture maker / editor | Pixel editor (pencil, eraser, fill, picker, undo), 24 procedural templates, hue shift, PNG import | ✅ |
| Ore/tool/armor packs | **Material Pack wizard**: one name + colour creates up to 24 elements with textures and recipes | ✅ |

### Needs checking in game (before calling Phase 1 shipped)

Generated JSON follows current Microsoft docs and the Bedrock wiki, and the scripts type-check against the real API. These still need a test world, ideally on Windows and one mobile device:

- [ ] Armor attachables render with `geometry.player.armor.*` (fallback: ship our own armor geometry)
- [ ] Custom tools mine vanilla blocks at the right speed and harvest tiered blocks (`minecraft:*_tier` tags)
- [ ] Plant feature (`single_block_feature` + `surface_pass`) spawns flowers on grass
- [ ] Ore feature heights below y=0 generate in deepslate
- [ ] Preset mob animations (walk, head look) look right; quadruped UV template lines up
- [ ] Custom command registration on 1.21.100 and on the latest release
- [ ] Re-export with a bumped version replaces the old pack cleanly
- [ ] `.bbmodel` import: posed bones, rotated cubes, mirrored and per-face UVs and imported animations match Blockbench in game
- [ ] Automatic walk/look animations on custom models look natural

## Phase 2: visual scripting and advanced content ⬜

Ordered by user value:

1. ⬜ **Blockly procedure editor** alongside the simple builder (both compile to the same Script API code). Variables: world, player and entity scoped, stored as dynamic properties. Loops, math, text, lists, if/else, wait (`system.runTimeout`).
2. ⬜ **Forms (MCreator GUIs)** via `@minecraft/server-ui`: action forms (buttons → procedures), modal forms (text, slider, dropdown, toggle → variables), message forms. "Open form" action.
3. ⬜ **Command arguments**: typed parameters (player, number, text, item, enum) usable inside actions.
4. ⬜ **3D previews** (three.js): items in hand, mobs with animations, armor on a player, Blockbench models.
5. ⬜ **Projectiles and ranged items**: throwables, bows/shooters, custom projectile entities with on-hit procedures.
6. ⬜ **Special block shapes**: slabs, stairs, fences, walls, doors, trapdoors, panes, carpets (geometry presets + block states + scripts).
7. ⬜ **Crops**: growth stages, bonemeal, seeds, harvest drops.
8. ⬜ **Structures**: import `.mcstructure`, place via structure features / jigsaw, loot in chests.
9. ⬜ **Particles**: visual designer for RP particle JSON, spawnable from procedures.
10. ⬜ **Entity extras**: tame, breed, ride, fly, swim AI, ranged attacks, custom trades (trade tables), ambient/hurt/death sounds, multiple textures (variants).
11. ⬜ **Tags editor** for items and blocks; **block states/permutations** editor.
12. ⬜ **Localization editor** for multiple languages.
13. ⬜ **Music discs** (`jukebox_playable` + jukebox song definitions).
14. ⬜ Brewing recipes.

## Phase 3: closing Bedrock gaps with scripting 🔧

Bedrock has no data-driven version of these, so they're simulated with generated scripts:

- 🔧 Custom enchantments (lore + dynamic properties + event hooks, enchanting via custom table or anvil-like form)
- 🔧 Custom potion effects (timed script effects + HUD text)
- 🔧 Achievements / advancements (tracked per player, toast via title/actionbar)
- 🔧 Overlays (actionbar/title first; JSON UI HUD later)
- 🔧 "Key bindings" via sneak/jump/item-use combos (Bedrock has no custom keys)
- 🔧 Custom game rules as world dynamic properties + vanilla `gamerule` control
- 🔧 Biomes where Bedrock supports data-driven biomes
- 🔧 Damage types using vanilla damage causes

Not possible on Bedrock: ⛔ dimensions, ⛔ fluids, ⛔ paintings, ⛔ banner patterns, ⛔ attributes, ⛔ Java code/mixins.

## Phase 4: platform ⬜

- ⬜ Cloud sync and sharing (accounts, share links, collaboration)
- ⬜ Templates gallery (starter add-ons, community packs)
- ⬜ AI assistant: describe an element or texture in words, get a draft
- ⬜ JSON-schema linting of output against Mojang's schemas; content-log style error explanations
- ⬜ Marketplace readiness checks (naming, sizes, performance budget)
- ⬜ Plugin system for new element types and generators
- ⬜ Installable PWA with offline support
- ⬜ Import existing add-ons (reverse-generate a project from a `.mcaddon`)

---

## Adding a new element type (developer guide)

1. Add the interface to `src/model/types.ts` and include it in `ModElement`.
2. Register it in `KINDS` and `createElement` in `src/model/registry.ts`.
3. Write a generator in `src/export/` and call it from `generateAddon` in `generate.ts`.
4. Add an editor in `src/ui/editors/` and route it in `ElementEditor.tsx`.
5. Add it to `tests/fixture.ts` and assert the output in `tests/generate.test.ts`.
6. Update `src/model/parity.ts` and this file.

## Testing

- `npm test`: generator tests + generated-script type check.
- `npm run build`: type-checks the whole app.
- Before release: run the in-game checklist above.

## Changelog

- **0.1.1**: Fix: a mob set to a custom model whose file was missing or unreadable silently fell back to the player-shaped model (wrong shape, missing arms). That's now a blocking export error. Added direct `.bbmodel` import (model, texture, animations) for mobs and blocks, automatic walk/head-look for custom models, and a warning when a preset model gets a non-64×64 texture.

- **0.1.0**: Phase 0 and Phase 1. 14 element types, Material Pack wizard, texture editor with 24 templates, no-code procedures and custom commands, export with validation.
