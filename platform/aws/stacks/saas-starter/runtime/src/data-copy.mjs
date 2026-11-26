// data-copy: the Postgres half of a D1 -> Postgres copy during the Cloudflare -> AWS cutover
// (platform/aws/cutover/README.md). db-admin dispatches to it on event.action:
//   inspect   -> { tables: { <name>: { columns: [...], count } } }   (schema public)
//   import    -> insert one batch of rows into one table, in one transaction; batch 0 may
//                replace (DELETE first) and otherwise refuses a non-empty table
//   finish    -> move each serial/identity sequence past the copied max, so new rows do not collide
//   checksum  -> { tables: { <name>: { count, sha256 } } } over a full read-back
// The checksum is canonical and type-erased (canon_vectors.json in platform/aws/cutover is
// checked by this file's tests and by the Python orchestrator's), so the runner computes the
// same digest from the D1 rows it read and compares. No row content is ever returned or logged.
import { createHash } from "node:crypto";

export const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const q = (s) => { if (!IDENT.test(s)) throw new Error(`bad identifier: ${String(s).slice(0, 70)}`); return `"${s}"`; };

// One value as text. null is distinct from every string; numbers are spelled the way
// JavaScript's String() spells them; booleans as 1/0 (SQLite has no boolean); bytes as hex;
// dates as ISO 8601 (a timestamptz column only matches if D1 held the same ISO text).
export function canonValue(v) {
  if (v === null || v === undefined) return "\u0000N";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error("non-finite number");
    return Object.is(v, -0) ? "0" : String(v);
  }
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  if (Array.isArray(v) && v.every((b) => Number.isInteger(b) && b >= 0 && b < 256)) return Buffer.from(v).toString("hex");
  if (typeof v === "object") return JSON.stringify(v);   // json/jsonb columns
  return String(v);
}

export function rowDigest(row) {
  const keys = Object.keys(row).sort();
  const text = keys.map((k) => `${k}=${canonValue(row[k])}`).join("\u001f");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// Order-independent: the digest of the sorted row digests, so neither side needs a key order.
export function tableChecksum(rows) {
  const digests = rows.map(rowDigest).sort();
  return { count: rows.length, sha256: createHash("sha256").update(digests.join("\n"), "utf8").digest("hex") };
}

export async function inspect(db) {
  const cols = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
  const tables = {};
  for (const r of cols.rows) (tables[r.table_name] ||= { columns: [], count: 0 }).columns.push(r.column_name);
  for (const t of Object.keys(tables)) {
    if (!IDENT.test(t)) { delete tables[t]; continue; }
    const c = await db.query(`SELECT count(*)::text AS n FROM public.${q(t)}`);
    tables[t].count = Number(c.rows[0].n);
  }
  return { tables };
}

export async function importBatch(db, { table, columns, rows, batch, replace }) {
  q(table); columns.forEach(q);
  if (!Array.isArray(rows)) throw new Error("rows must be an array of arrays");
  for (const r of rows) if (!Array.isArray(r) || r.length !== columns.length) throw new Error("row width does not match columns");
  // D1's JSON spells a blob as an array of bytes; a bytea column takes a Buffer.
  const types = await db.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
  const bytea = new Set((types.rows || []).filter((r) => r.data_type === "bytea").map((r) => r.column_name));
  const values = (r) => r.map((v, i) => (bytea.has(columns[i]) && Array.isArray(v) ? Buffer.from(v) : v));
  await db.query("BEGIN");
  try {
    if (batch === 0) {
      const c = await db.query(`SELECT count(*)::text AS n FROM public.${q(table)}`);
      if (Number(c.rows[0].n) > 0) {
        if (!replace) throw new Error(`table ${table} already has rows; refusing to copy over them`);
        await db.query(`DELETE FROM public.${q(table)}`);
      }
    }
    // 1,000 rows or fewer per statement keeps the bind count under Postgres's 65,535.
    const per = Math.max(1, Math.floor(60000 / Math.max(1, columns.length)));
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per);
      const params = [];
      const tuples = chunk.map((r) => `(${values(r).map((v) => { params.push(v); return `$${params.length}`; }).join(", ")})`);
      await db.query(`INSERT INTO public.${q(table)} (${columns.map(q).join(", ")}) VALUES ${tuples.join(", ")}`, params);
    }
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
  return { table, batch, inserted: rows.length };
}

export async function finish(db, { tables }) {
  const moved = [];
  for (const t of tables) {
    q(t);
    const seqs = await db.query(
      `SELECT a.attname AS col, pg_get_serial_sequence(format('public.%I', $1::text), a.attname) AS seq
         FROM pg_attribute a WHERE a.attrelid = format('public.%I', $1::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped`, [t]);
    for (const s of seqs.rows) {
      if (!s.seq) continue;
      await db.query(
        `SELECT setval($1::regclass, GREATEST(COALESCE((SELECT max(${q(s.col)}) FROM public.${q(t)}), 0), 1), (SELECT count(*) > 0 FROM public.${q(t)}))`, [s.seq]);
      moved.push(`${t}.${s.col}`);
    }
  }
  return { sequences: moved };
}

export async function checksum(db, { tables }) {
  const out = {};
  for (const t of tables) {
    const r = await db.query(`SELECT * FROM public.${q(t)}`);
    out[t] = tableChecksum(r.rows);
  }
  return { tables: out };
}

export async function dispatch(db, event) {
  switch (event.action) {
    case "inspect": return inspect(db);
    case "import": return importBatch(db, event);
    case "finish": return finish(db, event);
    case "checksum": return checksum(db, event);
    default: throw new Error(`unknown action: ${String(event.action).slice(0, 40)}`);
  }
}
