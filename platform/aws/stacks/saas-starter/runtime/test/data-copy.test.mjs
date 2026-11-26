// data-copy: checksum vectors shared with the Python orchestrator, the import guards, and (with
// PG_SUPERUSER_URL set, as e2e.test.mjs) a real Postgres round trip: import, finish, checksum.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { canonValue, rowDigest, tableChecksum, importBatch, dispatch } from "../src/data-copy.mjs";

const V = JSON.parse(readFileSync(new URL("../../../../cutover/canon_vectors.json", import.meta.url), "utf8"));

test("canon vectors: numbers, rows and table checksum", () => {
  for (const [n, s] of V.numbers) assert.equal(canonValue(n), s, `number ${n}`);
  for (const { row, digest } of V.rows) assert.equal(rowDigest(row), digest);
  const t = tableChecksum(V.table.rows);
  assert.equal(t.count, V.table.count);
  assert.equal(t.sha256, V.table.sha256);
});

test("canon is type-erased the way Postgres reads back what D1 held", () => {
  const d1 = { id: 7, big: 9007199254740993n, flag: 1, b: [1, 2, 255] };
  const pgRow = { id: "7", big: "9007199254740993", flag: true, b: Buffer.from([1, 2, 255]) };
  assert.equal(rowDigest(d1), rowDigest(pgRow));
  assert.notEqual(canonValue(null), canonValue("\u0000N".slice(1)));
  assert.notEqual(rowDigest({ a: null }), rowDigest({ a: "" }));
  // Row order does not matter; content does.
  const rows = V.table.rows;
  assert.equal(tableChecksum([...rows].reverse()).sha256, V.table.sha256);
  assert.notEqual(tableChecksum(rows.slice(1)).sha256, V.table.sha256);
});

function fakeDb(count) {
  const sql = [];
  return {
    sql,
    async query(text, params) {
      sql.push(text);
      if (/count\(\*\)/.test(text)) return { rows: [{ n: String(count) }] };
      return { rows: [], params };
    },
  };
}

test("import: refuses a non-empty table unless told to replace, and rolls back on error", async () => {
  const db = fakeDb(3);
  await assert.rejects(importBatch(db, { table: "orders", columns: ["id"], rows: [[1]], batch: 0 }), /already has rows/);
  assert.equal(db.sql.at(-1), "ROLLBACK");
  const ok = fakeDb(3);
  await importBatch(ok, { table: "orders", columns: ["id"], rows: [[1]], batch: 0, replace: true });
  assert.ok(ok.sql.some((s) => s.startsWith('DELETE FROM public."orders"')));
  assert.equal(ok.sql.at(-1), "COMMIT");
});

test("import: identifiers are checked, values are parameters", async () => {
  const db = fakeDb(0);
  await assert.rejects(importBatch(db, { table: 'x"; DROP TABLE y; --', columns: ["id"], rows: [], batch: 0 }), /bad identifier/);
  await assert.rejects(importBatch(db, { table: "t", columns: ["id", "a b"], rows: [], batch: 0 }), /bad identifier/);
  await assert.rejects(importBatch(db, { table: "t", columns: ["id"], rows: [[1, 2]], batch: 1 }), /row width/);
  const ok = fakeDb(0);
  await importBatch(ok, { table: "t", columns: ["id", "name"], rows: [[1, "'; DROP TABLE t; --"]], batch: 1 });
  const insert = ok.sql.find((s) => s.startsWith("INSERT"));
  assert.equal(insert, 'INSERT INTO public."t" ("id", "name") VALUES ($1, $2)');
  await assert.rejects(dispatch(ok, { action: "drop" }), /unknown action/);
});

const SU = process.env.PG_SUPERUSER_URL;
test("e2e: D1-shaped rows copied into Postgres read back with the same checksum", { skip: !SU && "PG_SUPERUSER_URL not set" }, async () => {
  const admin = new pg.Client({ connectionString: SU });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS copy_e2e");
  await admin.query("CREATE DATABASE copy_e2e");
  await admin.end();
  const u = new URL(SU); u.pathname = "/copy_e2e";
  const db = new pg.Client({ connectionString: u.toString() });
  await db.connect();
  try {
    await db.query(`CREATE TABLE orders (id bigserial PRIMARY KEY, email text NOT NULL, note text, paid integer, ratio double precision, blob bytea)`);
    const columns = ["id", "email", "note", "paid", "ratio", "blob"];
    // Exactly what the orchestrator sends: D1's JSON values, blobs as byte arrays.
    const asParams = (r) => columns.map((c) => r[c]);
    const rows = V.table.rows;
    await dispatch(db, { action: "import", table: "orders", columns, rows: rows.slice(0, 2).map(asParams), batch: 0 });
    await dispatch(db, { action: "import", table: "orders", columns, rows: rows.slice(2).map(asParams), batch: 1 });
    const seq = await dispatch(db, { action: "finish", tables: ["orders"] });
    assert.deepEqual(seq.sequences, ["orders.id"]);
    const sum = await dispatch(db, { action: "checksum", tables: ["orders"] });
    assert.deepEqual(sum.tables.orders, { count: V.table.count, sha256: V.table.sha256 });
    const next = await db.query(`INSERT INTO orders (email) VALUES ('new@example.com') RETURNING id`);
    assert.equal(String(next.rows[0].id), "4");
    const seen = await dispatch(db, { action: "inspect" });
    assert.equal(seen.tables.orders.count, 4);
    // A second copy without replace is refused; with replace it starts over.
    await assert.rejects(dispatch(db, { action: "import", table: "orders", columns, rows: [], batch: 0 }), /already has rows/);
    await dispatch(db, { action: "import", table: "orders", columns, rows: rows.map(asParams), batch: 0, replace: true });
    assert.deepEqual((await dispatch(db, { action: "checksum", tables: ["orders"] })).tables.orders.sha256, V.table.sha256);
  } finally { await db.end(); }
});
