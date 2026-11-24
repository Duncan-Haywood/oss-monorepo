#!/usr/bin/env node
// Kriging from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs readings.csv [--model auto|spherical|exponential|gaussian|linear] [--predict x:y,...] [--json|--csv|--loo]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, looCsv, PAPERS, MODELS, fmt } from "./engine.mjs";

export const HELP = `kriging-interpolation: fill in a map from scattered readings, with a standard error everywhere (ordinary kriging; Matheron 1963)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: CSV or tab-separated rows with two coordinates and a value. Header
names pick the columns: lon/lat (or longitude/latitude) for degrees, x/y or
easting/northing for a flat map in any one unit. Without a header the first
three columns are x, y, value.
  x,y,zinc
  181072,333611,1022
  181025,333558,1141

Options:
  --value NAME        which column to map (default: the first other numeric one)
  --coords xy|lonlat  force flat or spherical coordinates (default: from the header)
  --model M           auto (default: the one with the smallest leave-one-out error)
                      or one of ${MODELS.join(", ")}
  --estimator E       matheron (default) or cressie (robust to a few wild readings)
  --lags N            distance classes for the semivariogram (default 15)
  --max-lag D         longest distance used for the semivariogram (default half the widest)
  --nugget A --psill B --range C
                      use this variogram instead of fitting one (needs --model)
  --predict x:y,x:y   estimates with a 95% band at these places
  --grid-x N          grid columns for --csv (default 72)
  --mask F            leave out grid cells farther than F times the median
                      spacing from any reading (default 1.5; 0 = none)
  --csv               the grid: x, y, estimate, standard error
  --loo               leave-one-out table: each reading, kriging, IDW and nearest
  --json              the full JSON result
  --help              this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Estimates from a statistical model of the readings you give. Not engineering,
surveying, environmental or professional advice; a regulator or standard may
require a different method. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/kriging-interpolation/`;

const WITH_VALUE = ["--value", "--coords", "--model", "--estimator", "--lags", "--max-lag", "--nugget", "--psill", "--range", "--predict", "--grid-x", "--mask"];

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, loo: false, file: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    const need = () => {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      return val;
    };
    const number = (min) => {
      const v = Number(need());
      if (!Number.isFinite(v) || v < min) throw new Error(`${a} needs a number of at least ${min}, got "${val}"`);
      return v;
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--loo") o.loo = true;
    else if (a === "--value") o.opts.value = need();
    else if (a === "--coords") {
      const v = need();
      if (v !== "xy" && v !== "lonlat") throw new Error(`--coords is xy or lonlat, got "${v}"`);
      o.opts.coords = v;
    } else if (a === "--model") {
      const v = need();
      if (v !== "auto" && !MODELS.includes(v)) throw new Error(`--model is auto or one of ${MODELS.join(", ")}, got "${v}"`);
      o.opts.model = v;
    } else if (a === "--estimator") {
      const v = need();
      if (v !== "matheron" && v !== "cressie") throw new Error(`--estimator is matheron or cressie, got "${v}"`);
      o.opts.estimator = v;
    } else if (a === "--lags") o.opts.lags = number(3);
    else if (a === "--max-lag") o.opts.maxLag = number(0);
    else if (a === "--nugget") o.opts.nugget = number(0);
    else if (a === "--psill") o.opts.psill = number(0);
    else if (a === "--range") o.opts.range = number(0);
    else if (a === "--grid-x") o.opts.gridX = number(10);
    else if (a === "--mask") o.opts.mask = number(0);
    else if (a === "--predict") {
      o.opts.predictAt = need().split(",").filter(Boolean).map((s) => {
        const [x, y] = s.split(":").map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`--predict takes x:y pairs separated by commas, got "${s}"`);
        return [x, y];
      });
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const g = (v, s = 4) => (Number.isFinite(v) ? Number(v.toPrecision(s)).toString() : String(v));

export function formatText(r) {
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  const u = r.unit ? ` ${r.unit}` : "";
  out.push(`Semivariogram (${r.variogram.estimator}), ${r.variogram.pairs} pairs:`);
  out.push(`  ${"distance".padStart(10)}  ${"gamma".padStart(10)}  ${"pairs".padStart(7)}`);
  for (const b of r.variogram.bins) out.push(`  ${g(b.h).padStart(10)}  ${g(b.gamma).padStart(10)}  ${String(b.n).padStart(7)}`);
  out.push("", "Models (leave-one-out):");
  for (const m of r.models) {
    if (m.failed) { out.push(`  ${m.model.padEnd(12)} failed: ${m.failed}`); continue; }
    out.push(`  ${m.model.padEnd(12)} nugget ${g(m.nugget).padStart(8)}  partial sill ${g(m.psill).padStart(8)}  range ${g(m.range).padStart(8)}${u}  RMSE ${g(m.loo.rmse)}  MSDR ${fmt(m.loo.msdr, 2)}${m.model === r.model.model ? "  <- used" : ""}`);
  }
  const cv = r.crossValidation;
  out.push("", "Leave-one-out error:", `  kriging           RMSE ${g(cv.kriging.rmse)}  MAE ${g(cv.kriging.mae)}  mean ${g(cv.kriging.meanError)}`,
    `  inverse distance  RMSE ${g(cv.idw.rmse)}  MAE ${g(cv.idw.mae)}`, `  nearest reading   RMSE ${g(cv.nearest.rmse)}  MAE ${g(cv.nearest.mae)}`, `  overall mean      RMSE ${g(cv.mean.rmse)}`);
  if (cv.outliers.length) {
    out.push("", "Readings more than 3 standard errors from their neighbours' estimate:");
    for (const o of cv.outliers) out.push(`  ${r.names.x} ${o.x}, ${r.names.y} ${o.y}: ${o.value} (neighbours say ${g(o.looEstimate)}, z ${fmt(o.z, 1)})`);
  }
  if (r.predictions.length) {
    out.push("", "Estimates:");
    for (const p of r.predictions) out.push(`  ${r.names.x} ${p.x}, ${r.names.y} ${p.y}: ${g(p.estimate)} (95% ${g(p.low95)} to ${g(p.high95)}; inverse distance ${g(p.idw)})`);
  }
  return out.join("\n");
}

export function run(argv, stdinText = "") {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `Error: ${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP };
  let text = stdinText;
  try {
    if (o.file && o.file !== "-") text = readFileSync(o.file, "utf8");
  } catch (e) {
    return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` };
  }
  if (!text || !text.trim()) return { code: 2, out: `Error: no input given (pass a file or pipe one in).\n\n${HELP}` };
  const r = analyze({ text, ...o.opts, grid: o.csv || o.json });
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  if (o.loo) return { code: 0, out: looCsv(r).trimEnd() };
  return { code: 0, out: formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const withValue = new Set(WITH_VALUE);
  const hasFile = argv.some((a, i) => !a.startsWith("-") && !withValue.has(argv[i - 1]));
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && !hasFile;
  const finish = (text) => {
    const { code, out } = run(argv, text);
    process.stdout.write(out + "\n");
    process.exitCode = code;
  };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
