#!/usr/bin/env node
// Writes the HTML report (html-report.mjs) for every model in MODEL_DIR
// against every IDS in IDS_DIR, then reads each file back and checks it holds
// what the report holds: one failure row per listed failing element (up to the default
// 1,000) in each specification, the summary's pass/fail counts, every reason under a
// requirement the specification lists, and well-formed markup (every opened
// table, details and tr closed). Prints a table for eval/html-report-*.md.
//
//   node --max-old-space-size=8192 eval/html-report.mjs MODEL_DIR IDS_DIR [OUT_DIR]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { check, readModel, parseModel, parseIds } from "../node.mjs";
import { htmlReport, failCount, requirementOf } from "../html-report.mjs";

const [modelDir, idsDir, outDir] = process.argv.slice(2);
if (!idsDir) { console.error("usage: node eval/html-report.mjs MODEL_DIR IDS_DIR [OUT_DIR]"); process.exit(2); }
if (outDir) mkdirSync(outDir, { recursive: true });
const models = readdirSync(modelDir).filter((f) => /\.(ifc|ifcxml|ifczip)$/i.test(f)).sort();
const idsFiles = readdirSync(idsDir).filter((f) => /\.(ids|xml)$/i.test(f)).sort();

const count = (s, re) => (s.match(re) || []).length;
const tot = { pairs: 0, errors: 0, specs: 0, rowsWant: 0, rowsGot: 0, specMismatch: 0, summaryMismatch: 0, reasons: 0, unattributed: 0, unbalanced: 0, bytes: 0, maxBytes: 0, cappedSpecs: 0, maxFailed: 0, capNoteMissing: 0, ms: 0, maxMs: 0, failing: 0 };
const perModel = [];
for (const m of models) {
  const parsed = parseModel((await readModel(join(modelDir, m))).bytes);
  const row = { model: m, pairs: 0, failingPairs: 0, rows: 0, mismatches: 0, biggest: 0 };
  for (const f of idsFiles) {
    let r;
    const tc = performance.now();
    try { r = check(parseIds(readFileSync(join(idsDir, f), "utf8")), parsed); } catch { tot.errors++; continue; }
    tot.pairs++; row.pairs++;
    const t0 = performance.now();
    const html = htmlReport(r, { modelName: m, idsName: f, generatedAt: "2026-11-21T00:00:00Z" });
    const ms = performance.now() - t0;
    const checkMs = performance.now() - tc - ms;
    tot.ms += ms; if (ms > tot.maxMs) { tot.maxMs = ms; tot.slowest = `${m} / ${f}: report ${(ms / 1000).toFixed(1)} s after a ${(checkMs / 1000).toFixed(1)} s check, ${r.specs.reduce((a, s) => a + failCount(s), 0).toLocaleString("en-US")} failing results`; }
    const bytes = Buffer.byteLength(html);
    tot.bytes += bytes; tot.maxBytes = Math.max(tot.maxBytes, bytes); row.biggest = Math.max(row.biggest, bytes);
    if (!r.pass) row.failingPairs++;
    // Markup balance.
    for (const tag of ["table", "details", "tr", "tbody", "summary"]) if (count(html, new RegExp(`<${tag}[ >]`, "g")) !== count(html, new RegExp(`</${tag}>`, "g"))) { tot.unbalanced++; break; }
    // One failure row per listed failure, per specification section.
    const sections = html.split(/<details class="spec" id="spec-/).slice(1);
    let bad = false;
    r.specs.forEach((s, i) => {
      tot.specs++;
      const sec = sections[i] || "";
      const got = count(sec.split("</details>")[0], /<tr data-el=/g);
      const want = Math.min(s.failed.length, 1000);
      if (s.failed.length > 1000) { tot.cappedSpecs++; tot.maxFailed = Math.max(tot.maxFailed, s.failed.length); if (!sec.includes(`Showing 1,000 of ${failCount(s).toLocaleString("en-US")} failing elements`)) tot.capNoteMissing++; }
      tot.rowsWant += want; tot.rowsGot += got; row.rows += got;
      if (got !== want) { tot.specMismatch++; bad = true; }
      for (const fl of s.failed) for (const x of fl.reasons) { tot.reasons++; if (!s.requirements.some((q) => requirementOf(s, x) === q) && s.optionality !== "prohibited") tot.unattributed++; }
      tot.failing += failCount(s);
    });
    // The summary table's Fail column, in order.
    const summary = html.split("<h2>Specifications</h2>")[1].split("</table>")[0];
    const fails = [...summary.matchAll(/<tr><td>.*?<\/td><td>.*?<\/td><td class="num">[^<]*<\/td><td class="num">[^<]*<\/td><td class="num">([^<]*)<\/td>/g)].map((x) => Number(x[1].replace(/,/g, "")));
    if (fails.length !== r.specs.length || fails.some((v, i) => v !== failCount(r.specs[i]))) { tot.summaryMismatch++; bad = true; }
    if (bad) row.mismatches++;
    if (outDir && !r.pass && row.failingPairs <= 3) writeFileSync(join(outDir, `${m}--${f}.html`), html);
  }
  perModel.push(row);
}
const st = (x) => x.toLocaleString("en-US");
console.log(`| Model | Pairs | Failing pairs | Failure rows written | Pairs with a mismatch | Largest report |`);
console.log(`| --- | ---: | ---: | ---: | ---: | ---: |`);
for (const r of perModel) console.log(`| ${r.model} | ${r.pairs} | ${r.failingPairs} | ${st(r.rows)} | ${r.mismatches} | ${(r.biggest / 1024).toFixed(0)} KB |`);
console.log();
console.log(`pairs ${tot.pairs} (IDS read errors ${tot.errors}); specifications ${st(tot.specs)}`);
console.log(`failure rows: report ${st(tot.rowsWant)}, HTML ${st(tot.rowsGot)}; specification sections with a different row count: ${tot.specMismatch}`);
console.log(`specifications past the 1,000-row default: ${tot.cappedSpecs} (largest ${st(tot.maxFailed)} failing elements), without the "Showing" note: ${tot.capNoteMissing}`);
console.log(`summary Fail column unlike failCount: ${tot.summaryMismatch} pairs; failing results ${st(tot.failing)}`);
console.log(`reasons ${st(tot.reasons)}, not under a listed requirement: ${tot.unattributed}`);
console.log(`unbalanced markup: ${tot.unbalanced} files`);
console.log(`HTML size: mean ${(tot.bytes / tot.pairs / 1024).toFixed(1)} KB, max ${(tot.maxBytes / 1048576).toFixed(2)} MB; render time mean ${(tot.ms / tot.pairs).toFixed(1)} ms, max ${tot.maxMs.toFixed(0)} ms`);
console.log(`slowest: ${tot.slowest}`);

