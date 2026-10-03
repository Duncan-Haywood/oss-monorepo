import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseJUnit, splitReports, detectDialect, buildUnits, lpt, improve, balance, exactPartition,
  equalCountSplit, imbalancePct, sweepShards, recommend, analyze, emitShard, matrixOf,
  formatSeconds, decodeEntities, EPS,
} from "./engine.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const U = (times) => times.map((time, i) => ({ key: `u${String(i).padStart(3, "0")}`, time, count: 1, members: [] }));
const sum = (a) => a.reduce((s, x) => s + x, 0);

// Deterministic pseudo-random numbers so the property tests are reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

function bruteForce(times, n) {
  const loads = new Array(n).fill(0);
  let best = Infinity;
  const go = (i) => {
    if (i === times.length) { best = Math.min(best, Math.max(...loads)); return; }
    for (let j = 0; j < n; j += 1) { loads[j] += times[i]; go(i + 1); loads[j] -= times[i]; }
  };
  go(0);
  return best;
}

// ------------------------------------------------------------------- parsing

test("parseJUnit reads pytest cases, ignores CDATA and entities in failure text, keeps decoded attributes", () => {
  const t = parseJUnit(fx("pytest.xml"));
  assert.equal(t.length, 9);
  assert.equal(t.some((x) => x.name === "fake" || x.time >= 500), false, "a <testcase> inside CDATA/failure text must not count");
  assert.equal(Math.round(sum(t.map((x) => x.time)) * 10) / 10, 71.4);
  assert.equal(t[0].classname, "tests.test_checkout");
  assert.equal(t.find((x) => x.name === "test_remove_item[1-2]").time, 0.3);
});

test("parseJUnit handles Jest file attributes, nested suites, Go, Maven, RSpec", () => {
  const jest = parseJUnit(fx("jest.xml"));
  assert.equal(jest.length, 6);
  assert.equal(jest[0].file, "src/cart/cart.test.ts");
  assert.equal(parseJUnit(fx("go.xml")).length, 7);
  assert.equal(parseJUnit(fx("maven.xml")).length, 4);
  const rs = parseJUnit(fx("rspec.xml"));
  assert.equal(rs.length, 5);
  assert.equal(rs[0].file, "./spec/models/user_spec.rb");
});

test("decodeEntities and attribute values containing > or entities", () => {
  assert.equal(decodeEntities("a &amp; b &lt;c&gt; &#65;&#x42;"), "a & b <c> AB");
  const xml = `<testsuite name="s"><testcase classname="a.b" name="t &gt; u &amp; v" time="1.5"/></testsuite>`;
  const [c] = parseJUnit(xml);
  assert.equal(c.name, "t > u & v");
  assert.equal(c.time, 1.5);
  const raw = `<testsuite name="s"><testcase classname="a.b" name="x > y" time="2"/></testsuite>`;
  assert.equal(parseJUnit(raw)[0].name, "x > y");
});

test("missing, negative or non-numeric times become 0 rather than NaN", () => {
  const xml = `<testsuite><testcase classname="a" name="x"/><testcase classname="a" name="y" time="-3"/><testcase classname="a" name="z" time="abc"/><testcase classname="a" name="w" time="1,234.5"/></testsuite>`;
  assert.deepEqual(parseJUnit(xml).map((t) => t.time), [0, 0, 0, 1234.5]);
});

test("splitReports separates concatenated documents", () => {
  const two = `${fx("pytest.xml")}\n${fx("maven.xml")}`;
  assert.equal(splitReports(two).length, 2);
  assert.equal(splitReports(fx("pytest.xml")).length, 1);
  assert.deepEqual(splitReports("   "), []);
});

test("detectDialect names each fixture's dialect", () => {
  assert.equal(detectDialect(parseJUnit(fx("pytest.xml"))), "pytest");
  assert.equal(detectDialect(parseJUnit(fx("jest.xml"))), "jest");
  assert.equal(detectDialect(parseJUnit(fx("go.xml"))), "go");
  assert.equal(detectDialect(parseJUnit(fx("maven.xml"))), "java");
  assert.equal(detectDialect(parseJUnit(fx("rspec.xml"))), "rspec");
  assert.equal(detectDialect([]), "unknown");
});

// ------------------------------------------------------------------ grouping

