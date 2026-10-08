import { Hono } from "hono";
import { hasAiKey, modelMap } from "../ai/provider.js";
import { bridgeHealth, bridgeTools } from "../bridge/client.js";

/** Top-level status routes only. Case AI routes live on /cases. */
export const ai = new Hono();

ai.get("/models", (c) => {
  return c.json({ models: modelMap(), configured: hasAiKey() });
});

ai.get("/mcp/status", async (c) => {
  const health = await bridgeHealth();
  let tools: { name: string; description?: string }[] = [];
  if (health.ok) {
    try {
      const t = await bridgeTools();
      tools = t.tools || [];
    } catch {
      /* ignore */
    }
  }
  return c.json({ ...health, tools });
});
