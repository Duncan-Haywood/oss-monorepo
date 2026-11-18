// Travel between sites (2026-11-14): "--travel 30" or "30; Main to Airport 60". A person's shifts at two named sites need
// max(rest, travel) between them; shifts with no site, or at one site, are unaffected.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStaff, parseShifts, parseTravel, buildRoster, coverOptions, _validListPair } from "./calc.mjs";

const { validList, validWith, validListSlow, buildContext } = _validListPair;

test("parseTravel reads a default, pairs and durations, and names what it cannot read", () => {
  assert.deepEqual(parseTravel("30"), { all: 30, pairs: [], errors: [] });
  assert.deepEqual(parseTravel(45), { all: 45, pairs: [], errors: [] });
  const t = parseTravel("20 min; Main St. to Airport 1.5h, harbour <-> airport 40");
  assert.equal(t.all, 20);
  assert.deepEqual(t.pairs, [["main st", "airport", 90], ["harbour", "airport", 40]]);
  assert.match(parseTravel("Main to 45").errors[0], /could not read/);
  assert.match(parseTravel("Main to main 45").errors[0], /same site twice/);
  assert.deepEqual(parseTravel(""), { all: 0, pairs: [], errors: [] });
});

// Ana alone, split shifts allowed (rest 0): Main 9-13, then Harbour 13-17 and Harbour 13:30-17.
const STAFF = "name,wage,max,min,availability\nAna,20,40,0,any";
const SHIFTS = "Mon,9,13,1,,site: Main\nMon,13,17,1,,site: Harbour\nTue,9,13,1,,site: Main\nTue,13:30,17,1,,site: Harbour\nWed,9,13,1,,site: Main\nWed,13,17,1,,site: Main";

test("the three hard-rule checks agree, and only a cross-site gap shorter than the trip is refused", () => {
  const st = parseStaff(STAFF).staff, sl = parseShifts(SHIFTS).slots;
  const at = (d, h) => sl.findIndex((s) => s.day === d && s.startMin === h * 60);
  const pairs = [[at(0, 9), at(0, 13)], [at(1, 9), at(1, 13.5)], [at(2, 9), at(2, 13)]];
  const want = { 0: [true, true, true], 20: [false, true, true], 30: [false, true, true], 31: [false, false, true] };
  for (const [tv, exp] of Object.entries(want)) {
    const ctx = buildContext(st, sl, { minRestHours: 0, travel: Number(tv) });
    pairs.forEach(([a, b], k) => {
      assert.equal(validList(ctx, 0, [a, b]), exp[k], `travel ${tv}, pair ${k}`);
      assert.equal(validListSlow(ctx, 0, [a, b]), exp[k]);
      assert.equal(validWith(ctx, 0, [a], b), exp[k]);
    });
  }
  // A trip inside the rest rule adds nothing: no table is built.
  assert.equal(buildContext(st, sl, { minRestHours: 10, travel: 30 }).travel, null);
  assert.equal(buildContext(st, sl, { minRestHours: 0, travel: "Main to Harbour 45" }).travel.T[1], 45);
});

test("a build with travel never puts one person at two sites closer than the trip; open shifts say why", () => {
  const st = parseStaff(STAFF).staff, sl = parseShifts(SHIFTS).slots;
  const free = buildRoster(st, sl, { minRestHours: 0 });
  assert.equal(free.unfilledSlots, 0);
  const r = buildRoster(st, sl, { minRestHours: 0, travel: 30 });
  assert.equal(r.unfilledSlots, 1); // Monday's 13:00 Harbour shift; Tuesday's starts 30 min after Main ends
  assert.match(r.unfilled[0].text, /no time to travel from another site/);
  // Same-site back-to-back (Wednesday) is still fine.
  assert.ok(r.assignments.filter((a) => a.slot.day === 2).every((a) => a.person === "Ana"));
});

test("a second person covers the shift the trip rules out, and the cover finder names the travel rule", () => {
  const st = parseStaff(STAFF + "\nBen,18,40,0,any,sites: Harbour").staff;
  const sl = parseShifts("Mon,9,13,1,,site: Main\nMon,13,17,1,,site: Harbour").slots;
  const r = buildRoster(st, sl, { minRestHours: 0, travel: 30 });
  assert.equal(r.unfilledSlots, 0);
  const ana = r.assignments.filter((a) => a.person === "Ana").map((a) => a.slot.site);
  assert.ok(!(ana.includes("Main") && ana.includes("Harbour")));
  // Ben calls out of Harbour: Ana is free but blocked by the trip.
  const i = r.assignments.findIndex((a) => a.slot.site === "Harbour");
  const c = coverOptions(st, sl, r, i, { minRestHours: 0, travel: 30 });
  const blocked = [...(c.blocked || []), ...(c.options || [])].find((x) => x.name === "Ana" || x.person === "Ana");
  assert.ok(blocked, JSON.stringify(c).slice(0, 400));
  assert.match(JSON.stringify(blocked), /travel/);
});

test("a travel pair naming no site, or a trip within the rest rule, is a warning", () => {
  const st = parseStaff(STAFF).staff, sl = parseShifts(SHIFTS).slots;
  const r = buildRoster(st, sl, { minRestHours: 0, travel: "Main to Airprot 45" });
  assert.ok(r.warnings.some((w) => /no shift is at a site called "airprot"/.test(w)));
  const r2 = buildRoster(st, sl, { travel: 30 });
  assert.ok(r2.warnings.some((w) => /within the 10 hour rest rule/.test(w)));
});

test("CLI: --travel is read and a bad one stops with a message", () => {
  const dir = mkdtempSync(join(tmpdir(), "travel-"));
  writeFileSync(join(dir, "staff.txt"), STAFF);
  writeFileSync(join(dir, "shifts.txt"), SHIFTS);
  const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const ok = spawnSync(process.execPath, [cli, "--json", "--rest", "0", "--travel", "30", join(dir, "staff.txt"), join(dir, "shifts.txt")], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).unfilledShifts, 1);
  const bad = spawnSync(process.execPath, [cli, "--travel", "soon", join(dir, "staff.txt"), join(dir, "shifts.txt")], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /could not read "soon"/);
});
