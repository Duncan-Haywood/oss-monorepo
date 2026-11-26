// Discovers every tenant-scoped table from the Drizzle schema so export and deletion cover tables
// that other modules add later without code changes here.
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { type SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../../db/schema";

export interface TenantTable {
  /** SQL table name, e.g. "documents". */
  name: string;
  table: SQLiteTable;
  /** The column holding the owning org id. */
  orgColumn: SQLiteColumn;
}

/** JS column keys that mark a row as owned by an org (Better Auth uses organizationId). */
const ORG_COLUMN_KEYS = ["orgId", "organizationId", "privateToOrgId"] as const;

/** Tables that hold dependents of others: deleting these first avoids ON DELETE RESTRICT errors. */
const DELETE_FIRST = [
  "followups",
  "submissions",
  "feedback",
  "reviews",
  "application_flags",
  "application_versions",
  "applications",
];

let cached: TenantTable[] | null = null;

export function tenantTables(): TenantTable[] {
  if (cached) return cached;
  const out: TenantTable[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue;
    const name = getTableName(value);
    if (name === "organization") continue;
    const cols = getTableColumns(value) as Record<string, SQLiteColumn>;
    const key = ORG_COLUMN_KEYS.find((k) => cols[k]);
    if (!key) continue;
    out.push({ name, table: value, orgColumn: cols[key] as SQLiteColumn });
  }
  const rank = (n: string) => {
    const i = DELETE_FIRST.indexOf(n);
    return i === -1 ? DELETE_FIRST.length : i;
  };
  out.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  cached = out;
  return out;
}
