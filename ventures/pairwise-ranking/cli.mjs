#!/usr/bin/env node
// Pairwise ranking from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs results.csv [--ties auto|davidson|half|drop] [--home auto|yes|no] [--json|--csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, predictFromResult, fmt, PAPERS, DEFAULTS } from "./engine.mjs";

export const HELP = `pairwise-ranking: rank players, teams or items from head-to-head results (Bradley-Terry, with ties and home advantage)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV, one game (or comparison) per row, in any of these shapes:
  winner,loser                      every row is a win for the first name
  a,b,result                        result 1/0/0.5, W/L/D, H/A/D, or the winner's name
  home,away,home_score,away_score   scores decide win, tie or loss
An optional count, n or weight column repeats a row. Date, round and week
columns are ignored. With home/away headers the home advantage is fitted.

Options:
  --ties MODE         auto (default: Davidson's tie model when there are ties),
                      davidson, half (half a win each) or drop
  --home MODE         auto (default: on when the headers say home/away), yes, no
  --prior-sd S        normal prior on log-strengths (0 = none). Used
                      automatically, at 1.5, when no finite ranking exists.
  --level L           confidence level for intervals and rank ranges (default 0.95)
  --draws N           simulations for rank ranges (default ${DEFAULTS.draws}; 0 skips)
  --seed N            seed for the simulations (default ${DEFAULTS.seed})
  --predict A,B       win/tie/loss chances for A against B (A listed first, at home if fitted)
  --csv               one row per player
  --json              the full JSON result
  --help              this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Statistics from the results you give. Not betting, financial or professional
advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/pairwise-ranking/`;

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null, ties: "auto", home: "auto", priorSd: 0, level: DEFAULTS.level, draws: DEFAULTS.draws, seed: DEFAULTS.seed, predict: null };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    const need = () => {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      return val;
    };
    const num = (lo, hi, int = false) => {
      const v = Number(need());
      if (!Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) throw new Error(`${a} must be ${int ? "a whole number" : "a number"} from ${lo} to ${hi}, got "${val}"`);
      return v;
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--ties") {
      const v = need().toLowerCase();
      if (!["auto", "davidson", "half", "drop"].includes(v)) throw new Error(`--ties is auto, davidson, half or drop, got "${val}"`);
      o.ties = v;
    } else if (a === "--home") {
      const v = need().toLowerCase();
      if (!["auto", "yes", "no"].includes(v)) throw new Error(`--home is auto, yes or no, got "${val}"`);
      o.home = v;
    } else if (a === "--prior-sd") o.priorSd = num(0, 100);
    else if (a === "--level") o.level = num(0.5, 0.9999);
    else if (a === "--draws") o.draws = num(0, 20000, true);
    else if (a === "--seed") o.seed = num(0, 4294967295, true);
    else if (a === "--predict") {
      const parts = need().split(",").map((s) => s.trim());
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`--predict needs two names separated by a comma, got "${val}"`);
      o.predict = parts;
    } else if (a === "-" || !a.startsWith("-")) {
      if (o.file) throw new Error(`only one input file, got "${o.file}" and "${a}"`);
      o.file = a;
    } else throw new Error(`unknown option ${a} (see --help)`);
  }
  return o;
}

const pad = (s, w) => String(s).padEnd(w);
const lpad = (s, w) => String(s).padStart(w);

export function textReport(r, o = {}) {
  const lines = [r.summary, ""];
  for (const w of r.warnings) lines.push(`Note: ${w}`);
  if (r.warnings.length) lines.push("");
  const wName = Math.max(6, ...r.players.map((p) => p.player.length));
  lines.push(`${lpad("#", 3)}  ${pad("player", wName)}  ${lpad("rating", 6)}  ${lpad("±", 4)}  ${lpad("rank range", 10)}  ${lpad("W-T-L", 11)}  ${lpad("score", 6)}`);
  for (const p of r.players) {
    const rr = p.rankLow == null ? "" : p.rankLow === p.rankHigh ? `${p.rankLow}` : `${p.rankLow}-${p.rankHigh}`;
    lines.push(`${lpad(p.rank, 3)}  ${pad(p.player, wName)}  ${lpad(fmt(p.rating, 0), 6)}  ${lpad(p.ratingSe == null ? "" : fmt(p.ratingSe, 0), 4)}  ${lpad(rr, 10)}  ${lpad(`${p.wins}-${p.ties}-${p.losses}`, 11)}  ${lpad(fmt(p.actualScore, 1), 6)}`);
  }
  lines.push("", `Rating = 1500 + 400 log10(strength); ± is one standard error. Rank range: ${fmt(100 * r.settings.level, 0)}% of ${r.settings.draws.toLocaleString("en-US")} simulations.`);
  if (o.predict) {
    const p = predictFromResult(r, o.predict[0], o.predict[1], { home: true });
    if (!p) lines.push("", `Cannot predict: ${o.predict.filter((n) => !r.model.players.includes(n)).join(" and ")} not in the results.`);
    else lines.push("", `${p.a} v ${p.b}${p.home ? ` (${p.a} at home)` : ""}: ${p.a} wins ${fmt(100 * p.win, 1)}%${r.ties ? `, tie ${fmt(100 * p.tie, 1)}%` : ""}, ${p.b} wins ${fmt(100 * p.loss, 1)}%.`);
  }
  return lines.join("\n");
}

export function run(argv, stdin = "") {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `${e.message}\n` };
  }
  if (o.help) return { code: 0, out: `${HELP}\n` };
  let csv;
  if (o.file && o.file !== "-") {
    try {
      csv = readFileSync(o.file, "utf8");
    } catch (e) {
      return { code: 2, out: `cannot read ${o.file}: ${e.code || e.message}\n` };
    }
  } else csv = stdin;
  if (!csv.trim()) return { code: 2, out: "No input. Give a CSV file, or pipe one in (see --help).\n" };
  const r = analyze({ csv, ties: o.ties, home: o.home, priorSd: o.priorSd, level: o.level, draws: o.draws, seed: o.seed });
  if (r.error) return { code: 1, out: `${r.error}\n` };
  if (o.json) return { code: 0, out: `${JSON.stringify(r, null, 2)}\n` };
  if (o.csv) return { code: 0, out: toCsv(r) };
  return { code: 0, out: `${textReport(r, o)}\n` };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const argv = process.argv.slice(2);
  let wantsStdin = false;
  try { const o = parseArgs(argv); wantsStdin = !o.help && (!o.file || o.file === "-"); } catch { /* run() reports it */ }
  const stdin = wantsStdin && !process.stdin.isTTY ? readFileSync(0, "utf8") : "";
  const r = run(argv, stdin);
  process.stdout.write(r.out);
  process.exitCode = r.code;
}
