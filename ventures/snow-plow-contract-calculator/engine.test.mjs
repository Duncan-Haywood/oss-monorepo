import test from "node:test";
import assert from "node:assert/strict";
import { compare, normalizeOptions, parseSites, parseSeasons, audit, summarizeCompare, summarizeAudit, money, DEFAULT_SITES_CSV, MODELS } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const byId = (c, id) => c.models.find((m) => m.id === id);
const one = [{ name: "Test lot", hours: 2, perPush: 100, seasonalFlat: 1000, perInch: 20, trigger: 3, saltLbs: 100 }];
const opts = { lowEvents: "0,0,0", normalEvents: "4,2,1", highEvents: "8,4,2", probs: "0,100,0" };

test("one site by hand: light storms are under the trigger, 3 plows, 7.6 hours, $600 cost", () => {
  const c = compare(one, opts);
  assert.equal(c.seasons.normal.plows, 3);
  // medium: 2 h x 1.0 + 12 min = 2.2 h, twice; heavy: 2 h x 1.5 + 12 min = 3.2 h
  close(c.seasons.normal.hours, 7.6);
  close(c.seasons.normal.running, 7.6 * 75);
  close(c.seasons.normal.salt, 30);
  close(c.seasons.normal.cost, 600);
});

test("each model bills what its rule says", () => {
  const c = compare(one, opts);
  close(byId(c, "perPush").revenue.normal, 300);
  // medium 4 in x 2 storms + heavy 6 in + 2 in at +25% = 8 + 8.5 inches
  close(byId(c, "perInch").revenue.normal, 16.5 * 20);
  close(byId(c, "flat").revenue.normal, 1000);
  close(byId(c, "cappedFlat").revenue.normal, 1000);
  close(byId(c, "hybrid").revenue.normal, 1000 * 0.4 + 3 * 100 * 0.6);
  close(byId(c, "perPush").effective.normal, (300 - 600) / 7.6);
  assert.equal(c.models.length, MODELS.length);
});

test("a seasonal flat is paid even when nothing is plowed; per push is not", () => {
  const c = compare(one, opts);
  assert.equal(c.seasons.low.plows, 0);
  assert.equal(byId(c, "flat").revenue.low, 1000);
  assert.equal(byId(c, "perPush").revenue.low, 0);
  assert.equal(byId(c, "flat").effective.low, null);
});

test("capped flat adds per-push revenue only past the cap", () => {
  const c = compare(one, { ...opts, capEvents: 1 });
  close(byId(c, "cappedFlat").revenue.normal, 1000 + 2 * 100);
  const d = compare(one, { ...opts, capEvents: 0 });
  close(byId(d, "cappedFlat").revenue.normal, 1000 + 3 * 100);
});

test("flat price needed for target, loss threshold and walk-away", () => {
  const c = compare(one, { ...opts, targetHourly: 40, walkAwayPct: 50 });
  close(c.flat.neededForTarget.normal, 600 + 7.6 * 40);
  close(c.flat.loseMoneyBelow.normal, 600);
  close(c.flat.walkAway, 600 + 7.6 * 40 * 0.5);
  assert.equal(c.flat.current, 1000);
  assert.equal(c.flat.clearsTargetInLowYear, true);
  // high year: 6 + 4 + ... is costlier than the quoted flat
  assert.ok(c.flat.loseMoneyBelow.high > c.flat.loseMoneyBelow.normal);
  assert.ok(c.flat.neededForTarget.high > c.flat.neededForTarget.low);
});

test("example route: cost, hours and the flat verdict match the guide", () => {
  const c = compare(parseSites(DEFAULT_SITES_CSV).sites, {});
  assert.deepEqual(["low", "normal", "high"].map((y) => c.seasons[y].plows), [21, 44, 73]);
  close(c.seasons.normal.hours, 74.05);
  assert.equal(money(c.seasons.normal.cost), "$6,171.75");
  assert.equal(money(c.flat.loseMoneyBelow.high), "$10,934.63");
  assert.equal(c.flat.losesMoneyInHighYear, true);
  assert.equal(c.flat.clearsTargetInLowYear, true);
  const flat = byId(c, "flat");
  assert.ok(flat.effective.low > flat.effective.normal && flat.effective.normal > flat.effective.high);
  assert.ok(flat.effective.high < 0);
  const pp = byId(c, "perPush");
  assert.ok(pp.effective.low > pp.effective.high && pp.effective.high > 0);
});

