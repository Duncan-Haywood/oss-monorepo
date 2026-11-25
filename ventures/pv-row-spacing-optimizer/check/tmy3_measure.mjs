// What does spacing rows by clear sky, or by the 9-to-3 winter rule, cost
// on a real typical year? Runs the engine on NREL TMY3 files (public domain,
// redistributed with pvlib-python in pvlib/data/) and prices every choice
// under the file's weather.
//
//   node check/tmy3_measure.mjs <pvlib data dir> > check/tmy3_results.json
//
// pvlib 0.16.1 ships two: 723170TYA.CSV (Greensboro, NC, 36.1 N) and
// 703165TY.csv (Sand Point, AK, 55.3 N). Everything else is the page's
// default inputs (DEFAULTS in calc.mjs), ranked by cost per MWh (LCOE), which
// does not depend on the energy price; regret is in $/MWh over the plant life.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyze, DEFAULTS } from "../calc.mjs";
import { parseWeatherFile } from "../weather.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node check/tmy3_measure.mjs <pvlib data dir>");
const out = { inputs: DEFAULTS, sites: [] };
for (const [file, altitude] of [["723170TYA.CSV", 273], ["703165TY.csv", 7]]) {
  const text = readFileSync(join(dir, file), "utf8");
  const w = parseWeatherFile(text, {});
  const site = { file, lat: w.lat, lon: w.lon, annual: w.annual, modes: {} };
  for (const mode of ["land", "capacity"]) {
    const real = analyze({ mode, lat: w.lat, lon: w.lon, altitude, rankBy: "lcoe" }, w);
    const clear = analyze({ mode, lat: w.lat, lon: w.lon, altitude, rankBy: "lcoe" });
    const cell = (a, tilt, gcr) => a.fixed.lcoeGrid[a.fixed.tilts.indexOf(tilt)][a.fixed.gcrs.indexOf(gcr)];
    const pick = (r) => ({ tilt: r.tilt, gcr: Math.round(r.gcr * 1000) / 1000, yield: Math.round(r.yield), rowLossPct: Math.round(r.rowLoss * 1e4) / 100, npv: Math.round(r.npv), lcoe: Math.round(r.lcoe * 100) / 100, kwp: Math.round(r.kwp), acres: Math.round(r.acres * 10) / 10 });
    const clearInReal = real.fixed.curve.length && cell(real, clear.fixed.best.tilt, clear.fixed.best.gcr);
    site.modes[mode] = {
      rankBy: real.rankBy,
      fixedBest: pick(real.fixed.best),
      trackerBest: pick(real.tracker.best),
      nineToThreeAtBestTilt: real.rule && pick(real.rule),
      clearSkyChoice: { tilt: clear.fixed.best.tilt, gcr: clear.fixed.best.gcr, yieldClaimed: Math.round(clear.fixed.best.yield), lcoeUnderRealWeather: Math.round(clearInReal * 100) / 100 },
      lcoeAddedByRule: real.rule ? Math.round((real.rule.lcoe - real.fixed.best.lcoe) * 100) / 100 : null,
      lcoeAddedByClearSky: Math.round((clearInReal - real.fixed.best.lcoe) * 100) / 100,
      choice: real.choice,
    };
  }
  out.sites.push(site);
}
console.log(JSON.stringify(out, null, 1));
