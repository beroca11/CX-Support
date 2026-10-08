import { query } from "../db/client.js";

export type PicklistMap = Record<string, { value: string; active: boolean }[]>;

export async function loadPicklists(): Promise<PicklistMap> {
  const result = await query<{ name: string; value: string; active: boolean }>(
    `SELECT name, value, active FROM picklists ORDER BY name, value`,
  );
  const map: PicklistMap = {};
  for (const row of result.rows) {
    if (!map[row.name]) map[row.name] = [];
    map[row.name].push({ value: row.value, active: row.active });
  }
  return map;
}

export async function activeValues(name: string): Promise<string[]> {
  const result = await query<{ value: string }>(
    `SELECT value FROM picklists WHERE name = $1 AND active = TRUE ORDER BY value`,
    [name],
  );
  return result.rows.map((r) => r.value);
}

/** Reject unknown or inactive picklist values. Empty allowed when optional. */
export async function assertPicklist(
  name: string,
  value: string | undefined | null,
  { optional = false }: { optional?: boolean } = {},
): Promise<string | null> {
  if (value == null || value === "") {
    if (optional) return null;
    return `Missing ${name}`;
  }
  const result = await query<{ active: boolean }>(
    `SELECT active FROM picklists WHERE name = $1 AND value = $2`,
    [name, value],
  );
  if (result.rows.length === 0) return `Unknown ${name}: ${value}`;
  if (!result.rows[0].active) return `Inactive ${name}: ${value}`;
  return null;
}
