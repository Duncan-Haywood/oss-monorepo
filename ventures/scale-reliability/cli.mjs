#!/usr/bin/env node
// Scale reliability from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data/phq9-nhanes-2017-2018.csv
//   node cli.mjs survey.csv --items q1,q2,q3,q4 --reverse q3 --missing 99 --json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS, fmt } from "./engine.mjs";

export const HELP = `scale-reliability: Cronbach's alpha with its confidence interval, McDonald's omega, Guttman's
lambda-2 and lambda-6, and an item analysis for a questionnaire scale

Usage:
  node cli.mjs [answers.csv | -] [options]       (reads stdin when no file or "-")

Input: a CSV with one row per respondent and one numeric column per item (question). Blank, NA
and the --missing codes count as missing; a row with any missing item is left out. Text columns
and columns named like an identifier (id, seqn, respondent, timestamp, ...) are skipped unless
--items names them.

Options:
  --items A,B,C          the item columns (default: every numeric, non-identifier column)
  --reverse A,B          reverse-keyed items, recoded as (min + max) - answer
  --scale-min N          lowest possible answer (default: the lowest answer seen)
  --scale-max N          highest possible answer (default: the highest answer seen)
  --missing 7,9          answer codes that mean missing (e.g. refused, don't know)
  --confidence 0.95      interval level
  --bootstrap 1000       resamples for the BCa intervals (0 skips them)
  --seed 1               bootstrap seed
  --json                 print the full JSON result
  --help                 this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. ${p.url}`).join("\n")}

Statistical estimates from the answers you supply, not medical, psychological, legal, tax,
financial or professional advice. A reliable score is not necessarily a valid one.
No warranty. FSL-1.1-MIT licence. Web version: https://marisstella.app/scale-reliability/`;

const FLAGS = { "--items": "items", "--reverse": "reverse", "--scale-min": "scaleMin", "--scale-max": "scaleMax", "--missing": "missing", "--confidence": "confidence", "--bootstrap": "bootstrap", "--seed": "seed" };
const NUMERIC = ["scaleMin", "scaleMax", "confidence", "bootstrap", "seed"];

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (FLAGS[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[FLAGS[a]] = argv[++i];
    } else if (a.startsWith("--") && a.includes("=") && FLAGS[a.slice(0, a.indexOf("="))]) o[FLAGS[a.slice(0, a.indexOf("="))]] = a.slice(a.indexOf("=") + 1);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}; see --help`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  for (const k of NUMERIC) if (o[k] !== undefined) {
    o[k] = Number(o[k]);
    if (!Number.isFinite(o[k])) throw new Error(`--${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a number`);
  }
  return o;
}

export function formatText(r) {
  const cl = `${Math.round(r.input.confidence * 100)}%`;
  const out = [...r.summary, ""];
  out.push(`Coefficients (${r.k} items, ${r.n} complete respondents of ${r.rows}${r.input.reversed.length ? `; reversed: ${r.input.reversed.join(", ")}` : ""})`);
  out.push(`  Cronbach's alpha       ${fmt(r.alpha.value)}   ${cl} CI ${fmt(r.alpha.lower)} to ${fmt(r.alpha.upper)} (Feldt)${r.alpha.bootstrap ? `; ${fmt(r.alpha.bootstrap.lower)} to ${fmt(r.alpha.bootstrap.upper)} (BCa)` : ""}`);
  out.push(`  standardised alpha     ${fmt(r.standardizedAlpha)}   mean inter-item r ${fmt(r.meanInterItemCorrelation)}`);
  out.push(`  McDonald's omega       ${fmt(r.omega.value)}${r.omega.bootstrap ? `   ${cl} CI ${fmt(r.omega.bootstrap.lower)} to ${fmt(r.omega.bootstrap.upper)} (BCa, ${r.omega.bootstrap.reps} resamples)` : ""}`);
  out.push(`  omega, standardised    ${fmt(r.omega.standardized)}   one-factor RMSR ${fmt(r.omega.standardizedRmsr)} (correlation scale)`);
  out.push(`  Guttman lambda-2       ${fmt(r.lambda2)}`);
  out.push(`  Guttman lambda-6       ${fmt(r.lambda6)}`);
  out.push(`  eigenvalues (corr.)    ${r.eigenvalues.slice(0, 4).map((v) => fmt(v, 2)).join(", ")}${r.eigenvalues.length > 4 ? ", ..." : ""}`);
  out.push("");
  const w = Math.max(4, ...r.items.map((it) => it.name.length + (it.reversed ? 4 : 0)));
  out.push(`  ${"item".padEnd(w)}   mean     sd   item-rest r   alpha if deleted   omega if deleted   loading (std)`);
  for (const it of r.items) out.push(`  ${(it.name + (it.reversed ? " (R)" : "")).padEnd(w)}  ${fmt(it.mean, 2).padStart(5)}  ${fmt(it.sd, 2).padStart(5)}  ${fmt(it.itemRest).padStart(12)}  ${fmt(it.alphaIfDeleted).padStart(17)}  ${fmt(it.omegaIfDeleted).padStart(17)}  ${fmt(it.standardizedLoading).padStart(14)}`);
  out.push("", `Total score: mean ${fmt(r.totalScore.mean, 2)}, SD ${fmt(r.totalScore.sd, 2)}, range ${r.totalScore.min} to ${r.totalScore.max}, standard error of measurement ${fmt(r.totalScore.sem, 2)}`);
  out.push(`Spearman-Brown: ${r.spearmanBrown.map((t) => `${t.target} needs ${t.items ?? "-"} items`).join("; ")}`);
  if (r.input.skipped.length) out.push(`Skipped columns: ${r.input.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}`);
  if (r.warnings.length) out.push("", ...r.warnings.map((x) => `Note: ${x}`));
  return out.join("\n").trimEnd();
}

export function run(argv, stdinText) {
  let o;
  try { o = parseArgs(argv); } catch (e) { return { code: 2, out: `Error: ${e.message}\n\n${HELP}` }; }
  if (o.help) return { code: 0, out: HELP };
  let csv;
  try { csv = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdinText; } catch (e) { return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` }; }
  if (!csv || !csv.trim()) return { code: 2, out: `Error: no CSV given (pass a file or pipe one in).\n\n${HELP}` };
  const { json, help, file, ...input } = o;
  void help; void file;
  let r;
  try { r = analyze({ ...input, csv }); } catch (e) { return { code: 1, out: `Error: ${e.message}` }; }
  return { code: 0, out: json ? JSON.stringify(r, null, 2) : formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const takesValue = new Set(Object.keys(FLAGS));
  const hasFile = argv.some((a, i) => !a.startsWith("-") && !takesValue.has(argv[i - 1]));
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && (!hasFile || argv.includes("-"));
  const finish = (text) => { const { code, out } = run(argv, text); process.stdout.write(out + "\n"); process.exitCode = code; };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
