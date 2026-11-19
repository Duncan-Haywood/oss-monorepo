#!/usr/bin/env node
// ids-model-check for CI: check every model matching a glob against every IDS
// matching another, and write what a build server reads.
//
//   node ci-cli.mjs --models "models/**/*.ifc" --ids "requirements/*.ids"
//       [--pairing all|name] [--junit report.xml] [--summary summary.md]
//       [--bcf-dir bcf/] [--json results.json] [--annotations] [--fail-on error|warning|never]
//       [--root DIR] [--max-failures N] [--fail-on-unchecked] [--fail-on-audit-warnings]
//       [--gitlab-codequality gl-code-quality-report.json] [--gitlab-max-per-spec N]
//       [--fail-on-duplicate-globalids] [--fail-on-shared-globalids]
//       [--shared-globalids-allow FILE]
//
// Globs are matched under --root (default: the current directory), skipping
// .git and node_modules. Inside GitHub Actions (GITHUB_ACTIONS=true) it also
// prints workflow annotations, appends the summary to GITHUB_STEP_SUMMARY and
// writes counts to GITHUB_OUTPUT. Exit 0 when the build should pass, 1 when
// it should fail (per --fail-on, and --fail-on-unchecked: an entity facet
// naming IFCWALL left IfcWallStandardCase elements unchecked; and
// --fail-on-audit-warnings: the IDS audit warns that a specification probably
// does not check what was meant, e.g. it names an abstract class; and
// --fail-on-duplicate-globalids: two elements of a model share a GlobalId;
// and --fail-on-shared-globalids: with two or more models, a GlobalId one
// model's element holds is also in another model, or two models are one model
// twice; --shared-globalids-allow FILE lists GlobalIds or classes a team
// shares between models on purpose, which then count with the types and
// relationships that follow them), 2 on a usage error, a bad allow-list line
// or when no file matched.
// Each specification's report keeps its first --max-failures failing elements
// (default 1000; counts stay exact) so one spec matching every entity of a
// large export cannot run Node out of memory. --gitlab-codequality writes a
// GitLab Code Quality report: one issue per failing element (every listed one,
// --max-failures, or --gitlab-max-per-spec N) keyed on its GlobalId, so a merge request's widget says which
// elements it broke or fixed. Nothing leaves the machine.
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep, isAbsolute } from "node:path";
import { check, readModel, parseModel, parseIds } from "./node.mjs";
import { globalIdIndex } from "./ids.mjs";
import { bcfZip } from "./bcf.mjs";
import { junitXml, annotations, codeQuality, cqElements, stepSummary, tally, notChecked, auditFindings, modelFindings, dupLine, crossModelGlobalIds, parseSharedAllow, sharedLine, revisionLine, sharedCount, idsSpecLines, globToRegex, patterns, pairUp, stepLines } from "./ci.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const usage = () => { console.error('usage: node ci-cli.mjs --models "GLOB[,GLOB]" --ids "GLOB[,GLOB]" [--pairing all|name] [--junit FILE] [--summary FILE] [--bcf-dir DIR] [--json FILE] [--annotations] [--fail-on error|warning|never] [--root DIR] [--max-failures N] [--fail-on-unchecked] [--fail-on-audit-warnings] [--gitlab-codequality FILE] [--gitlab-max-per-spec N] [--fail-on-duplicate-globalids] [--fail-on-shared-globalids] [--shared-globalids-allow FILE]'); process.exit(2); };
if (flag("--help") || !opt("--models") || !opt("--ids")) usage();
const failOn = opt("--fail-on", "error");
if (!["error", "warning", "never"].includes(failOn)) usage();
const pairing = opt("--pairing", "all");
if (!["all", "name"].includes(pairing)) usage();
const root = opt("--root", ".");
const maxFailed = Number(opt("--max-failures", "1000"));
if (!Number.isInteger(maxFailed) || maxFailed < 1) usage();
const gha = process.env.GITHUB_ACTIONS === "true";
const failOnUnchecked = flag("--fail-on-unchecked");
const failOnAudit = flag("--fail-on-audit-warnings");
const failOnDuplicates = flag("--fail-on-duplicate-globalids");
const failOnShared = flag("--fail-on-shared-globalids");
// A team's list of GlobalIds or classes shared between models on purpose
// (ci.mjs parseSharedAllow); a bad line stops the run rather than being skipped.
let sharedAllow = null;
if (opt("--shared-globalids-allow")) {
  try { sharedAllow = parseSharedAllow(readFileSync(isAbsolute(opt("--shared-globalids-allow")) ? opt("--shared-globalids-allow") : join(opt("--root", "."), opt("--shared-globalids-allow")), "utf8")); }
  catch (e) { console.error(`--shared-globalids-allow: ${e.message}`); process.exit(2); }
  if (sharedAllow.errors.length) { console.error(`--shared-globalids-allow ${opt("--shared-globalids-allow")}:\n  ${sharedAllow.errors.join("\n  ")}`); process.exit(2); }
}
const gitlab = opt("--gitlab-codequality");
const cqPerSpec = Number(opt("--gitlab-max-per-spec", String(maxFailed))); // GitLab issues per failing specification; the rest are one "N more" issue
if (!Number.isInteger(cqPerSpec) || cqPerSpec < 1) usage();

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

