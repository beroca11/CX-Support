import { z } from "zod";
import { escalateObject } from "../escalate.js";
import { recordRun, usageTokens } from "../runs.js";
import { activeValues } from "../../lib/picklists.js";

const schema = z.object({
  title: z.string(),
  customer: z.string().default(""),
  caseType: z.string(),
  severity: z.string(),
  product: z.string().default(""),
  region: z.string().default(""),
  intake: z.string().default(""),
  summary: z.string(),
  identifiers: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.7),
});

export async function classifyIntake(text: string, caseId?: string) {
  const [caseTypes, severities, products, regions, intakes] = await Promise.all([
    activeValues("caseType"),
    activeValues("severity"),
    activeValues("product"),
    activeValues("region"),
    activeValues("intake"),
  ]);

  const system = `You classify executive escalation intake.
Pick caseType from: ${caseTypes.join(", ") || "Other"}.
Pick severity from: ${severities.join(", ") || "High"}.
Pick intake from: ${intakes.join(", ") || "Exec"}. Intake is who escalated it: Exec, Prosumer, Jordan, HBR, or Social Escalation. Leave intake empty when the text does not say.
Product options (or empty): ${products.join(", ") || "(none)"}.
Region options (or empty): ${regions.join(", ") || "(none)"}.
Extract account/order/ticket identifiers when present.
Return confidence 0-1. Do not invent facts.`;

  const started = Date.now();
  try {
    const result = await escalateObject({
      schema,
      system,
      prompt: text,
      confidence: (o) => o.confidence,
    });
    if (
      result.object.intake &&
      intakes.length > 0 &&
      !intakes.includes(result.object.intake)
    ) {
      result.object.intake = "";
    }
    const tokens = usageTokens(result.usage);
    await recordRun({
      caseId,
      task: "classify",
      model: result.model,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      durationMs: Date.now() - started,
      steps: result.escalated ? 2 : 1,
      ok: true,
    });
    return result.object;
  } catch (e) {
    await recordRun({
      caseId,
      task: "classify",
      model: "none",
      durationMs: Date.now() - started,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
