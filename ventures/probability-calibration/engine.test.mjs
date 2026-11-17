import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, pav, isotonicMap, corp, brier, logScore, binned, spiegelhalter, observedExpected, calibrationSlope, auc,
  consistency, parseCsv, readForecasts, profileColumns, toNumber, toOutcome, recalibrator, toCsv, report, PAPERS, mulberry32,
} from "./engine.mjs";

const ref = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const NFL = readFileSync(new URL("./data/nfl-elo-2010-2020.csv", import.meta.url), "utf8");
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

function caseData(c) {
  if (c.p) return { p: c.p, y: c.y };
  const { header, rows } = parseCsv(NFL);
  const pi = header.indexOf("elo_prob_home");
  const yi = header.indexOf("home_won");
  return { p: rows.map((r) => Number(r[pi])), y: rows.map((r) => Number(r[yi])) };
}

for (const c of ref.cases) {
  test(`${c.name}: scores, CORP decompositions, AUC, Cox fit and z tests match scikit-learn / scipy`, () => {
    const { p, y } = caseData(c);
    for (const score of ["brier", "log"]) {
      const r = corp(p, y, score);
      for (const k of ["score", "mcb", "dsc", "unc"]) close(r[k], c[score][k], 1e-10, `${score} ${k}`);
      close(r.score, r.mcb - r.dsc + r.unc, 1e-12, `${score} identity`);
    }
    close(brier(p, y), c.brier.score, 1e-12, "brier");
    close(logScore(p, y), c.log.score, 1e-12, "log score");
    close(auc(p, y), c.auc, 1e-12, "auc");
    const cs = calibrationSlope(p, y);
    close(cs.intercept, c.cox.intercept, 1e-6, "cox intercept");
    close(cs.slope, c.cox.slope, 1e-6, "cox slope");
    const sp = spiegelhalter(p, y);
    close(sp.z, c.spiegelhalter.z, 1e-10, "spiegelhalter z");
    close(sp.p, c.spiegelhalter.p, 1e-6, "spiegelhalter p");
    const oe = observedExpected(p, y);
    close(oe.z, c.inTheLarge.z, 1e-10, "O-E z");
    close(oe.p, c.inTheLarge.p, 1e-6, "O-E p");
    for (const [key, binning] of [["binned10width", "width"], ["binned10count", "count"]]) {
      const b = binned(p, y, { bins: 10, binning });
      for (const k of ["ece", "mce", "reliability", "resolution", "uncertainty"]) close(b[k], c[key][k], 1e-12, `${key} ${k}`);
    }
    if (c.isotonic) {
      const { fit } = pav(p, y);
      c.isotonic.forEach((v, i) => close(fit[i], v, 1e-12, `isotonic fit ${i}`));
    }
  });
}

test("PAV: a textbook example, ties in x pooled, and the result is non-decreasing", () => {
  // y = 1,3,2,4,3,5 on x = 1..6 pools (3,2) and (4,3)
  const { fit, blocks } = pav([1, 2, 3, 4, 5, 6], [1, 3, 2, 4, 3, 5]);
  assert.deepEqual(Array.from(fit), [1, 2.5, 2.5, 3.5, 3.5, 5]);
  assert.equal(blocks.length, 4);
  const t = pav([0.2, 0.2, 0.5, 0.5], [1, 0, 0, 0]);
  assert.deepEqual(Array.from(t.fit), [0.25, 0.25, 0.25, 0.25]);
  const rng = mulberry32(3);
  const x = Array.from({ length: 500 }, () => Math.round(rng() * 50) / 50);
  const y = x.map((v) => (rng() < v ? 1 : 0));
  const f = pav(x, y).fit;
  const order = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  for (let k = 1; k < order.length; k++) assert.ok(f[order[k]] >= f[order[k - 1]] - 1e-15);
  for (let k = 1; k < order.length; k++) if (x[order[k]] === x[order[k - 1]]) assert.equal(f[order[k]], f[order[k - 1]]);
});

test("isotonic map interpolates between blocks and clips at the ends", () => {
  const { blocks } = pav([0.1, 0.3, 0.5, 0.7], [0, 0, 1, 1]);
  const m = isotonicMap(blocks);
  assert.equal(m(0), 0);
  assert.equal(m(0.3), 0);
  close(m(0.4), 0.5, 1e-12, "midpoint");
  assert.equal(m(0.9), 1);
});

test("calibrated forecasts pass and overconfident ones fail the resampling test", () => {
  const rng = mulberry32(11);
  const p = Array.from({ length: 2000 }, () => rng());
  const good = p.map((v) => (rng() < v ? 1 : 0));
  const bad = p.map((v) => (rng() < 0.5 + 0.5 * (v - 0.5) ? 1 : 0));
  const a = consistency(p, good, { resamples: 200, seed: 2 });
  const b = consistency(p, bad, { resamples: 200, seed: 2 });
  assert.ok(a.pValue > 0.05, `calibrated p ${a.pValue}`);
  assert.ok(b.pValue < 0.01, `miscalibrated p ${b.pValue}`);
  assert.ok(calibrationSlope(p, bad).slope < 0.7);
  // the band contains the diagonal for most grid points
  const inside = a.band.filter((g) => g.lower <= g.x + 0.02 && g.upper >= g.x - 0.02).length;
  assert.ok(inside / a.band.length > 0.9);
  // seeded: the same seed gives the same answer
  assert.deepEqual(consistency(p, good, { resamples: 50, seed: 9 }), consistency(p, good, { resamples: 50, seed: 9 }));
});