test("pytest grouping: file, class and test keys and node ids", () => {
  const tests = parseJUnit(fx("pytest.xml"));
  const file = buildUnits(tests, { group: "file" });
  assert.deepEqual(file.units.map((u) => u.key), ["tests/test_api.py", "tests/test_checkout.py", "tests/test_models.py", "tests/test_utils.py"]);
  assert.equal(Math.round(file.units.find((u) => u.key === "tests/test_checkout.py").time * 10) / 10, 2.8);
  const cls = buildUnits(tests, { group: "class" });
  assert.ok(cls.units.some((u) => u.key === "tests/test_models.py::TestUser"));
  const tst = buildUnits(tests, { group: "test" });
  assert.ok(tst.units.some((u) => u.key === "tests/test_checkout.py::TestCart::test_add_item"));
  assert.equal(tst.units.length, 9);
});

test("Go subtests collapse into their top-level test instead of double counting", () => {
  const tests = parseJUnit(fx("go.xml"));
  const u = buildUnits(tests, { group: "test" }).units;
  assert.equal(u.find((x) => x.key.endsWith("::TestInvoice")).time, 9, "parent time already includes its subtests");
  assert.equal(sum(u.map((x) => x.time)), 9 + 4 + 2 + 5 + 1);
  assert.equal(buildUnits(tests, { group: "file" }).units.length, 2, "go file/class grouping is the package");
});

test("Java grouping: class units, parametrised methods merge in test mode", () => {
  const tests = parseJUnit(fx("maven.xml"));
  assert.equal(buildUnits(tests, { group: "file" }).units.length, 1);
  const t = buildUnits(tests, { group: "test" }).units;
  assert.deepEqual(t.map((u) => u.key), ["com.acme.OrderServiceTest#cancelsOrder", "com.acme.OrderServiceTest#createsOrder", "com.acme.OrderServiceTest#rejectsEmpty"]);
  assert.equal(t.find((u) => u.key.endsWith("#rejectsEmpty")).time, 2);
});

test("Jest and RSpec group by file; a retry of the same test is counted once, at its longest", () => {
  assert.deepEqual(buildUnits(parseJUnit(fx("jest.xml")), { group: "file" }).units.map((u) => u.key),
    ["src/cart/cart.test.ts", "src/search/search.test.ts", "src/util/util.test.ts"]);
  assert.deepEqual(buildUnits(parseJUnit(fx("rspec.xml")), { group: "file" }).units.map((u) => u.key),
    ["spec/lib/money_spec.rb", "spec/models/user_spec.rb", "spec/requests/orders_spec.rb"]);
  const dup = `<testsuite name="pytest"><testcase classname="t.test_a" name="test_x" time="2"/><testcase classname="t.test_a" name="test_x" time="5"/></testsuite>`;
  assert.equal(buildUnits(parseJUnit(dup), { group: "file" }).units[0].time, 5);
});

test("an unknown group is rejected", () => {
  assert.throws(() => buildUnits(parseJUnit(fx("pytest.xml")), { group: "nope" }), /group must be/);
});

// -------------------------------------------------------------- partitioning

test("balance matches the brute-force optimum on 150 small random instances", () => {
  const rand = rng(42);
  for (let c = 0; c < 150; c += 1) {
    const m = 2 + Math.floor(rand() * 7);
    const n = 2 + Math.floor(rand() * 3);
    const times = Array.from({ length: m }, () => Math.round((0.5 + rand() * 40) * 10) / 10);
    const opt = bruteForce(times, n);
    const r = balance(U(times), n);
    assert.ok(Math.abs(r.makespan - opt) < 1e-6, `case ${c}: times ${times} n ${n}: got ${r.makespan}, optimum ${opt}`);
    assert.equal(r.optimal, true);
    assert.ok(Math.abs(sum(r.shards.map((s) => s.load)) - sum(times)) < 1e-6);
  }
});

test("LPT alone respects Graham's 4/3 - 1/(3n) bound against the brute-force optimum", () => {
  const rand = rng(7);
  let worstRatio = 0;
  for (let c = 0; c < 200; c += 1) {
    const m = 3 + Math.floor(rand() * 6);
    const n = 2 + Math.floor(rand() * 3);
    const times = Array.from({ length: m }, () => 1 + Math.floor(rand() * 50));
    const opt = bruteForce(times, n);
    const mk = Math.max(...lpt(U(times), n).map((s) => s.load));
    const bound = 4 / 3 - 1 / (3 * n);
    assert.ok(mk <= bound * opt + 1e-9, `times ${times} n ${n}: LPT ${mk} opt ${opt}`);
    worstRatio = Math.max(worstRatio, mk / opt);
  }
  assert.ok(worstRatio <= 4 / 3);
});

