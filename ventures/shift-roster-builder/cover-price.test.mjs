// Call-out slack priced inside the build: coverRisk and --cover-price (2026-11-13, eval/cover-price.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverSlackText, optimalityText, calloutExposure, TEMPLATES } from "./calc.mjs";
import { parseArgs, run } from "./cli.mjs";
import { readFileSync } from "node:fs";

const O = { minRestHours: 10 };
const ctxOf = (staffText, shiftsText, o = O) => buildContext(parseStaff(staffText).staff, parseShifts(shiftsText).slots, o);

test("one person alone: every day they work is at risk, for its hours", () => {
  const staffText = "name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any";
  const shiftsText = "Mon-Sat, 9:00, 13:00, 1";
  const staff = parseStaff(staffText).staff, slots = parseShifts(shiftsText).slots;
  const r = buildRoster(staff, slots, O);
  const risk = coverRisk(ctxOf(staffText, shiftsText), r.owner);
  assert.equal(risk.personDays, 5); // Tue-Sat, the default fromDay is Tuesday as calloutExposure's is
  assert.equal(risk.riskyDays, 5);
  assert.equal(risk.hours, 20);
});

test("a free second person makes every day coverable: no risk", () => {
  const staffText = "name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any\nBo, 20, 60, 0, any";
  const shiftsText = "Mon-Sun, 9:00, 13:00, 1";
  const staff = parseStaff(staffText).staff, slots = parseShifts(shiftsText).slots;
  const r = buildRoster(staff, slots, O);
  const risk = coverRisk(ctxOf(staffText, shiftsText), r.owner);
  assert.equal(risk.hours, 0);
  assert.equal(risk.riskyDays, 0);
  assert.equal(calloutExposure(staff, slots, r, O).exposure, 0); // and the slow measurement agrees
});

test("risk counts every shift of a person-day, and a day nobody else can take", () => {
  // Both Tuesday shifts are pinned to Ana, so nobody else is eligible: her whole Tuesday is at risk, both shifts counted.
  const staffText = "name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any\nBo, 20, 60, 0, any";
  const shiftsText = "Tue, 9:00, 12:00, 1, , fixed: Ana\nTue, 14:00, 18:00, 1, , fixed: Ana";
  const o = { minRestHours: 0 }; // so one person may hold both of the day's shifts
  const risk = coverRisk(ctxOf(staffText, shiftsText, o), buildRoster(parseStaff(staffText).staff, parseShifts(shiftsText).slots, o).owner);
  assert.equal(risk.riskyDays, 1);
  assert.equal(risk.hours, 7); // 3 h + 4 h, both of Ana's Tuesday shifts
});

test("the price buys a hand-over on the retail template, and the roster it posts is the one the price paid for", () => {
  const t = TEMPLATES.retail;
  const staff = parseStaff(t.staff()).staff, slots = parseShifts(t.shifts()).slots;
  const plain = buildRoster(staff, slots, O);
  const priced = buildRoster(staff, slots, { ...O, coverPrice: 50 });
  const cs = priced.coverSlack;
  assert.ok(cs.moves >= 1, `moves ${cs.moves}`);
  assert.ok(cs.riskHours < cs.riskHoursBefore, `${cs.riskHours} < ${cs.riskHoursBefore}`);
  assert.equal(cs.riskHoursBefore, coverRisk(buildContext(staff, slots, O), plain.owner).hours);
  // It pays for the slack in score and never in coverage.
  assert.ok(priced.score >= plain.score - 1e-9);
  assert.ok(priced.score - plain.score <= 50 * (cs.riskHoursBefore - cs.riskHours) + 1e-9);
  assert.equal(priced.unfilledHours, plain.unfilledHours);
  // What it bought, measured the slow way.
  assert.ok(calloutExposure(staff, slots, priced, O).exposure <= calloutExposure(staff, slots, plain, O).exposure);
});

test("too low a price changes nothing, and the report says so", () => {
  const t = TEMPLATES.retail;
  const staff = parseStaff(t.staff()).staff, slots = parseShifts(t.shifts()).slots;
  const plain = buildRoster(staff, slots, O);
  const cheap = buildRoster(staff, slots, { ...O, coverPrice: 0.01 });
  assert.equal(cheap.coverSlack.moves, 0);
  assert.equal(cheap.score, plain.score);
  assert.deepEqual(cheap.owner, plain.owner);
  assert.match(coverSlackText(cheap.coverSlack, staff), /no hand-over or swap paid for itself/);
});

test("no price opens a shift: coverage outranks slack whatever the price", () => {
  // One closer qualified for the Saturday close; buying slack must not leave it open.
  const staffText = "name, wage, max hours, min hours, availability\nAna, 20, 20, 0, any\nBo, 30, 20, 0, Mon-Fri 9-17";
  const shiftsText = "Mon-Sat, 9:00, 13:00, 1";
  const staff = parseStaff(staffText).staff, slots = parseShifts(shiftsText).slots;
  const plain = buildRoster(staff, slots, O);
  const priced = buildRoster(staff, slots, { ...O, coverPrice: 1e6 });
  assert.equal(priced.unfilledHours, plain.unfilledHours);
  assert.ok(priced.score < 100000 * (plain.unfilledHours + 1));
});

