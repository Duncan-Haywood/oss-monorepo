#!/usr/bin/env node
// Scores the checker on buildingSMART's IDS test pairs.
//
//   eval/fetch-testcases.sh            # sparse-clones github.com/buildingSMART/IDS
//   node eval/run-testcases.mjs [dir] [--verbose] [--only substring]
//
// Each pair is <expected>-<case>.ids / .ifc, expected pass, fail or invalid.
// "invalid" means the IDS or model is not valid; a checker must not report a
// pass, so it is scored like fail. The test files are CC BY-ND 4.0 and are not
// copied into this repository.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { check } from "../node.mjs";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const oi = args.indexOf("--only");
const only = oi >= 0 ? args[oi + 1] : null;
const dir = args.find((a, i) => !a.startsWith("--") && (oi < 0 || i !== oi + 1)) || new URL("./IDS/Documentation/ImplementersDocumentation/TestCases", import.meta.url).pathname;
if (!existsSync(dir)) {
  console.error(`no test cases at ${dir}; run eval/fetch-testcases.sh first`);
  process.exit(2);
}
const byFacet = {};
const wrong = [];
const strictWrong = [];
let total = 0;
let right = 0;
for (const facet of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  for (const f of readdirSync(join(dir, facet)).filter((f) => f.endsWith(".ids")).sort()) {
    const base = f.slice(0, -4);
    if (only && !(facet + "/" + base).includes(only)) continue;
    const expected = base.split("-")[0];
    const ifcPath = join(dir, facet, base + ".ifc");
    if (!existsSync(ifcPath)) continue;
    let got;
    let err = null;
    let report = null;
    try {
      report = check(readFileSync(join(dir, facet, f), "utf8"), readFileSync(ifcPath, "utf8"));
      got = report.pass ? "pass" : report.valid ? "fail" : "invalid";
    } catch (e) {
      got = "error";
      err = e.message;
    }
    const ok = expected === "pass" ? got === "pass" : got !== "pass";
    // Strict: an invalid-* IDS must be reported invalid, and no pass-*/fail-*
    // IDS may be (the audit must not cry wolf on valid files).
    const strictOk = expected === "invalid" ? got === "invalid" : got === expected;
    if (!strictOk) strictWrong.push({ facet, base, expected, got, report });
    const slot = (byFacet[facet] ||= { total: 0, right: 0 });
    slot.total++;
    total++;
    if (ok) { slot.right++; right++; }
    else wrong.push({ facet, base, expected, got, err, report });
  }
}
for (const [facet, s] of Object.entries(byFacet)) console.log(`${facet.padEnd(15)} ${String(s.right).padStart(3)} / ${s.total}`);
console.log(`${"total".padEnd(15)} ${String(right).padStart(3)} / ${total}`);
const inv = strictWrong.filter((w) => w.expected === "invalid").length;
const falseInv = strictWrong.filter((w) => w.expected !== "invalid" && w.got === "invalid").length;
console.log(`strict (invalid must read INVALID, pass/fail exact): ${total - strictWrong.length} / ${total}; invalid-* not flagged: ${inv}; valid IDS flagged invalid: ${falseInv}`);
if (verbose) for (const w of strictWrong) console.log(`STRICT ${w.facet}/${w.base}: expected ${w.expected}, got ${w.got}${w.report && w.report.audit.length ? " [" + w.report.audit.map((a) => a.level + ": " + a.message).join(" | ") + "]" : ""}`);
for (const w of wrong) {
  console.log(`WRONG ${w.facet}/${w.base}: expected ${w.expected}, got ${w.got}${w.err ? " (" + w.err + ")" : ""}`);
  if (verbose && w.report) for (const s of w.report.specs) console.log(`   ${s.status} applicable=${s.applicable} ${s.note || ""} ${s.failed.map((x) => x.reasons.join("; ")).join(" | ")}`);
}
process.exitCode = wrong.length ? 1 : 0;
