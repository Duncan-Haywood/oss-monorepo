// Coverage and calibration with a known truth. node eval/simulate.mjs > eval/simulation.json
// Each data set: n true values uniform on [20, 200]; x = truth + e1, y = 2 + 1.05 truth + e2,
// errors normal with SD 4 (constant) or 4% of the level (proportional), rounded to 0.1.
import { demingJackknife, weightedDeming, passingBablok, cusumLinearity, blandAltman, rng } from "../engine.mjs";

const settings = { datasets: 1000, n: 60, slope: 1.05, intercept: 2, sd: 4, cv: 0.04, seed: 20261117 };
const draw = rng(settings.seed);
const gauss = () => { let u = 0; while (u === 0) u = draw(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * draw()); };
const r1 = (v) => Math.round(v * 10) / 10;
const inside = (ci, v) => ci[0] <= v && v <= ci[1];

function run(kind) {
  const c = { demingSlope: 0, demingIntercept: 0, weightedSlope: 0, pbSlope: 0, pbIntercept: 0, cusumRejects: 0, cusumTested: 0, loaCover: 0 };
  for (let k = 0; k < settings.datasets; k++) {
    const x = [], y = [];
    for (let i = 0; i < settings.n; i++) {
      const t = 20 + 180 * draw();
      const s = kind === "constant" ? settings.sd : settings.cv * t;
      const truthY = kind === "curved" ? settings.intercept + settings.slope * t + 0.004 * (t - 110) ** 2 : settings.intercept + settings.slope * t;
      x.push(r1(t + s * gauss()));
      y.push(r1(truthY + s * gauss()));
    }
    const d = demingJackknife(x, y, 1);
    const pb = passingBablok(x, y);
    const cu = cusumLinearity(x, y, pb.slope, pb.intercept);
    if (Number.isFinite(cu.p)) { c.cusumTested++; if (cu.p < 0.05) c.cusumRejects++; }
    if (kind === "curved") continue;
    c.demingSlope += inside(d.slopeCI, settings.slope);
    c.demingIntercept += inside(d.interceptCI, settings.intercept);
    c.pbSlope += inside(pb.slopeCI, settings.slope);
    c.pbIntercept += inside(pb.interceptCI, settings.intercept);
    if (kind === "proportional") c.weightedSlope += inside(weightedDeming(x, y, 1).slopeCI, settings.slope);
    if (kind === "constant") {
      // Share of a fresh pair's differences inside the limits: should be near 95% on average.
      const ba = blandAltman(x, y);
      const sdDiff = Math.sqrt(2) * settings.sd, mu = settings.intercept + (settings.slope - 1) * 110;
      let inn = 0;
      for (let j = 0; j < 200; j++) { const t = 20 + 180 * draw(); const dd = r1(settings.intercept + settings.slope * t + settings.sd * gauss()) - r1(t + settings.sd * gauss()); if (dd >= ba.lower && dd <= ba.upper) inn++; }
      c.loaCover += inn / 200;
      void sdDiff; void mu;
    }
  }
  const N = settings.datasets, pct = (v) => Math.round((1000 * v) / N) / 10;
  const out = { cusumRejectRate: Math.round((1000 * c.cusumRejects) / c.cusumTested) / 10 };
  if (kind !== "curved") Object.assign(out, { demingSlope: pct(c.demingSlope), demingIntercept: pct(c.demingIntercept), passingBablokSlope: pct(c.pbSlope), passingBablokIntercept: pct(c.pbIntercept) });
  if (kind === "proportional") out.weightedDemingSlope = pct(c.weightedSlope);
  if (kind === "constant") out.loaContainsNewDifferences = pct(c.loaCover);
  return out;
}

const result = { settings, note: "Percentages of data sets whose 95% interval contains the true value; CUSUM reject rate at p < 0.05 (false alarms for constant/proportional, power for curved).", constant: run("constant"), proportional: run("proportional"), curved: run("curved") };
console.log(JSON.stringify(result, null, 1));
