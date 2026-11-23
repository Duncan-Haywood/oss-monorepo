import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTariff, parseTariffs, hourlyPrices, usHolidays, EXAMPLE_TARIFFS } from "./tariff.mjs";

const at = (plan, y, mo, d, h) => {
  const p = hourlyPrices(plan, Date.UTC(y, mo - 1, d, h), 1);
  return [p.imp[0], p.exp[0]];
};

test("the last matching line wins; months, day types and hours narrow a line", () => {
  const { ok, plan, errors } = parseTariff(`name: t
fixed: 12.5
import: 0.30
import jun-sep: 0.35
import 16-21: 0.40
import jun-sep weekdays 16-21: 0.55
export: 0.05`);
  assert.ok(ok, errors.join("; "));
  assert.equal(plan.fixed, 12.5);
  assert.deepEqual(at(plan, 2025, 1, 15, 10), [0.3, 0.05]); // January, morning
  assert.deepEqual(at(plan, 2025, 7, 15, 10), [0.35, 0.05]); // July (Tuesday), morning
  assert.deepEqual(at(plan, 2025, 7, 15, 16), [0.55, 0.05]); // July weekday 4 pm
  assert.deepEqual(at(plan, 2025, 7, 19, 16), [0.4, 0.05]); // July Saturday 4 pm: the weekday line does not apply
  assert.deepEqual(at(plan, 2025, 7, 15, 21), [0.35, 0.05]); // 21 is the end, not included
});

test("hours and months wrap", () => {
  const { plan } = parseTariff("import: 0.3\nimport 21-6: 0.1\nimport nov-feb 6-9: 0.5");
  assert.equal(at(plan, 2025, 3, 3, 23)[0], 0.1);
  assert.equal(at(plan, 2025, 3, 3, 5)[0], 0.1);
  assert.equal(at(plan, 2025, 3, 3, 6)[0], 0.3);
  assert.equal(at(plan, 2025, 1, 6, 7)[0], 0.5);
  assert.equal(at(plan, 2025, 12, 1, 7)[0], 0.5);
  assert.equal(at(plan, 2025, 3, 3, 7)[0], 0.3);
});

test("export at import minus a charge, by period, and an hourly table", () => {
  const minus = parseTariff("import: 0.3\nimport 16-21: 0.5\nexport: import - 0.03").plan;
  assert.deepEqual(at(minus, 2025, 5, 5, 17).map((x) => +x.toFixed(4)), [0.5, 0.47]);
  const rows = Array.from({ length: 12 }, (_, m) => Array.from({ length: 24 }, (_, h) => (m * 100 + h) / 1000).join(" "));
  const tbl = parseTariff(`import: 0.3\nexport table weekdays:\n${rows.join("\n")}\nexport table weekends:\n${rows.map(() => Array(24).fill(0.01).join(",")).join("\n")}`);
  assert.ok(tbl.ok, tbl.errors.join("; "));
  assert.equal(at(tbl.plan, 2025, 9, 3, 18)[1], (800 + 18) / 1000); // Wednesday in September, 6 pm
  assert.equal(at(tbl.plan, 2025, 9, 6, 18)[1], 0.01); // Saturday
});

test("US federal holidays, observed days, priced as weekends when asked", () => {
  const h25 = usHolidays(2025), h26 = usHolidays(2026);
  for (const d of ["2025-01-01", "2025-02-17", "2025-05-26", "2025-07-04", "2025-09-01", "2025-11-11", "2025-11-27", "2025-12-25"]) assert.ok(h25.has(d), d);
  assert.ok(h26.has("2026-07-03"), "Saturday July 4, 2026 observed on Friday");
  assert.ok(!h26.has("2026-07-04"));
  assert.equal(h25.size, 8);
  const plan = parseTariff("import: 0.3\nimport weekdays 16-21: 0.5\nholidays: weekend").plan;
  assert.equal(at(plan, 2025, 7, 4, 17)[0], 0.3);
  assert.equal(at(plan, 2025, 7, 3, 17)[0], 0.5);
  assert.equal(at({ ...plan, holidays: false }, 2025, 7, 4, 17)[0], 0.5);
});

test("mistakes are named, with the line", () => {
  const r = parseTariff("import: 32\nimport sumer: 0.4\nexport 16-21 0.2\nfoo: 1");
  assert.ok(!r.ok);
  assert.match(r.errors.join("\n"), /Line 1: 32 \$\/kWh is outside/);
  assert.match(r.errors.join("\n"), /Line 2: "sumer"/);
  assert.match(r.errors.join("\n"), /Line 3: no colon/);
  assert.match(r.errors.join("\n"), /Line 4: unknown line "foo"/);
  assert.match(parseTariff("export: 0.05").errors[0], /No import price/);
  assert.match(parseTariff("import: 0.3\nexport table:\n1 2 3").errors[0], /12 lines/);
});

test("the examples parse and every hour of a year is priced", () => {
  const plans = parseTariffs(EXAMPLE_TARIFFS);
  assert.equal(plans.length, 3);
  for (const p of plans) {
    assert.ok(p.ok, p.errors.join("; "));
    const h = hourlyPrices(p.plan, Date.UTC(2025, 0, 1), 8760);
    assert.equal(h.uncovered, 0);
    assert.equal(h.months.length, 12);
    for (let i = 0; i < 8760; i++) assert.ok(h.exp[i] <= h.imp[i] + 1e-12, "export never above import in the examples");
  }
});

// Added by quality round 100 (portfolio/quality/audits/2026-11-23-home-battery-planner.json).
test("0-24 covers every hour, and other ranges are unchanged", () => {
  const r = parseTariff("import: 0.30\nimport 0-24: 0.50");
  assert.deepEqual(r.errors, []);
  const { imp } = hourlyPrices(r.plan, Date.UTC(2025, 0, 1), 24);
  assert.ok([...imp].every((x) => x === 0.5), [...imp].join(","));
  const q = parseTariff("import: 0.10\nimport 16-21: 0.40\nimport 21-1: 0.05\nimport 22-24: 0.20").plan;
  const h = [...hourlyPrices(q, Date.UTC(2025, 0, 1), 24).imp];
  assert.deepEqual(h.slice(16, 21), [0.4, 0.4, 0.4, 0.4, 0.4]);
  // later lines win: 22-24 (hours 22, 23) overrides part of 21-1 (21, 22, 23, 0)
  assert.deepEqual(h.slice(21), [0.05, 0.2, 0.2]);
  assert.equal(h[0], 0.05); assert.equal(h[1], 0.10); assert.equal(h[15], 0.10);
});

test("a Saturday New Year's Day is observed on the Friday before, in the old year", () => {
  // 2022-01-01 was a Saturday, so Fri 2021-12-31 is the observed federal holiday (OPM)
  assert.ok(usHolidays(2021).has("2021-12-31"));
  const p = parseTariff("import: 0.30\nimport weekdays 16-21: 0.50\nholidays: weekend").plan;
  assert.equal(hourlyPrices(p, Date.UTC(2021, 11, 31, 17), 1).imp[0], 0.3);
  assert.equal(hourlyPrices(p, Date.UTC(2021, 11, 30, 17), 1).imp[0], 0.5);
});
