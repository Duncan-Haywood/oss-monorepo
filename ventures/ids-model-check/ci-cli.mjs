#!/usr/bin/env node
// ids-model-check for CI: check every model matching a glob against every IDS
// matching another, and write what a build server reads.
//
//   node ci-cli.mjs --models "models/**/*.ifc" --ids "requirements/*.ids"
//       [--pairing all|name] [--junit report.xml] [--summary summary.md]
//       [--bcf-dir bcf/] [--json results.json] [--annotations] [--fail-on error|warning|never]
//       [--root DIR]
//
// Globs are matched under --root (default: the current directory), skipping
// .git and node_modules. Inside GitHub Actions (GITHUB_ACTIONS=true) it also
// prints workflow annotations, appends the summary to GITHUB_STEP_SUMMARY and
// writes counts to GITHUB_OUTPUT. Exit 0 when the build should pass, 1 when
// it should fail (per --fail-on), 2 on a usage error or when no file matched.
// Nothing leaves the machine.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { check, readModel } from "./node.mjs";
import { bcfZip } from "./bcf.mjs";
import { junitXml, annotations, stepSummary, tally, globToRegex, patterns, pairUp, stepLines } from "./ci.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const usage = () => { console.error('usage: node ci-cli.mjs --models "GLOB[,GLOB]" --ids "GLOB[,GLOB]" [--pairing all|name] [--junit FILE] [--summary FILE] [--bcf-dir DIR] [--json FILE] [--annotations] [--fail-on error|warning|never] [--root DIR]'); process.exit(2); };
if (flag("--help") || !opt("--models") || !opt("--ids")) usage();
const failOn = opt("--fail-on", "error");
if (!["error", "warning", "never"].includes(failOn)) usage();
const pairing = opt("--pairing", "all");
if (!["all", "name"].includes(pairing)) usage();
const root = opt("--root", ".");
const gha = process.env.GITHUB_ACTIONS === "true";

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
    else if (e.isSymbolicLink()) { try { if (statSync(p).isFile()) out.push(p); } catch { /* dangling link */ } } // linked files yes, linked dirs no (no loops)
  }
  return out;
}
let all;
try { all = walk(root).map((p) => relative(root, p).split(sep).join("/")).sort(); } catch (e) { console.error(`error: ${e.message}`); process.exit(2); }
const match = (input) => { const res = patterns(input).map(globToRegex); return all.filter((p) => res.some((r) => r.test(p))); };
const models = match(opt("--models"));
const idsFiles = match(opt("--ids")).filter((p) => !models.includes(p));
if (!models.length || !idsFiles.length) {
  console.error(`error: ${!models.length ? `no model matched "${opt("--models")}"` : `no IDS matched "${opt("--ids")}"`} under ${root}`);
  process.exit(2);
}

const runs = [];
const lines = new Map();
const idsText = new Map();
for (const { model, ids } of pairUp(models, idsFiles, pairing)) {
  try {
    if (!idsText.has(ids)) idsText.set(ids, readFileSync(join(root, ids), "utf8"));
    const t0 = Date.now();
    const m = await readModel(join(root, model));
    const report = check(idsText.get(ids), m.text);
    report.seconds = (Date.now() - t0) / 1000;
    const failedIds = report.specs.flatMap((s) => s.failed.slice(0, 1).map((f) => f.id));
    const known = lines.get(model) || new Map();
    if (/\.ifc$/i.test(model)) for (const [k, v] of stepLines(m.text, failedIds.filter((id) => !known.has(id)))) known.set(k, v);
    lines.set(model, known);
    runs.push({ model, ids, report });
  } catch (e) {
    runs.push({ model, ids, error: e.message });
  }
}

const t = tally(runs);
for (const r of runs) {
  if (r.error) console.log(`ERROR ${r.model} vs ${r.ids}: ${r.error}`);
  else console.log(`${tally([r]).ok ? "PASS " : "FAIL "} ${r.model} vs ${r.ids}: ${r.report.specs.filter((s) => s.status === "pass").length} of ${r.report.specs.length} specifications pass`);
}
console.log(`${t.ok ? "PASS" : "FAIL"}: ${t.pairs} pair(s), ${t.passed} pass, ${t.failed} fail, ${t.warnings} optional warning(s), ${t.invalid} invalid, ${t.unreadable} unreadable`);

const write = (f, s) => { mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, s); };
if (opt("--junit")) write(opt("--junit"), junitXml(runs));
if (opt("--json")) write(opt("--json"), JSON.stringify({ tally: t, runs }, null, 2));
const summary = stepSummary(runs);
if (opt("--summary")) write(opt("--summary"), summary);
if (opt("--bcf-dir")) {
  mkdirSync(opt("--bcf-dir"), { recursive: true });
  for (const r of runs) {
    if (r.error || r.report.pass) continue;
    const name = `${r.model}--${r.ids}`.replace(/[^A-Za-z0-9._-]+/g, "_") + ".bcfzip";
    writeFileSync(join(opt("--bcf-dir"), name), bcfZip(r.report, { modelName: r.model.split("/").pop() }));
  }
}
if (gha || flag("--annotations")) for (const a of annotations(runs, { lines })) console.log(a);
if (gha && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (gha && process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries({ result: t.ok ? "pass" : "fail", pairs: t.pairs, specs: t.specs, passed: t.passed, failed: t.failed, warnings: t.warnings, invalid: t.invalid, unreadable: t.unreadable, "elements-failed": t.elementsFailed }).map(([k, v]) => `${k}=${v}\n`).join(""));
}
const bad = failOn === "never" ? false : failOn === "warning" ? !t.ok || t.warnings > 0 : !t.ok;
process.exitCode = bad ? 1 : 0;
