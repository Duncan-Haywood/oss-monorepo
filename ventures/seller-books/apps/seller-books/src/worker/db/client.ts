import { getTableColumns, type Table } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export { schema };

/**
 * D1 allows at most 100 bound parameters per statement, so a multi-row insert takes
 * floor(100 / columns) rows at a time (a sale has 20 columns: 5 rows). The old fixed 8 rows bound
 * 160 parameters, and every report with 5 or more new sales failed with a 500 (fixed 2026-11-26).
 */
export const D1_MAX_PARAMS = 100;
export const rowsPerInsert = (table: Table) =>
  Math.max(1, Math.floor(D1_MAX_PARAMS / Object.keys(getTableColumns(table)).length));
