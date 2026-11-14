// A person's own rate at one site (2026-11-14): a staff cell "wage at Airport: 24" (or "+2", "+10%", "-1") pays that person
// that rate there. It replaces the site rule's dollar and percentage parts for them, never the site's floor, and is priced in
// the search, the exact check, covers and the report like a site rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStaff, parseShifts, buildRoster, parsePersonSiteWage, personSiteRate, parseSiteWage, coverOptions, siteSplit } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const HEAD = "name,wage,max,min,availability\n";

test("parsing the cell: absolute, dollars, percent, a cut, and the errors", () => {
  assert.deepEqual(parsePersonSiteWage("wage at Airport: 24"), { site: "airport", label: "Airport", abs: 24, add: 0, pct: 0 });
  assert.deepEqual(parsePersonSiteWage("Rate @ Harbour St.: $22.50/h"), { site: "harbour st", label: "Harbour St.", abs: 22.5, add: 0, pct: 0 });
  assert.equal(parsePersonSiteWage("pay at Mall: +2").add, 2);
  assert.equal(parsePersonSiteWage("wage at Mall: +10%").pct, 10);
  assert.equal(parsePersonSiteWage("wage at Outlet: -1.5").add, -1.5);
  assert.ok(parsePersonSiteWage("wage at Mall: lots").error);
  assert.ok(parsePersonSiteWage("wage at Mall: -100%").error);
  const st = parseStaff(HEAD + "Ana,18,40,0,Mon-Fri 9-17,wage at Airport: 24,wage at Mall: +2");
  assert.deepEqual(st.errors, []);
  assert.deepEqual([...st.staff[0].siteWages.keys()], ["airport", "mall"]);
  // The cell is not read as availability: Ana is still available Mon-Fri 9-17 only.
  assert.deepEqual(st.staff[0].days[5], []);
  assert.deepEqual(st.staff[0].days[0], [[540, 1020]]);
  assert.equal(parseStaff(HEAD + "Ana,18,40,0,any,wage at Airport: x").errors.length, 1);
  assert.equal(parseStaff(HEAD + "Ana,18,40,0,any,wage at Airport: 20,wage at airport: 21").errors.length, 1);
  assert.equal(parseStaff(HEAD + "Ana,18,40,0,any").staff[0].siteWages, undefined);
});

test("the person's rate replaces the site's premium but never its floor", () => {
  const [floor] = parseSiteWage("City +5 min 21.30").rules;
  const ana = parseStaff(HEAD + "Ana,18,40,0,any,wage at City: 19").staff[0];
  const ben = parseStaff(HEAD + "Ben,18,40,0,any,wage at City: +2").staff[0];
  const cy = parseStaff(HEAD + "Cy,18,40,0,any,wage at City: 26").staff[0];
  const dee = parseStaff(HEAD + "Dee,18,40,0,any").staff[0];
  assert.equal(personSiteRate(ana, "city", floor), 21.3); // own $19 is under the floor
  assert.equal(personSiteRate(ben, "city", floor), 21.3); // own +2 = $20, replaces +5, still under the floor
  assert.equal(personSiteRate(cy, "city", floor), 26);
  assert.equal(personSiteRate(dee, "city", floor), 23); // no own rate: the rule, 18 + 5
  assert.equal(personSiteRate(cy, "main", null), 18); // another site: own wage
  assert.equal(personSiteRate(cy, "city", null), 26); // no rule at all
});

