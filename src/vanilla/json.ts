/**
 * Parses JSON that may contain // and /* *\/ comments and trailing commas (as Minecraft's own files do).
 * Throws a readable error if the text can't be understood.
 */
export function parseLenientJson(text: string): unknown {
  return parseLenientJsonWithNote(text).value;
}

export interface LenientResult {
  value: unknown;
  /** True when the file had been squashed onto one line and comments had to be cut short to read it. */
  repaired: boolean;
}

export function parseLenientJsonWithNote(text: string): LenientResult {
  const clean = (t: string) => t.replace(/^﻿/, "");
  try {
    return { value: JSON.parse(stripComments(clean(text), false).replace(/,(\s*[}\]])/g, "$1")), repaired: false };
  } catch (first) {
    // A file squashed onto one line keeps its // comments, which then swallow the rest of the line.
    // Mojang's comments never contain quotes, so end each // comment where the next quoted key starts.
    if (/\/\/[^\n"]*"/.test(text)) {
      try {
        return { value: JSON.parse(stripComments(clean(text), true).replace(/,(\s*[}\]])/g, "$1")), repaired: true };
      } catch { /* fall through to the original error */ }
    }
    throw first;
  }
}

function stripComments(text: string, endAtQuote: boolean): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") { out += n ?? ""; i++; }
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n" && !(endAtQuote && text[i] === '"')) i++;
      if (endAtQuote && text[i] === '"') i--; // let the quote start the next token
      out += "\n";
      continue;
    }
    if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out;
}

/** Re-formats JSON text (with comments or squashed lines) as clean, indented JSON. Returns null if unreadable. */
export function normalizeJsonText(text: string): { text: string; repaired: boolean } | null {
  try {
    const r = parseLenientJsonWithNote(text);
    return { text: JSON.stringify(r.value, null, 2), repaired: r.repaired };
  } catch {
    return null;
  }
}
