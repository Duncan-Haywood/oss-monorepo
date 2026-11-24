// Row spacing and tilt for a ground-mount PV plant, chosen by money: every
// fixed-tilt (tilt, GCR) pair and every tracker GCR is simulated through a
// year of weather (rows.mjs), then priced by net present value with the
// site's land, capital, O&M and energy price. Two cases:
//   mode "land":     the buildable acres are fixed; tighter rows fit more
//                    capacity, each kWp yielding a little less.
//   mode "capacity": the DC capacity is fixed (an interconnection limit);
//                    tighter rows lease less land and lose more to shade.

import { simulate, shadeFreePitch, MODEL_DEFAULTS } from "./rows.mjs";
import { clearSkyYear, parseWeatherFile } from "./weather.mjs";

const RAD = Math.PI / 180;
const ACRE_M2 = 4046.8564224;

export const DEFAULTS = {
  lat: 35.0,
  lon: -106.6,
  altitude: 1500,
  linkeTurbidity: 3.0,
  airTemp: 20,
  azimuth: 180,
  tiltMin: 0,
  tiltMax: 40,
  gcrMin: 0.2,
  gcrMax: 0.7,
  collectorWidth: 4.0,
  bands: 2,
  trackerWidth: 2.4,
  trackerMaxAngle: 60,
  backtrack: true,
  axisAzimuth: 180,
  trackerBands: 1,
  albedo: 0.2,
  losses: 0.14,
  moduleEff: 0.21,
  overhead: 0.15,
  mode: "land",
  rankBy: "auto",
  acres: 40,
  mwdc: 10,
  price: 50,
  capex: 1.0,
  trackerPremium: 0.1,
  om: 15,
  landCost: 800,
  discount: 0.07,
  life: 30,
  degradation: 0.005,
  tzHours: 0,
  shiftMinutes: 0,
};

/** The page's example: an invented 40-acre site near Albuquerque, NM. */
export function sampleInput() {
  return { ...DEFAULTS };
}

function check(i) {
  const errs = [];
  const need = (k, lo, hi) => {
    if (!Number.isFinite(i[k]) || i[k] < lo || i[k] > hi) errs.push(`${k} must be a number from ${lo} to ${hi}.`);
  };
  need("lat", -66, 66);
  need("lon", -180, 180);
  need("altitude", -400, 6000);
  need("linkeTurbidity", 1, 8);
  need("airTemp", -40, 50);
  need("azimuth", 0, 360);
  need("tiltMin", 0, 80);
  need("tiltMax", 0, 80);
  need("gcrMin", 0.05, 0.95);
  need("gcrMax", 0.05, 0.95);
  need("collectorWidth", 0.5, 20);
  need("bands", 0, 24);
  need("trackerWidth", 0.5, 20);
  need("trackerMaxAngle", 0, 90);
  need("axisAzimuth", 0, 360);
  need("trackerBands", 0, 24);
  need("albedo", 0, 1);
  need("losses", 0, 0.6);
  need("moduleEff", 0.05, 0.4);
  need("overhead", 0, 2);
  need("acres", 0.1, 1e6);
  need("mwdc", 0.001, 1e5);
  need("price", 0, 2000);
  need("capex", 0, 20);
  need("trackerPremium", -5, 5);
  need("om", 0, 500);
  need("landCost", 0, 1e6);
  need("discount", 0, 0.5);
  need("life", 1, 60);
  need("degradation", 0, 0.1);
  if (i.tiltMax < i.tiltMin) errs.push("tiltMax is below tiltMin.");
  if (i.gcrMax < i.gcrMin) errs.push("gcrMax is below gcrMin.");
  if (i.mode !== "land" && i.mode !== "capacity") errs.push('mode must be "land" or "capacity".');
  if (!["auto", "npv", "lcoe"].includes(i.rankBy)) errs.push('rankBy must be "auto", "npv" or "lcoe".');
  if (errs.length) throw new Error(errs.join(" "));
}

/** Present-value factors: energy (with degradation) and flat yearly costs. */
export function annuity(r, n, d) {
  let e = 0, c = 0;
  for (let k = 1; k <= n; k++) {
    const df = 1 / (1 + r) ** k;
    e += (1 - d) ** (k - 1) * df;
    c += df;
  }
  return { energy: e, cost: c };
}

/** Sun vector at a solar hour angle (deg) and declination on a given latitude. */
function sunAt(lat, decl, ha) {
  const p = lat * RAD, d = decl * RAD, h = ha * RAD;
  const up = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
  const z = Math.acos(Math.max(-1, Math.min(1, up)));
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(p) - Math.tan(d) * Math.cos(p)) + Math.PI;
  return { e: Math.sin(z) * Math.sin(az), n: Math.sin(z) * Math.cos(az), up };
}

