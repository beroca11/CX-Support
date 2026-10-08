import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { migrate } from "./db/client.js";
import { cases } from "./routes/cases.js";
import { picklists } from "./routes/picklists.js";
import { ai } from "./routes/ai.js";
import { hasAiKey, modelMap } from "./ai/provider.js";
import { bridgeConfigure, bridgeHealth, bridgeTools } from "./bridge/client.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.get("/models", (c) =>
  c.json({ models: modelMap(), configured: hasAiKey() }),
);

app.get("/mcp/status", async (c) => {
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

app.post("/mcp/config", async (c) => {
  const body = await c.req.json().catch(() => null);
  const settings = body?.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return c.json({ error: "Paste MCP settings JSON" }, 400);
  }
  if (JSON.stringify(settings).length > 20000) {
    return c.json({ error: "Settings are too large" }, 400);
  }
  try {
    const result = await bridgeConfigure(settings);
    console.log(JSON.stringify({ action: "mcp_config", name: result.name, ok: result.ok }));
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Connect failed";
    const jsonAt = message.indexOf("{");
    if (jsonAt >= 0) {
      try {
        const detail = JSON.parse(message.slice(jsonAt)).detail;
        if (typeof detail === "string") {
          const status = message.includes("failed: 400") ? 400 : 502;
          return c.json({ error: detail }, status);
        }
      } catch {
        /* keep the bridge message */
      }
    }
    return c.json({ error: "MCP reconnect failed" }, 502);
  }
});

// AI routes first so /cases/classify and /cases/:id/ai/* are not eaten by /:id
app.route("/", ai);
app.route("/cases", cases);
app.route("/picklists", picklists);

const port = Number(process.env.PORT || 4000);

async function main() {
  await migrate();
  console.log(JSON.stringify({ action: "migrate", ok: true }));
  serve({ fetch: app.fetch, port }, () => {
    console.log(JSON.stringify({ action: "listen", port }));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
