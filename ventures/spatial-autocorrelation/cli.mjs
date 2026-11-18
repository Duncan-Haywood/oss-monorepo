#!/usr/bin/env node
// Spatial autocorrelation from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs places.csv [--neighbors nb.csv] [--var NAME] [--json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, report, PAPERS } from "./engine.mjs";

export const HELP = `spatial-autocorrelation: are high values next to high values?
Global Moran's I, Geary's C and Getis-Ord General G; local Moran's I (LISA)
clusters and outliers; Getis-Ord Gi* hot spots; a Moran correlogram.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: CSV, tab or semicolon-separated, one row per place, an id column,
coordinates (lon/lat or longitude/latitude for degrees, x/y or
easting/northing for projected units) and one or more numeric columns.
Every numeric column is analysed unless --var names some.
  state,lon,lat,income
  Alabama,-86.83,32.79,33096

Options:
  --neighbors FILE    neighbour list instead of distances: "place,n1;n2;n3"
                      per row, or one "place,neighbour" pair per row
  --weights KIND      knn (default), band, inverse, or list (default with --neighbors)
  --k N               neighbours for knn (default 6)
  --threshold D       distance band / inverse-distance cut-off (km for lon/lat;
                      default: the smallest that leaves no place without neighbours)
  --power P           inverse-distance power (default 1)
  --transform T       r (row-standardised, default), b (binary), none (raw inverse distance)
  --coordinates C     auto (default), geographic or planar
  --var A,B           columns to analyse
  --id NAME, --x NAME, --y NAME   name the columns when the guess is wrong
  --permutations N    permutations for pseudo p-values (default 999; 0 = analytic only)
  --seed S            random seed (default 12345)
  --alpha A           significance level for clusters (default 0.05)
  --fdr               Benjamini-Hochberg false-discovery-rate cut-off for local tests
  --bands N           correlogram distance rings (default 8; 0 = none)
  --json              the full JSON result
  --help              this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

A description of the pattern in the numbers you give, not proof of a cause.
Not legal, tax, financial, public-health, planning or other professional
advice. No warranty. MIT licence.
Web version: https://marisstella.app/spatial-autocorrelation/`;

const WITH_VALUE = { "--neighbors": "neighborsFile", "--weights": "weights", "--k": "k", "--threshold": "threshold", "--power": "power", "--transform": "transform", "--coordinates": "coordinates", "--var": "variables", "--vars": "variables", "--id": "id", "--x": "x", "--y": "y", "--permutations": "permutations", "--seed": "seed", "--alpha": "alpha", "--bands": "bands" };
const NUMERIC = new Set(["k", "threshold", "power", "permutations", "seed", "alpha", "bands"]);

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--fdr") o.opts.fdr = true;
    else if (a in WITH_VALUE) {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      const key = WITH_VALUE[a];
      if (NUMERIC.has(key)) {
        const n = Number(val);
        if (!Number.isFinite(n)) throw new Error(`${a} needs a number, got "${val}"`);
        o.opts[key] = n;
      } else o.opts[key] = val;
    } else if (a.startsWith("--")) throw new Error(`Unknown option ${a} (see --help)`);
    else if (o.file === null) o.file = a;
    else throw new Error(`Unexpected argument "${a}"`);
  }
  return o;
}

export function run(argv, stdin = null) {
  let o;
  try { o = parseArgs(argv); } catch (e) { return { code: 2, out: "", err: `${e.message}\n` }; }
  if (o.help) return { code: 0, out: `${HELP}\n`, err: "" };
  try {
    const text = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin ?? readFileSync(0, "utf8");
    const { neighborsFile, ...opts } = o.opts;
    if (neighborsFile) opts.neighbors = readFileSync(neighborsFile, "utf8");
    const result = analyze({ ...opts, text });
    const warn = result.warnings.length ? result.warnings.map((w) => `warning: ${w}\n`).join("") : "";
    return { code: 0, out: o.json ? `${JSON.stringify(result, null, 2)}\n` : `${report(result)}\n`, err: warn };
  } catch (e) {
    return { code: 1, out: "", err: `${e.message}\n` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = run(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  process.exitCode = r.code;
}
