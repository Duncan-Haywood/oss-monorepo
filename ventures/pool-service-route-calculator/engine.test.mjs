import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, parseAccounts, toCsv, summarize, resolveOptions, money, DEFAULT_ACCOUNTS_CSV, MAX_ACCOUNTS } from "./engine.mjs";

const fixture = readFileSync(new URL("./fixtures/accounts.csv", import.meta.url), "utf8");
const run = (text = fixture, o = {}) => analyze(parseAccounts(text).accounts, o);
const row = (res, name) => res.rows.find((r) => r.name === name);

test("hours, cost and effective hourly follow the stated arithmetic", () => {
  const f = row(run(), "Foster (Far Rd)");
  // hours = 4.33*(25+35)/60 + 2/12*45/60
  assert.ok(Math.abs(f.hours - (4.33 * 60 / 60 + (2 / 12) * 0.75)) < 1e-9);
  const vehicle = (4.33 * 35 / 60 + (2 / 12) * 0.75) * 14;
  assert.ok(Math.abs(f.cost - (34 + vehicle + (2 / 12) * 15)) < 1e-9);
  assert.ok(Math.abs(f.effective - (125 - f.cost) / f.hours) < 1e-9);
  assert.equal(money(f.effective), "$11.53");
  assert.equal(money(f.needed), "$251.81");
});

test("the price that clears the target earns exactly the target", () => {
  const a = run();
  for (const r of a.rows) {
    const again = analyze([{ ...r, price: r.needed }], {}).rows[0];
    assert.ok(Math.abs(again.effective - 40) < 1e-6, r.name);
  }
});

test("moves: keep at target, reprice within the limit, drop beyond it", () => {
  const a = run();
  assert.equal(row(a, "Foster (Far Rd)").move, "drop");
  assert.equal(row(a, "Chen (Cedar Ct)").move, "reprice");
  assert.equal(row(a, "Brooks (Oak Lane)").move, "keep");
  assert.equal(row(a, "Brooks (Oak Lane)").increasePct, 0);
  assert.deepEqual([a.route.below, a.route.reprice, a.route.drop], [5, 2, 3]);
  const generous = run(fixture, { maxIncreasePct: 200 });
  assert.equal(generous.route.drop, 0);
  assert.equal(generous.route.reprice, 5);
});

test("rows are sorted worst effective hourly first", () => {
  const e = run().rows.map((r) => r.effective);
  assert.deepEqual([...e].sort((x, y) => x - y), e);
});

test("route totals and the route hourly if an account were dropped", () => {
  const a = run();
  assert.equal(money(a.route.blended), "$30.46");
  assert.equal(a.route.hours.toFixed(1), "29.9");
  assert.equal((a.route.driveShare * 100).toFixed(0), "31");
  const f = row(a, "Foster (Far Rd)");
  assert.equal(money(f.routeHourlyIfDropped), "$33.78");
  const keep = parseAccounts(fixture).accounts.filter((x) => !["Foster (Far Rd)", "Hart (Hillcrest)", "Dunn (Hillcrest)"].includes(x.name));
  const k = analyze(keep, {});
  assert.equal(money(k.route.blended), "$41.73");
  assert.equal(k.route.hours.toFixed(1), "18.1");
  assert.equal(money(a.route.net - k.route.net), "$154.41");
});

test("a single account cannot be dropped to a route of nothing", () => {
  const a = analyze([{ name: "A", price: 100, visitMin: 20, driveMin: 5, chemicals: 20, callbacks: 0 }], {});
  assert.equal(a.rows[0].routeHourlyIfDropped, null);
});

test("route density: a nearer new stop earns more and needs a lower price", () => {
  const a = run();
  const by = Object.fromEntries(a.density.map((d) => [d.legMin, d]));
  assert.deepEqual([5, 10, 15, 20, 30].map((m) => money(by[m].effective)), ["$46.16", "$37.77", "$31.44", "$26.49", "$19.24"]);
  assert.deepEqual([5, 15, 30].map((m) => money(by[m].needed)), ["$126.28", "$165.25", "$223.70"]);
  assert.equal(money(a.newStop.routeAfter), "$30.55");
  assert.ok(by[5].routeChange > 0 && by[30].routeChange < 0);
  const custom = run(fixture, { newLegMin: 8 });
  assert.ok(custom.density.some((d) => d.legMin === 8));
});

test("callbacks and drive both lower the hourly; helper pay and truck cost move it", () => {
  const base = { name: "A", price: 130, visitMin: 25, driveMin: 6, chemicals: 28, callbacks: 0 };
  const e = (x, o = {}) => analyze([{ ...base, ...x }], o).rows[0].effective;
  assert.ok(e({ callbacks: 6 }) < e({}));
  assert.ok(e({ driveMin: 30 }) < e({}));
  assert.ok(e({}, { truckPerHr: 40 }) < e({}));
  assert.ok(e({}, { laborPerHr: 20 }) < e({}));
});

test("parser: header may reorder columns, ignores comments, reports bad rows", () => {
  const p = parseAccounts("# c\nprice,name,drive,visit,chem\n100,A,5,20,10\n");
  assert.deepEqual(p.accounts[0], { name: "A", price: 100, visitMin: 20, driveMin: 5, chemicals: 10, callbacks: 0 });
  const bad = parseAccounts("A,x,20,5,10,0\nB,100,0,5,10,0\nC,100,20,5\n,1,2,3");
  assert.equal(bad.accounts.length, 1);
  assert.match(bad.errors[0], /Line 1: price/);
  assert.match(bad.errors[1], /Line 2: visit minutes/);
  assert.match(bad.errors[2 + 0] ?? "", /expected name/);
  assert.equal(parseAccounts('"Smith, J",100,20,5,10,0').accounts[0].name, "Smith, J");
  assert.equal(parseAccounts("A,$100,20,5,10,0").accounts[0].price, 100);
});

test("parser limit and option validation", () => {
  const many = Array.from({ length: MAX_ACCOUNTS + 1 }, (_, i) => `P${i},100,20,5,10,0`).join("\n");
  const p = parseAccounts(many);
  assert.equal(p.accounts.length, MAX_ACCOUNTS);
  assert.match(p.errors[0], /Too many accounts/);
  assert.throws(() => resolveOptions({ targetHourly: "x" }), /Target hourly needs a number/);
  assert.throws(() => resolveOptions({ visitsPerMonth: 0 }), /Visits per month must be between/);
  assert.throws(() => analyze([], {}), /at least one account/);
  assert.equal(DEFAULT_ACCOUNTS_CSV.trim(), fixture.trim());
});

test("CSV export has one line per account, quotes commas, round-trips the key columns", () => {
  const csv = toCsv(run());
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 11);
  assert.match(lines[0], /^account,price,hours_per_month/);
  assert.match(lines[1], /^Foster \(Far Rd\),125,4\.46,73\.61,51\.39,11\.53,251\.81,101\.45,drop,33\.78$/);
  const quoted = toCsv(run('"Smith, J",100,20,5,10,0\nB,100,20,5,10,0'));
  assert.match(quoted, /^"Smith, J",/m);
});

test("summary names counts, target and the not-market-rates caveat", () => {
  const s = summarize(run());
  assert.equal(s.status, "warn");
  assert.match(s.text, /^5 of 10 accounts earn under \$40\.00 an hour/);
  assert.match(s.text, /not market rates/);
  const ok = summarize(run(fixture, { targetHourly: 10 }));
  assert.equal(ok.status, "ok");
});
