import type { DamageTypeElement } from "../../model/types";
import { DAMAGE_CAUSES } from "../../model/vanilla";
import { Section, Select, Text, Toggle } from "../fields";
import type { Patch } from "./types";

const fill = (t: string) => t.replace(/\{victim\}/g, "Steve").replace(/\{attacker\}/g, "Alex");

export function DamageEditor({ el, patch }: { el: DamageTypeElement; patch: Patch<DamageTypeElement> }) {
  const cause = DAMAGE_CAUSES.find((c) => c.value === el.cause) ?? DAMAGE_CAUSES[0];
  return (
    <>
      <Section title="Damage type" hint="Bedrock can't add new kinds of damage, so this one works like one of Minecraft's and shows its own death message.">
        <Select label="Works like" value={el.cause} onChange={(c) => patch({ cause: c })} options={DAMAGE_CAUSES.map((c) => ({ value: c.value, label: c.label }))} help={cause.help} />
        <Toggle label="Scales with difficulty" value={el.scaleWithDifficulty} onChange={(scaleWithDifficulty) => patch({ scaleWithDifficulty })}
          help="On players: about half on Easy, 1.5× on Hard, none on Peaceful." />
      </Section>
      <Section title="Death messages" hint="Shown in chat when a player dies from it.">
        <Text label="Message" value={el.deathMessage} onChange={(deathMessage) => patch({ deathMessage }, "msg")} placeholder="{victim} was zapped" />
        <Text label="When someone caused it" value={el.deathMessageBy} onChange={(deathMessageBy) => patch({ deathMessageBy }, "by")} placeholder="{victim} was zapped by {attacker}" />
        <div className="death-preview" aria-label="Chat preview">
          {el.deathMessage && <div>{fill(el.deathMessage)}</div>}
          {(el.deathMessageBy || el.deathMessage) && <div>{fill(el.deathMessageBy || el.deathMessage)}</div>}
        </div>
        <p className="field-help">Use {"{victim}"} for who died and {"{attacker}"} for who caused it. Minecraft's own message is hidden for that moment, and nothing shows if the world turns death messages off.</p>
      </Section>
      <Section title="Using it">
        <p className="field-help">Add the <strong>Deal custom damage</strong> step to a procedure, command, form button or key binding: choose who's hurt, how much, and who caused it.</p>
      </Section>
    </>
  );
}