test("the classic LPT worst case is repaired by the exact search", () => {
  // n=2, items 3,3,2,2,2: LPT gives 7, optimum is 6 (3+3 | 2+2+2).
  const items = U([3, 3, 2, 2, 2]);
  assert.equal(Math.max(...lpt(items, 2).map((s) => s.load)), 7);
  const r = balance(items, 2);
  assert.equal(r.makespan, 6);
  assert.equal(r.optimal, true);
  assert.equal(r.lptMakespan, 7);
});

test("local search alone never worsens LPT, conserves every unit, and stays within the bound on a large instance", () => {
  const rand = rng(99);
  const times = Array.from({ length: 400 }, () => Math.round(rand() ** 3 * 600) / 10);
  const items = U(times);
  const before = lpt(items, 12);
  const lptMax = Math.max(...before.map((s) => s.load));
  const after = improve(before);
  const mk = Math.max(...after.map((s) => s.load));
  assert.ok(mk <= lptMax + EPS);
  const keys = after.flatMap((s) => s.items.map((u) => u.key)).sort();
  assert.deepEqual(keys, items.map((u) => u.key).sort());
  for (const s of after) assert.ok(Math.abs(s.load - sum(s.items.map((u) => u.time))) < 1e-6, "stored load matches its items");
  const lb = Math.max(Math.max(...times), sum(times) / 12);
  assert.ok(mk <= lb * (4 / 3 - 1 / 36) + 1e-9);
});

test("exactPartition reports null when its node budget runs out instead of claiming optimality", () => {
  const items = U([17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 19, 23, 29]);
  assert.equal(exactPartition(items, 4, 1e9, 5), null);
});

test("balance is deterministic and independent of input order", () => {
  const rand = rng(5);
  const times = Array.from({ length: 60 }, () => Math.round(rand() * 300) / 10);
  const items = U(times);
  const a = balance(items, 5);
  const b = balance([...items].reverse(), 5);
  assert.deepEqual(a.shards.map((s) => s.items.map((u) => u.key)), b.shards.map((s) => s.items.map((u) => u.key)));
  assert.equal(a.makespan, b.makespan);
});

test("balance rejects a bad shard count; one shard holds everything; more shards than units leaves some empty", () => {
  assert.throws(() => balance(U([1, 2]), 0), /whole number/);
  assert.throws(() => balance(U([1, 2]), 1.5), /whole number/);
  assert.equal(balance(U([1, 2, 3]), 1).makespan, 6);
  const r = balance(U([5, 3]), 4);
  assert.equal(r.makespan, 5);
  assert.equal(r.shards.filter((s) => s.items.length === 0).length, 2);
});

test("balance scales to thousands of units", () => {
  const rand = rng(11);
  const times = Array.from({ length: 3000 }, () => Math.round(rand() ** 2 * 900) / 10);
  const t0 = Date.now();
  const r = balance(U(times), 16);
  assert.ok(Date.now() - t0 < 5000, "3000 units over 16 shards should take well under 5s");
  assert.ok(r.makespan <= r.lowerBound * 1.01);
});

test("equalCountSplit cuts by count in name order and conserves time", () => {
  const items = U([10, 1, 1, 1, 1, 10, 1, 1]);
  const s = equalCountSplit(items, 4);
  assert.deepEqual(s.map((x) => x.items.length), [2, 2, 2, 2]);
  assert.equal(sum(s.map((x) => x.load)), 26);
});

// ------------------------------------------------------- cost and the report

test("imbalancePct is the slowest shard's excess over the ideal shard", () => {
  assert.equal(imbalancePct(150, 400, 4), 50);
  assert.equal(imbalancePct(100, 400, 4), 0);
  assert.equal(imbalancePct(0, 0, 4), 0);
});

test("sweep: one shard bills the whole suite plus one setup; billed minutes follow N x (slowest + setup)", () => {
  const sweep = sweepShards(U([60, 60, 60, 60]), 30, 4);
  assert.equal(sweep[0].max, 240);
  assert.equal(sweep[0].billedMinutes, (1 * (240 + 30)) / 60);
  assert.equal(sweep[3].max, 60);
  assert.equal(sweep[3].wall, 90);
  assert.equal(sweep[3].billedMinutes, (4 * 90) / 60);
  assert.equal(sweep[1].billedMinutesExact, (240 + 2 * 30) / 60);
});

