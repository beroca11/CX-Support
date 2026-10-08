import { createGateway, generateObject, generateText, stepCountIs, type LanguageModel } from "ai";
import type { z } from "zod";

export type ModelRole = "fast" | "reason" | "write";

const defaults: Record<ModelRole, string> = {
  fast: "openai/gpt-4.1-mini",
  reason: "openai/gpt-4.1",
  write: "openai/gpt-4.1-mini",
};

export function modelMap(): Record<ModelRole, string> {
  return {
    fast: process.env.MODEL_FAST || defaults.fast,
    reason: process.env.MODEL_REASON || defaults.reason,
    write: process.env.MODEL_WRITE || defaults.write,
  };
}

export function hasAiKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

function gateway() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not set");
  return createGateway({ apiKey: key });
}

export function getModel(role: ModelRole): LanguageModel {
  const id = modelMap()[role];
  return gateway()(id);
}

export function modelId(role: ModelRole): string {
  return modelMap()[role];
}

export async function genObject<T extends z.ZodType>(opts: {
  role: ModelRole;
  schema: T;
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  schemaName?: string;
  schemaDescription?: string;
  repairText?: (options: { text: string }) => Promise<string | null>;
}) {
  const result = await generateObject({
    model: getModel(opts.role),
    schema: opts.schema,
    schemaName: opts.schemaName,
    schemaDescription: opts.schemaDescription,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
    experimental_repairText: opts.repairText
      ? async ({ text }) => opts.repairText?.({ text }) ?? null
      : undefined,
  });
  return {
    object: result.object as z.infer<T>,
    usage: result.usage,
    model: modelId(opts.role),
  };
}

export async function genText(opts: {
  role: ModelRole;
  system: string;
  prompt: string;
  tools?: Parameters<typeof generateText>[0]["tools"];
  maxSteps?: number;
  maxOutputTokens?: number;
}) {
  const result = await generateText({
    model: getModel(opts.role),
    system: opts.system,
    prompt: opts.prompt,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxSteps ?? 1),
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  });
  return {
    text: result.text,
    usage: result.usage,
    steps: result.steps?.length ?? 1,
    model: modelId(opts.role),
  };
}
