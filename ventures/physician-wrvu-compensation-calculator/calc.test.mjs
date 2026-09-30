import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASSUMPTIONS, STRUCTURES, normalize, expectedWrvus, structureResult, physicianComp, compareOffers,
  crossings, clawbackExposure, money, money2,
} from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const OFFER = { base: 300_000, cf: 50, threshold: 6000, wrvus: 8000 };

test("stated assumptions", () => {
  assert.deepEqual(ASSUMPTIONS.sensitivitySteps, [0.8, 0.9, 1.0, 1.1, 1.2]);
  assert.equal(ASSUMPTIONS.defaultHoursPerWeek, 40);
  assert.deepEqual(STRUCTURES.length, 3);
});

test("no benchmark or market rate is shipped in the model", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /median|percentile|\bMGMA\b\s*=/i);
});

test("base then productivity pays base plus conversion factor above the threshold", () => {
  const r = physicianComp(OFFER);
  near(r.results["base-plus-productivity"].clinical, 300_000 + 50 * 2000);
  assert.equal(r.results["base-plus-productivity"].incentive, 100_000);
});

test("pure productivity is conversion factor times wRVUs, using its own factor when given", () => {
  near(physicianComp(OFFER).results["pure-productivity"].clinical, 400_000);
  near(physicianComp({ ...OFFER, pureCf: 55 }).results["pure-productivity"].clinical, 440_000);
});

test("fixed salary defaults to the base and can be overridden", () => {
  near(physicianComp(OFFER).results["fixed-salary"].clinical, 300_000);
  near(physicianComp({ ...OFFER, fixedSalary: 320_000 }).results["fixed-salary"].clinical, 320_000);
});

test("below the threshold the base is guaranteed when no repayment share is set", () => {
  const r = physicianComp({ ...OFFER, wrvus: 5000 });
  near(r.results["base-plus-productivity"].clinical, 300_000);
  near(r.results["base-plus-productivity"].shortfall, 50_000);
  assert.equal(r.results["base-plus-productivity"].repayment, 0);
});

test("a 100% repayment share turns the shortfall into pure productivity pay", () => {
  const r = physicianComp({ ...OFFER, wrvus: 5000, repayPct: 100 });
  near(r.results["base-plus-productivity"].clinical, 250_000);
  near(r.results["base-plus-productivity"].repayment, 50_000);
});

test("a 40% repayment share repays 40% of the gap", () => {
  const r = physicianComp({ ...OFFER, wrvus: 5000, repayPct: 40 });
  near(r.results["base-plus-productivity"].clinical, 280_000);
});

test("break-even where pure productivity overtakes base is solved exactly", () => {
  const r = physicianComp({ ...OFFER, pureCf: 55 });
  near(r.breakEvens.pureOvertakesBase, 300_000 / 55, 0.001);
  near(r.breakEvens.pureOvertakesFixed, 300_000 / 55, 0.001);
  assert.equal(r.breakEvens.incentiveStart, 6000);
  near(r.breakEvens.impliedThreshold, 6000);
});

test("identical curves have no crossing, and a crossing between lines is found", () => {
  assert.deepEqual(physicianComp(OFFER).breakEvens.pureVsBase, []);
  assert.deepEqual(crossings((x) => x, (x) => 10, [0, 5, 20]), [10]);
  assert.deepEqual(crossings((x) => x, (x) => 10, [0, 10, 20]), [10]);
});

test("quality bonus multiplies clinical pay by the share earned", () => {
  const r = physicianComp({ ...OFFER, quality: 10, qualityEarned: 50 });
  near(r.results["base-plus-productivity"].clinical, 400_000 * 1.05);
  const full = physicianComp({ ...OFFER, quality: 10 });
  near(full.results["base-plus-productivity"].clinical, 440_000);
});

test("effective dollars per wRVU is clinical pay over wRVUs", () => {
  const r = physicianComp(OFFER);
  near(r.results["base-plus-productivity"].perWrvu, 50);
  near(r.results["fixed-salary"].perWrvu, 37.5);
});

test("comp per hour uses hours per week times weeks, defaulting to 40 x FTE", () => {
  const r = physicianComp(OFFER);
  assert.equal(r.results["base-plus-productivity"].hours, 1840);
  near(r.results["base-plus-productivity"].perHour, 400_000 / 1840);
  const half = physicianComp({ ...OFFER, fte: 0.5 });
  assert.equal(half.results["fixed-salary"].hours, 920);
  const explicit = physicianComp({ ...OFFER, hoursPerWeek: 55, weeks: 48 });
  assert.equal(explicit.results["fixed-salary"].hours, 2640);
});

test("call pay and CME are added; signing and retention are spread over the stay", () => {
  const r = physicianComp({ ...OFFER, call: 20_000, cme: 5000, signing: 60_000, retention: 30_000, yearsStay: 3 });
  const s = r.results["base-plus-productivity"];
  near(s.recurring, 425_000);
  near(s.totalAnnual, 425_000 + 20_000 + 10_000);
  near(s.yearOneCash, 485_000);
});