test("recommend: cheapest N meeting a target, a floor note when unreachable, a knee without a target", () => {
  const items = U([100, 20, 20, 20, 20, 20]);
  const sweep = sweepShards(items, 10, 6);
  const rec = recommend(sweep, { targetSeconds: 130, floor: 100, setupSeconds: 10 });
  assert.equal(rec.basis, "target");
  assert.ok(rec.n >= 2 && sweep[rec.n - 1].wall <= 130);
  assert.ok(sweep.filter((r) => r.wall <= 130).every((r) => r.billedMinutes >= rec.billedMinutes - 1e-9));
  const impossible = recommend(sweep, { targetSeconds: 50, floor: 100, setupSeconds: 10 });
  assert.equal(impossible.n, null);
  assert.match(impossible.note, /floor is 1m 50s/);
  const knee = recommend(sweep, { floor: 100, setupSeconds: 10 });
  assert.equal(knee.basis, "knee");
  assert.equal(knee.n, 2, "100 | 5x20 already reaches the 110s floor");
});

test("analyze: balanced beats the equal-count baseline on the 24-file fixture and the arithmetic adds up", () => {
  const r = analyze([parseJUnit(fx("suite-24-files.xml"))], { shards: 4, setupSeconds: 45 });
  assert.equal(r.totals.units, 24);
  assert.equal(Math.round(r.totals.seconds), 440);
  assert.equal(Math.round(r.idealSeconds), 110);
  assert.ok(r.balanced.max < r.current.max);
  assert.equal(r.balanced.wall, r.balanced.max + 45);
  assert.equal(r.balanced.billedMinutes, (4 * (r.balanced.max + 45)) / 60);
  assert.ok(Math.abs(r.savings.wallSeconds - (r.current.wall - r.balanced.wall)) < 1e-9);
  assert.ok(Math.abs(r.savings.billedMinutes - (r.current.billedMinutes - r.balanced.billedMinutes)) < 1e-9);
  const placed = r.balanced.shards.flatMap((s) => s.units).sort();
  assert.equal(placed.length, 24);
  assert.equal(new Set(placed).size, 24);
  assert.ok(r.balanced.imbalancePct < 1);
  assert.ok(r.current.imbalancePct > 30);
});

test("analyze flags the indivisible bottleneck and says --group test splits it", () => {
  const r = analyze([parseJUnit(fx("suite-24-files.xml"))], { shards: 8, setupSeconds: 0 });
  assert.equal(r.bottlenecks[0].key, "tests/test_import_big_csv.py");
  assert.equal(r.bottlenecks[0].splittable, true);
  assert.ok(r.bottlenecks[0].seconds > r.idealSeconds);
  assert.equal(r.balanced.max, r.floorSeconds, "the slowest shard is exactly the indivisible unit");
  assert.ok(r.warnings.some((w) => /longer than the ideal shard/.test(w) && /--group test/.test(w)));
  const fine = analyze([parseJUnit(fx("suite-24-files.xml"))], { shards: 4 });
  assert.deepEqual(fine.bottlenecks, []);
});

test("a single test longer than the ideal shard is flagged without a split hint in test mode", () => {
  const xml = `<testsuite name="pytest"><testcase classname="t.test_a" name="test_huge" time="100"/>${Array.from({ length: 9 }, (_, i) => `<testcase classname="t.test_b" name="test_${i}" time="1"/>`).join("")}</testsuite>`;
  const r = analyze([parseJUnit(xml)], { shards: 4, group: "test" });
  assert.equal(r.bottlenecks[0].splittable, false);
  assert.equal(r.balanced.max, 100);
});

test("--current-from-reports uses each report as one current shard", () => {
  const a = parseJUnit(fx("pytest.xml"), 0);
  const b = parseJUnit(`<testsuite name="pytest"><testcase classname="tests.test_z" name="test_a" time="3"/></testsuite>`, 1);
  const r = analyze([a, b], { shards: 2, currentFromReports: true });
  assert.equal(r.current.mode, "reports");
  assert.equal(r.current.shards.length, 2);
  assert.equal(Math.round(r.current.shards[1].seconds), 3);
  const fallback = analyze([a], { shards: 2, currentFromReports: true });
  assert.equal(fallback.current.mode, "equal-count");
  assert.ok(fallback.warnings.some((w) => /two or more report files/.test(w)));
});

test("the gate compares the current split's imbalance with the limit", () => {
  const reports = [parseJUnit(fx("suite-24-files.xml"))];
  assert.equal(analyze(reports, { shards: 4, maxImbalancePct: 20 }).gate.exceeded, true);
  assert.equal(analyze(reports, { shards: 4, maxImbalancePct: 90 }).gate.exceeded, false);
  assert.equal(analyze(reports, { shards: 4 }).gate, null);
});

