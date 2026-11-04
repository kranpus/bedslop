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
| Procedure | When → Only if → Do builder. 12 triggers, 10 conditions, 25 actions, per-step chance, `{player}`/`{target}` text, live JS preview | ✅ (plus a Blockly block editor) |
| Command | `/namespace:name` custom commands with permission levels and conditions | ✅ (with arguments) |
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
- [ ] Slabs stack into double slabs; doors place both halves, open together and drop once; fences/walls/panes connect on place and break
- [ ] Projectiles: snowball-style sprite faces the camera; arrow sticks in blocks; bow draws, uses the ammo list in order and loses durability
- [ ] Crops grow on random ticks, bone meal advances them, seeds plant only on the allowed blocks, grown crops drop produce
- [ ] Structures generate where expected (surface sink, underground range, biome tags, rarity); chest `LootTable` paths fill on first open; "Place structure" rotates and centres correctly; custom blocks inside structures load
- [ ] Particles: billboard size matches the preview (exported as half-width); colours/opacity fade; bouncing and vanishing on blocks; custom texture shows whole; "Spawn particles" height offset
- [ ] Mob extras: taming chance and sitting; breeding makes babies that grow up; rider steers a walking mount; flyers hover and swimmers stay in water; ranged mobs fire own projectiles; trade screen opens and restocks; sounds play; variants differ between spawns
- [ ] Tags: `#tag` shaped/shapeless recipes accept tagged items; tag conditions; custom block states persist, rules apply, set/cycle steps work on placed blocks
- [ ] Music discs: jukebox plays the song, stops at the set length, hopper ejects; "Now playing" shows the disc name; comparator signal
- [ ] Brewing: custom-ingredient mixes and bottle changes show up and work in the brewing stand
- [ ] Custom enchantments: book form applies and levels up; lore shows; hit/break/worn effects fire (and extra damage doesn't loop); bow enchantments apply to arrows
- [ ] Creative groups: appear folded with their icon and name; members aren't listed twice; translations show when the game language changes
- [ ] Leftovers round: stair corners join like vanilla; fence arms now face the right way; gates/buttons/plates power redstone; crops stop without water/daylight; picking resets the stage; crossbows load and fire; saddles, carrot-on-a-stick steering, mount chests and flying mounts; trade levels unlock; flipbook particles animate; block particles tick; state rules hide model parts; enchantment conflicts block combining; enum/item/block command arguments
- [ ] Scoreboards: created and shown on world load; change/reset/show/hide steps; global scores; {score:name} text; work alongside /scoreboard
- [ ] Custom effects: timer counts down; Minecraft effects stay on and are removed at the end; damage/heal ticks; potion gives it; milk cures; mobs keep effects after a reload
- [ ] HUD/overlays: layout matches the editor at different GUI scales; live text and bars update; invisible data titles never flash; overlays show/hide and time out; works alongside other HUD packs
- [ ] Form layouts: grid forms show tiles with icons and text, buttons click the right option, scrolling works with many buttons, close button works; forms without a layout still look vanilla; own-background layout draws title and close button; check on touch and with a controller
- [ ] Container themes: a storage block's background shows only on its own screen (not on chests), lines up with the slots for 9/27/54 slots, and the title with a curly apostrophe still matches
- [ ] Custom effect list: effects show on the left with colours, levels and timers, the list clears when they end, and "above the hotbar" effects still use the action bar
- [ ] Manual animation slots: "When attacking" (`variable.attack_time`), "When hurt" and "When dying" fire at the right moment; one-shot controllers replay on each attack; "Match walking speed" stops foot sliding

## Phase 2: visual scripting and advanced content ✅

Ordered by user value:

1. ✅ **Blockly procedure editor** alongside the simple builder (both compile to the same Script API code; switching to blocks carries the simple steps over). Every step and condition is a block, plus if/else, repeat/while/for loops (guarded at 10,000 iterations), math, text, waits (`system.runTimeout`), "for each player", event values, local variables and global variables. The block JSON compiles without Blockly, so export stays testable. ✅ list blocks (make, get/set/insert/remove, length, find, sub-list, for each), variables kept per player or mob, workspace colours follow the app's light/dark theme.
2. ✅ **Forms (MCreator GUIs)** via `@minecraft/server-ui`: button menus with icons, input forms (text, slider, dropdown, toggle, label → variables and `{key}` values), yes/no dialogs; "Show form" step; retries when the player is busy; live in-app preview.
3. ✅ **Command arguments**: whole number, decimal, text, true/false and player (becomes the target); required or optional; usable as `{name}` and with the "argument" block. ✅ item, block, mob type and option-list (enum) arguments.
   ✅ **Global variables** (world or per player, number/text/true-false) stored as dynamic properties; "Change a variable" step, "Variable compares to" condition, `{name}` in any text. ✅ "Run manually" trigger + "Run another procedure" step for reusable procedures.
4. ✅ **3D previews** (three.js): mobs with live animations, controllers and game-state toggles; blocks (custom Blockbench models with hitbox, every shape); items as thick 3D sprites like in the hand; armour worn on a player; structures; particles.
5. ✅ **Projectiles and ranged items**: projectile elements (flat sprite like a snowball, vanilla arrow shape, or a Blockbench model) with damage, knockback, fire, effects, speed/gravity presets, disappear or stick on hit, hit sound. Items can throw a projectile, be bow ammo, or be a bow (`minecraft:shooter` with ammo list, draw time, durability). "Projectile hits a mob / block" procedure triggers. ✅ crossbows (load, then fire) and mob ranged attacks (item 10).
5b. ✅ **Blocks, round 2**: custom Blockbench models (`.bbmodel` with texture, 3D preview, hitbox fit/full/none); crafting stations (`minecraft:crafting_table`, per-recipe "Craft in"); storage blocks (`minecraft:block_entity` container, 1-54 slots, 1.26.60+); redstone output (constant or lever-style toggle, optional light/texture when on, 1.21.120+ format) and input (`minecraft:redstone_consumer` + `onRedstoneUpdate`, lamp behaviour, "receives/loses redstone power" procedure triggers, 1.26.0+). Each block picks its minimum format version; export flags features newer than the project's target, with a one-click "Update project" in the editor.
5c. ✅ **Vanilla mob templates**: 89 vanilla mobs. Picking one downloads its behaviour + client files (and sounds/model for the preview) from Mojang's `bedrock-samples` at a pinned release; nothing of Mojang's is bundled. The copy keeps the AI/events, links back with `runtime_identifier`, and uses the game's own model, textures and animations; health, speed, attack, hitbox, drops, egg and spawning are editable, with an optional reskin. Manual upload fallback where GitHub is blocked. Lenient JSON parser for Mojang-style files (comments, trailing commas); preview reads legacy 1.8 geometry with inheritance.
6. ✅ **Special block shapes**: a Shape picker on blocks: slab (stacks into a double slab that drops two), stairs, carpet, trapdoor (click to open), door (two tall, top/bottom textures, places its top half, open/close), fence, wall and pane (connect to neighbours and solid blocks via scripts). Generated geometry, hitboxes and 3D preview. ✅ stair inner/outer corners (vanilla rules, by script), upside-down stairs, fence gates (fences join them), buttons (1 s redstone pulse) and pressure plates (powered while stood on). Fixed: fence/wall/pane east and west arms were swapped (Bedrock model x is mirrored).
7. ✅ **Crops**: 2-8 growth stages (crop `#` or cross shape), growth chance per random tick, bone meal, plant on farmland (or anything), seeds item, harvest drops (one seed when young; produce + extra seeds when grown). ✅ only grows on watered farmland; only grows in daylight (daytime, open sky; scripts can't read light levels on stable Minecraft, so torches don't count); right-click picking that resets to an earlier stage, like sweet berries.
8. ✅ **Structures**: import a `.mcstructure` (own little-endian NBT reader/writer, checked against prismarine-nbt), coloured-cube 3D preview with block counts, a loot table per chest/barrel (own or vanilla; written into the file's block entities), natural generation via `minecraft:structure_template_feature` + feature rules (dimension, surface with sink or underground Y range, biome tags, rarity, facing, shift radius, grounded/unburied/overlap rules), and a "Place structure" step (`world.structureManager.place`, rotation, centred). The example has a Ruby Shrine with a loot chest. ⛔ jigsaw structures (still experimental in Bedrock); ⛔ Java `.nbt` conversion (Java and Bedrock block names and states differ too much to map reliably); structure editing stays in Minecraft (Structure Block).
9. ✅ **Particles**: particle effect designer with a live 3D preview that simulates the game's motion rules (speed, gravity, drag, bouncing). Eight built-in white sprites (tinted) or your own texture; start/end colour, opacity and size; smooth or crisp; glow or take world light; burst or stream; ball/cube/flat-circle spawn area, outwards/up/inwards; lifetime, gravity, air resistance, spin; pass through, bounce or vanish on blocks. Seven presets. "Spawn particles" step for your effects and 25 vanilla ones; `/particle` works too. ✅ flipbook animations (frame strips), blocks that give off particles on a timer. Molang curves left out: the start/end values cover the common cases.
10. ✅ **Entity extras** (preset and Blockbench mobs): walk, fly (hover AI, no fall damage) or swim (water navigation, breathes water, spawns underwater); melee or ranged attacks (vanilla projectiles or your own, interval and range); taming (items, chance, follow/defend owner, sit); breeding (items, babies that grow up, optional tame-only); riding (steerable on walking mobs, seat height, optional tame-only); villager-style trades (economy trade table, two wanted items, restocks); ambient/hurt/death/footstep sounds (own or vanilla); random texture variants (render controller on `query.variant`). Built as component groups and events. ✅ saddles, steering with a held item (carrot-on-a-stick style, with boost), chests on mounts, flying mounts (happy ghast style, 1.21.90+), trade levels Novice to Master. Baby/sitting animations: use the animation slots on Blockbench mobs.
11. ✅ **Tags editor** for items and blocks: Tags field on every item/tool/food/armor/block/plant/crop with vanilla suggestions, a Tags tab listing every tag with its members (add/remove) and the recipes using it, `#tag` recipe ingredients, and "Player is holding an item tagged" / "Block has tag" conditions. **Block states**: on/off, number range (up to 16) or list states; rules that change texture, light, break time, slipperiness, map colour or collision when states match (exported as permutations); "Set block state", "Cycle block state" steps and "Block state is" condition; one-click "Change on click" procedure. ✅ rules that hide parts (bones) of a custom model. ⛔ tagging vanilla items (not possible in Bedrock).
12. ✅ **Localization editor**: a Languages tab for any of the 28 other languages Bedrock supports. Every text the add-on shows (item, block and mob names, spawn eggs, pack name and description, creative groups) with a translation box, progress per language, untranslated filter, and .lang download/upload for translating elsewhere. Missing lines fall back to English.
15. ✅ **Creative inventory groups**: your own collapsible groups with a name and icon in any creative tab (item catalog, Minecraft 1.21.60+), managed in Settings; blocks and items pick from your groups or Minecraft's.
13. ✅ **Music discs**: upload an .ogg (checked, length read automatically), icon template, volume and comparator signal. Bedrock's stable `minecraft:record` only accepts the vanilla disc sound events, so each disc plays through one vanilla disc's slot (picked automatically or by hand, clashes reported) and the resource pack points that slot at the song; the editor and export explain that the vanilla disc plays the song too. Discs work in your own loot tables. ⛔ own disc sound events until Mojang's beta record format is stable; ⛔ creeper drops (would mean replacing Minecraft's creeper loot table).
14. ✅ **Brewing recipes**: a Brewing recipe type for the brewing stand. "Turn one potion into another" (`minecraft:recipe_brewing_mix`, all 46 vanilla potion types by readable name) and "Change the bottle" (`minecraft:recipe_brewing_container`: potion, splash, lingering), with any item (yours included) as the ingredient. Bedrock has no custom potion types, so the editor points to drinkable Food elements for your own effects. Custom potions come with Phase 3's custom potion effects.

## Phase 3: closing Bedrock gaps with scripting 🔧

Bedrock has no data-driven version of these, so they're simulated with generated scripts:

- ✅ **Custom enchantments**: stored on the item (dynamic property + tooltip lore line), up to level X, for swords/axes/tools/bows/armour pieces/anything plus chosen items. Effects scale per level: on hit (extra damage, fire, effect on target, life steal, lightning chance, run a procedure with {level}), on block break (XP, effect, procedure), while worn/held (constant effect). Enchanted book items (use to pick an item; another copy raises the level), "Enchant held item" step and "Held item has enchantment" check. Bow enchantments carry over to the arrow. ✅ enchantments that can't share an item (both ways). Books sell through any custom trader. ⛔ enchanting table / anvil (not scriptable).
- ✅ **Custom potion effects**: stored on the player or mob (survives reloads), ticked once a second by script. While active: keep Minecraft effects on (optionally stronger per level), hurt or heal per second, particles, procedures every few seconds, on start and on end. Timer above the hotbar in a chosen colour, milk cure option, cleared on death. Optional drinkable potion (leaves a glass bottle). "Give custom effect" / "Remove custom effect" steps and "Has custom effect" check.
- 🔧 Achievements / advancements (tracked per player, toast via title/actionbar)
- ✅ **HUDs and screen overlays (JSON UI editor)**: a visual screen canvas with images, text (with § formatting), live text ({variable}, {score:name}, {player}) and segmented bars from a variable or scoreboard, each pinned to one of nine anchors and dragged into place. HUD mode is always on screen; overlay mode is shown and hidden by procedure steps (optionally for N seconds, with a dimmed background). Generates RP/ui/_ui_defs.json, a hud_screen.json modification and the panels; live values travel from the script as invisible titles caught by "preserved title" data controls, one per tick per player.
- ✅ **Custom form layouts and themed container screens (JSON UI)**: menu forms can switch from Minecraft's button list to a grid of tiles (columns, tile size, icon size, form size, text colour, optional body text) inside Minecraft's dialog frame or on your own background image with a title and close button. The script puts an invisible marker (formatting codes only) at the start of the title; `server_form.json` points vanilla's form factory at a switch that shows the vanilla form for unmarked titles and the matching layout for marked ones, so every other form (including other add-ons' forms) still looks normal. Storage blocks can have a screen background, drawn behind the title and slots of the data-driven container screen when its title matches. Custom potion effects now list on the left of the screen by default (like vanilla's effect list; up to 6), or above the hotbar per effect.
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

- **0.17.0** (Phase 3): Custom form layouts (a grid of tiles with your own sizes, colours and optional background image) and themed container screens (a background image for storage blocks), both made with JSON UI. Custom potion effects now show in a list on the left of the screen by default. Example: the Ruby shop is a 2-column grid. 186 tests.

- **0.16.0** (Phase 3): JSON UI editor for HUDs and screen overlays: images, text, live text and bars on a drag-and-drop screen canvas; overlays shown and hidden by new procedure steps. Example: a "Ruby stats" counter and a "New wand!" overlay. 176 tests.

- **0.15.0** (Phase 3): Custom potion effects run by script: Minecraft effect bundles, damage/heal over time, particles, procedures (every few seconds, on start, on end), an on-screen timer, milk cure, drinkable potion items, and give/remove/has steps. Potion bottle texture template. Example: Ruby Rush, sold by the Ruby Merchant. 168 tests.

- **0.14.0**: In-game scoreboards. Define them on the Variables tab (title, where they show, sort order); they're created when the world loads. New steps: Change score (set/add/subtract for the player, the target or a shared "global" score), Reset score, Show scoreboard, Hide scoreboard; a "Score compares to" check; a "score of" block; `{score:name}` in any text. Example: a "Rubies mined" sidebar. 163 tests.

- **0.13.0**: Finished the "not yet" notes inside done features: command item/block/mob/option arguments; list blocks; stair corners, fence gates, buttons and pressure plates (and fixed swapped east/west fence arms); crops that need water or daylight and berry-style picking; crossbows; saddles, item steering, mount chests, flying mounts and trade levels; flipbook particles and blocks that give off particles; state rules that hide model parts; conflicting enchantments. The rest are marked as impossible on Bedrock, with the reason. 158 tests.

- **0.12.0**: Finished the partly done features. Languages tab (translations for every in-game text, .lang download/upload); your own creative inventory groups with icons (1.21.60+) and a group picker with Minecraft's groups; 3D previews for items (as in the hand) and armour on a player. 138 tests.

- **0.11.0** (Phase 3, item 1): Custom enchantments run by script: on-hit, on-break and worn/held effects that scale per level, enchanted books, an "Enchant held item" step and a "Held item has enchantment" check. Examples: Vampire (life steal, wither) and Ruby Sight (night vision helmet), sold by the Ruby Merchant. 130 tests.

- **0.10.0** (Phase 2, item 14): Brewing recipes. Turn one vanilla potion into another, or change the bottle (splash, lingering), with any item as the ingredient. Example: a ruby turns an awkward potion into Regeneration II. 124 tests.

- **0.9.0** (Phase 2, item 13): Music discs with your own .ogg song, automatic length, volume, comparator signal and a disc icon template. Each disc plays through a vanilla disc's sound slot (Bedrock's stable record component only allows those). 120 tests.

