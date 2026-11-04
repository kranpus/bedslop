/** Parses JSON that may contain // and /* *\/ comments and trailing commas (as Minecraft's own files do). */
export function parseLenientJson(text: string): unknown {
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
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  // Trailing commas before } or ] (outside strings, which are already intact).
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
