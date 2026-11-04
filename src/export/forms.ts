// Forms (MCreator GUIs) → @minecraft/server-ui code.
import { formMarker, layoutForms } from "./screens";
import { fnName } from "../model/logic";
import type { FormElement } from "../model/types";
import type { GenContext } from "./context";
import { actionsBody } from "./scripts";

const S = JSON.stringify;

export function genForm(ctx: GenContext, f: FormElement) {
  const fn = fnName("form", f.name);
  const label = `Form ${f.displayName}`;
  const icon = (texId: string) => {
    if (!texId) return "";
    const tex = ctx.texture(texId);
    if (!tex) return "";
    return ctx.writeTexture(texId, tex.kind === "block" ? "blocks" : "items");
  };
  let build = "";
  let handle = "";
  switch (f.formType) {
    case "menu": {
      ctx.script.uiImports.add("ActionFormData");
      if (!f.buttons.length) ctx.warn(f, "has no buttons yet.");
      // A custom layout is picked by an invisible marker at the start of the title.
      const li = layoutForms(ctx.project.elements.filter((e): e is FormElement => e.kind === "form")).findIndex((x) => x.id === f.id);
      const marker = li >= 0 ? `${S(formMarker(li))} + ` : "";
      build = `const form = new ActionFormData().title(${marker}BC.fmt(ctx, ${S(f.title)})).body(BC.fmt(ctx, ${S(f.body)}));\n` +
        f.buttons.map((b) => {
          const path = icon(b.icon);
          return `form.button(BC.fmt(ctx, ${S(b.text)})${path ? `, ${S(path)}` : ""});\n`;
        }).join("");
      handle = `switch (res.selection) {\n` + f.buttons.map((b, i) =>
        `  case ${i}: {\n${actionsBody(b.actions, `${label} → ${b.text}`, 2)}    break;\n  }\n`).join("") + `}\n`;
      break;
    }
    case "input": {
      ctx.script.uiImports.add("ModalFormData");
      const fields = f.fields;
      if (!fields.some((x) => x.kind !== "label")) ctx.warn(f, "has no input fields yet.");
      build = `const form = new ModalFormData().title(BC.fmt(ctx, ${S(f.title)}));\n` + fields.map((x) => {
        const l = `BC.fmt(ctx, ${S(x.label)})`;
        switch (x.kind) {
          case "text": return `form.textField(${l}, ${S(x.placeholder)}, { defaultValue: BC.fmt(ctx, ${S(x.defaultValue)}) });\n`;
          case "slider": return `form.slider(${l}, ${Number(x.min) || 0}, ${Number(x.max) || 10}, { valueStep: ${Math.max(1, Number(x.step) || 1)}, defaultValue: ${Number(x.defaultValue) || Number(x.min) || 0} });\n`;
          case "dropdown": return `form.dropdown(${l}, ${S(x.options.length ? x.options : ["Option"])}, { defaultValueIndex: ${Math.max(0, x.options.indexOf(x.defaultValue))} });\n`;
          case "toggle": return `form.toggle(${l}, { defaultValue: ${x.defaultValue === "true"} });\n`;
          default: return `form.label(${l});\n`;
        }
      }).join("") + `form.submitButton(BC.fmt(ctx, ${S(f.submitText || "Done")}));\n`;
      // formValues has one entry per element, in order (labels give undefined).
      handle = `const values = res.formValues ?? [];\nconst args = { ...(ctx.args ?? {}) };\n` + fields.map((x, i) => {
        if (x.kind === "label") return "";
        const raw = x.kind === "dropdown" ? `${S(x.options)}[Number(values[${i}])] ?? ""` : `values[${i}]`;
        const key = x.key || `field${i + 1}`;
        let out = `args[${S(key)}] = ${raw};\n`;
        if (x.variable) out += `BC.run(${S(`${label} → save ${key}`)}, () => BC.setVar(ctx, ${S(x.variable)}, "player", "set", args[${S(key)}]));\n`;
        return out;
      }).join("") + `{\n  const ctx2 = { ...ctx, args };\n  ((ctx) => {\n${actionsBody(f.submitActions, `${label} → submit`, 2)}  })(ctx2);\n}\n`;
      break;
    }
    case "confirm": {
      ctx.script.uiImports.add("MessageFormData");
      build = `const form = new MessageFormData().title(BC.fmt(ctx, ${S(f.title)})).body(BC.fmt(ctx, ${S(f.body)}))` +
        `.button1(BC.fmt(ctx, ${S(f.yesText || "Yes")})).button2(BC.fmt(ctx, ${S(f.noText || "No")}));\n`;
      handle = `if (res.selection === 0) {\n${actionsBody(f.yesActions, `${label} → ${f.yesText}`, 1)}} else {\n${actionsBody(f.noActions, `${label} → ${f.noText}`, 1)}}\n`;
      break;
    }
  }
  const indent = (code: string, n: number) => code.split("\n").map((l) => (l ? "  ".repeat(n) + l : l)).join("\n");
  ctx.script.sections.push(`// Form: ${f.displayName}
function ${fn}(ctx, tries = 0) {
  const player = ctx.player;
  if (!player) return;
${indent(build, 1)}
  form.show(player).then((res) => {
    // The player was busy in another screen (e.g. still in chat): try again shortly.
    if (res.canceled) {
      if (String(res.cancelationReason) === "UserBusy" && tries < 20) system.runTimeout(() => ${fn}(ctx, tries + 1), 10);
      return;
    }
${indent(handle, 2)}
  }).catch((err) => console.warn(\`[\${NAMESPACE}] ${label} failed: \${err}\`));
}
`);
}