- **0.8.0** (Phase 2, item 11): Tags and block states. Tags field on all items and blocks, a Tags tab, `#tag` recipe ingredients and tag conditions; custom block states with rules (texture, light, break time, slipperiness, map colour, collision) and Set/Cycle block state steps plus a "Block state is" condition. Example: a Ruby Lamp that switches on and off when clicked. 115 tests.

- **0.7.2**: GitHub Pages works in either mode: a built copy of the app is committed in `site/` (`npm run build:site`), and the raw `index.html` forwards there when Pages publishes the repository as-is. `.nojekyll` skips GitHub's Jekyll step.

- **0.7.1**: If the repository's raw `index.html` is published unbuilt (GitHub Pages set to "Deploy from a branch"), the page now explains how to switch Pages to the build workflow instead of staying blank.

- **0.7.0** (Phase 2, item 10): Mob extras for preset and Blockbench mobs: flying and swimming, ranged attacks, taming, breeding with babies, riding, trades, mob sounds and random texture variants. Example: the Ember Boar breeds and can be ridden, the Ruby Golem throws ruby shards, and a new Ruby Merchant trades. 108 tests.

- **0.6.1**: Fix the extra whole-page scrollbar: on/off switches' hidden checkboxes were positioned against the page, stretching it below the window. The layout rows are now also capped so only the sidebar and editor scroll.

