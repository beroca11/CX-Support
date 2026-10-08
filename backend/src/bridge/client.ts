const base = () => process.env.MCP_BRIDGE_URL || "http://localhost:8100";

export type BridgeSource = {
  id: string;
  kind: string;
  title: string;
  from?: string;
  date: string;
  snippet: string;
  text: string;
};

export type PrefetchResult = {
  sources: BridgeSource[];
  queries: string[];
};

async function bridgeFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bridge ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function bridgeHealth(): Promise<{
  ok: boolean;
  tools?: number;
  error?: string;
}> {
  try {
    return await bridgeFetch("/health");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function bridgeTools(): Promise<{ tools: { name: string; description?: string }[] }> {
  return bridgeFetch("/tools");
}

export async function bridgeConfigure(settings: Record<string, unknown>): Promise<{
  ok: boolean;
  name: string;
  tools: number;
  error?: string | null;
}> {
  return bridgeFetch("/settings", {
    method: "POST",
    body: JSON.stringify({ settings }),
  });
}

export async function bridgeCall(
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const data = await bridgeFetch("/call", {
    method: "POST",
    body: JSON.stringify({ tool, args }),
  });
  return data.result ?? data;
}

export async function bridgeBatch(
  calls: { tool: string; args: Record<string, unknown> }[],
): Promise<unknown[]> {
  const data = await bridgeFetch("/batch", {
    method: "POST",
    body: JSON.stringify({ calls }),
  });
  return data.results ?? data;
}

export async function bridgePrefetch(input: {
  caseId: string;
  customer: string;
  subject: string;
  identifiers?: string[];
  since?: string;
}): Promise<PrefetchResult> {
  return bridgeFetch("/prefetch/case", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
