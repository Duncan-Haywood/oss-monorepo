// Wages by site (2026-11-14): `siteWage` ("Airport +2; Harbour +10%; Downtown min 21.30") pays a person a different rate at
// a named site, prices it in the search and the exact check, and pays overtime on the week's weighted-average rate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStaff, parseShifts, buildRoster, parseSiteWage, siteRate, siteSplit, dailyLabor, coverOptions } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("parsing: dollars, percent, a floor, combinations, a cheaper site and the errors", () => {
  const sw = parseSiteWage("Airport +2; Harbour St. +10%; Downtown min $21.30; Mall +1 min 20; Outlet -1.50");
  assert.deepEqual(sw.errors, []);
  assert.deepEqual(sw.rules.map((r) => [r.site, r.add, r.pct, r.min]), [
    ["airport", 2, 0, 0], ["harbour st", 0, 10, 0], ["downtown", 0, 0, 21.3], ["mall", 1, 0, 20], ["outlet", -1.5, 0, 0],
  ]);
  assert.equal(siteRate(18, sw.rules[1]), 18 * 1.1);
  assert.equal(siteRate(18, sw.rules[2]), 21.3);
  assert.equal(siteRate(25, sw.rules[2]), 25); // a floor never lowers a wage
  assert.equal(siteRate(19.5, sw.rules[3]), 20.5);
  assert.equal(siteRate(18, null), 18);
  assert.equal(parseSiteWage("Airport").errors.length, 1);
  assert.equal(parseSiteWage("Airport +2; airport +3").errors.length, 1);
  assert.equal(parseSiteWage("").rules.length, 0);
});

test("overtime is paid on the week's weighted-average rate (29 CFR 778.115)", () => {
  // Ana: 30 h at Main ($18) and 20 h at Airport ($20) = $940 straight time over 50 h, regular rate $18.80,
  // 10 overtime hours owe half of it more each: $94. Total $1,034.
  const st = parseStaff("name,wage,max,min,availability\nAna,18,60,0,any").staff;
  const sl = parseShifts("Mon-Fri,9,15,1,,site: Main\nMon-Fri,16,20,1,,site: Airport").slots;
  const plain = buildRoster(st, sl, { minRestHours: 0 });
  assert.equal(plain.cost, 50 * 18 + 10 * 9);
  assert.equal(plain.siteWage, undefined);
  const r = buildRoster(st, sl, { minRestHours: 0, siteWage: "Airport +2" });
  assert.equal(r.unfilledSlots, 0);
  near(r.cost, 1034);
  near(r.siteWage.extra, 1034 - 990);
  assert.equal(r.siteWage.sites[0].hours, 20);
  near(r.siteWage.sites[0].extra, 40);
  // With a 10% burden everything scales, travel and allowances aside.
  near(buildRoster(st, sl, { minRestHours: 0, siteWage: "Airport +2", burdenPct: 10 }).cost, 1034 * 1.1);
});

test("the search sends the cheaper person to the site with the higher floor", () => {
  // Ana $15, Ben $22; Downtown pays at least $20. Ana at Main + Ben Downtown costs 15 + 22 = $37 an hour; the swap costs
  // 20 + 22 = $42. Unpriced, both tie at $37 and either can come out.
  const st = parseStaff("name,wage,max,min,availability\nAna,15,40,0,any\nBen,22,40,0,any").staff;
  const sl = parseShifts("Mon-Fri,9,17,1,,site: Main\nMon-Fri,9,17,1,,site: Downtown").slots;
  for (const exact of [false, "auto", true]) {
    const r = buildRoster(st, sl, { siteWage: "Downtown min 20", exact });
    assert.equal(r.unfilledSlots, 0);
    for (const a of r.assignments) assert.equal(a.person, a.slot.site === "Main" ? "Ana" : "Ben", String(exact));
    near(r.cost, 40 * 37);
    near(r.siteWage.extra, 0);
  }
});

test("the by-site split shares pay by what each site's hours earn, and the day view uses the site rate", () => {
  const st = parseStaff("name,wage,max,min,availability\nAna,18,60,0,any").staff;
  const sl = parseShifts("Mon-Fri,9,15,1,,site: Main\nMon-Fri,16,20,1,,site: Airport").slots;
  const r = buildRoster(st, sl, { minRestHours: 0, siteWage: "Airport +2" });
  const sp = siteSplit(r);
  assert.equal(sp.byEarnings, true);
  near(sp.sites.reduce((t, x) => t + x.cost, 0), r.cost);
  const air = sp.sites.find((x) => x.site === "Airport"), main = sp.sites.find((x) => x.site === "Main");
  near(air.cost / main.cost, 400 / 540); // 20 h x $20 against 30 h x $18
  const dl = dailyLabor(r, st);
  near(dl.days[0].cost, 6 * 18 + 4 * 20);
});

test("the cover finder prices a call-out cover at the site's rate", () => {
  // Ben ($20) is pinned to Tuesday at the Airport, which pays 20% more: $24 for him, $21.60 for Ana ($18). If he calls out,
  // Ana covering it changes payroll by 8 x (21.60 - 24) = -$19.20; at their own wages it would be 8 x (18 - 20) = -$16.
  const st = parseStaff("name,wage,max,min,availability\nAna,18,40,0,any\nBen,20,40,0,any,sites: Airport").staff;
  const sl = parseShifts("Mon,9,17,1,,site: Main,fixed: Ana\nTue,9,17,1,,site: Airport,fixed: Ben").slots;
  const opt = { siteWage: "Airport +20%" };
  const r = buildRoster(st, sl, opt);
  const i = r.assignments.findIndex((a) => a.slot.site === "Airport");
  assert.equal(r.assignments[i].person, "Ben");
  near(r.cost, 8 * 18 + 8 * 24);
  const free = sl.map(({ fixed, ...s }) => s); // the pins placed the week; the cover may go to anyone
  near(coverOptions(st, free, r, i, opt).fits.find((x) => x.name === "Ana").extraCost, -19.2);
  const r0 = buildRoster(st, sl, {});
  near(coverOptions(st, free, r0, i, {}).fits.find((x) => x.name === "Ana").extraCost, -16);
});