test("the NFL example: what the page and post quote", () => {
  const r = analyze({ csv: NFL });
  assert.equal(r.n, 2930);
  assert.equal(r.columns.forecast, "elo_prob_home");
  assert.equal(r.columns.outcome, "home_won");
  assert.equal(r.events, 1655);
  assert.equal(pctText(r.baseRate), "56.5%");
  assert.equal(pctText(r.meanForecast), "58.4%");
  assert.equal(r.inTheLarge.z.toFixed(2), "-2.24");
  assert.ok(r.inTheLarge.p < 0.05);
  assert.ok(r.consistency.pValue > 0.05);
  assert.equal(r.calibrated, true);
  assert.match(r.summary, /significant overall overforecast/);
  close(r.brier.score, r.brier.mcb - r.brier.dsc + r.brier.unc, 1e-12, "identity");
});
const pctText = (v) => `${(v * 100).toFixed(1)}%`;

test("input reading: percentages, yes/no outcomes, a named positive label, and errors", () => {
  assert.equal(toNumber("35%"), 0.35);
  assert.equal(toOutcome("Yes"), 1);
  assert.equal(toOutcome("FALSE"), 0);
  assert.equal(toOutcome("rain", "rain"), 1);
  assert.equal(toOutcome("dry", "rain"), 0);
  const pctCsv = "id,chance_of_rain,rained\n" + Array.from({ length: 30 }, (_, i) => `${i},${(i * 3) % 100},${i % 3 ? "no" : "yes"}`).join("\n");
  const r = analyze({ csv: pctCsv, resamples: 0 });
  assert.equal(r.columns.forecast, "chance_of_rain");
  assert.equal(r.columns.outcome, "rained");
  assert.ok(r.warnings.some((w) => /percentages/.test(w)));
  const lab = "p,weather\n" + Array.from({ length: 20 }, (_, i) => `${i / 20},${i % 2 ? "rain" : "dry"}`).join("\n");
  assert.equal(analyze({ csv: lab, positive: "rain", outcomeColumn: "weather", resamples: 0 }).events, 10);
  assert.throws(() => analyze({ csv: "p,y\n0.5,1\n0.4,0" }), /at least 10/);
  assert.throws(() => analyze({ csv: "p,y\n" + Array(12).fill("0.5,1").join("\n") }), /Every outcome is the same/);
  assert.throws(() => analyze({ csv: "a,b\nx,y\nz,w" }), /No column of probabilities/);
  assert.throws(() => analyze({ csv: NFL, bins: 1 }), /Bins/);
  const prof = profileColumns(parseCsv(NFL));
  assert.equal(prof.find((c) => c.name === "playoff").kind, "binary");
  assert.equal(readForecasts(parseCsv(NFL)).columns.outcome, "home_won");
});

test("an infinite log score is reported, not decomposed", () => {
  const p = [0, 0.2, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0.4];
  const y = [1, 0, 0, 1, 0, 1, 1, 1, 1, 0];
  const r = analyze({ p, y, resamples: 0 });
  assert.equal(r.log.score, Infinity);
  assert.ok(r.warnings.some((w) => /log score is infinite/.test(w)));
  assert.ok(Number.isFinite(r.brier.mcb));
});

test("recalibrated forecasts score better in sample, and the outputs are well formed", () => {
  const c = ref.cases.find((x) => x.name === "grid-overconfident");
  const r = analyze({ p: c.p, y: c.y, resamples: 100 });
  assert.ok(brier(r.recalibrate.isotonic, c.y) <= r.brier.score);
  close(brier(r.recalibrate.isotonic, c.y), r.brier.recalibrated, 1e-12, "isotonic recalibrated score");
  assert.ok(brier(r.recalibrate.platt, c.y) < r.brier.score);
  assert.ok(r.cox.slope < 1);
  const f = recalibrator(r, "platt");
  assert.ok(f(0.95) < 0.95 && f(0.05) > 0.05);
  const csv = toCsv(r).trim().split("\n");
  assert.equal(csv.length, c.p.length + 1);
  assert.equal(csv[0], "forecast,outcome,isotonic_recalibrated,platt_recalibrated");
  const text = report(r);
  assert.match(text, /CORP decomposition/);
  assert.match(text, /Cox calibration intercept/);
});

test("PAPERS carry DOIs and say what was implemented", () => {
  assert.ok(PAPERS.length >= 8);
  for (const p of PAPERS) {
    assert.ok(p.authors && p.title && p.venue && p.year && p.url && p.implemented, p.title);
    assert.match(p.url, /^https:\/\/doi\.org\/10\./);
  }
  assert.ok(PAPERS.some((p) => p.doi === "10.1073/pnas.2016191118"));
});

test("array input: a missing forecast or an unreadable outcome is an error, and yes/no outcomes count (red team 2026-11-17)", () => {
  const p = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.15, 0.85];
  const y = [0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1];
  const base = analyze({ p, y });
  // "yes" used to read as a non-event, so this table had no events at all.
  const words = analyze({ p, y: y.map((v) => (v ? "yes" : "no")) });
  assert.deepEqual(words.brier, base.brier);
  assert.deepEqual(analyze({ p: p.map(String), y: y.map(Boolean) }).brier, base.brier);
  const withP = (v) => { const q = [...p]; q[3] = v; return q; };
  const withY = (v) => { const z = [...y]; z[3] = v; return z; };
  for (const v of [null, "", false, "n/a"]) assert.throws(() => analyze({ p: withP(v), y }), /between 0 and 1/, `p ${v}`);
  for (const v of [null, undefined, "", "maybe", 2]) assert.throws(() => analyze({ p, y: withY(v) }), /not readable as yes\/no/, `y ${v}`);
});
