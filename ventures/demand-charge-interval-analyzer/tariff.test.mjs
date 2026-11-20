import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./calc.mjs";
import { touBattery, jointLP, jointLPPeriods, onPeakFlags } from "./tou.mjs";
import { parseUrdb, findRate, holidays, expand, toWindow, billMonth, tariffBattery, flatRate } from "./tariff.mjs";

const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/urdb/${f}`, import.meta.url), "utf8"));
const sce = fixture("sce-gs2-tou-b-2015.json");
const entergy = fixture("entergy-arkansas-lps-tou-2018.json");
const bat = (kw, kwh, roundTrip = 1) => ({ kw, kwh, roundTrip });
const settings = (ratchet = "") => ({ unit: "kw", intervalMin: "", demandRate: "1", ratchetPct: ratchet, usablePct: "" });
function month(y, mo, fn) {
  const rows = [];
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) for (let q = 0; q < 96; q++) rows.push({ t: Date.UTC(y, mo - 1, d, Math.floor(q / 4), (q % 4) * 15), v: fn(d, q) });
  return rows;
}

test("SCE GS-2 TOU-B (URDB): periods, rates, flat demand, fixed charge, and the discounts it does not apply", () => {
  const r = parseUrdb(JSON.stringify({ items: [sce] }));
  assert.equal(r.ok, true);
  const s = r.schedule;
  assert.deepEqual(s.energy.prices, [0.0712, 0.09368, 0.066, 0.08888, 0.1355]);
  assert.deepEqual(s.demand.rates, [0, 5.3, 18.11]);
  assert.deepEqual(s.flat, { months: Array(12).fill(0), rates: [13.2] });
  assert.equal(s.fixedMonthly, 259.2);
  assert.equal(s.startdate, "2015-06-01");
  assert.ok(r.warnings.some((w) => /demandattrs/.test(w)));
  assert.equal(findRate({ ElectricTariff: { urdb_response: sce } }), sce);
});

test("Entergy Arkansas LPS-TOU (URDB): rate + adj riders, demand window, seasonal demand periods", () => {
  const r = parseUrdb(entergy);
  assert.equal(r.ok, true);
  const s = r.schedule;
  assert.ok(Math.abs(s.energy.prices[0] - (0.01973 + 0.01882)) < 1e-12);
  assert.ok(Math.abs(s.demand.rates[0] - (18.18 + 0.707)) < 1e-12);
  assert.equal(s.demandWindow, 15);
  assert.equal(s.flat, null);
  // July weekday 15:00 is summer on-peak (period 0); January 10:00 is winter on-peak (period 2).
  const { period, price } = expand([Date.UTC(2018, 6, 10, 15), Date.UTC(2018, 0, 10, 10), Date.UTC(2018, 6, 14, 15)], s);
  assert.deepEqual(period, [0, 2, 1]); // Saturday 14 July is off-peak
  assert.ok(Math.abs(price[0] - (0.01973 + 0.01882)) < 1e-12);
});

test("bad input is refused with a reason", () => {
  assert.equal(parseUrdb("{not json").ok, false);
  assert.match(parseUrdb({ foo: 1 }).error, /No URDB rate/);
  const broken = { ...sce, demandweekdayschedule: sce.demandweekdayschedule.slice(0, 11) };
  assert.match(parseUrdb(broken).error, /12 months x 24 hours/);
  const outOfRange = { ...sce, energyweekdayschedule: sce.energyweekdayschedule.map((r) => r.map(() => 7)) };
  assert.equal(parseUrdb(outOfRange).ok, false);
  const tiered = { ...sce, energyratestructure: [[{ rate: 0.1, max: 500 }, { rate: 0.2 }], ...sce.energyratestructure.slice(1)] };
  assert.ok(parseUrdb(tiered).warnings.some((w) => /2 tiers/.test(w)));
});

test("holidays: NERC six and federal eleven, with the observed-day rules", () => {
  assert.deepEqual(holidays(2024, "nerc"), ["2024-01-01", "2024-05-27", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25"]);
  const f22 = holidays(2022, "federal");
  assert.equal(f22.length, 11);
  assert.ok(f22.includes("2021-12-31")); // New Year's Day 2022 fell on a Saturday
  assert.ok(f22.includes("2022-06-20")); // Juneteenth on a Sunday, observed Monday
  assert.ok(f22.includes("2022-12-26"));
  assert.ok(f22.includes("2022-01-17") && f22.includes("2022-10-10") && f22.includes("2022-11-24"));
  assert.equal(holidays(2020, "federal").length, 10); // before Juneteenth
  assert.ok(holidays(2022, "nerc").includes("2022-12-26")); // Sunday Christmas moves to Monday
  // Independence Day 2024 (a Thursday) bills on the weekend schedule when holidays apply.
  const s = parseUrdb(sce).schedule;
  const t = [Date.UTC(2024, 6, 4, 13)];
  assert.equal(expand(t, s).period[0], 2);
  assert.equal(expand(t, s, "nerc").period[0], -1);
  assert.equal(expand(t, s, "nerc").weekend[0], true);
});

test("demand window: 15-minute readings averaged into 30-minute blocks on the clock", () => {
  const list = [0, 15, 30, 45].map((m, i) => ({ t: Date.UTC(2024, 0, 1, 0, m), kw: [10, 30, 20, 20][i] }));
  const w = toWindow(list, 15, 30);
  assert.equal(w.intervalMin, 30);
  assert.deepEqual(w.list.map((p) => p.kw), [20, 20]);
  assert.equal(toWindow(list, 15, 15).list, list);
});

test("two demand periods and the facility charge: kW-limited battery shaves each spike by its rating", () => {
  // SCE GS-2 TOU-B with one flat energy price, so only demand matters.
  const s = parseUrdb(sce).schedule;
  s.energy = { ...s.energy, prices: s.energy.prices.map(() => 0.1) };
  // July 2015, flat 10 kW, a 30 kW quarter-hour each weekday at 09:00 (mid-peak, 5.30) and 13:00 (on-peak, 18.11).
  const rows = month(2015, 7, (d, q) => (q === 36 || q === 52 ? 30 : 10));
  const a = analyze(rows, settings());
  const r = tariffBattery(a, s, bat(5, 1000));
  const m = r.months[0];
  assert.deepEqual(m.before.periodKw, [0, 30, 30]);
  assert.ok(Math.abs(m.after.periodKw[1] - 25) < 0.01 && Math.abs(m.after.periodKw[2] - 25) < 0.01, JSON.stringify(m.after.periodKw));
  assert.ok(Math.abs(m.after.facKw - 25) < 0.01);
  const perMonth = 5 * 5.3 + 5 * 18.11 + 5 * 13.2;
  assert.ok(Math.abs(r.demandSaving - perMonth * 12) < 0.5, `${r.demandSaving} vs ${perMonth * 12}`);
  assert.ok(Math.abs(r.energySaving) < 0.5);
  assert.ok(Math.abs(r.yearly.before.fixed - 259.2 * 12) < 1e-9);
});

test("a one-window tariff written as a URDB rate gives touBattery's answer", () => {
  // Facility $10/kW, on-peak demand $12/kW 12:00-18:00 weekdays, $0.20 / $0.10 energy.
  const on = Array.from({ length: 24 }, (_, h) => (h >= 12 && h < 18 ? 1 : 0));
  const off = Array(24).fill(0);
  const urdb = {
    energyratestructure: [[{ rate: 0.1 }], [{ rate: 0.2 }]], energyweekdayschedule: Array(12).fill(on), energyweekendschedule: Array(12).fill(off),
    demandratestructure: [[{ rate: 0 }], [{ rate: 12 }]], demandweekdayschedule: Array(12).fill(on), demandweekendschedule: Array(12).fill(off),
    flatdemandstructure: [[{ rate: 10 }]], flatdemandmonths: Array(12).fill(0),
  };
  const s = parseUrdb(urdb).schedule;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rows = [...month(2026, 6, () => 40 + 30 * rnd()), ...month(2026, 7, () => 40 + 30 * rnd())];
  const a = analyze(rows, { ...settings("80"), demandRate: "10" });
  const b = bat(15, 30, 0.88);
  const t = touBattery(a, { onStart: 12, onEnd: 18, weekdaysOnly: true, onDemandRate: 12, onPrice: 0.2, offPrice: 0.1, facilityRate: 10 }, b);
  const u = tariffBattery(a, s, b);
  assert.ok(Math.abs(u.yearlyBefore - t.yearlyBefore) < 1e-6, `${u.yearlyBefore} vs ${t.yearlyBefore}`);
  assert.ok(Math.abs(u.yearlyAfter - t.yearlyAfter) / t.yearlyAfter < 1e-4, `${u.yearlyAfter} vs ${t.yearlyAfter}`);
});

test("jointLPPeriods with one period is jointLP", () => {
  const load = Array.from({ length: 96 * 3 }, (_, i) => 20 + 10 * Math.sin(i / 7) + (i % 96 === 60 ? 15 : 0));
  const times = load.map((_, i) => Date.UTC(2026, 5, 1) + i * 900000);
  const on = onPeakFlags(times, { onStart: 14, onEnd: 19, weekdaysOnly: false });
  const price = on.map((x) => (x ? 0.3 : 0.1));
  const b = bat(8, 20, 0.9);
  const x = jointLP(load, on, price, 0.25, b, 9, 14);
  const y = jointLPPeriods({ load, period: on.map((v) => (v ? 0 : -1)), price, rates: [14] }, 0.25, b, 9);
  assert.deepEqual(x.grid, y.grid);
});

test("the battery never raises the bill, and none means no change, on both real rates", () => {
  const s1 = parseUrdb(sce).schedule, s2 = parseUrdb(entergy).schedule;
  const rows = [...month(2015, 7, (d, q) => 30 + 20 * Math.sin((q / 96) * 2 * Math.PI - 1.5) + (d % 5 === 0 && q === 58 ? 25 : 0)), ...month(2015, 8, (d, q) => 28 + 18 * Math.sin((q / 96) * 2 * Math.PI - 1.4))];
  const a = analyze(rows, settings("50"));
  for (const s of [s1, s2]) {
    const z = tariffBattery(a, s, bat(0, 0));
    assert.ok(Math.abs(z.saving) < 1e-9);
    const r = tariffBattery(a, s, bat(10, 20, 0.88), { holidays: "nerc" });
    assert.ok(r.ok);
    r.months.forEach((m) => assert.ok(m.after.total <= m.before.total + 1e-6, `${m.month} ${m.after.total} > ${m.before.total}`));
    assert.ok(r.saving > 0);
  }
  // Bills recompute by hand: the before bill is facility peak x flat rate + each period's peak x its rate + energy + fixed.
  const m = tariffBattery(a, s1, bat(0, 0)).months[0];
  const list = a.months[0].list;
  const { price, period } = expand(list.map((p) => p.t), s1);
  const hand = billMonth(list.map((p) => p.kw), period, price, 0.25, s1, 6);
  assert.ok(Math.abs(m.before.total - (hand.facKw * flatRate(s1, 6) + hand.touDemand + hand.energy + 259.2)) < 1e-9);
});