/** The rule of thumb: rows free of shade from 9:00 to 15:00 solar time on
 * the winter solstice. Returns the GCR it implies for a tilt, or null when
 * the sun is down at 9:00. */
export function nineToThreeGcr(lat, tilt, azimuth) {
  const decl = lat >= 0 ? -23.44 : 23.44;
  const fE = Math.sin(azimuth * RAD), fN = Math.cos(azimuth * RAD);
  let pitch = 0;
  for (const ha of [-45, 45]) {
    const s = sunAt(lat, decl, ha);
    if (!(s.up > 0.01)) return null;
    pitch = Math.max(pitch, shadeFreePitch(s.e * fE + s.n * fN, s.up, tilt));
  }
  return pitch > 0 ? Math.min(1, 1 / pitch) : 1;
}

function range(lo, hi, step) {
  const out = [];
  for (let k = 0; lo + k * step <= hi + 1e-9; k++) out.push(Math.round((lo + k * step) * 1000) / 1000);
  return out;
}

/** Build the weather series: a typical-year file when given, else clear sky. */
export function buildWeather(i) {
  if (i.weatherText && String(i.weatherText).trim()) {
    return parseWeatherFile(i.weatherText, { lat: i.lat, lon: i.lon, tzHours: i.tzHours, shiftMinutes: i.shiftMinutes, airTemp: i.airTemp });
  }
  const w = clearSkyYear({ lat: i.lat, lon: i.lon, altitude: i.altitude, linkeTurbidity: i.linkeTurbidity, airTemp: i.airTemp });
  w.notes = ["Clear sky every day: yields and shading losses are upper bounds. Load a typical-year file (PVGIS or NSRDB) for the site's real mix of beam and diffuse light."];
  return w;
}

/** Price one layout. y = kWh/kWp-yr; landPerKwp = acres per kWp. */
function price(i, f, y, gcr, capexPerW) {
  const landPerKwp = ((1 / i.moduleEff / gcr) * (1 + i.overhead)) / ACRE_M2;
  const kwp = i.mode === "land" ? i.acres / landPerKwp : i.mwdc * 1000;
  const acres = i.mode === "land" ? i.acres : kwp * landPerKwp;
  const mwh = (kwp * y) / 1000;
  const cost = kwp * capexPerW * 1000 + kwp * i.om * f.cost + acres * i.landCost * f.cost;
  const npv = mwh * i.price * f.energy - cost;
  return { kwp, acres, mwhYear1: mwh, npv, lcoe: mwh > 0 ? cost / (mwh * f.energy) : Infinity };
}