test("analyze rejects reports with no cases, no timings, or bad options", () => {
  assert.throws(() => analyze([[]], {}), /no <testcase>/);
  assert.throws(() => analyze([parseJUnit(`<testsuite><testcase classname="a" name="b" time="0"/></testsuite>`)], {}), /no timings/);
  assert.throws(() => analyze([parseJUnit(fx("pytest.xml"))], { shards: 0 }), /whole number/);
  assert.throws(() => analyze([parseJUnit(fx("pytest.xml"))], { setupSeconds: -1 }), /setup seconds/);
});

test("warns when there are fewer units than shards and when most timings are zero", () => {
  const few = analyze([parseJUnit(fx("maven.xml"))], { shards: 3 });
  assert.ok(few.warnings.some((w) => /sit empty/.test(w)));
  const zeros = `<testsuite name="pytest">${Array.from({ length: 6 }, (_, i) => `<testcase classname="t.test_a" name="test_${i}" time="${i === 0 ? 5 : 0}"/>`).join("")}</testsuite>`;
  assert.ok(analyze([parseJUnit(zeros)], { shards: 2, group: "test" }).warnings.some((w) => /time of 0/.test(w)));
});

// ------------------------------------------------------------------ emitters

test("emitters produce the right command per dialect", () => {
  const unitsOf = (name, group, dialect) => buildUnits(parseJUnit(fx(name)), { group, dialect }).units;
  const py = unitsOf("pytest.xml", "test");
  const e = emitShard("pytest", "test", py.filter((u) => u.key.includes("TestCart")));
  assert.match(e.command, /^pytest /);
  assert.ok(e.args.includes("tests/test_checkout.py::TestCart::test_add_item"));
  assert.match(e.command, /'tests\/test_checkout\.py::TestCart::test_remove_item\[1-2\]'/, "ids with brackets are shell-quoted");
  assert.equal(emitShard("pytest", "file", unitsOf("pytest.xml", "file")).args[0], "tests/test_api.py");
  assert.equal(emitShard("jest", "file", unitsOf("jest.xml", "file")).command, "npx jest src/cart/cart.test.ts src/search/search.test.ts src/util/util.test.ts");
  assert.equal(emitShard("rspec", "file", unitsOf("rspec.xml", "file")).command, "bundle exec rspec spec/lib/money_spec.rb spec/models/user_spec.rb spec/requests/orders_spec.rb");
  const go = emitShard("go", "test", unitsOf("go.xml", "test"));
  assert.match(go.command, /go test -run '\^\(TestInvoice\|TestRefund\|TestTaxTable\)\$' github.com\/acme\/app\/billing && go test -run '\^\(TestLoad\|TestSave\)\$' github.com\/acme\/app\/store/);
  assert.equal(emitShard("go", "file", unitsOf("go.xml", "file")).command, "go test github.com/acme/app/billing github.com/acme/app/store");
  const j = emitShard("java", "test", unitsOf("maven.xml", "test"));
  assert.equal(j.command, "mvn test -Dtest=com.acme.OrderServiceTest#cancelsOrder,com.acme.OrderServiceTest#createsOrder,com.acme.OrderServiceTest#rejectsEmpty");
  assert.match(j.altCommand, /gradle test --tests com\.acme\.OrderServiceTest\.cancelsOrder/);
  assert.equal(emitShard("java", "file", unitsOf("maven.xml", "file")).command, "mvn test -Dtest=com.acme.OrderServiceTest");
});

test("every test appears in exactly one shard's command", () => {
  const r = analyze([parseJUnit(fx("suite-24-files.xml"))], { shards: 5, group: "test" });
  const all = r.balanced.shards.flatMap((s) => s.emit.args);
  assert.equal(all.length, 48);
  assert.equal(new Set(all).size, 48);
});

test("matrixOf returns a GitHub Actions matrix with one row per shard", () => {
  const r = analyze([parseJUnit(fx("suite-24-files.xml"))], { shards: 3 });
  const m = matrixOf(r);
  assert.equal(m.include.length, 3);
  assert.deepEqual(m.include.map((x) => x.shard), [1, 2, 3]);
  assert.ok(m.include.every((x) => x.command.startsWith("pytest ") && x.tests.includes("tests/test_")));
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
});

test("formatSeconds", () => {
  assert.equal(formatSeconds(0), "0s");
  assert.equal(formatSeconds(59.94), "59.9s");
  assert.equal(formatSeconds(125), "2m 5s");
  assert.equal(formatSeconds(3725), "1h 2m 5s");
});
