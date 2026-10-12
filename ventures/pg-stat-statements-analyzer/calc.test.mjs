import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeRows, analyze, family, statementType, tablesOf, sampleCsv, toCsv, humanMs, humanBytes, QUERY } from "./calc.mjs";

const run = (csv) => { const n = normalizeRows(parseCsv(csv)); assert.equal(n.error, null); return analyze(n.statements); };
const H = "query,calls,total_exec_time,rows,shared_blks_hit,shared_blks_read,temp_blks_written";

test("the bundled query names every column the parser reads", () => {
  for (const c of ["queryid", "query", "calls", "total_exec_time", "rows", "shared_blks_hit", "shared_blks_read", "temp_blks_written"]) assert.match(QUERY, new RegExp(c));
  assert.match(QUERY, /pg_stat_statements/);
});

test("parseCsv keeps commas, quotes and newlines inside quoted query text", () => {
  const rows = parseCsv('a,b\n"select 1,\n""x""",2\n');
  assert.deepEqual(rows[1], ['select 1,\n"x"', "2"]);
});

test("normalizeRows reports a missing column by name and accepts PG12 column names", () => {
  assert.match(normalizeRows(parseCsv("query,calls\nselect 1,2")).error, /total_exec_time/);
  const n = normalizeRows(parseCsv("query,calls,total_time\nselect 1,10,50"));
  assert.equal(n.error, null);
  assert.equal(n.statements[0].total, 50);
});

test("normalizeRows derives total from mean when only mean is given, and skips bad rows with a line number", () => {
  const n = normalizeRows(parseCsv("query,calls,mean_exec_time\nselect 1,10,2\nselect 2,x,1\n,3,1"));
  assert.equal(n.statements[0].total, 20);
  assert.deepEqual(n.skipped.map((s) => s.line), [3, 4]);
});

test("family merges IN-list lengths, VALUES rows, comments and parameter numbers", () => {
  assert.equal(family("SELECT a FROM t WHERE id IN ($1,$2)"), family("select a from t where id in ($1, $2, $3, $4)"));
  assert.equal(family("INSERT INTO t VALUES ($1,$2)"), family("INSERT INTO t VALUES ($1,$2),($3,$4),($5,$6)"));
  assert.equal(family("/*app='x'*/ select 1 -- note\n"), family("select 1"));
  assert.notEqual(family("select a from t where id = $1"), family("select a from t where id > $1"));
});

test("statementType looks through a leading WITH and parentheses", () => {
  assert.equal(statementType("WITH x AS (SELECT 1) SELECT * FROM x"), "select");
  assert.equal(statementType("with d as (delete from t returning *) insert into u select * from d"), "insert");
  assert.equal(statementType("/* c */ UPDATE t SET a = 1"), "update");
  assert.equal(statementType("VACUUM t"), "vacuum");
});

test("tablesOf finds joined and written tables but not extract() or DISTINCT FROM operands", () => {
  assert.deepEqual(tablesOf("select o.id from public.orders o join customers c on c.id = o.cid where extract(epoch from o.created_at) > $1 and o.a is distinct from $2").sort(), ["customers", "public.orders"]);
  assert.deepEqual(tablesOf("UPDATE carts SET x = 1"), ["carts"]);
  assert.deepEqual(tablesOf("select * from generate_series(1,3)"), []);
});

test("shares, merged variants and call totals reconcile", () => {
  const r = run(sampleCsv());
  const s = r.summary;
  assert.equal(s.statements, 11);
  assert.equal(s.families, 9);
  assert.equal(s.merged, 2);
  assert.ok(Math.abs(r.families.reduce((a, f) => a + f.share, 0) - 1) < 1e-9);
  assert.equal(r.families.reduce((a, f) => a + f.calls, 0), s.totalCalls);
  assert.ok(Math.abs(r.families.reduce((a, f) => a + f.total, 0) - s.totalMs) < 1e-6);
  assert.ok(Math.abs(r.families.at(-1).cumShare - 1) < 1e-9);
  assert.ok(s.k50 <= s.k80 && s.k80 <= s.k90);
  const merged = r.families.find((f) => f.variants === 3);
  assert.equal(merged.calls, 188000 + 96000 + 52000);
});

test("the sample trips every rule once and the plain ones stay quiet", () => {
  const r = run(sampleCsv());
  const codes = new Set(r.findings.flatMap((f) => f.flags.map((x) => x.code)));
  for (const c of ["hot", "chatty", "cold", "temp", "slow", "swing", "rows"]) assert.ok(codes.has(c), c);
  const quiet = r.families.find((f) => f.sample.includes("FROM products WHERE sku"));
  assert.deepEqual(quiet.flags, []);
});

test("chatty needs a select, many calls, a large call share and about one row per call", () => {
  const big = `select * from t where id = $1`;
  const mk = (extra) => run(`${H}\n"${big}",5000000,2000000,5000000,0,0,0\n"select 2 from other where x > $1",1000,1000,1000,0,0,0${extra}`);
  assert.ok(mk("").findings.some((f) => f.flags.some((x) => x.code === "chatty")));
  const wide = run(`${H}\n"${big}",5000000,2000000,50000000,0,0,0\n"select 2 from other where x > $1",1000,1000,1000,0,0,0`);
  assert.ok(!wide.findings.some((f) => f.flags.some((x) => x.code === "chatty")), "10 rows per call is a list fetch, not an N+1 lookup");
  const upd = run(`${H}\n"update t set a = 1 where id = $1",5000000,2000000,5000000,0,0,0`);
  assert.ok(!upd.findings.some((f) => f.flags.some((x) => x.code === "chatty")));
});

test("cache and temp rules respect their minimum sizes", () => {
  const small = run(`${H}\n"select 1 from t",10,100,1,10,1000,10`);
  assert.deepEqual(small.families[0].flags.map((x) => x.code), ["hot"]);
  const cold = run(`${H}\n"select 1 from t",10,100,1,100,20000,2000`);
  assert.deepEqual(cold.families[0].flags.map((x) => x.code).sort(), ["cold", "hot", "temp"]);
  assert.equal(cold.summary.hitRatio, 100 / 20100);
});

test("missing optional columns leave the related rules off instead of failing", () => {
  const r = run("query,calls,total_exec_time\nselect 1 from a,10,100\nselect 2 from b,10,100");
  assert.equal(r.summary.hitRatio, null);
  assert.equal(r.families[0].rowsPerCall, null);
  assert.deepEqual(r.families[0].flags.map((x) => x.code), ["hot"]);
});

test("payoff is Amdahl arithmetic on the top families", () => {
  const r = run("query,calls,total_exec_time\nselect 1 from a,1,600\nselect 2 from b,1,400");
  const p = r.payoff.find((x) => x.top === 1);
  assert.ok(Math.abs(p.ifTwiceAsFast - 0.3) < 1e-9);
  assert.ok(Math.abs(p.ifTenTimesFaster - 0.54) < 1e-9);
});

test("table rollup sums time for queries touching a table", () => {
  const r = run(sampleCsv());
  assert.equal(r.tables[0].table, "orders");
});

test("toCsv writes one row per family with flags, and escapes the query", () => {
  const r = run(sampleCsv());
  const lines = toCsv(r.families).split("\n");
  assert.equal(lines.length, r.families.length + 1);
  assert.match(lines[1], /hot\|cold/);
});

test("humanMs and humanBytes format ranges", () => {
  assert.equal(humanMs(0.5), "0.5 ms");
  assert.equal(humanMs(90000), "1.5 min");
  assert.equal(humanMs(7200000), "2.0 h");
  assert.equal(humanBytes(524288000), "500 MB");
});
