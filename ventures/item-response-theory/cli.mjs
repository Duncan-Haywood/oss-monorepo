#!/usr/bin/env node
// Item response theory from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs answers.csv [--model auto|1pl|2pl] [--key B,D,A,...] [--json|--items|--people|--report]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, summarize, itemCsv, peopleCsv, report, PAPERS } from "./engine.mjs";

export const HELP = `item-response-theory: item difficulty, discrimination and fit for a right/wrong test (1PL and 2PL IRT by marginal maximum likelihood; Bock & Aitkin 1981)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: CSV or tab-separated, one row per person and one column per item.
Cells are 0/1 (or true/false, right/wrong), or raw answers (A-E, 1-5) with
a row whose first cell is "key". Blank, NA, "." and "-" are missing. A
column headed id/name/student holds labels; one headed count/freq/weight
says how many people gave that row.
  student,q1,q2,q3
  key,B,D,A
  Ana,B,D,C

Options:
  --model M      auto (default: fit both, keep the lower BIC), 1pl (alias rasch) or 2pl
  --key K        answer key, comma separated or one letter per item ("BDAC")
  --no-se        skip standard errors (faster on big tests)
  --items        item table as CSV (a, b with standard errors, p, item-rest r, S-X2)
  --people       one row per person: summed score and EAP ability with its posterior SD
  --report       Markdown report
  --json         the full JSON result
  --help         this text

Citations:
${PAPERS.map((p) => `  ${p.cite}${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

A statistical estimate from the answers you give, not a substitute for a
psychometrician's review of a high-stakes test. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/item-response-theory/`;

export function parseArgs(argv) {
  const o = { mode: "text", help: false, file: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    const need = () => {
      if (val === undefined) val = argv[++i];
      if (val === undefined) throw new Error(`${a} needs a value`);
      return val;
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.mode = "json";
    else if (a === "--items") o.mode = "items";
    else if (a === "--people") o.mode = "people";
    else if (a === "--report") o.mode = "report";
    else if (a === "--no-se") o.opts.standardErrors = false;
    else if (a === "--model") {
      const v = need().toLowerCase();
      if (!["auto", "1pl", "2pl", "rasch"].includes(v)) throw new Error(`--model is auto, 1pl, rasch or 2pl, got "${v}"`);
      o.opts.model = v;
    } else if (a === "--key") o.opts.key = need();
    else if (a === "-" || !a.startsWith("-")) {
      if (o.file) throw new Error(`one input file, got "${o.file}" and "${a}"`);
      o.file = a;
    } else throw new Error(`unknown option ${a} (try --help)`);
  }
  return o;
}

const f2 = (v) => (v == null || !Number.isFinite(v) ? "-" : v.toFixed(2));

export function run(argv, stdin = null) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: "", err: `${e.message}\n` };
  }
  if (o.help) return { code: 0, out: HELP + "\n", err: "" };
  let text;
  try {
    text = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin ?? readFileSync(0, "utf8");
  } catch (e) {
    return { code: 2, out: "", err: `cannot read ${o.file || "stdin"}: ${e.message}\n` };
  }
  let r;
  try {
    r = analyze({ text, ...o.opts });
  } catch (e) {
    return { code: 1, out: "", err: `${e.message}\n` };
  }
  if (o.mode === "json") return { code: 0, out: JSON.stringify(r, null, 1) + "\n", err: "" };
  if (o.mode === "items") return { code: 0, out: itemCsv(r), err: "" };
  if (o.mode === "people") return { code: 0, out: peopleCsv(r), err: "" };
  if (o.mode === "report") return { code: 0, out: report(r), err: "" };
  const lines = [...summarize(r), ""];
  if (r.comparison) lines.push(`Models: 1PL log-likelihood ${r.fits["1pl"].logLik.toFixed(3)}, BIC ${r.comparison.bic1pl.toFixed(2)}; 2PL ${r.fits["2pl"].logLik.toFixed(3)}, BIC ${r.comparison.bic2pl.toFixed(2)}`, "");
  const w = Math.max(4, ...r.itemTable.map((i) => i.item.length));
  lines.push(`${"item".padEnd(w)}      a   (se)       b   (se)  p right  item-rest  S-X2 p`);
  for (const i of r.itemTable) lines.push(`${i.item.padEnd(w)} ${f2(i.a).padStart(6)} (${f2(i.aSE)}) ${f2(i.b).padStart(7)} (${f2(i.bSE)}) ${f2(i.pCorrect).padStart(8)} ${f2(i.itemRest).padStart(10)} ${i.sx2p == null ? "     -" : i.sx2p.toFixed(3).padStart(7)}${i.flags.length ? "  <- " + i.flags.join("; ") : ""}`);
  if (r.warnings.length) lines.push("", ...r.warnings.map((x) => `Note: ${x}`));
  return { code: 0, out: lines.join("\n") + "\n", err: "" };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const r = run(process.argv.slice(2));
  if (r.out) process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  process.exitCode = r.code;
}
