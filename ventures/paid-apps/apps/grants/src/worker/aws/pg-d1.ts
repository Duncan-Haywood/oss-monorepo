// A D1-shaped `DB` binding over Postgres (RDS) for the AWS runtime, so Drizzle's D1 driver and the
// few hand-written `env.DB.prepare()` calls run unchanged (docs/AWS.md).
//
// Why grants has its own instead of the starter's `env.DB` (runtime/src/d1.mjs): Drizzle reads
// select results through `raw()` as positional arrays, and the starter builds those arrays from
// row objects, which drops a column whenever a join selects two columns with the same name
// (`id`, `org_id`, ...). Here `raw()` asks Postgres for array rows. Numbers also come back as
// numbers (bigint epoch-ms timestamps, counts, sums), as D1 returns them.
//
// The pool is the starter's `env.pg` (node-postgres Pool, IAM auth, TLS): this module only uses
// the structural interface below, so grants has no `pg` dependency of its own.
import { toPostgresSql } from "./sql-dialect";

/** The node-postgres query config fields this adapter uses. */
export interface PgQueryConfig {
  text: string;
  values?: unknown[];
  rowMode?: "array";
  types?: { getTypeParser: (oid: number, format?: string) => (value: string) => unknown };
}

export interface PgResult {
  rows: unknown[];
  rowCount: number | null;
}

export interface PgClient {
  query(config: PgQueryConfig): Promise<PgResult>;
}

export interface PgPoolClient extends PgClient {
  release(): void;
}

export interface PgPool extends PgClient {
  connect(): Promise<PgPoolClient>;
}

// Postgres type OIDs whose text form we parse; everything else stays a string (text, json, ...).
const INT8 = 20;
const INT2 = 21;
const INT4 = 23;
const FLOAT4 = 700;
const FLOAT8 = 701;
const NUMERIC = 1700;
const BOOL = 16;

/** D1 semantics: integers and reals are JS numbers; SQLite has no booleans, so 1/0. */
export const d1TypeParsers: NonNullable<PgQueryConfig["types"]> = {
  getTypeParser(oid: number) {
    switch (oid) {
      case INT2:
      case INT4:
      case INT8:
      case FLOAT4:
      case FLOAT8:
      case NUMERIC:
        return (v: string) => Number(v);
      case BOOL:
        return (v: string) => (v === "t" ? 1 : 0);
      default:
        return (v: string) => v;
    }
  },
};

/** D1 binds booleans as 1/0 and has no Date type; Drizzle already converts Dates to epoch ms. */
function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return v;
}

interface D1LikeResult {
  success: true;
  results: Record<string, unknown>[];
  meta: { changes: number; duration: number; rows_read: number; rows_written: number };
}

function d1Result(r: PgResult): D1LikeResult {
  const changes = r.rowCount ?? 0;
  return {
    success: true,
    results: r.rows as Record<string, unknown>[],
    meta: { changes, duration: 0, rows_read: r.rows.length, rows_written: changes },
  };
}

export class PgD1Statement {
  constructor(
    private readonly db: PgD1Database,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): PgD1Statement {
    return new PgD1Statement(this.db, this.sql, params.map(toParam));
  }

  /** @internal */
  query(client: PgClient, rowMode?: "array"): Promise<PgResult> {
    return client.query({
      text: toPostgresSql(this.sql),
      values: this.params,
      types: d1TypeParsers,
      ...(rowMode ? { rowMode } : {}),
    });
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const r = await this.query(this.db.pool);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column === undefined ? row : row[column]) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1LikeResult & { results: T[] }> {
    return d1Result(await this.query(this.db.pool)) as D1LikeResult & { results: T[] };
  }

  async run(): Promise<D1LikeResult> {
    return d1Result(await this.query(this.db.pool));
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const r = await this.query(this.db.pool, "array");
    return r.rows as T[];
  }
}

export class PgD1Database {
  constructor(readonly pool: PgPool) {}

  prepare(sql: string): PgD1Statement {
    return new PgD1Statement(this, sql);
  }

  /** Like D1's batch: all statements in one transaction, rolled back if any fails. */
  async batch(statements: PgD1Statement[]): Promise<D1LikeResult[]> {
    const client = await this.pool.connect();
    try {
      await client.query({ text: "BEGIN" });
      const out: D1LikeResult[] = [];
      for (const s of statements) out.push(d1Result(await s.query(client)));
      await client.query({ text: "COMMIT" });
      return out;
    } catch (e) {
      await client.query({ text: "ROLLBACK" }).catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    await this.pool.query({ text: sql });
    return { count: 1, duration: 0 };
  }

  dump(): Promise<ArrayBuffer> {
    return Promise.reject(new Error("dump() is not available on Postgres: use pg_dump"));
  }

  withSession(): PgD1Database {
    return this;
  }
}

/** The adapter typed as the D1 binding the rest of the app (and Drizzle's D1 driver) expects. */
export function createPgD1(pool: PgPool): D1Database {
  return new PgD1Database(pool) as unknown as D1Database;
}