test("with no site rule at all, own rates price the search and the report", () => {
  // Ana and Ben both $18; Ana is paid $24 at the Airport. Ana at Main + Ben at the Airport costs $36/h; the swap $42/h.
  const st = parseStaff(HEAD + "Ana,18,40,0,any,wage at Airport: 24\nBen,18,40,0,any").staff;
  const sl = parseShifts("Mon-Fri,9,17,1,,site: Main\nMon-Fri,9,17,1,,site: Airport").slots;
  for (const exact of [false, "auto", true]) {
    const r = buildRoster(st, sl, { exact });
    assert.equal(r.unfilledSlots, 0);
    for (const a of r.assignments) assert.equal(a.person, a.slot.site === "Main" ? "Ana" : "Ben", String(exact));
    near(r.cost, 40 * 36);
    near(r.siteWage.extra, 0);
  }
  // Ana only allowed at the Airport: her rate is paid and reported.
  const only = parseStaff(HEAD + "Ana,18,40,0,any,wage at Airport: 24,sites: Airport\nBen,18,40,0,any,sites: Main").staff;
  const r = buildRoster(only, sl, {});
  near(r.cost, 40 * 18 + 40 * 24);
  near(r.siteWage.extra, 240);
  assert.deepEqual(r.siteWage.sites, [{ site: "Airport", add: 0, pct: 0, min: 0, hours: 40, extra: 240, ownRates: ["Ana"] }]);
  assert.equal(r.assignments.find((a) => a.slot.site === "Airport").rate, 24);
  const sp = siteSplit(r);
  near(sp.sites.find((x) => x.site === "Airport").cost, 960);
});

test("a person's own premium is weighed against the site rule's premium for everyone else", () => {
  // Airport +3 for everyone; Ana (base $20) has agreed $21 there, Ben (base $18) gets the rule's $21 too, so it ties on the
  // Airport rate; but Ana at Main costs $20 and Ben $18: Ben belongs at Main and Ana at the Airport. Without her cell, Ana at
  // the Airport would cost $23 and the cheap split is Ana Main + Ben Airport ($20 + $21 = $41 vs $18 + $23 = $41: a tie).
  // With her cell: Ana Airport + Ben Main = 21 + 18 = $39, Ana Main + Ben Airport = 20 + 21 = $41.
  const st = parseStaff(HEAD + "Ana,20,40,0,any,wage at Airport: 21\nBen,18,40,0,any").staff;
  const sl = parseShifts("Mon-Fri,9,17,1,,site: Main\nMon-Fri,9,17,1,,site: Airport").slots;
  const r = buildRoster(st, sl, { siteWage: "Airport +3" });
  for (const a of r.assignments) assert.equal(a.person, a.slot.site === "Airport" ? "Ana" : "Ben");
  near(r.cost, 40 * 39);
});

test("the cover finder prices a cover at the person's own rate", () => {
  // Ben is pinned to Tuesday at the Airport. Ana ($18) is paid $25 there by her own cell, Cy ($18) the rule's $20.
  const st = parseStaff(HEAD + "Ana,18,40,0,any,wage at Airport: 25\nBen,20,40,0,any,sites: Airport\nCy,18,40,0,any").staff;
  const sl = parseShifts("Tue,9,17,1,,site: Airport,fixed: Ben").slots;
  const opt = { siteWage: "Airport min 20" };
  const r = buildRoster(st, sl, opt);
  const free = sl.map(({ fixed, ...s }) => s);
  const fits = coverOptions(st, free, r, 0, opt).fits;
  near(fits.find((x) => x.name === "Ana").extraCost, 8 * (25 - 20));
  near(fits.find((x) => x.name === "Cy").extraCost, 0);
});

test("unused cells warn, and staff without cells leave every result byte-identical", () => {
  const sl = parseShifts("Mon-Fri,9,17,1,,site: Main\nMon-Fri,9,17,1,,site: Harbour").slots;
  const base = buildRoster(parseStaff(HEAD + "Ana,22,40,0,any\nBen,18,40,0,any").staff, sl, {});
  const strip = (r) => JSON.stringify({ ...r, options: null, warnings: null, timings: null, optimality: null });
  const r1 = buildRoster(parseStaff(HEAD + "Ana,22,40,0,any,wage at Airport: 30\nBen,18,40,0,any").staff, sl, {});
  assert.equal(strip(r1), strip(base));
  assert.ok(r1.warnings.some((w) => /Ana: no shift is at a site called "Airport"/.test(w)), r1.warnings.join("|"));
  const n = parseStaff(HEAD + "Ana,22,40,0,any,sites: Main,wage at Harbour: 30");
  assert.ok(n.notes.some((x) => /does not list Harbour/.test(x)), n.notes.join("|"));
  const r2 = buildRoster(parseStaff(HEAD + "Ana,22,40,0,any,wage at Harbour: 22\nBen,18,40,0,any").staff, sl, {});
  assert.equal(strip(r2), strip(base)); // a cell equal to the person's own wage changes nothing
});

