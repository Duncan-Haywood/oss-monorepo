#!/usr/bin/env node
// Multiple-testing correction from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs pvalues.csv --column p_value --alpha 0.05 [--method bh] [--json]
import { readFileSync } from "node:fs";
import { analyze, PAPERS, METHODS, formatP } from "./engine.mjs";

export const HELP = `fdr-multiple-testing: Benjamini-Hochberg, Holm, Bonferroni, Storey q-values and e-BH for a list of tests

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a bare list of p-values (one per line, or comma/space separated), or a CSV
with a header row. Rows with a missing value are left out and counted.

Options:
  --column NAME        column holding the p-values (or e-values); default: one named p, pvalue, p_value, ...
  --label NAME         column naming each test (default: the first text column)
  --kind p             p (p-values) | e (e-values, corrected with e-BH)
  --alpha 0.05         error rate to control (FWER or FDR, by method)
  --method bh          the method the summary leads with: ${METHODS.map((m) => m.id).join(" | ")}
  --lambda 0.5         lambda in Storey's estimate of the share of true nulls, pi0
  --all                list every test, not only the ones the lead method keeps
  --csv                print a CSV of every test with each method's adjusted p-value
  --json               print the full JSON result
  --help               this text

Every method is run; the table shows how many tests each keeps. FWER methods
(Bonferroni, Sidak, Holm, Hochberg) bound the chance of even one false positive;
FDR methods (Benjamini-Hochberg, Benjamini-Yekutieli, two-stage BKY, Storey)
bound the expected share of false positives among those kept.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not medical, legal or financial advice. No warranty. MIT licence.
Web version: https://marisstella.app/fdr-multiple-testing/`;

const FLAGS = { "--column": "column", "--label": "labelColumn", "--kind": "kind", "--alpha": "alpha", "--method": "method", "--lambda": "lambda" };

export function parseArgs(argv) {
  const o = { json: false, help: false, all: false, csv: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--all") o.all = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (FLAGS[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[FLAGS[a]] = argv[++i];
    } else if (a.startsWith("--") && a.includes("=") && FLAGS[a.slice(0, a.indexOf("="))]) o[FLAGS[a.slice(0, a.indexOf("="))]] = a.slice(a.indexOf("=") + 1);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}; see --help`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

export function toCsv(r) {
  const ids = r.kind === "e" ? ["ebh"] : Object.keys(r.items[0]?.adjusted || {});
  const rejIds = r.kind === "e" ? ["ebh"] : r.methods.map((m) => m.id);
  const head = ["rank", "label", r.kind === "e" ? "e_value" : "p_value", ...ids.map((id) => `${id}_adjusted`), ...rejIds.map((id) => `${id}_kept`)];
  const lines = [head.join(",")];
  for (const it of r.items) lines.push([it.rank, q(it.label), it.value, ...ids.map((id) => it.adjusted[id]), ...rejIds.map((id) => (it.rejected[id] ? 1 : 0))].join(","));
  return lines.join("\n") + "\n";
}

export function formatText(r, { all = false } = {}) {
  if (r.error) return `Error: ${r.error}`;
  const out = [r.summary, ""];
  out.push("method                  controls  valid under                                         kept");
  for (const m of r.methods) out.push(`${m.name.padEnd(22)}  ${m.controls.split(" ")[0].padEnd(8)}  ${m.assumption.slice(0, 50).padEnd(50)}  ${String(m.rejections).padStart(5)}`);
  if (r.kind === "p") out.push("", `Storey pi0 (lambda ${r.lambda}) = ${r.pi0.toFixed(3)}; Benjamini-Hochberg cut-off p = ${r.bhCutoff === null ? "none" : formatP(r.bhCutoff)}`);
  const lead = r.method;
  const shown = all ? r.items : r.items.filter((it) => it.rejected[lead]);
  if (shown.length) {
    out.push("", all ? "All tests:" : `Kept by ${r.methods.find((m) => m.id === lead).name}:`);
    if (r.kind === "e") {
      out.push("rank  label                      e-value      e-BH level");
      for (const it of shown) out.push(`${String(it.rank).padStart(4)}  ${String(it.label).slice(0, 24).padEnd(24)}  ${it.value.toPrecision(4).padStart(10)}  ${formatP(it.adjusted.ebh).padStart(12)}`);
    } else {
      out.push("rank  label                     p          BH         BY         Holm       q-value");
      for (const it of shown) out.push(`${String(it.rank).padStart(4)}  ${String(it.label).slice(0, 22).padEnd(22)}  ${[it.value, it.adjusted.bh, it.adjusted.by, it.adjusted.holm, it.adjusted.storey].map((v) => formatP(v).padStart(9)).join("  ")}`);
    }
  }
  if (r.warnings.length) out.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return out.join("\n");
}

export function run(argv, stdinText) {
  let o;
  try { o = parseArgs(argv); } catch (e) { return { code: 2, out: `Error: ${e.message}\n\n${HELP}` }; }
  if (o.help) return { code: 0, out: HELP };
  let csv;
  try { csv = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdinText; } catch (e) { return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` }; }
  if (!csv || !csv.trim()) return { code: 2, out: `Error: no input given (pass a file or pipe one in).\n\n${HELP}` };
  const input = { csv };
  for (const k of ["column", "labelColumn", "kind", "method"]) if (o[k] !== undefined) input[k] = o[k];
  for (const k of ["alpha", "lambda"]) if (o[k] !== undefined) input[k] = Number(o[k]);
  const r = analyze(input);
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  return { code: 0, out: formatText(r, { all: o.all }) };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && !argv.some((a, i) => !a.startsWith("-") && !Object.keys(FLAGS).includes(argv[i - 1]) && a !== "-");
  const finish = (text) => { const { code, out } = run(argv, text); process.stdout.write(out + "\n"); process.exitCode = code; };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
