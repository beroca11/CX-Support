import { createGateway, embedMany } from "ai";
import { hasAiKey } from "./provider.js";
import { bridgeCall } from "../bridge/client.js";

export type KbHit = {
  id: string;
  title: string;
  text: string;
  score: number;
  method: "vector" | "keyword";
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "issue",
  "customer",
  "about",
  "have",
  "been",
  "were",
  "was",
  "are",
]);

function clip(text: string, max = 6000): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max);
}

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || []).filter(
    (w) => !STOP.has(w),
  );
}

export function kbQueries(input: {
  title: string;
  product: string;
  caseType: string;
  summary: string;
  extra?: string;
}): string[] {
  const phrase = (s: string) =>
    s
      .replace(/['"\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  const qs = [
    phrase(input.extra || ""),
    phrase(input.product),
    phrase(input.title),
    phrase(`${input.caseType} ${input.product}`),
    phrase(input.summary),
  ];
  return [...new Set(qs.filter((q) => q.length >= 3))].slice(0, 4);
}

function driveQuery(text: string): string {
  const folder = (process.env.EES_KB_FOLDER_ID || "").replace(/'/g, "").trim();
  const safe = text.replace(/'/g, "\\'");
  const match = `(fullText contains '${safe}' or name contains '${safe}')`;
  return folder
    ? `'${folder}' in parents and ${match} and trashed = false`
    : `${match} and trashed = false`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function fileList(payload: unknown): { id: string; name: string; mimeType: string }[] {
  let data = payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = payload;
    }
  }
  const rec = asRecord(data);
  const list = Array.isArray(data)
    ? data
    : rec
      ? rec.files || rec.items || rec.results || rec.data
      : [];
  const rows = Array.isArray(list) ? list : [];
  const out: { id: string; name: string; mimeType: string }[] = [];
  for (const row of rows) {
    const file = asRecord(row);
    if (!file) continue;
    const id = String(file.id || file.file_id || file.fileId || "");
    if (!id) continue;
    out.push({
      id,
      name: String(file.name || file.title || "(untitled)"),
      mimeType: String(file.mimeType || file.mime_type || ""),
    });
  }
  return out;
}

function textOf(payload: unknown): string {
  if (typeof payload === "string") return payload;
  const rec = asRecord(payload);
  if (!rec) return payload == null ? "" : JSON.stringify(payload);
  const direct = rec.text || rec.body || rec.content || rec.values;
  if (typeof direct === "string") return direct;
  return JSON.stringify(payload);
}

async function readFile(file: {
  id: string;
  name: string;
  mimeType: string;
}): Promise<string> {
  try {
    if (file.mimeType.toLowerCase().includes("spreadsheet")) {
      const raw = await bridgeCall("read_sheet_values", {
        spreadsheet_id: file.id,
        range_name: "A1:Z80",
      });
      return clip(textOf(raw));
    }
    const raw = await bridgeCall("get_doc_content", { document_id: file.id });
    return clip(textOf(raw));
  } catch {
    return "";
  }
}

function keywordScore(issue: string, text: string): number {
  const want = new Set(tokens(issue));
  if (!want.size) return 0;
  const have = new Set(tokens(text));
  let hit = 0;
  for (const word of want) if (have.has(word)) hit += 1;
  return hit / want.size;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

async function rank(
  issue: string,
  docs: { title: string; text: string }[],
): Promise<{ score: number; method: "vector" | "keyword" }[]> {
  const keyword = docs.map((doc) => ({
    score: keywordScore(issue, `${doc.title}\n${doc.text}`),
    method: "keyword" as const,
  }));
  if (!hasAiKey() || docs.length === 0) return keyword;
  try {
    const key = process.env.AI_GATEWAY_API_KEY;
    if (!key) return keyword;
    const model = createGateway({ apiKey: key }).textEmbeddingModel(
      process.env.MODEL_EMBED || "openai/text-embedding-3-small",
    );
    const { embeddings } = await embedMany({
      model,
      values: [
        issue.slice(0, 2000),
        ...docs.map((doc) => `${doc.title}\n${doc.text}`.slice(0, 2000)),
      ],
    });
    return docs.map((_, i) => ({
      score: cosine(embeddings[0], embeddings[i + 1]),
      method: "vector" as const,
    }));
  } catch {
    return keyword;
  }
}

/** Read one Drive article when a search excerpt is not enough to state the fix. */
export async function readKnowledge(fileId: string): Promise<KbHit | null> {
  const id = fileId.replace(/^drive:/, "").trim();
  if (!id) return null;
  const text = await readFile({ id, name: "", mimeType: "" });
  const sheet = text ? "" : await readFile({ id, name: "", mimeType: "spreadsheet" });
  const body = text || sheet;
  if (!body.trim()) return null;
  return {
    id: `drive:${id}`,
    title: id,
    text: body,
    score: 1,
    method: "keyword",
  };
}

/** Search Drive knowledge articles and rank them against the issue. */
export async function searchKnowledge(
  issue: string,
  opts?: { queries?: string[]; exclude?: Set<string> },
): Promise<KbHit[]> {
  const queries = (opts?.queries?.length ? opts.queries : [issue])
    .map((q) => q.trim())
    .filter((q) => q.length >= 3)
    .slice(0, 4);
  if (!queries.length) return [];

  const found = new Map<string, { id: string; name: string; mimeType: string }>();
  await Promise.all(
    queries.map(async (q) => {
      try {
        const raw = await bridgeCall("search_drive_files", {
          query: driveQuery(q),
          page_size: 8,
        });
        for (const file of fileList(raw)) {
          const id = `drive:${file.id}`;
          if (opts?.exclude?.has(id) || found.has(id)) continue;
          found.set(id, file);
        }
      } catch {
        /* one query failing should not drop the rest */
      }
    }),
  );

  const files = [...found.values()].slice(0, 6);
  const docs = await Promise.all(
    files.map(async (file) => ({
      id: `drive:${file.id}`,
      title: file.name,
      text: await readFile(file),
    })),
  );
  const readable = docs.filter((doc) => doc.text.trim());
  const scores = await rank(issue, readable);
  return readable
    .map((doc, i) => ({ ...doc, ...scores[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
