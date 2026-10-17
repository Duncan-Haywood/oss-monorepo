import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs, run } from "./cli.mjs";

const fx = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const capture = async (argv) => {
  let out = "";
  let err = "";
  const code = await run(argv, { out: (s) => { out += s; }, err: (s) => { err += s; } });
  return { code, out, err };
};

test("parseArgs reads options in both spellings, flags, and unknown options", () => {
  const a = parseArgs(["split", "a.xml", "--shards=3", "--setup-seconds", "60", "--json", "--matrix", "--current-from-reports", "--wat"]);
  assert.equal(a.sub, "split");
  assert.deepEqual(a.positional, ["a.xml"]);
  assert.equal(a.opts.shards, "3");
  assert.equal(a.opts["setup-seconds"], "60");
  assert.equal(a.json && a.matrix && a.currentFromReports, true);
  assert.deepEqual(a.errors, ["unknown option --wat"]);
  assert.deepEqual(parseArgs(["split", "--shards"]).errors, ["--shards needs a value"]);
});

test("a pytest report: exit 0, balanced shards, commands and the disclaimer", async () => {
  const r = await capture(["split", fx("suite-24-files.xml"), "--shards", "4", "--setup-seconds", "45"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Current split/);
  assert.match(r.out, /Balanced split/);
  assert.match(r.out, /pytest tests\/test_/);
  assert.match(r.out, /Shard count sweep/);
  assert.match(r.out, /heuristic/i);
  assert.match(r.out, /not engineering or financial advice/i);
});

test("--json is parseable and carries the sweep, matrix, bottlenecks and disclaimer", async () => {
  const r = await capture(["split", fx("suite-24-files.xml"), "--shards", "8", "--json"]);
  const j = JSON.parse(r.out);
  assert.equal(j.n, 8);
  assert.equal(j.matrix.include.length, 8);
  assert.equal(j.bottlenecks[0].key, "tests/test_import_big_csv.py");
  assert.ok(j.sweep.length >= 8);
  assert.ok(j.disclaimer);
});

test("--matrix prints only the Actions matrix JSON", async () => {
  const r = await capture(["split", fx("suite-24-files.xml"), "--shards", "3", "--matrix"]);
  const m = JSON.parse(r.out);
  assert.equal(m.include.length, 3);
  assert.equal(r.out.trim().split("\n").length, 1);
});

test("--max-imbalance-pct exits 1 over the limit and 0 under it", async () => {
  const over = await capture(["split", fx("suite-24-files.xml"), "--shards", "4", "--max-imbalance-pct", "20"]);
  assert.equal(over.code, 1);
  assert.match(over.out, /GATE FAILED/);
  const under = await capture(["split", fx("suite-24-files.xml"), "--shards", "4", "--max-imbalance-pct", "90"]);
  assert.equal(under.code, 0);
  assert.match(under.out, /Gate ok/);
});

test("--target-seconds picks the cheapest N and --runs-per-month adds the monthly saving", async () => {
  const r = await capture(["split", fx("suite-24-files.xml"), "--shards", "4", "--setup-seconds", "45", "--target-seconds", "150", "--runs-per-month", "200", "--json"]);
  const j = JSON.parse(r.out);
  assert.equal(j.recommendation.basis, "target");
  assert.ok(j.sweep[j.recommendation.n - 1].wall <= 150);
  assert.equal(Math.round(j.savings.monthlyBilledMinutes * 1000), Math.round(j.savings.billedMinutes * 200 * 1000));
});

test("two files with --current-from-reports treat each as today's shard", async () => {
  const r = await capture(["split", fx("maven.xml"), fx("maven2.xml"), "--current-from-reports", "--json"]);
  const j = JSON.parse(r.out);
  assert.equal(j.current.mode, "reports");
  assert.equal(j.n, 2, "shard count defaults to the number of report files");
  assert.deepEqual(j.current.shards.map((s) => Math.round(s.seconds * 10) / 10), [12.5, 30.2]);
});

test("each dialect is read and emits its own runner command", async () => {
  const want = [["pytest.xml", /pytest tests\//], ["jest.xml", /npx jest src\//], ["go.xml", /go test /], ["maven.xml", /mvn test -Dtest=/], ["rspec.xml", /bundle exec rspec spec\//]];
  for (const [file, re] of want) {
    const r = await capture(["split", fx(file), "--shards", "2"]);
    assert.equal(r.code, 0, file);
    assert.match(r.out, re, file);
  }
});

test("--group test splits the big file; the bottleneck line appears when it is indivisible", async () => {
  const r = await capture(["split", fx("suite-24-files.xml"), "--shards", "8"]);
  assert.match(r.out, /Indivisible bottlenecks/);
  assert.match(r.out, /try --group test/);
  const fine = await capture(["split", fx("suite-24-files.xml"), "--shards", "8", "--group", "test", "--json"]);
  assert.equal(JSON.parse(fine.out).group, "test");
});

test("a missing file, a bad option value and a non-report exit 2", async () => {
  assert.equal((await capture(["split", "nope.xml"])).code, 2);
  assert.equal((await capture(["split", fx("pytest.xml"), "--bogus"])).code, 2);
  const bad = await capture(["split", fx("pytest.xml"), "--shards", "0"]);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /--shards/);
  assert.equal((await capture(["split", fx("pytest.xml"), "--group", "nope"])).code, 2);
  assert.equal((await capture(["split", fx("pytest.xml"), "--format", "cobol"])).code, 2);
  assert.equal((await capture(["split", fx("not-a-report.txt")])).code, 2);
});

test("--help exits 0 and a bare call exits 2", async () => {
  assert.equal((await capture(["--help"])).code, 0);
  assert.equal((await capture([])).code, 2);
});

test("the real process exits with the gate's code and makes no network call", () => {
  const p = spawnSync(process.execPath, [fileURLToPath(new URL("./cli.mjs", import.meta.url)), "split", fx("suite-24-files.xml"), "--shards", "4", "--max-imbalance-pct", "5"], { encoding: "utf8" });
  assert.equal(p.status, 1);
  assert.match(p.stdout, /GATE FAILED/);
});
