import ts from "typescript";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Type-checks generated main.js against real Script API typings. Returns readable errors (empty = OK). */
export function typecheckScript(src: string, serverTypings = "node_modules/@minecraft/server/index.d.ts"): string[] {
  const dir = mkdtempSync(join(tmpdir(), "bc-script-"));
  const file = join(dir, "main.js");
  writeFileSync(file, src);
  // Minecraft's script runtime provides console.
  writeFileSync(join(dir, "env.d.ts"), "declare const console: { log(...a: unknown[]): void; warn(...a: unknown[]): void };");
  const program = ts.createProgram([file, join(dir, "env.d.ts")], {
    allowJs: true, checkJs: true, noEmit: true, strict: false, noImplicitAny: false,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts"], types: [],
    baseUrl: resolve("."), paths: {
      "@minecraft/server": [resolve(serverTypings)],
      "@minecraft/server-ui": [resolve("node_modules/@minecraft/server-ui/index.d.ts")],
    },
  });
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, "\n");
    if (!d.file || d.start === undefined) return msg;
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${line + 1}: ${msg}\n    ${src.split("\n")[line]}`;
  });
}
