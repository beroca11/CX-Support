import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

export async function migrate() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const schema = fs.readFileSync(path.join(dir, "schema.sql"), "utf8");
  await pool.query(schema);
}
