# Bedrock Creator

A web app for making Minecraft Bedrock add-ons without writing code. Think MCreator, built for Bedrock and running in the browser.

- **Content:** blocks, plants, items, tools, armor, food, mobs (with Blockbench import and an animated 3D preview), recipes, loot tables
- **World:** ore generation, natural plant and mob spawning
- **Logic:** procedures as simple "When → Only if → Do" steps or as Blockly blocks (loops, variables, math, waits), custom slash commands with arguments, global variables, and forms (button menus, input forms, yes/no dialogs), all compiled to the official Script API
- **Art:** built-in pixel editor with 24 procedural templates, plus a Material Pack wizard that builds a full ore/tool/armor set from one name and colour
- **Export:** a ready-to-import `.mcaddon` (or separate `.mcpack` files) with validation before you download

Projects save automatically in your browser. Nothing is uploaded.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the printed local URL. To build a static site you can host anywhere (GitHub Pages, Netlify, etc.):

```bash
npm run build
```

The output in `dist/` is fully static.

## Test

```bash
npm test
```

Tests generate a full add-on from a fixture project, check every file, and type-check the generated JavaScript against the official `@minecraft/server` typings.

## Plan

See [DEVPLAN.md](DEVPLAN.md) for the roadmap and the MCreator → Bedrock feature matrix.

Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang AB.
