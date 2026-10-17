import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseIndexDef, normalizeRows, analyze, dropScript, toCsv, sampleCsv, humanBytes, QUERY } from "./calc.mjs";

const HEAD = "schemaname,tablename,indexname,indexdef,idx_scan,size_bytes,indisunique,indisprimary,indisvalid,table_writes,constraints";
const row = (name, def, scans, size = 1000, o = {}) =>
  [o.schema ?? "public", o.table ?? "t", name, `"${def}"`, scans, size, o.unique ?? "f", o.primary ?? "f", o.valid ?? "t", o.writes ?? 100, o.constraints ?? 0].join(",");
const run = (...rows) => {
  const n = normalizeRows(parseCsv([HEAD, ...rows].join("\n")));
  assert.ok(!n.error, n.error);
  return analyze(n.indexes);
};
const on = (n, cols, extra = "") => `CREATE INDEX ${n} ON public.t USING btree (${cols})${extra}`;

test("parseIndexDef reads columns, INCLUDE, WHERE, method, and expressions with commas", () => {
  const d = parseIndexDef("CREATE UNIQUE INDEX a ON public.t USING btree (lower(email), coalesce(x, 0), created_at DESC) INCLUDE (name) WHERE (deleted_at IS NULL)");
  assert.equal(d.unique, true);
  assert.equal(d.method, "btree");
  assert.deepEqual(d.columns, ["lower(email)", "coalesce(x, 0)", "created_at desc"]);
  assert.deepEqual(d.include, ["name"]);
  assert.equal(d.predicate, "(deleted_at is null)");
  assert.equal(parseIndexDef("SELECT 1"), null);
});

test("a missing column is an error naming it, not a silent empty report", () => {
  const n = normalizeRows(parseCsv("tablename,indexname\nt,i"));
  assert.match(n.error, /Missing column/);
  assert.match(n.error, /indexdef/);
});

test("bad rows are skipped with a line number", () => {
  const n = normalizeRows(parseCsv([HEAD, row("a", on("a", "x"), 5), row("b", "nonsense", 5), row("c", on("c", "y"), "many")].join("\n")));
  assert.equal(n.indexes.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.line), [3, 4]);
});

test("identical definitions are duplicates; the most-used or protected one is kept", () => {
  const r = run(row("a", on("a", "x"), 10), row("b", on("b", "x"), 90));
  assert.deepEqual(r.findings.map((f) => [f.name, f.kind, f.keep]), [["a", "duplicate", "b"]]);
});

test("a unique constraint index is kept over a plain duplicate and is never dropped", () => {
  const r = run(row("u", "CREATE UNIQUE INDEX u ON public.t USING btree (x)", 0, 1000, { unique: "t", constraints: 1 }), row("p", on("p", "x"), 5));
  assert.equal(r.findings.find((f) => f.name === "u"), undefined);
  assert.ok(!r.script.includes("IF EXISTS public.u;"));
});

test("a leading-prefix btree is redundant; a different order, predicate or method is not", () => {
  const r = run(row("a", on("a", "x"), 5), row("ab", on("ab", "x, y"), 5));
  assert.deepEqual(r.findings.map((f) => [f.name, f.kind, f.keep]), [["a", "redundant", "ab"]]);
  assert.equal(run(row("b", on("b", "y"), 5), row("ab", on("ab", "x, y"), 5)).findings.length, 0);
  assert.equal(run(row("a", on("a", "x", " WHERE (z)"), 5), row("ab", on("ab", "x, y"), 5)).findings.length, 0);
  assert.equal(run(row("a", "CREATE INDEX a ON public.t USING hash (x)", 5), row("ab", on("ab", "x, y"), 5)).findings.length, 0);
});

test("zero scans is unused, but primary keys and constraint indexes never are", () => {
  const r = run(row("pk", "CREATE UNIQUE INDEX pk ON public.t USING btree (id)", 0, 10, { unique: "t", primary: "t", constraints: 1 }), row("old", on("old", "z"), 0, 50));
  assert.deepEqual(r.findings.map((f) => [f.name, f.kind]), [["old", "unused"]]);
});

test("an invalid index is flagged first and is not also called unused", () => {
  const r = run(row("bad", on("bad", "x"), 0, 10, { valid: "f" }));
  assert.deepEqual(r.findings.map((f) => f.kind), ["invalid"]);
});

test("a redundant index is kept when its covering index is itself unused (dropping both would lose a used index)", () => {
  const r = run(row("a", on("a", "x"), 500), row("ab", on("ab", "x, y"), 0));
  assert.deepEqual(r.findings.map((f) => [f.name, f.kind]), [["ab", "unused"]]);
});

test("totals reconcile: kinds, findings and reclaim agree", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  const r = analyze(n.indexes);
  assert.equal(r.findings.length, r.summary.flagged);
  assert.equal(Object.values(r.kinds).reduce((s, k) => s + k.count, 0), r.summary.flagged);
  assert.equal(Object.values(r.kinds).reduce((s, k) => s + k.size, 0), r.summary.reclaim);
  assert.equal(r.findings.reduce((s, f) => s + f.size, 0), r.summary.reclaim);
  assert.ok(r.summary.reclaim < r.summary.totalSize);
  assert.equal(n.skipped.length, 0);
});

test("the sample finds one of each kind and keeps every protected index", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).indexes);
  assert.deepEqual(Object.keys(r.kinds).sort(), ["duplicate", "invalid", "redundant", "unused"]);
  for (const keep of ["orders_pkey", "events_pkey", "users_pkey", "users_email_key"]) assert.ok(!r.script.includes(keep + ";"), keep);
});

test("drop script quotes odd names and uses CONCURRENTLY with a warning header", () => {
  const s = dropScript([{ schema: "My Schema", table: "t", name: 'we"ird', kind: "unused", size: 5, keep: null }]);
  assert.match(s, /DROP INDEX CONCURRENTLY IF EXISTS "My Schema"\."we""ird";/);
  assert.match(s, /Review every line/);
  assert.equal(dropScript([]), "-- Nothing to drop.");
});

test("csv export escapes and humanBytes formats", () => {
  assert.match(toCsv([{ schema: "s", table: "t", name: "a,b", kind: "unused", size: 1, scans: 0, keep: null }]), /"a,b"/);
  assert.equal(humanBytes(1536), "1.5 KB");
  assert.match(QUERY, /pg_stat_user_indexes/);
});
