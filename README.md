# Bedrock Creator

A web app for making Minecraft Bedrock add-ons without writing code. Think MCreator, built for Bedrock and running in the browser.

- **Content:** blocks (custom models, crafting stations, storage, redstone), plants, items, tools, armor, food, mobs (Blockbench import, animated 3D preview, or start from any vanilla mob), recipes, loot tables
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

### Publish it on GitHub Pages

The repo includes `.github/workflows/pages.yml`. Push to GitHub, then in the repository go to **Settings → Pages → Source: GitHub Actions**. (If Pages is left on "Deploy from a branch", the raw `index.html` forwards to `site/`, a committed copy of the built app; refresh it with `npm run build:site` before pushing.) Every push then tests, builds and publishes the app at `https://<your-name>.github.io/<repo>/`. Hosted this way, vanilla mob templates download straight from Mojang's GitHub and add-ons download as `.mcaddon` files.

## Vanilla mob templates

`src/vanilla/index.json` lists Minecraft's mobs and where their files live in [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) (ids and file names only). The app downloads a mob's files from that repository when someone picks it, or reads them from Minecraft's vanilla behaviour/resource pack ZIPs that the user imports once (kept in their browser; needed where the page can't reach GitHub, such as the claude.ai preview). Those files are © Mojang AB under the Minecraft EULA and are not stored in this repo. To rebuild the index for a newer release:

```bash
TAG=v1.26.60.5 node scripts/build-vanilla-index.mjs path/to/bedrock-samples
```

## Test

```bash
npm test
```

Tests generate a full add-on from a fixture project, check every file, and type-check the generated JavaScript against the official `@minecraft/server` typings.

## Plan

See [DEVPLAN.md](DEVPLAN.md) for the roadmap and the MCreator → Bedrock feature matrix.

Not affiliated with Mojang or Microsoft. Minecraft is a trademark of Mojang AB.