- **0.6.0** (Phase 2, item 9): Particle effects. Designer with live 3D preview, built-in sprites or your own texture, colour/opacity/size over lifetime, burst or stream, spawn area and direction, gravity, air resistance, spin, block collisions, and seven presets. New "Spawn particles" step (your effects or Minecraft's). The example wand now sparkles. 97 tests.

- **0.5.1**: Fix custom block model import: file pickers no longer filter by file type (phones and tablets greyed out `.bbmodel` and `.mcstructure` files); "Import .bbmodel…" button right under Shape on every block (switches it to the custom model); drag-and-drop a model onto the block's Look section; the model panel now sits under Shape instead of below the textures; clearer messages for wrong files; models too big or too far outside the block for Minecraft to draw are flagged in the editor and at export. 88 tests.

- **0.5.0** (Phase 2, item 8): Structures. Import `.mcstructure` files, preview them in 3D, put loot tables in their chests, generate them in the world with placement rules, and place them from procedures with the new "Place structure" step. Example project gains a Ruby Shrine. 84 tests.

- **0.4.0** (Phase 2, items 5-7): Projectiles and ranged items (throwables, bows, ammo, on-hit damage/fire/effects, "projectile hits" triggers); block shapes (slab, stairs, carpet, trapdoor, door, fence, wall, pane) with 3D previews; crops with growth stages, bone meal and seeds. New texture templates: crop, seeds, orb, bow, arrow. The example project gains ruby brick slab/stairs/wall, a throwing shard and a ruby berry crop. 76 tests.

- **0.3.2**: Vanilla templates work where GitHub is blocked (like the claude.ai preview): import Minecraft's vanilla behaviour/resource pack ZIPs (or the bedrock-samples ZIP, .mcpack or loose .json) once; the app keeps only what templates need (~3 MB) in the browser, picks the newest look per mob, and adds sounds, model and default texture for the preview. Mobs in newer packs appear automatically. Adds a GitHub Pages workflow for self-hosting. 65 tests.

- **0.3.1**: Fix vanilla mob templates: files squashed onto one line (whose `//` comments cut off the rest) are recovered with a note; uploads are checked on arrival (either order, same mob, right kind of file) with specific messages instead of a misleading "missing" error at export; upload is always available, both files at once. Copies now point breeding partners, offspring and spawned babies at themselves instead of the vanilla mob. Manual model JSON uploads are cleaned the same way. 62 tests.

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
