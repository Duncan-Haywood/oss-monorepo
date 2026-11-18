// Staff shared between sites (2026-11-14): "site:" on shifts, "sites:" on people, one build across several shops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStaff, parseShifts, buildRoster, siteSplit, siteSplitText, siteKey, rosterCsv, parseRosterCsv, pinStarted, keepFromCsv, keepFrom, slotKey, DAYS } from "./calc.mjs";

const STAFF = `name,wage,max,min,availability
Ana,20,40,0,any,sites: Main St | Harbour
Ben,18,40,0,any,sites: main st.
Cal,19,40,0,any,site: Harbour
Dee,17,40,0,any`;
const SHIFTS = `day,start,end,people,label
Mon-Fri,9,17,1,Open,site: Main St
Mon-Fri,9,17,1,Open,site: Harbour
Sat,9,17,2,,site: Harbour,role: keyholder x1`;

test("site: on a shift and sites: on a person are read; names ignore case and punctuation", () => {
  const st = parseStaff(STAFF), sh = parseShifts(SHIFTS);
  assert.deepEqual(st.errors, []); assert.deepEqual(sh.errors, []);
  assert.deepEqual(st.staff.map((p) => p.sites), [["main st", "harbour"], ["main st"], ["harbour"], null]);
  assert.equal(siteKey("Main St."), "main st");
  const sat = sh.slots.filter((s) => s.day === 5);
  assert.deepEqual(sat.map((s) => [s.site, s.role, s.label]), [["Harbour", "keyholder", ""], ["Harbour", "", ""]]);
  assert.equal(sh.slots.find((s) => s.day === 0 && s.site === "Main St").label, "Open");
  // A shift line with no site is unchanged.
  assert.equal("site" in parseShifts("Mon,9,17,1,Open,cook").slots[0], false);
  assert.match(parseShifts("Mon,9,17,1,Open,site:").errors[0], /"site:" needs a name/);
  assert.match(parseStaff("name,wage\nAna,20,40,0,any,sites: |").errors[0], /names no site/);
});

test("nobody is placed at a site their row does not list, and the hour cap holds across sites", () => {
  const st = parseStaff(STAFF.replace("Ana,20,40", "Ana,20,24")), sh = parseShifts(SHIFTS.replace("role: keyholder x1", ""));
  const r = buildRoster(st.staff, sh.slots, {});
  const by = new Map(st.staff.map((p) => [p.name, p]));
  for (const a of r.assignments) if (a.person) {
    const s = by.get(a.person).sites;
    assert.ok(!s || s.includes(siteKey(a.slot.site)), `${a.person} at ${a.slot.site}`);
  }
  const ana = r.people.find((p) => p.name === "Ana");
  assert.ok(ana.hours <= 24 + 1e-9);
  assert.equal(r.unfilledSlots, 0);
});

test("an open shift at a site nobody works at says so", () => {
  const st = parseStaff("name,wage,max,min,availability\nAna,20,40,0,any,sites: Main");
  const sh = parseShifts("Mon,9,17,1,,site: Harbour");
  const r = buildRoster(st.staff, sh.slots, {});
  assert.equal(r.unfilledSlots, 1);
  assert.equal(r.unfilled[0].text, 'nobody listed works at "Harbour"');
});