test("malpractice tail is a cost only for the share the visitor pays", () => {
  const base = physicianComp(OFFER).selected.totalAnnual;
  near(physicianComp({ ...OFFER, tailCost: 30_000, tailPayer: "you", yearsStay: 3 }).selected.totalAnnual, base - 10_000);
  near(physicianComp({ ...OFFER, tailCost: 30_000, tailPayer: "split", yearsStay: 3 }).selected.totalAnnual, base - 5000);
  near(physicianComp({ ...OFFER, tailCost: 30_000, tailPayer: "employer" }).selected.totalAnnual, base);
});

test("signing bonus clawback: pro-rata and cliff", () => {
  const n = normalize({ signing: 60_000, clawbackMonths: 24 });
  near(clawbackExposure(n, 12), 30_000);
  near(clawbackExposure(n, 24), 0);
  near(clawbackExposure(normalize({ signing: 60_000, clawbackMonths: 24, clawbackType: "cliff" }), 12), 60_000);
  assert.equal(clawbackExposure(normalize({ signing: 60_000 }), 6), 0);
  const r = physicianComp({ ...OFFER, signing: 60_000, clawbackMonths: 24, leaveMonth: 6 });
  near(r.clawbackAtLeave, 45_000);
  assert.deepEqual(r.clawback.map((c) => c.months), [6, 12, 24]);
});

test("non-compete stake is months of recurring pay", () => {
  const r = physicianComp({ ...OFFER, nonCompeteMonths: 12 });
  near(r.nonCompeteAtStake, r.selected.recurring);
});

test("expected wRVUs come from clinic volume when not typed", () => {
  const n = normalize({ days: 4, weeks: 46, patients: 20, wpv: 1.3 });
  const e = expectedWrvus(n);
  near(e.wrvus, 4784);
  assert.equal(e.source, "clinic");
  assert.equal(expectedWrvus(normalize({ wrvus: 7000, days: 4 })).source, "typed");
  assert.equal(expectedWrvus(normalize({})).source, "none");
});

test("sensitivity covers 80% to 120% and the 100% row matches the headline", () => {
  const r = physicianComp({ ...OFFER, repayPct: 100 });
  assert.deepEqual(r.sensitivity.map((s) => s.step), [0.8, 0.9, 1, 1.1, 1.2]);
  const mid = r.sensitivity[2];
  near(mid.rows["base-plus-productivity"].totalAnnual, r.results["base-plus-productivity"].totalAnnual);
  near(r.sensitivity[0].wrvus, 6400);
  near(r.sensitivity[0].rows["base-plus-productivity"].clinical, 300_000 + 50 * 400);
  const low = physicianComp({ ...OFFER, wrvus: 6000, repayPct: 100 });
  near(low.sensitivity[0].shortfall, 300_000 - 50 * 4800);
  near(low.sensitivity[0].repayment, 60_000);
  near(low.worstCaseShortfall, 60_000);
});

test("findings flag an expected volume below the threshold and a repayable shortfall", () => {
  const r = physicianComp({ ...OFFER, wrvus: 5000, repayPct: 100 });
  assert.ok(r.findings.some((f) => /below the 6,000 threshold/.test(f.title)));
  assert.ok(r.findings.some((f) => f.severity === "high" && /repaid/.test(f.title)));
});

test("empty input yields a clear high finding, not NaN", () => {
  const r = physicianComp({});
  assert.equal(r.findings[0].severity, "high");
  assert.ok(Number.isFinite(r.selected.totalAnnual));
  assert.ok(Number.isFinite(r.selected.perHour));
});

test("garbage input is treated as zero or default", () => {
  const r = physicianComp({ base: "abc", cf: "-5", wrvus: NaN, fte: "x", structure: "nope" });
  assert.equal(r.inputs.cf, 0);
  assert.equal(r.inputs.fte, 1);
  assert.equal(r.inputs.structure, "base-plus-productivity");
});

test("two offers compare, and the productivity scale where they tie is found", () => {
  const A = { base: 350_000, cf: 0, threshold: 0, wrvus: 6000, structure: "fixed-salary" };
  const B = { cf: 50, wrvus: 6000, structure: "pure-productivity" };
  const c = compareOffers(A, B);
  assert.equal(c.winner, "A");
  near(c.diffTotal, 50_000);
  near(c.crossoverScale, 350_000 / 300_000, 0.001);
  near(c.crossoverWrvus.b, 7000, 1);
  const flipped = compareOffers({ ...A, base: 250_000 }, B);
  assert.equal(flipped.winner, "B");
  near(flipped.crossoverScale, 250_000 / 300_000, 0.001);
});

test("offers that never cross report no crossover", () => {
  const c = compareOffers({ ...OFFER, structure: "fixed-salary" }, { ...OFFER, base: 200_000, structure: "fixed-salary" });
  assert.equal(c.crossoverScale, null);
});

test("money formatting", () => {
  assert.equal(money(1234567.6), "$1,234,568");
  assert.equal(money(-5000), "-$5,000");
  assert.equal(money2(217.391), "$217.39");
});
