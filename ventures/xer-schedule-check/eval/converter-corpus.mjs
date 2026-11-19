// Run the full assessment (dcma.mjs assess, which runs cpm.mjs) over every
// .xer in a directory and count what a reader would trip over: a crash or a
// hang, a refusal, and NaN / undefined / Infinity anywhere in the report or
// its warnings. Built for files written by hand or by other tools; the list
// of public files used on 2026-11-19 is eval/converter-corpus-2026-11-19.txt
// (fetch them with --fetch; nothing is committed, their licences vary).
//
//   node eval/converter-corpus.mjs <dir> [--fetch list.txt] [--json out.json]
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseXer, decodeXer } from "../xer.mjs";
import { assess } from "../dcma.mjs";
import { reviewHtml } from "../report.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
if (opt("--fetch")) {
  mkdirSync(dir, { recursive: true });
  for (const line of readFileSync(opt("--fetch"), "utf8").split("\n")) {
    const [repo, ...rest] = line.trim().split(" ");
    if (!repo || repo.startsWith("#")) continue;
    const path = rest.join(" ");
    const out = join(dir, `${repo}/${path}`.replace(/\//g, "__"));
    if (existsSync(out)) continue;
    try { execFileSync("curl", ["-sSfL", "-m", "60", "-o", out, `https://raw.githubusercontent.com/${repo}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`]); }
    catch { console.log(`not fetched: ${repo} ${path}`); }
  }
}
const seen = new Set();
const rows = [];
const bad = /\bNaN\b|\bundefined\b|\bInfinity\b/;
for (const f of readdirSync(dir).filter((n) => /\.xer$/i.test(n)).sort()) {
  const buf = readFileSync(join(dir, f));
  const h = createHash("sha1").update(buf).digest("hex");
  if (seen.has(h)) continue;
  seen.add(h);
  const t0 = Date.now();
  const row = { file: f };
  try {
    const xer = parseXer(decodeXer(buf));
    const rep = assess(xer);
    let html = "";
    try { html = reviewHtml(rep); } catch (e) { row.reportError = e.message; }
    const text = JSON.stringify(rep) + html;
    const m = bad.exec(text);
    row.outcome = "assessed";
    row.warnings = rep.warnings.length;
    if (m) row.stray = text.slice(Math.max(0, m.index - 60), m.index + 30);
  } catch (e) {
    row.outcome = /no PROJECT table/.test(e.message) ? "refused" : "crashed";
    row.error = e.message;
  }
  row.ms = Date.now() - t0;
  rows.push(row);
}
const count = (k) => rows.filter((r) => r.outcome === k).length;
const stray = rows.filter((r) => r.stray);
console.log(`${rows.length} distinct files: ${count("assessed")} assessed, ${count("refused")} refused with a reason, ${count("crashed")} crashed`);
console.log(`stray NaN/undefined/Infinity: ${stray.length} files; warnings: ${rows.reduce((a, r) => a + (r.warnings || 0), 0)} (most in one file ${Math.max(0, ...rows.map((r) => r.warnings || 0))})`);
for (const r of rows.filter((r) => r.outcome === "crashed")) console.log(`  CRASH ${r.file}: ${r.error}`);
for (const r of stray.slice(0, 10)) console.log(`  STRAY ${r.file}: ...${r.stray}...`);
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(rows, null, 1));
