import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANONS, dayNumber, oneYearAfter, money, massesFromLumpSum,
  status, check, autoBook, registerRows, registerCsv, yearSummary,
} from "./intentions.mjs";

const codes = (fs) => fs.map((f) => f.code);

const base = () => ({
  settings: { localOfferingCents: 1000, warnDays: 30 },
  intentions: [
    { id: "I1", received: "2026-01-10", donor: "A. Family", intention: "+ John Smith", offeringCents: 1000 },
    { id: "I2", received: "2026-02-01", donor: "B. Jones", intention: "Thanksgiving", offeringCents: 2000 },
  ],
  masses: [
    { id: "M1", date: "2026-11-07", time: "08:00", celebrant: "Fr. Paul", intentionIds: [] },
    { id: "M2", date: "2026-11-08", time: "10:00", celebrant: "Fr. Paul", intentionIds: [] },
  ],
  transfers: [],
});

test("dates: real calendar days only, one year keeps the day, leap day falls back", () => {
  assert.equal(dayNumber("2026-01-02") - dayNumber("2026-01-01"), 1);
  assert.throws(() => dayNumber("2026-02-30"), /real date/);
  assert.throws(() => dayNumber("26-1-1"), /YYYY-MM-DD/);
  assert.equal(oneYearAfter("2026-03-15"), "2027-03-15");
  assert.equal(oneYearAfter("2028-02-29"), "2029-02-28");
  assert.equal(money(123456), "$1,234.56");
});

test("c. 950: lump sum divided by the local offering", () => {
  assert.deepEqual(massesFromLumpSum(10500, 1000), { masses: 10, remainderCents: 500 });
  assert.throws(() => massesFromLumpSum(100, 0));
});

test("canon quotes are the vatican.va wording the checks cite", () => {
  assert.match(CANONS[953], /^No one is permitted to accept more offerings/);
  assert.match(CANONS["951.2"], /cannot accept an offering for it under any title/);
});

test("status: open, scheduled, celebrated, transferred, with days to a year", () => {
  const b = base();
  b.intentions.push({ id: "I3", received: "2026-03-01", offeringCents: 1000 }, { id: "I4", received: "2026-03-02", offeringCents: 1000 });
  b.masses[0].intentionIds = ["I1"];
  b.masses.push({ id: "M0", date: "2026-10-01", celebrated: true, intentionIds: ["I2"] });
  b.transfers.push({ intentionId: "I3", date: "2026-04-01", toPriest: "Fr. Mark", amountCents: 1000 });
  const s = Object.fromEntries(status(b, "2026-11-03").map((x) => [x.id, x]));
  assert.equal(s.I1.state, "scheduled");
  assert.equal(s.I1.daysLeft, dayNumber("2027-01-10") - dayNumber("2026-11-03"));
  assert.equal(s.I2.state, "celebrated");
  assert.equal(s.I2.daysLeft, null);
  assert.equal(s.I3.state, "transferred");
  assert.equal(s.I4.state, "open");
});

test("c. 948: two offered intentions on one Mass is flagged; an unpaid one is not", () => {
  const b = base();
  b.masses[0].intentionIds = ["I1", "I2"];
  assert.ok(codes(check(b, "2026-11-03")).includes("several-offerings-one-mass"));
  b.intentions[1].offeringCents = 0;
  assert.ok(!codes(check(b, "2026-11-03")).includes("several-offerings-one-mass"));
});

test("c. 951 §1: a priest with two offered Masses in a day passes one offering on, except Christmas", () => {
  const b = base();
  b.masses[1].date = "2026-11-07";
  b.masses[0].intentionIds = ["I1"];
  b.masses[1].intentionIds = ["I2"];
  const f = check(b, "2026-11-03").find((x) => x.code === "binated-offerings-to-ordinary");
  assert.ok(f);
  assert.match(f.message, /keeps the offering for one \(here Mass M1\).*\$20\.00/);
  b.masses[0].date = b.masses[1].date = "2026-12-25";
  assert.ok(!codes(check(b, "2026-11-03")).includes("binated-offerings-to-ordinary"));
});

test("c. 951 §2: an offering on a concelebrated later Mass is flagged", () => {
  const b = base();
  b.masses[1].date = "2026-11-07";
  b.masses[1].time = "12:00";
  b.masses[1].concelebrated = true;
  b.masses[1].intentionIds = ["I2"];
  assert.ok(codes(check(b, "2026-11-03")).includes("concelebrated-second-mass-offering"));
  b.masses[1].concelebrated = false;
  assert.ok(!codes(check(b, "2026-11-03")).includes("concelebrated-second-mass-offering"));
});

test("c. 955 §1: a transfer passes the whole offering unless the excess was personal", () => {
  const b = base();
  b.transfers.push({ intentionId: "I2", date: "2026-03-01", toPriest: "Fr. Mark", amountCents: 1000 });
  assert.ok(codes(check(b, "2026-11-03")).includes("transfer-short"));
  b.transfers[0].personalExcess = true;
  assert.ok(!codes(check(b, "2026-11-03")).includes("transfer-short"));
  b.transfers[0].amountCents = 500; // below the diocesan amount even with a personal gift
  assert.ok(codes(check(b, "2026-11-03")).includes("transfer-short"));
});