test("siteSplit: hours, open hours and payroll per site; payroll shares add up to the roster's", () => {
  const st = parseStaff(STAFF), sh = parseShifts(SHIFTS + "\nSun,9,17,1,,site: Airport");
  const r = buildRoster(st.staff, sh.slots, {});
  const sp = siteSplit(r);
  assert.deepEqual(sp.sites.map((s) => s.site), ["Airport", "Harbour", "Main St"]);
  const air = sp.sites[0];
  // Only Dee (no sites: cell) may work anywhere, so Airport is covered by Dee.
  assert.equal(air.covered, 8);
  assert.ok(Math.abs(sp.sites.reduce((t, s) => t + s.cost, 0) - r.cost) < 1e-6);
  assert.equal(sp.sites.reduce((t, s) => t + s.hours, 0), r.totalHours);
  for (const p of sp.shared) assert.ok(Object.keys(p.hours).length >= 2);
  assert.match(siteSplitText(sp), /^By site \(one staff list across 3 sites/);
  assert.equal(siteSplit(buildRoster(st.staff, parseShifts("Mon,9,17,1").slots, {})), null);
});

test("roster CSV carries a site column only when sites are used, and reads back", () => {
  const st = parseStaff(STAFF), sh = parseShifts(SHIFTS);
  const r = buildRoster(st.staff, sh.slots, {});
  const csv = rosterCsv(r);
  assert.equal(csv.split("\n")[0], "day,start,end,hours,label,assigned_to,role,site");
  const back = parseRosterCsv(csv);
  assert.ok(back.every((x) => x.site === "Main St" || x.site === "Harbour"));
  const plain = rosterCsv(buildRoster(st.staff, parseShifts("Mon,9,17,1").slots, {}));
  assert.equal(plain.split("\n")[0], "day,start,end,hours,label,assigned_to,role");
});

test("reissue: a started shift is held by whoever had it at the same site, not the same hours elsewhere", () => {
  const sh = parseShifts(SHIFTS);
  const posted = "day,start,end,hours,label,assigned_to,role,site\nMon,9am,5pm,8.00,Open,Cal,,Harbour\nMon,9am,5pm,8.00,Open,Ben,,Main St\n";
  const pin = pinStarted(sh.slots, posted, 12 * 60);
  const mon = pin.slots.filter((s) => s.day === 0);
  assert.deepEqual(mon.map((s) => [s.site, s.fixed]).sort(), [["Harbour", "Cal"], ["Main St", "Ben"]]);
  // An older file with no site column still pins by day and hours.
  const old = pinStarted(sh.slots, "day,start,end,hours,label,assigned_to,role\nMon,9am,5pm,8.00,Open,Cal,\n", 12 * 60);
  assert.equal(old.pinned, 1);
});

test("keep: last week's shifts match their own site; a file with no site matches any site", () => {
  const sh = parseShifts(SHIFTS);
  const harbourMon = sh.slots.find((s) => s.day === 0 && s.site === "Harbour");
  const mainMon = sh.slots.find((s) => s.day === 0 && s.site === "Main St");
  assert.notEqual(slotKey(harbourMon), slotKey(mainMon));
  const k = keepFromCsv("day,start,end,hours,label,assigned_to,role,site\nMon,9am,5pm,8.00,Open,Cal,,Harbour\n");
  assert.deepEqual(k.cal, [slotKey({ ...harbourMon, role: "*" })]);
  const st = parseStaff(STAFF);
  const base = buildRoster(st.staff, sh.slots, {});
  const r = buildRoster(st.staff, sh.slots, { keep: keepFrom(base), keepValue: 0.5 });
  assert.equal(r.unfilledSlots, base.unfilledSlots); // the Saturday keyholder copy is open in both: nobody has the role
  assert.deepEqual(r.assignments.map((a) => a.person), base.assignments.map((a) => a.person));
});

test("CLI: --each-location tags every shift line with its site, and the output builds as one roster", () => {
  const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "sites-"));
  // Square item-sales header (real column names); rows made up: Main St busy 7-15 daily, Harbour 11-19 Fri-Sun.
  const HEAD = "Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,Itemization Type";
  const sq = (date, time, net, loc) => `${date},${time},Eastern Time (US & Canada),Coffee,Latte,1,Regular,,,${net},$0.00,${net},$0.50,T${time},P${time},iPad,,,Payment,${loc},,,,,,,Physical Item`;
  const rows = [HEAD];
  for (let d = 2; d <= 15; d++) {
    const date = `2026-11-${String(d).padStart(2, "0")}`;
    const wd = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    for (let h = 7; h < 15; h++) rows.push(sq(date, `${String(h).padStart(2, "0")}:10:00`, "$130.00", "Main St"));
    if (wd >= 4) for (let h = 11; h < 19; h++) rows.push(sq(date, `${String(h).padStart(2, "0")}:20:00`, "$50.00", "Harbour"));
  }
  const sales = join(dir, "sales.csv");
  writeFileSync(sales, rows.join("\n"));
  const each = spawnSync(process.execPath, [CLI, "--from-sales", sales, "--splh", "60", "--each-location", "--half-life", "none"], { encoding: "utf8" });
  assert.equal(each.status, 0, each.stderr);
  const lines = each.stdout.split("\n").filter((l) => l && !l.startsWith("#"));
  assert.ok(lines.length > 0 && lines.every((l) => /, , site: (Main St|Harbour)$/.test(l)), each.stdout);
  assert.match(each.stdout, /^Fri\/Sat\/Sun, 11:00, 19:00, 1, , site: Harbour$/m);
  const shifts = join(dir, "shifts.csv"), staff = join(dir, "staff.csv");
  writeFileSync(shifts, each.stdout);
  writeFileSync(staff, "name,wage,max,min,availability\nAna,20,40,0,any,sites: Main St | Harbour\nBen,18,40,0,any,sites: Main St\nCal,19,40,0,any,sites: Main St\nDee,17,40,0,any,sites: Main St\nEve,17,40,0,any,sites: Harbour\n");
  const built = spawnSync(process.execPath, [CLI, staff, shifts, "--json"], { encoding: "utf8" });
  assert.ok(built.status === 0, built.stderr);
  const j = JSON.parse(built.stdout);
  assert.deepEqual(j.sites.sites.map((s) => s.site), ["Harbour", "Main St"]);
  assert.ok(j.assignments.every((a) => a.site));
  for (const a of j.assignments) if (a.person === "Eve") assert.equal(a.site, "Harbour");
  for (const a of j.assignments) if (["Ben", "Cal", "Dee"].includes(a.person)) assert.equal(a.site, "Main St");
  const txt = spawnSync(process.execPath, [CLI, staff, shifts], { encoding: "utf8" });
  assert.match(txt.stdout, /By site \(one staff list across 2 sites/);
  assert.ok(DAYS.length === 7);
});
