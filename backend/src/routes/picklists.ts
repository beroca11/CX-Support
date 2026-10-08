import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { z } from "zod";
import { query } from "../db/client.js";
import { loadPicklists } from "../lib/picklists.js";
import { bridgeCall } from "../bridge/client.js";

export const picklists = new Hono();

type PickRow = { list: string; value: string; active: boolean };

function cellGrid(payload: unknown): string[][] {
  let data = payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  const rec =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  const range = Array.isArray(rec?.valueRanges)
    ? (rec.valueRanges[0] as Record<string, unknown> | undefined)
    : null;
  const values = Array.isArray(data)
    ? data
    : rec?.values || range?.values || rec?.data || rec?.rows;
  if (!Array.isArray(values)) return [];
  return values.map((row) =>
    Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [],
  );
}

function rowsFromGrid(grid: string[][]): PickRow[] {
  const rows: PickRow[] = [];
  for (const [i, row] of grid.entries()) {
    const [list, value, active] = row;
    if (!list || !value) continue;
    if (i === 0 && list.toLowerCase() === "list") continue;
    const flag = (active || "TRUE").toLowerCase();
    rows.push({
      list,
      value,
      active: !["false", "0", "no", "inactive"].includes(flag),
    });
  }
  return rows;
}

function exampleRows(): PickRow[] {
  const file = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../db/picklists.example.csv",
  );
  const text = fs.readFileSync(file, "utf8");
  const grid = text
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()));
  return rowsFromGrid(grid);
}

async function replaceLists(rows: PickRow[]) {
  const grouped = new Map<string, PickRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.list) || [];
    list.push(row);
    grouped.set(row.list, list);
  }
  const counts: Record<string, number> = {};
  for (const [name, values] of grouped) {
    await query(`DELETE FROM picklists WHERE name = $1`, [name]);
    for (const v of values) {
      await query(
        `INSERT INTO picklists (name, value, active) VALUES ($1,$2,$3)`,
        [name, v.value, v.active],
      );
    }
    counts[name] = values.filter((v) => v.active).length;
  }
  return counts;
}

picklists.get("/", async (c) => {
  return c.json({ picklists: await loadPicklists() });
});

picklists.post("/sync", async (c) => {
  const sheetId = (process.env.EES_PICKLIST_SHEET_ID || "").trim();
  try {
    let rows: PickRow[];
    let source: "sheet" | "example";
    if (sheetId) {
      const raw = await bridgeCall("read_sheet_values", {
        spreadsheet_id: sheetId,
        range_name: "Picklists!A:C",
      });
      rows = rowsFromGrid(cellGrid(raw));
      source = "sheet";
    } else {
      rows = exampleRows();
      source = "example";
    }
    if (!rows.length) return c.json({ error: "Picklist sheet is empty" }, 400);
    const counts = await replaceLists(rows);
    console.log(JSON.stringify({ action: "picklist_sync", source, counts }));
    return c.json({ source, counts, picklists: await loadPicklists() });
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

picklists.put("/:name", async (c) => {
  const name = c.req.param("name");
  const schema = z.object({
    values: z.array(
      z.object({
        value: z.string().min(1),
        active: z.boolean().default(true),
      }),
    ),
  });
  const body = schema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.message }, 400);

  await query(`DELETE FROM picklists WHERE name = $1`, [name]);
  for (const v of body.data.values) {
    await query(
      `INSERT INTO picklists (name, value, active) VALUES ($1,$2,$3)`,
      [name, v.value, v.active],
    );
  }
  console.log(JSON.stringify({ action: "picklist", name }));
  return c.json({ picklists: await loadPicklists() });
});