test("c. 954: transfer against the donor's express wish is flagged", () => {
  const b = base();
  b.intentions[0].forbidTransfer = true;
  b.transfers.push({ intentionId: "I1", date: "2026-03-01", amountCents: 1000 });
  assert.ok(codes(check(b, "2026-11-03")).includes("transfer-against-donor"));
});

test("c. 956 and c. 955 §2: past a year is high, within the warning window is medium", () => {
  const b = base();
  b.intentions[0].received = "2025-10-01";
  b.intentions[1].received = "2025-11-20";
  const fs = check(b, "2026-11-03");
  assert.equal(fs[0].code, "past-one-year");
  assert.equal(fs[0].canon, 956);
  assert.ok(codes(fs).includes("near-one-year"));
});

test("c. 953: more open intentions than a year of free Masses", () => {
  const b = base();
  b.settings.intentionMassesPerWeek = 0.02; // one a year
  assert.ok(codes(check(b, "2026-11-03")).includes("over-capacity"));
  b.settings.intentionMassesPerWeek = 5;
  assert.ok(!codes(check(b, "2026-11-03")).includes("over-capacity"));
});

test("findings are sorted worst first and each carries its canon's quote", () => {
  const b = base();
  b.masses[0].intentionIds = ["I1", "I2"];
  b.intentions[0].requestedDate = "2026-11-01";
  const fs = check(b, "2026-11-03");
  assert.equal(fs[0].severity, "high");
  assert.equal(fs.at(-1).severity, "low");
  for (const f of fs) assert.ok(f.quote, f.code);
});

test("autoBook: requested dates first, then oldest first, one per Mass, original untouched", () => {
  const b = base();
  b.intentions.push({ id: "I3", received: "2026-05-01", offeringCents: 1000, requestedDate: "2026-11-08" });
  b.masses.push({ id: "M3", date: "2026-11-09", intentionIds: [] }, { id: "Mx", date: "2026-11-02", intentionIds: [] });
  const { book, placed, unplaced } = autoBook(b, "2026-11-03");
  assert.deepEqual(placed.map((p) => [p.id, p.massId]), [["I3", "M2"], ["I1", "M1"], ["I2", "M3"]]);
  assert.deepEqual(unplaced, []);
  assert.deepEqual(b.masses[0].intentionIds, []);
  assert.equal(check(book, "2026-11-03").filter((f) => f.code === "several-offerings-one-mass").length, 0);
  // a requested date with no free Mass stays unplaced rather than drifting
  b.intentions[2].requestedDate = "2026-12-01";
  assert.equal(autoBook(b, "2026-11-03").unplaced[0].id, "I3");
});

test("register: CSV columns, quoting and formula-safe cells", () => {
  const b = base();
  b.intentions[0].intention = '=HYPERLINK("x")';
  b.intentions[1].intention = "Mary, and family";
  const csv = registerCsv(b, "2026-11-03");
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "id,received,donor,intention,masses,offering,state,celebrated,scheduled,transferred,dueBy");
  assert.match(lines[1], /,"'=HYPERLINK\(""x""\)",/);
  assert.match(lines[2], /,"Mary, and family",/);
  assert.equal(registerRows(b, "2026-11-03")[0].dueBy, "2027-01-10");
});

test("yearSummary: counts and offerings per bucket", () => {
  const b = base();
  b.masses.push({ id: "M0", date: "2026-10-01", celebrated: true, intentionIds: ["I1"] });
  const y = yearSummary(b, 2026, "2026-11-03");
  assert.deepEqual(y.received, { count: 2, cents: 3000 });
  assert.deepEqual(y.celebrated, { count: 1, cents: 1000 });
  assert.deepEqual(y.outstanding, { count: 1, cents: 2000 });
});

test("bad input is refused with a message that names the entry", () => {
  assert.throws(() => check({ intentions: [{ id: "a", received: "2026-01-01" }, { id: "a", received: "2026-01-01" }] }, "2026-11-03"), /duplicate intention id a/);
  assert.throws(() => check({ intentions: [], masses: [{ id: "m", date: "2026-01-01", intentionIds: ["zz"] }] }, "2026-11-03"), /unknown intention zz/);
  assert.throws(() => check({ intentions: [{ id: "a", received: "2026-01-01", offeringCents: -1 }] }, "2026-11-03"), /negative/);
});

test("autoBook leaves an intention past a year for the ordinary instead of booking it", () => {
  const b = base();
  b.intentions[0].received = "2025-10-01";
  const r = autoBook(b, "2026-11-03");
  assert.ok(!r.placed.some((p) => p.id === "I1"));
  assert.match(r.unplaced.find((u) => u.id === "I1").reason, /c\. 956/);
});

test("an intention booked before its year is up no longer warns", () => {
  const b = base();
  b.intentions[0].received = "2025-11-20";
  assert.ok(codes(check(b, "2026-11-03")).includes("near-one-year"));
  b.masses[0].intentionIds = ["I1"];
  assert.ok(!codes(check(b, "2026-11-03")).includes("near-one-year"));
});