test("breakeven storms: fixed price stops paying as storms scale up; per push never does while each plow pays", () => {
  const c = compare(parseSites(DEFAULT_SITES_CSV).sites, {});
  const flat = byId(c, "flat");
  assert.ok(flat.targetStorms > 0 && flat.targetStorms < flat.breakEvenStorms);
  assert.ok(flat.breakEvenStorms > 18 && flat.breakEvenStorms < 40);
  assert.equal(byId(c, "perPush").breakEvenStorms, null);
  // price the per-push below cost per visit: loses on every storm
  const bad = compare(one.map((s) => ({ ...s, perPush: 10 })), opts);
  assert.equal(byId(bad, "perPush").losesEveryStorm, true);
});

test("best, sturdiest and summary", () => {
  const c = compare(parseSites(DEFAULT_SITES_CSV).sites, {});
  assert.equal(c.best.id, "cappedFlat");
  assert.ok(c.sturdiest.worstYear >= byId(c, "flat").worstYear);
  const s = summarizeCompare(c);
  assert.equal(s.status, "ok");
  assert.match(s.text, /loses money in a high year below \$10,934\.63/);
});

test("probabilities weight the expected revenue", () => {
  const c = compare(one, { ...opts, probs: "50,0,50" });
  close(byId(c, "perPush").revenue.weighted, 0.5 * 0 + 0.5 * byId(c, "perPush").revenue.high);
});

test("options validate with readable errors", () => {
  assert.throws(() => normalizeOptions({ truckRate: "x" }), /truckRate must be a number/);
  assert.throws(() => normalizeOptions({ walkAwayPct: 101 }), /between 0 and 100/);
  assert.throws(() => normalizeOptions({ normalEvents: "1,2" }), /three numbers/);
  assert.throws(() => normalizeOptions({ probs: "0,0,0" }), /not all be zero/);
  assert.throws(() => normalizeOptions({ lightDepth: 9 }), /depths must rise/);
  assert.throws(() => compare([], {}), /at least one site/);
  assert.equal(normalizeOptions({ truckRate: "$60" }).truckRate, 60);
});

test("parseSites reports line numbers and never throws", () => {
  const p = parseSites("name,hours,perPush,seasonalFlat,perInch,trigger,saltLbs\nA,1,100,500,10,2\nB,0,1,1,1,1\nC,1,x,1,1,1\nD,1\n,1,1,1,1,1\n# c\nE,1,1,1,1,-1\nF,1,1,1,1,1,-5");
  assert.equal(p.sites.length, 1);
  assert.equal(p.sites[0].saltLbs, 0);
  assert.deepEqual(p.errors.map((e) => e.split(":")[0]), ["Line 3", "Line 4", "Line 5", "Line 6", "Line 8", "Line 9"]);
});

test("parseSeasons and audit rank models by net hourly", () => {
  const p = parseSeasons("site,model,revenue,hours,season\nA,Per-Push,1000,10,25\nB,seasonal,1000,40\nC,seasonal,x,3\nD,seasonal,1,0\n,flat,1,1\nE,,1,1\nF,flat");
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].model, "per-push");
  assert.equal(p.errors.length, 5);
  const a = audit(p, { truckRate: 50, fuelPerHr: 10, bladeWearPerHr: 5, targetHourly: 30 });
  close(a.runningPerHour, 65);
  assert.equal(a.byModel[0].model, "per-push");
  close(a.byModel[0].net, 100 - 65);
  close(a.byModel[1].net, 25 - 65);
  assert.equal(a.below, 1);
  close(a.shortfall, (30 + 40) * 40);
  assert.match(summarizeAudit(a).text, /Best model: per-push/);
  assert.equal(summarizeAudit({ rows: [] }).status, "empty");
});

test("limits are enforced", () => {
  const rows = Array.from({ length: 501 }, (_, i) => `S${i},m,1,1`).join("\n");
  assert.match(parseSeasons(rows).errors.join(), /Too many rows/);
  const sites = Array.from({ length: 201 }, (_, i) => `S${i},1,1,1,1,1`).join("\n");
  assert.match(parseSites(sites).errors.join(), /Too many sites/);
});
