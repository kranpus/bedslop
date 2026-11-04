// Copies the built app (dist/) into site/, which is committed. GitHub Pages set to "Deploy from a branch"
// publishes the raw repository; its index.html then forwards to site/ so the app still works.
import { cpSync, rmSync, writeFileSync } from "node:fs";

rmSync("site", { recursive: true, force: true });
cpSync("dist", "site", { recursive: true });
writeFileSync("site/README.md", "Built copy of the app for GitHub Pages branch deploys. Regenerate with `npm run build:site`; don't edit by hand.\n");
console.log("site/ updated from dist/");
