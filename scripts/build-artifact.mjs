// Packs dist/ into one self-contained HTML page (no <html>/<head>/<body>) for hosting as a claude.ai artifact.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";

const assets = readdirSync("dist/assets");
// The page must be one file: a second script chunk would be missing once hosted.
if (assets.filter((f) => f.endsWith(".js")).length !== 1) throw new Error(`Expected one JS bundle in dist/assets, found: ${assets.join(", ")}. Avoid dynamic import().`);
const css = readFileSync(`dist/assets/${assets.find((f) => f.endsWith(".css"))}`, "utf8");
const js = readFileSync(`dist/assets/${assets.find((f) => f.endsWith(".js"))}`, "utf8").replace(/<\/script/gi, "<\\/script");

const page = `<title>Bedrock Creator</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Silkscreen&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
mkdirSync("dist-artifact", { recursive: true });
writeFileSync("dist-artifact/bedrock-creator.html", page);
console.log(`dist-artifact/bedrock-creator.html ${(page.length / 1024).toFixed(0)} KB`);