// Each model is read and parsed once and each IDS parsed once, however many
// pairs they are in (pairUp yields a model's pairs together, so only one
// parsed model is held at a time). The first pair of a model carries the read
// and parse time in its report.seconds, so the JUnit times sum to the run.
const runs = [];
const lines = new Map();
const idsParsed = new Map();
const idsLines = new Map(); // IDS file -> line of each <specification>, for annotations
const idsOf = (ids) => {
  if (!idsParsed.has(ids)) {
    try {
      const text = readFileSync(join(root, ids), "utf8");
      idsParsed.set(ids, { ids: parseIds(text) });
      idsLines.set(ids, idsSpecLines(text));
    } catch (e) { idsParsed.set(ids, { error: e.message }); }
  }
  const r = idsParsed.get(ids);
  if (r.error) throw new Error(r.error);
  return r.ids;
};
let current = { model: null };
const gidIndexes = []; // one GlobalId index per model read, for crossModelGlobalIds
for (const { model, ids } of pairUp(models, idsFiles, pairing)) {
  try {
    let t0 = Date.now();
    if (current.model !== model) {
      current = { model };
      try {
        const m = await readModel(join(root, model));
        current.text = /\.ifc$/i.test(model) ? m.bytes : null;
        current.parsed = parseModel(m.bytes);
        gidIndexes.push({ model, index: globalIdIndex(current.parsed) });
      } catch (e) { current.error = e.message; }
    } else t0 = null;
    if (current.error) throw new Error(current.error);
    const t1 = Date.now();
    const report = check(idsOf(ids), current.parsed, { maxFailed });
    report.seconds = (Date.now() - (t0 ?? t1)) / 1000;
    const failedIds = report.specs.flatMap((s) => [...s.failed.slice(0, 1), ...(gitlab ? cqElements(s, cqPerSpec) : [])].map((f) => f.id));
    for (const d of report.duplicateGlobalIds || []) failedIds.push(d.elements[1].id);
    const known = lines.get(model) || new Map();
    if (current.text) for (const [k, v] of stepLines(current.text, failedIds.filter((id) => !known.has(id)))) known.set(k, v);
    lines.set(model, known);
    runs.push({ model, ids, report });
  } catch (e) {
    runs.push({ model, ids, error: e.message });
  }
}

