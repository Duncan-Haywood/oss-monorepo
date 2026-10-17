import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, DEFAULT_TIERS, priceJob, priceBook, partsMarkup, hourlyCost, toCsv, summarize, money, pct, encodeShare, decodeShare, cleanTiers } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults: true cost is $100 an hour, split $70 labour and $30 overhead", () => {
  const h = hourlyCost(DEFAULTS);
  close(h.loadedWage, 43.75);
  close(h.labourPerHour, 70);
  close(h.overheadPerHour, 30);
  close(h.perHour, 100);
});

test("defaults: a 2.75-hour job with $120 of parts prices at $595", () => {
  const r = priceJob();
  close(r.hours, 2.75);
  close(r.timeCost, 275);
  close(r.markup.markup, 78);
  close(r.partsCharge, 198);
  close(r.exact, 275 / 0.7 + 198);
  close(r.price, 595);
  close(r.totalCost, 395);
  close(r.profit, 200);
  assert.equal(pct(r.marginPct), "33.6%");
  assert.equal(money(r.effectiveRate), "$172.73");
  close(r.minCallout, 180);
  close(r.breakEvenHours, 4.75);
});

test("markup tiers are marginal: no cliff at a tier ceiling", () => {
  const a = partsMarkup(100).markup;
  const b = partsMarkup(100.01).markup;
  assert.ok(b > a && b - a < 0.01);
  close(partsMarkup(0).markup, 0);
  close(partsMarkup(25).markup, 25);
  close(partsMarkup(900).markup, 330);
  assert.equal(partsMarkup(900).slices.length, 4);
});

test("a bigger part never lowers the price, and rounding never takes margin down", () => {
  let last = 0;
  for (let p = 0; p <= 1500; p += 7.5) {
    const r = priceJob({ partsCost: p });
    assert.ok(r.price >= last, String(p));
    assert.ok(r.price >= r.exact - 1e-9);
    last = r.price;
  }
});

test("the margin on time is hit exactly when parts are zero and rounding is off", () => {
  const r = priceJob({ partsCost: 0, roundTo: 0 });
  close(r.marginPct, 30, 1e-9);
});

test("billable hours drive the cost: counting every paid hour as billable under-prices", () => {
  assert.equal(money(priceJob({ billableHours: 2080 }).hourly.perHour), "$62.50");
  assert.equal(money(priceJob({ billableHours: 1000 }).hourly.perHour), "$130.00");
  assert.equal(priceJob({ billableHours: 2080 }).price, 445);
  assert.equal(priceJob({ billableHours: 1000 }).price, 710);
});

test("the flat price loses money past its break-even hours and earns more when the job is fast", () => {
  const r = priceJob();
  close(r.overrun[3].profit, -75);
  close(r.overrun[2].profit, 62.5);
  const fast = r.tm.rows[0];
  const slow = r.tm.rows[5];
  assert.ok(fast.flatBeatsTm && !slow.flatBeatsTm);
  close(r.tm.crossHours, (595 - 198) / 135);
  assert.equal(r.tm.tmCoversCost, true);
  assert.equal(priceJob({ tmRate: 90 }).tm.tmCoversCost, false);
});

test("the two bills are equal at the cross hours", () => {
  const r = priceJob();
  close(r.tm.crossHours * r.tm.rate + r.partsCharge, r.price, 1e-9);
});

test("the big job: water heater swap prices at $1,875 with a 28.0% margin", () => {
  const r = priceJob({ onsiteHours: 3.5, travelHours: 1, partsCost: 900 });
  close(r.markup.markup, 330);
  close(r.price, 1875);
  assert.equal(pct(r.marginPct), "28.0%");
  assert.equal(money(r.effectiveRate), "$216.67");
});

test("price book prices each row on the shared shop numbers", () => {
  const rows = priceBook([{ name: "A", onsiteHours: 1, travelHours: 0.5, partsCost: 25 }, { name: "", onsiteHours: 2, travelHours: 0.75, partsCost: 120 }]);
  assert.equal(rows[0].price, 265);
  assert.equal(rows[1].name, "Job 2");
  assert.equal(rows[1].price, 595);
  assert.throws(() => priceBook([]), /at least one job/);
});

test("CSV escapes quotes and commas and defuses spreadsheet formulas", () => {
  const csv = toCsv([{ name: '=HYPERLINK("x"),y', onsiteHours: 1, travelHours: 0.5, partsCost: 0, hours: 1.5, price: 265, totalCost: 150, profit: 115, marginPct: 43.4, effectiveRate: 176.67 }]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""x""),y",`), lines[1]);
  assert.ok(lines[0].startsWith("Job,On-site hours"));
});

test("bad input is rejected with a message, not NaN", () => {
  assert.throws(() => priceJob({ wage: "" }), /Hourly wage/);
  assert.throws(() => priceJob({ targetMarginPct: 100 }), /under 100/);
  assert.throws(() => priceJob({ billableHours: 3000 }), /more than paid/);
  assert.throws(() => priceJob({ onsiteHours: 0, travelHours: 0 }), /more than zero/);
  assert.throws(() => priceJob({ partsCost: -1 }), /Parts cost/);
  assert.throws(() => cleanTiers([{ upTo: 100, markupPct: 10 }, { upTo: 50, markupPct: 10 }, { upTo: null, markupPct: 5 }]), /above the one before/);
});

test("share link round-trips every field and the tiers, and ignores junk", () => {
  const inputs = { ...DEFAULTS, wage: 42, partsCost: 333.5 };
  const tiers = [{ upTo: 30, markupPct: 90 }, { upTo: 200, markupPct: 50 }, { upTo: null, markupPct: 20 }];
  const d = decodeShare("#" + encodeShare(inputs, tiers));
  assert.deepEqual(d.inputs, inputs);
  assert.deepEqual(d.tiers, tiers);
  const bad = decodeShare("#wage=abc&partsCost=-5&evil=1&tiers=9:9,1:1,:2");
  assert.deepEqual(bad.inputs, {});
  assert.equal(bad.tiers, null);
  assert.deepEqual(decodeShare(undefined), { inputs: {}, tiers: null });
});

test("summary names the price, the callout and the overrun", () => {
  const s = summarize(priceJob());
  assert.equal(s.status, "ok");
  for (const t of ["$100.00 per billable hour", "$595.00", "$180.00", "4.75 hours"]) assert.ok(s.text.includes(t), t);
});

test("default tiers are the documented ones", () => {
  assert.deepEqual(DEFAULT_TIERS.map((t) => t.markupPct), [100, 60, 40, 25]);
});
