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
| Living entity | Humanoid / quadruped presets with walk + look animations, or Blockbench import: quick `.bbmodel` conversion (model, texture, animations) or manual files used exactly as exported (`.geo.json`, `.animation.json`, `.animation_controllers.json`, each viewable/editable), with automatic walk/look from bone names and a manual "what plays when" editor (walking, idle, attacking, hurt, in water, on fire, dying, custom Molang; loop or once; speed; match walking speed; body-part mapping); passive / neutral / hostile AI; drops; spawn egg; natural spawning by biome tag, light, herd size | ✅ |
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
- [x] `.bbmodel` import matches Blockbench's own Bedrock export (checked on a real Blockbench 5 project: 11/11 bones, 137/137 keyframes identical)
- [ ] `.bbmodel` import in game: rotated cubes and per-face UVs (not covered by the real-project check)
- [ ] Automatic walk/look animations on custom models look natural
- [ ] Storage block: chest screen opens, items persist, contents on break (needs 1.26.60; confirm no experimental toggle is required)
- [ ] Lever-style switch powers redstone dust / doors; lamp lights up and "receives/loses redstone power" procedures fire once per change
- [ ] Custom crafting station opens the 3×3 grid and only shows recipes tagged for it
- [ ] Vanilla templates: zombie, pig, villager, horse, creeper spawn, behave and animate like the original; sounds play; `minecraft:`-namespaced entity properties in copied files are accepted on a custom id
- [ ] Forms open from item use and commands; input form values land in variables; the busy-retry works when opened from chat
- [ ] Command arguments (number and player) parse and appear in `{name}`
- [ ] Variables persist across world reloads (dynamic properties)
- [ ] Manual animation slots: "When attacking" (`variable.attack_time`), "When hurt" and "When dying" fire at the right moment; one-shot controllers replay on each attack; "Match walking speed" stops foot sliding

## Phase 2: visual scripting and advanced content ⬜

Ordered by user value:

1. ✅ **Blockly procedure editor** alongside the simple builder (both compile to the same Script API code; switching to blocks carries the simple steps over). Every step and condition is a block, plus if/else, repeat/while/for loops (guarded at 10,000 iterations), math, text, waits (`system.runTimeout`), "for each player", event values, local variables and global variables. The block JSON compiles without Blockly, so export stays testable. ⬜ lists, entity-scoped variables, custom block colours/themes for dark mode.
2. ✅ **Forms (MCreator GUIs)** via `@minecraft/server-ui`: button menus with icons, input forms (text, slider, dropdown, toggle, label → variables and `{key}` values), yes/no dialogs; "Show form" step; retries when the player is busy; live in-app preview.
3. ✅ **Command arguments**: whole number, decimal, text, true/false and player (becomes the target); required or optional; usable as `{name}` and with the "argument" block. ⬜ item/block/enum argument types.
   ✅ **Global variables** (world or per player, number/text/true-false) stored as dynamic properties; "Change a variable" step, "Variable compares to" condition, `{name}` in any text. ✅ "Run manually" trigger + "Run another procedure" step for reusable procedures.
4. 🟡 **3D previews** (three.js): ✅ mobs with live animations, controllers and game-state toggles. ⬜ blocks with custom models, items in hand, armor on a player.
5. ⬜ **Projectiles and ranged items**: throwables, bows/shooters, custom projectile entities with on-hit procedures.
5b. ✅ **Blocks, round 2**: custom Blockbench models (`.bbmodel` with texture, 3D preview, hitbox fit/full/none); crafting stations (`minecraft:crafting_table`, per-recipe "Craft in"); storage blocks (`minecraft:block_entity` container, 1-54 slots, 1.26.60+); redstone output (constant or lever-style toggle, optional light/texture when on, 1.21.120+ format) and input (`minecraft:redstone_consumer` + `onRedstoneUpdate`, lamp behaviour, "receives/loses redstone power" procedure triggers, 1.26.0+). Each block picks its minimum format version; export flags features newer than the project's target, with a one-click "Update project" in the editor.
5c. ✅ **Vanilla mob templates**: 89 vanilla mobs. Picking one downloads its behaviour + client files (and sounds/model for the preview) from Mojang's `bedrock-samples` at a pinned release; nothing of Mojang's is bundled. The copy keeps the AI/events, links back with `runtime_identifier`, and uses the game's own model, textures and animations; health, speed, attack, hitbox, drops, egg and spawning are editable, with an optional reskin. Manual upload fallback where GitHub is blocked. Lenient JSON parser for Mojang-style files (comments, trailing commas); preview reads legacy 1.8 geometry with inheritance.
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

