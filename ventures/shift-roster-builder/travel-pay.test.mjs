// Paid travel between sites (2026-11-14): --pay-travel pays each same-day trip between two named sites as hours worked (so it
// counts toward daily and weekly overtime), --travel-allowance adds a flat amount per trip; the search prices both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStaff, parseShifts, buildRoster, coverOptions, siteSplit } from "./calc.mjs";

const ANA = "name,wage,max,min,availability\nAna,20,40,0,any";
const HOP = "Mon,9,13,1,,site: Main\nMon,14,18,1,,site: Harbour";

test("a trip is paid at the wage, counts toward daily overtime, and the allowance sits outside overtime and burden", () => {
  const st = parseStaff(ANA).staff, sl = parseShifts(HOP).slots;
  const base = { minRestHours: 0, travel: 30 };
  assert.equal(buildRoster(st, sl, base).cost, 160);
  assert.equal(buildRoster(st, sl, base).travelPaid, undefined); // off: nothing new in the result
  const paid = buildRoster(st, sl, { ...base, travelPay: true });
  assert.equal(paid.cost, 170);
  assert.deepEqual(paid.travelPaid, { trips: 1, hours: 0.5, cost: 10 });
  // 8 h of shifts + 1 h trip with daily overtime after 8 h: the trip hour is paid at 1.5x.
  const ot = buildRoster(st, sl, { ...base, travel: 60, travelPay: true, dailyOtAfter: 8 });
  assert.equal(ot.cost, 190);
  assert.equal(ot.otHours, 1);
  // $5 a trip with a 10% burden: the burden applies to wages only.
  const allow = buildRoster(st, sl, { ...base, travelAllowance: 5, burdenPct: 10 });
  assert.ok(Math.abs(allow.cost - (176 + 5)) < 1e-9, String(allow.cost));
  assert.equal(allow.travelPaid.trips, 1);
});

test("only consecutive same-day shifts at different named sites are trips", () => {
  const st = parseStaff(ANA).staff;
  const sl = parseShifts("Mon,7,9,1,,site: Main\nMon,10,12,1\nMon,13,15,1,,site: Harbour\nMon,16,18,1,,site: Harbour\nTue,7,9,1,,site: Main\nWed,7,9,1,,site: Harbour").slots;
  const r = buildRoster(st, sl, { minRestHours: 0, travel: 30, travelPay: true });
  assert.equal(r.unfilledSlots, 0);
  // Main -> (no site, skipped) -> Harbour on Monday is one trip; Harbour -> Harbour none; Tue Main and Wed Harbour are other days.
  assert.equal(r.travelPaid.trips, 1);
});

test("the search avoids a paid trip it can avoid, at no cost in open hours", () => {
  // Ana opens Main; the afternoon has one shift at each site and Ben can work either. Unpriced, sending Ana across ties with
  // keeping her at Main; priced, keeping her at Main is strictly cheaper.
  const st = parseStaff(ANA + "\nBen,20,40,0,any").staff;
  const sl = parseShifts("Mon,9,13,1,,site: Main\nMon,14,18,1,,site: Main\nMon,14,18,1,,site: Harbour\nTue,9,13,1,,site: Main\nTue,14,18,1,,site: Main\nTue,14,18,1,,site: Harbour").slots;
  for (const opt of [{ travelPay: true }, { travelAllowance: 3 }]) {
    const r = buildRoster(st, sl, { minRestHours: 0, travel: 30, ...opt });
    assert.equal(r.unfilledSlots, 0);
    assert.equal(r.travelPaid.trips, 0, JSON.stringify(opt));
    assert.equal(r.cost, 480); // 24 h at $20, no trip
  }
});

test("the by-site split still adds back to payroll, and the cover finder prices the trip", () => {
  const st = parseStaff(ANA + "\nBen,18,40,0,any,sites: Harbour").staff;
  const sl = parseShifts(HOP).slots;
  const opt = { minRestHours: 0, travel: 30, travelPay: true };
  const r = buildRoster(st, sl, opt);
  const sp = siteSplit(r);
  assert.ok(Math.abs(sp.sites.reduce((t, x) => t + x.cost, 0) - r.cost) < 1e-6);
  // Ben calls out of Harbour; Ana covering it makes a 30-minute paid trip: 4 h + 0.5 h at $20 = $90 instead of Ben's $72,
  // so the cover adds $18 (unpriced it would add $8).
  const i = r.assignments.findIndex((a) => a.slot.site === "Harbour");
  assert.equal(r.assignments[i].person, "Ben");
  const c = coverOptions(st, sl, r, i, opt);
  const ana = (c.options || c.fits || []).find((x) => x.name === "Ana");
  assert.ok(ana, JSON.stringify(c).slice(0, 300));
  assert.equal(ana.extraCost, 18);
  assert.equal(coverOptions(st, sl, buildRoster(st, sl, { ...opt, travelPay: false }), i, { ...opt, travelPay: false }).fits.find((x) => x.name === "Ana").extraCost, 8);
});

test("warnings: paid travel with no trip time, or no sites", () => {
  const st = parseStaff(ANA).staff;
  const r = buildRoster(st, parseShifts(HOP).slots, { minRestHours: 0, travelPay: true });
  assert.ok(r.warnings.some((w) => /no travel time is set/.test(w)), r.warnings.join("|"));
  const r2 = buildRoster(st, parseShifts("Mon,9,13,1").slots, { travelPay: true });
  assert.ok(r2.warnings.some((w) => /no trips between sites to pay/.test(w)));
  // Trips inside the rest rule are still paid, so the "changes nothing" warning is not given.
  const r3 = buildRoster(st, parseShifts(HOP).slots, { travel: 30, travelPay: true });
  assert.ok(!r3.warnings.some((w) => /changes nothing/.test(w)));
});

test("CLI: --pay-travel and --travel-allowance reach the build, the report and --json", () => {
  const dir = mkdtempSync(join(tmpdir(), "travel-pay-"));
  writeFileSync(join(dir, "staff.txt"), ANA);
  writeFileSync(join(dir, "shifts.txt"), HOP);
  const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const args = ["--rest", "0", "--travel", "30", "--pay-travel", "--travel-allowance", "4", join(dir, "staff.txt"), join(dir, "shifts.txt")];
  const j = spawnSync(process.execPath, [cli, "--json", ...args], { encoding: "utf8" });
  assert.equal(j.status, 0, j.stderr);
  const out = JSON.parse(j.stdout);
  assert.equal(out.payroll, 174);
  assert.deepEqual(out.travelPaid, { trips: 1, hours: 0.5, cost: 14 });
  const t = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /Trips between sites: 1 \(Ana 1\), 0\.5 h paid travel, adding \$14 to payroll, overtime included\./);
});