test("the exact check stays a valid bound with own rates: proven rosters are never beaten by a brute force", () => {
  const rnd = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(11);
  for (let t = 0; t < 6; t++) {
    const staff = ["name,wage,max,min,availability"];
    for (let k = 0; k < 3; k++) staff.push(`P${k},${15 + Math.round(rnd() * 8)},${[16, 24, 40][Math.floor(rnd() * 3)]},0,any${rnd() < 0.6 ? `,wage at ${rnd() < 0.5 ? "A" : "B"}: ${rnd() < 0.5 ? "+" : "-"}${1 + Math.floor(rnd() * 4)}` : ""}`);
    const shifts = [];
    for (let k = 0; k < 4; k++) shifts.push(`${["Mon", "Tue", "Wed"][Math.floor(rnd() * 3)]},${8 + Math.floor(rnd() * 6)},${16 + Math.floor(rnd() * 6)},1,,site: ${rnd() < 0.5 ? "A" : "B"}`);
    const st = parseStaff(staff.join("\n")).staff, sl = parseShifts(shifts.join("\n")).slots;
    const opt = { siteWage: "B +2 min 19", balance: 0, otAfter: 20, exact: true, exactTolerance: 0 };
    const r = buildRoster(st, sl, opt);
    let best = { open: Infinity, cost: Infinity };
    const P = st.length, S = sl.length;
    for (let code = 0; code < (P + 1) ** S; code++) {
      const pin = [];
      let c = code;
      for (let i = 0; i < S; i++) { pin.push(c % (P + 1)); c = Math.floor(c / (P + 1)); }
      const fixed = sl.map((s, i) => ({ ...s, fixed: pin[i] === P ? "(nobody)" : st[pin[i]].name }));
      const q = buildRoster(st, fixed, { ...opt, exact: false });
      if (q.assignments.some((a, i) => (a.person || "(nobody)") !== fixed[i].fixed)) continue;
      if (q.unfilledHours < best.open - 1e-9 || (Math.abs(q.unfilledHours - best.open) < 1e-9 && q.cost < best.cost)) best = { open: q.unfilledHours, cost: q.cost };
    }
    assert.ok(r.unfilledHours <= best.open + 1e-9, `week ${t}: ${r.unfilledHours} open vs ${best.open}`);
    if (Math.abs(r.unfilledHours - best.open) < 1e-9) assert.ok(r.cost <= best.cost + 0.01, `week ${t}: $${r.cost} vs brute force $${best.cost}`);
  }
});

test("CLI: an own-rate cell reaches the report and --json with no --site-wage", () => {
  const dir = mkdtempSync(join(tmpdir(), "own-site-wage-"));
  writeFileSync(join(dir, "staff.txt"), HEAD + "Ana,18,60,0,any,wage at Airport: +2");
  writeFileSync(join(dir, "shifts.txt"), "Mon-Fri,9,15,1,,site: Main\nMon-Fri,16,20,1,,site: Airport");
  const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const args = ["--rest", "0", join(dir, "staff.txt"), join(dir, "shifts.txt")];
  const j = spawnSync(process.execPath, [cli, "--json", ...args], { encoding: "utf8" });
  assert.equal(j.status, 0, j.stderr);
  const out = JSON.parse(j.stdout);
  near(out.payroll, 1034); // the same 50-hour week as site-wage.test.mjs, with the +2 on Ana's row instead of a rule
  near(out.siteWage.extra, 44);
  const t = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /Wages by site: Airport \(own rate: Ana\) 20 h, \+\$40\. Payroll above everyone's own wage: \$44/);
});