- **0.3.0**: Blocks: custom Blockbench models with 3D preview and fitted hitboxes, crafting stations with per-recipe "Craft in", storage blocks, redstone output and input with lamp behaviour and new redstone triggers, per-block format versions and version checks. Vanilla mob templates for 89 mobs (downloaded from Mojang's bedrock-samples, reskin optional), with legacy-geometry preview. Example gains a Ruby Workbench. 58 tests; block scripts type-checked against `@minecraft/server` 2.11.0.

- **0.2.0** (Phase 2, part 1): Blockly block editor for procedures and commands; global variables; forms (menus, input forms, yes/no dialogs); command arguments; "run manually" trigger and "run another procedure" step; missing procedure/form references reported. Example project shows a block-based counter, a shop form and a command with an argument. 43 tests, generated scripts type-checked against `@minecraft/server` 2.1.0 and `@minecraft/server-ui` 2.0.0.

- **0.1.7**: Fix `.bbmodel` import: Blockbench 5 projects keep bone names, pivots and rotations in a separate `groups` list, which was ignored, so bones pivoted around the wrong point and limbs flew apart. Keyframes are now converted from Blockbench's axes to Bedrock's (rotation X/Y and position X inverted, like Blockbench's exporter) and snapped to the animation's frame rate. Verified against a real project: output is identical to Blockbench's own export.

- **0.1.6**: Fix "animation isn't in the imported animation file" after re-importing: manual animation choices are matched by name when the file's animation names change, and are re-pointed automatically on upload. Handled cases (like renamed animation ids) show as neutral notes instead of warnings.

- **0.1.5**: Fix manually imported animations not loading in game: animation names without the required `animation.` prefix (e.g. `walk`) are exported as `animation.<namespace>.<mob>.walk`, and controllers without `controller.animation.` get it too. Bone names with spaces or symbols are renamed identically in the model and all animations. Attack, hurt and death animations default to playing once even if authored as looping. The preview now honours `override_previous_animation`.

- **0.1.4**: Animated 3D preview for mobs, built from exactly what gets exported: model, texture, animations and controllers. "As in game" mode with walking/attack/hurt/water/fire/dying/look toggles, "Single animation" mode with a scrubbable timeline, playback speed, and front/side/back/top views. Includes a Molang interpreter. "Match walking speed" now scales by `query.modified_move_speed` (the old distance-based formula could play far too fast in game).

- **0.1.3**: Manual model files for custom mobs: upload Blockbench's own `.geo.json`, `.animation.json` and `.animation_controllers.json`; they're written to the pack unchanged and unmodified animations are referenced directly. Uploaded controllers can be switched on in the animation list, and animations they already play aren't double-played. `.bbmodel` conversion fixes: blank scale axes no longer collapse to 0; before/after keyframes, step keyframes, override, blend weight, start/loop delay and time update are kept. Warning when a texture's shape doesn't match the model.

- **0.1.2**: Manual animation assignment for custom mobs: choose each animation's trigger, loop or play-once (via generated animation controllers), speed, and walk-speed sync. Pick which bones the generated walk and head look move, with swing amount and direction.

- **0.1.1**: Fix: a mob set to a custom model whose file was missing or unreadable silently fell back to the player-shaped model (wrong shape, missing arms). That's now a blocking export error. Added direct `.bbmodel` import (model, texture, animations) for mobs and blocks, automatic walk/head-look for custom models, and a warning when a preset model gets a non-64×64 texture.

- **0.1.0**: Phase 0 and Phase 1. 14 element types, Material Pack wizard, texture editor with 24 templates, no-code procedures and custom commands, export with validation.