/** Run the whole analysis. `weather` may be passed in to reuse a parsed file. */
export function analyze(input = {}, weather = null) {
  const i = { ...DEFAULTS, ...input };
  for (const k of Object.keys(DEFAULTS)) if (typeof DEFAULTS[k] === "number" && typeof i[k] === "string" && i[k].trim() !== "") i[k] = Number(i[k]);
  i.backtrack = i.backtrack === true || i.backtrack === "true" || i.backtrack === 1;
  check(i);
  const w = weather || buildWeather(i);
  const f = annuity(i.discount, i.life, i.degradation);
  const model = { albedo: i.albedo, losses: i.losses };
  const gcrs = range(i.gcrMin, i.gcrMax, 0.01);
  const tilts = range(i.tiltMin, i.tiltMax, 1);

  // Fixed tilt: every (tilt, GCR).
  const fixedGrid = [];
  for (const tilt of tilts) {
    const layout = { kind: "fixed", tilt, azimuth: i.azimuth };
    const iso = simulate(w, layout, 0, { ...model, bands: i.bands }).kwhPerKwp;
    const row = [];
    for (const gcr of gcrs) {
      const sim = simulate(w, layout, gcr, { ...model, bands: i.bands });
      const y = sim.kwhPerKwp;
      const r = { tilt, gcr, yield: y, isolatedYield: iso, rowLoss: 1 - y / iso, poa: sim.poa, ...price(i, f, y, gcr, i.capex) };
      row.push(r);
    }
    fixedGrid.push(row);
  }
  const decorateFixed = (r) => ({ ...r, pitch: i.collectorWidth / r.gcr, gap: i.collectorWidth / r.gcr - i.collectorWidth * Math.cos(r.tilt * RAD) });

  // Single-axis tracker: every GCR.
  const tLayout = { kind: "tracker", axisAzimuth: i.axisAzimuth, maxAngle: i.trackerMaxAngle, backtrack: i.backtrack };
  const tIso = simulate(w, { ...tLayout, backtrack: false }, 0, { ...model, bands: i.trackerBands }).kwhPerKwp;
  const trackerCurve = [];
  for (const gcr of gcrs) {
    const sim = simulate(w, tLayout, gcr, { ...model, bands: i.trackerBands });
    const y = sim.kwhPerKwp;
    const r = { gcr, yield: y, isolatedYield: tIso, rowLoss: 1 - y / tIso, poa: sim.poa, pitch: i.trackerWidth / gcr, ...price(i, f, y, gcr, i.capex + i.trackerPremium) };
    trackerCurve.push(r);
  }

  // Rank by net present value when some layout pays. When none does, the
  // highest NPV is simply the smallest plant (in land mode, the sparsest
  // rows), which answers nothing; rank by cost per MWh instead.
  const allFixed = fixedGrid.flat();
  const maxNpv = Math.max(...allFixed.map((r) => r.npv), ...trackerCurve.map((r) => r.npv));
  const rankBy = i.rankBy !== "auto" ? i.rankBy : maxNpv > 0 ? "npv" : "lcoe";
  const better = (a, b) => (rankBy === "npv" ? a.npv > b.npv : a.lcoe < b.lcoe);
  const pick = (list) => list.reduce((best, r) => (better(r, best) ? r : best));
  const bestFixed = pick(allFixed);
  const bestTracker = pick(trackerCurve);
  const fixedCurve = fixedGrid[tilts.indexOf(bestFixed.tilt)];

  // The 9-to-3 rule at the best tilt, priced the same way, for comparison.
  let rule = null;
  const gRule = nineToThreeGcr(w.lat, bestFixed.tilt, i.azimuth);
  if (gRule != null) {
    const layout = { kind: "fixed", tilt: bestFixed.tilt, azimuth: i.azimuth };
    const y = simulate(w, layout, gRule, { ...model, bands: i.bands }).kwhPerKwp;
    rule = decorateFixed({ tilt: bestFixed.tilt, gcr: gRule, yield: y, isolatedYield: bestFixed.isolatedYield, rowLoss: 1 - y / bestFixed.isolatedYield, ...price(i, f, y, gRule, i.capex) });
  }

  const notes = [...(w.notes || [])];
  const edge = (r, lo, hi, what) => {
    if (r === lo) notes.push(`The best ${what} is at the bottom of the range searched; widen it.`);
    if (r === hi) notes.push(`The best ${what} is at the top of the range searched; widen it.`);
  };
  edge(bestFixed.gcr, gcrs[0], gcrs[gcrs.length - 1], "fixed-tilt GCR");
  edge(bestFixed.tilt, tilts[0], tilts[tilts.length - 1], "tilt");
  edge(bestTracker.gcr, gcrs[0], gcrs[gcrs.length - 1], "tracker GCR");
  if (rankBy === "lcoe" && i.rankBy === "auto") notes.push("No layout has a positive net present value at these prices, so layouts are ranked by the lowest cost per MWh instead.");

  return {
    input: i,
    weather: { source: w.source, lat: w.lat, lon: w.lon, steps: w.sU.length, stepHours: w.dt, annual: w.annual },
    factors: f,
    fixed: { best: decorateFixed(bestFixed), curve: fixedCurve.map(decorateFixed), tilts, gcrs, npvGrid: fixedGrid.map((row) => row.map((r) => r.npv)), lcoeGrid: fixedGrid.map((row) => row.map((r) => r.lcoe)) },
    tracker: { best: bestTracker, curve: trackerCurve },
    rule,
    rankBy,
    choice: better(bestTracker, bestFixed) ? "tracker" : "fixed",
    notes,
  };
}

export { MODEL_DEFAULTS };

/** CSV of every GCR searched: fixed tilt at the best tilt, and the tracker. */
export function reportCsv(a) {
  const rows = [["layout", "tilt_deg", "gcr", "pitch_m", "yield_kwh_per_kwp", "row_loss_pct", "kwp_dc", "acres", "npv_usd", "lcoe_usd_per_mwh"]];
  const r2 = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : "");
  for (const r of a.fixed.curve) rows.push(["fixed", r.tilt, r2(r.gcr, 2), r2(r.pitch, 2), r2(r.yield, 1), r2(100 * r.rowLoss, 2), r2(r.kwp, 0), r2(r.acres, 2), r2(r.npv, 0), r2(r.lcoe, 2)]);
  for (const r of a.tracker.curve) rows.push(["tracker", "", r2(r.gcr, 2), r2(r.pitch, 2), r2(r.yield, 1), r2(100 * r.rowLoss, 2), r2(r.kwp, 0), r2(r.acres, 2), r2(r.npv, 0), r2(r.lcoe, 2)]);
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}