test("off by default: no coverSlack on an ordinary build", () => {
  const t = TEMPLATES.retail;
  const r = buildRoster(parseStaff(t.staff()).staff, parseShifts(t.shifts()).slots, O);
  assert.equal(r.coverSlack, null);
});

test("optimalityText does not claim a proof the traded roster breaks", () => {
  const opt = { status: "optimal", tolerance: 0.5, bestScore: 100, coverTraded: { give: 5.82, provenScore: 2251.82, riskHoursSaved: 27 } };
  const text = optimalityText(opt);
  assert.match(text, /traded for call-out slack/);
  assert.doesNotMatch(text, /no roster under your rules scores better/);
});

test("CLI --cover-price prints the slack line and carries it in --json", () => {
  const t = TEMPLATES.retail;
  const o = parseArgs(["--cover-price", "50", "staff.csv", "shifts.csv"]);
  assert.equal(o.options.coverPrice, 50);
  const out = run(t.staff(), t.shifts(), o);
  assert.equal(out.code, 0);
  assert.match(out.out, /Call-out slack:/);
  const j = JSON.parse(run(t.staff(), t.shifts(), { ...o, mode: "json" }).out);
  assert.equal(j.coverSlack.price, 50);
  assert.ok(j.coverSlack.riskHours <= j.coverSlack.riskHoursBefore);
  assert.throws(() => parseArgs(["--cover-price", "nope"]), /--cover-price needs a number/);
});

test("the page offers the price, passes it to the build and shows what it bought", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="coverprice"/);
  assert.match(html, /coverPrice: Number\(\$\("#coverprice"\)\.value\)/);
  assert.match(html, /!postedCsv \? \{ coverPrice/); // a fresh week only, as --cover-price is in the CLI
  assert.match(html, /coverSlackText\(r\.coverSlack, st\.staff\)/);
  assert.match(html, /cover_price_used/); // usage event
});

// 2026-11-13 later (eval/cover-risk-joint.mjs): the day's shifts are covered all at once, and hand-over chains count.
test("one stand-in is not counted for two shifts they cannot both work", () => {
  const staffText = "name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any\nBo, 20, 4, 0, any";
  const shiftsText = "Tue, 9:00, 13:00, 1\nTue, 14:00, 18:00, 1";
  const ctx = ctxOf(staffText, shiftsText);
  const owner = [0, 0]; // Ana works both; Bo could take either on its own, not both (4 h a week)
  const each = coverRisk(ctx, owner, { joint: false, chain: 0 });
  assert.equal(each.hours, 0); // the first form passed this day
  const joint = coverRisk(ctx, owner, { chain: 0 });
  assert.equal(joint.riskyDays, 1);
  assert.equal(joint.hours, 8);
});

test("a hand-over chain covers a day nobody can take outright, and only from the call-out day on", () => {
  const staffText = "name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any\nBo, 20, 4, 0, any\nCy, 20, 40, 0, Wed";
  const shiftsText = "Tue, 9:00, 13:00, 1\nWed, 9:00, 13:00, 1";
  const ctx = ctxOf(staffText, shiftsText);
  const owner = [0, 1]; // Ana Tue, Bo Wed. If Ana calls out: Bo is full, Cy only works Wednesdays
  const none = coverRisk(ctx, owner, { chain: 0 });
  assert.deepEqual(none.cases.map((c) => [c.person, c.day]), [[0, 1]]);
  const one = coverRisk(ctx, owner, { chain: 1 });
  assert.equal(one.riskyDays, 0); // Bo takes Tuesday and passes Wednesday to Cy
  assert.equal(one.chained, 1);
  assert.equal(coverRisk(ctx, owner).riskyDays, 0); // two passes is the default
  // A shift already worked cannot be passed: with Bo's shift on Monday, before the call-out day, no chain exists.
  const ctx2 = ctxOf(staffText.replace("Cy, 20, 40, 0, Wed", "Cy, 20, 40, 0, Mon"), "Tue, 9:00, 13:00, 1\nMon, 9:00, 13:00, 1");
  const slots2 = parseShifts("Tue, 9:00, 13:00, 1\nMon, 9:00, 13:00, 1").slots;
  const tueIdx = slots2.findIndex((s) => s.day === 1), monIdx = slots2.findIndex((s) => s.day === 0);
  const own2 = []; own2[tueIdx] = 0; own2[monIdx] = 1;
  assert.equal(coverRisk(ctx2, own2, { chain: 2 }).riskyDays, 1);
});

test("CLI --cover-chain sets the passes and rejects out-of-range values", () => {
  assert.equal(parseArgs(["--cover-chain", "0", "a", "b"]).options.coverChain, 0);
  assert.equal(parseArgs(["--cover-chain", "3", "a", "b"]).options.coverChain, 3);
  assert.throws(() => parseArgs(["--cover-chain", "4"]), /--cover-chain needs a whole number/);
});
