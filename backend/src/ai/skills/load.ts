import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Skill = {
  name: string;
  when: "always" | "email" | "slack";
  body: string;
};

function parseSkill(raw: string): Skill {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error("A revise skill is missing its header.");
  const meta = Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf(":");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
  const when = meta.when;
  if (when !== "always" && when !== "email" && when !== "slack") {
    throw new Error(`Skill ${meta.name || "?"} has an unknown when.`);
  }
  return { name: meta.name, when, body: match[2].trim() };
}

const skills: Skill[] = readdirSync(dirname(fileURLToPath(import.meta.url)))
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => parseSkill(readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), "utf8")));

/** Always-on skills, the skill for this channel, and any skill the note names. */
export function skillsFor(instruction: string, channel: string): Skill[] {
  return skills.filter((skill) => {
    if (skill.when === "always" || skill.when === channel) return true;
    return new RegExp(`\\b${skill.name}\\b`, "i").test(instruction);
  });
}

export function formatSkills(picked: Skill[]): string {
  return picked.map((skill) => `## ${skill.name}\n${skill.body}`).join("\n\n");
}