// GlobalIds shared between the models of the run (a federated set). The
// lines of the elements named are read afterwards, from the models involved
// only, since one parsed model is held at a time above.
const federation = crossModelGlobalIds(gidIndexes, { allow: sharedAllow });
{
  const want = new Map();
  for (const c of federation.conflicts) for (const h of c.holders) if (/\.ifc$/i.test(h.model) && !lines.get(h.model)?.has(h.id)) want.set(h.model, [...(want.get(h.model) || []), h.id]);
  for (const [model, ids] of want) {
    try {
      const known = lines.get(model) || new Map();
      for (const [k, v] of stepLines(readFileSync(join(root, model)), ids)) known.set(k, v);
      lines.set(model, known);
    } catch { /* no line: the annotation names the file only */ }
  }
}
const t = tally(runs, federation);
for (const r of runs) {
  if (r.error) console.log(`ERROR ${r.model} vs ${r.ids}: ${r.error}`);
  else console.log(`${tally([r]).ok ? "PASS " : "FAIL "} ${r.model} vs ${r.ids}: ${r.report.specs.filter((s) => s.status === "pass").length} of ${r.report.specs.length} specifications pass`);
}
for (const r of runs) for (const s of r.error ? [] : r.report.specs) if (s.hint && notChecked(s)) console.log(`  warning: "${s.name}" (${r.model} vs ${r.ids}): ${s.hint}`);
for (const a of auditFindings(runs)) for (const w of a.warnings) console.log(`  IDS audit warning: "${a.name}" (${a.ids}): ${w}`);
for (const m of modelFindings(runs)) for (const d of m.duplicates) console.log(`  model warning: ${m.model}: duplicate GlobalId ${dupLine(d)}`);
for (const p of federation.revisions) console.log(`  federation warning: ${revisionLine(p)}`);
for (const c of federation.conflicts) console.log(`  federation warning: shared GlobalId ${sharedLine(c)}`);
if (federation.allowed.length) console.log(`  note: ${federation.allowed.length} shared GlobalId(s) allowed by ${opt("--shared-globalids-allow")}${federation.allowed.some((c) => c.with?.length) ? `, with ${federation.allowed.reduce((n, c) => n + (c.with?.length || 0), 0)} type(s) and relationship(s) that follow them` : ""}`);
for (const u of federation.allowUnused) console.log(`  note: allow rule on line ${u.line} (${u.rule}) matched nothing shared in this run`);
if (federation.frame.length) console.log(`  note: ${federation.frame.length} project/site/building/storey/space/grid GlobalId(s) are the same in more than one model (usually intended)`);
// The check's result; --fail-on decides only the exit code, as before.
const ok = t.ok && !(failOnUnchecked && t.elementsNotChecked > 0) && !(failOnAudit && t.auditWarnings > 0) && !(failOnDuplicates && t.duplicateGlobalIds > 0) && !(failOnShared && sharedCount(federation) > 0);
const bad = failOn === "never" ? false : failOn === "warning" ? !ok || t.warnings > 0 : !ok;
console.log(`${ok ? "PASS" : "FAIL"}: ${t.pairs} pair(s), ${t.passed} pass, ${t.failed} fail, ${t.warnings} optional warning(s), ${t.invalid} invalid, ${t.unreadable} unreadable${t.elementsNotChecked ? `, ${t.elementsNotChecked} element(s) not checked (unnamed subclasses${failOnUnchecked ? ", --fail-on-unchecked" : ""})` : ""}${t.auditWarnings ? `, ${t.auditWarnings} IDS audit warning(s)${failOnAudit ? " (--fail-on-audit-warnings)" : ""}` : ""}${t.duplicateGlobalIds ? `, ${t.duplicateGlobalIds} duplicate GlobalId(s) in ${t.duplicateModels} model(s)${failOnDuplicates ? " (--fail-on-duplicate-globalids)" : ""}` : ""}${t.sharedGlobalIds ? `, ${t.sharedGlobalIds} GlobalId(s) shared between models${failOnShared ? " (--fail-on-shared-globalids)" : ""}` : ""}${t.revisionPairs ? `, ${t.revisionPairs} pair(s) of models that are one model twice` : ""}`);

const write = (f, s) => { mkdirSync(join(f, ".."), { recursive: true }); writeFileSync(f, s); };
if (opt("--junit")) write(opt("--junit"), junitXml(runs));
if (gitlab) {
  // GitLab reads paths from the repository root (the job's working directory).
  const rel = relative(process.cwd(), resolve(root)).split(sep).join("/");
  const pathPrefix = rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : "";
  write(gitlab, JSON.stringify(codeQuality(runs, { lines, idsLines, failOnUnchecked, failOnAudit, failOnDuplicates, maxPerSpec: cqPerSpec, pathPrefix, federation, failOnShared }), null, 2) + "\n");
}
if (opt("--json")) write(opt("--json"), JSON.stringify({ tally: t, runs, federation }, null, 2));
const summary = stepSummary(runs, { failOnUnchecked, failOnAudit, failOnDuplicates, federation, failOnShared });
if (opt("--summary")) write(opt("--summary"), summary);
if (opt("--bcf-dir")) {
  mkdirSync(opt("--bcf-dir"), { recursive: true });
  for (const r of runs) {
    if (r.error || r.report.pass) continue;
    const name = `${r.model}--${r.ids}`.replace(/[^A-Za-z0-9._-]+/g, "_") + ".bcfzip";
    writeFileSync(join(opt("--bcf-dir"), name), bcfZip(r.report, { modelName: r.model.split("/").pop() }));
  }
}
if (gha || flag("--annotations")) for (const a of annotations(runs, { lines, idsLines, failOnUnchecked, failOnAudit, failOnDuplicates, federation, failOnShared })) console.log(a);
if (gha && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (gha && process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries({ result: ok ? "pass" : "fail", pairs: t.pairs, specs: t.specs, passed: t.passed, failed: t.failed, warnings: t.warnings, invalid: t.invalid, unreadable: t.unreadable, "elements-failed": t.elementsFailed, "not-checked": t.elementsNotChecked, "audit-warnings": t.auditWarnings, "duplicate-globalids": t.duplicateGlobalIds, "shared-globalids": t.sharedGlobalIds + t.revisionPairs }).map(([k, v]) => `${k}=${v}\n`).join(""));
}
process.exitCode = bad ? 1 : 0;