test("off, unused or empty rules leave every result byte-identical, with a warning where it helps", () => {
  const st = parseStaff("name,wage,max,min,availability\nAna,22,40,0,any\nBen,18,40,0,any").staff;
  const sl = parseShifts("Mon-Fri,9,17,1,,site: Main\nMon-Fri,9,17,1,,site: Harbour").slots;
  const base = buildRoster(st, sl, {});
  const strip = (r) => JSON.stringify({ ...r, options: null, warnings: null, timings: null, optimality: null });
  const r1 = buildRoster(st, sl, { siteWage: "Airport +2" });
  assert.equal(strip(r1), strip(base));
  assert.ok(r1.warnings.some((w) => /no shift is at a site called "Airport"/.test(w)), r1.warnings.join("|"));
  const r2 = buildRoster(st, sl, { siteWage: "Harbour min 15" });
  assert.equal(strip(r2), strip(base));
  assert.ok(r2.warnings.some((w) => /changes nothing/.test(w)), r2.warnings.join("|"));
  const r3 = buildRoster(st, sl, { siteWage: "Harbour nonsense" });
  assert.ok(r3.warnings.some((w) => /could not read/.test(w)));
});

test("the exact check stays a valid bound: proven rosters are never beaten by a brute force over payroll", () => {
  // Tiny weeks, every assignment enumerated: no roster with as few open hours may cost less than a proven one by more
  // than the tolerance plus the soft terms' spread (balance 0 and no minimums leave payroll as the whole score).
  const rnd = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(7);
  for (let t = 0; t < 6; t++) {
    const staff = ["name,wage,max,min,availability"];
    for (let k = 0; k < 3; k++) staff.push(`P${k},${15 + Math.round(rnd() * 8)},${[16, 24, 40][Math.floor(rnd() * 3)]},0,any`);
    const shifts = [];
    for (let k = 0; k < 4; k++) shifts.push(`${["Mon", "Tue", "Wed"][Math.floor(rnd() * 3)]},${8 + Math.floor(rnd() * 6)},${16 + Math.floor(rnd() * 6)},1,,site: ${rnd() < 0.5 ? "A" : "B"}`);
    const st = parseStaff(staff.join("\n")).staff, sl = parseShifts(shifts.join("\n")).slots;
    const opt = { siteWage: "B +4 min 21", balance: 0, otAfter: 20, exact: true, exactTolerance: 0 };
    const r = buildRoster(st, sl, opt);
    // brute force
    let best = { open: Infinity, cost: Infinity };
    const P = st.length, S = sl.length;
    for (let code = 0; code < (P + 1) ** S; code++) {
      const pin = [];
      let c = code;
      for (let i = 0; i < S; i++) { pin.push(c % (P + 1)); c = Math.floor(c / (P + 1)); }
      const fixed = sl.map((s, i) => ({ ...s, fixed: pin[i] === P ? "(nobody)" : st[pin[i]].name }));
      const q = buildRoster(st, fixed, { ...opt, exact: false });
      if (q.assignments.some((a, i) => (a.person || "(nobody)") !== fixed[i].fixed)) continue; // breaks a hard rule
      if (q.unfilledHours < best.open - 1e-9 || (Math.abs(q.unfilledHours - best.open) < 1e-9 && q.cost < best.cost)) best = { open: q.unfilledHours, cost: q.cost };
    }
    assert.ok(r.unfilledHours <= best.open + 1e-9, `week ${t}: ${r.unfilledHours} open vs ${best.open}`);
    if (Math.abs(r.unfilledHours - best.open) < 1e-9) assert.ok(r.cost <= best.cost + 0.01, `week ${t}: $${r.cost} vs brute force $${best.cost}`);
  }
});

test("CLI: --site-wage reaches the build, the report and --json; a bad rule is an error", () => {
  const dir = mkdtempSync(join(tmpdir(), "site-wage-"));
  writeFileSync(join(dir, "staff.txt"), "name,wage,max,min,availability\nAna,18,60,0,any");
  writeFileSync(join(dir, "shifts.txt"), "Mon-Fri,9,15,1,,site: Main\nMon-Fri,16,20,1,,site: Airport");
  const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const args = ["--rest", "0", "--site-wage", "Airport +2", join(dir, "staff.txt"), join(dir, "shifts.txt")];
  const j = spawnSync(process.execPath, [cli, "--json", ...args], { encoding: "utf8" });
  assert.equal(j.status, 0, j.stderr);
  const out = JSON.parse(j.stdout);
  near(out.payroll, 1034);
  near(out.siteWage.extra, 44);
  const t = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /Wages by site: Airport \(\+\$2\/h\) 20 h, \+\$40\. Payroll above everyone's own wage: \$44, overtime on the week's average rate included\./);
  const bad = spawnSync(process.execPath, [cli, "--site-wage", "Airport", join(dir, "staff.txt"), join(dir, "shifts.txt")], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr + bad.stdout, /could not read/);
});
