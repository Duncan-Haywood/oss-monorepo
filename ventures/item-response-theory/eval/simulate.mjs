// Simulation with a known truth: parameter recovery, 95% interval coverage,
// S-X2 false-alarm rate on items that fit, S-X2 power on an item with
// guessing (which a 2PL cannot represent), and the likelihood-ratio test's
// false-alarm rate when the truth is a 1PL. Seeded, so the saved
// simulation.json is reproducible: `node eval/simulate.mjs` (about a minute).
// Also writes sim-2pl.csv, the data set eval/reference.py fits with girth.
import { writeFileSync } from "node:fs";
import { analyze } from "../engine.mjs";

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

function simulate(rnd, { people, a, b, c }) {
  const rows = [a.map((_, j) => `i${j + 1}`).join(",")];
  for (let i = 0; i < people; i++) {
    const th = normal(rnd);
    rows.push(a.map((aj, j) => { const p = (c?.[j] ?? 0) + (1 - (c?.[j] ?? 0)) / (1 + Math.exp(-aj * (th - b[j]))); return rnd() < p ? 1 : 0; }).join(","));
  }
  return rows.join("\n") + "\n";
}

const settings = { reps: 60, people: 1000, items: 20, seed: 20261117, guessItem: 20, guess: 0.25 };
const rnd = mulberry32(settings.seed);

// The reference data set for girth.
{
  const r = mulberry32(7);
  const a = Array.from({ length: 15 }, () => 0.6 + 1.4 * r());
  const b = Array.from({ length: 15 }, () => normal(r));
  writeFileSync(new URL("./sim-2pl.csv", import.meta.url), simulate(r, { people: 1000, a, b }));
}

const runs = [];
let cover = { a: 0, b: 0, n: 0 }, sq = { a: 0, b: 0 }, sx = { alarms: 0, tests: 0, guessFlag: 0 }, lr = { alarms: 0, reps: 0 };
for (let rep = 0; rep < settings.reps; rep++) {
  const J = settings.items;
  const a = Array.from({ length: J }, () => 0.6 + 1.4 * rnd());
  const b = Array.from({ length: J }, () => Math.max(-2.5, Math.min(2.5, normal(rnd))));
  const c = new Array(J).fill(0);
  c[settings.guessItem - 1] = settings.guess;
  const text = simulate(rnd, { people: settings.people, a, b, c });
  const r = analyze({ text, model: "2pl" });
  let ca = 0, cb = 0, fits = 0;
  r.itemTable.forEach((it, j) => {
    if (j === settings.guessItem - 1) { if (it.sx2p !== null && it.sx2p < 0.05) sx.guessFlag++; return; }
    if (Math.abs(it.a - a[j]) <= 1.96 * it.aSE) ca++;
    if (Math.abs(it.b - b[j]) <= 1.96 * it.bSE) cb++;
    sq.a += (it.a - a[j]) ** 2; sq.b += (it.b - b[j]) ** 2;
    if (it.sx2p !== null) { sx.tests++; if (it.sx2p < 0.05) { sx.alarms++; fits++; } }
  });
  cover.a += ca; cover.b += cb; cover.n += J - 1;
  // Likelihood-ratio false alarms: a 1PL truth (common slope 1.2), no guessing.
  const t1 = simulate(rnd, { people: settings.people, a: new Array(J).fill(1.2), b });
  const r1 = analyze({ text: t1, model: "auto", standardErrors: false });
  lr.reps++;
  if (r1.comparison.p < 0.05) lr.alarms++;
  runs.push({ rep, coverageA: ca / (J - 1), coverageB: cb / (J - 1), sx2Alarms: fits, guessItemP: r.itemTable[settings.guessItem - 1].sx2p, lrP1pl: r1.comparison.p, chosenUnder1pl: r1.model });
  process.stderr.write(".");
}
const summary = {
  coverageA: cover.a / cover.n,
  coverageB: cover.b / cover.n,
  rmseA: Math.sqrt(sq.a / cover.n),
  rmseB: Math.sqrt(sq.b / cover.n),
  sx2FalseAlarmRate: sx.alarms / sx.tests,
  sx2Tests: sx.tests,
  guessItemFlagRate: sx.guessFlag / settings.reps,
  lrFalseAlarmRate: lr.alarms / lr.reps,
  bicPicks1plUnder1pl: runs.filter((x) => x.chosenUnder1pl === "1pl").length / runs.length,
};
writeFileSync(new URL("./simulation.json", import.meta.url), JSON.stringify({ settings, summary, runs }, null, 1) + "\n");
console.log("\n" + JSON.stringify(summary, null, 1));
