import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLAUSES, FINDING_KIND_LABEL, AUDIT_COVERAGE_MONTHS, review, summary, toMarkdown, toCsv, csvCell, carLink, blankChecklist, planProgramme, normalise, EXAMPLE } from "./audit.mjs";
import { SOURCE, parse, render } from "./iso-clauses-gen.mjs";

const TODAY = "2026-11-28";
const APP = readFileSync(new URL("../cmmc/apps/cmmc/src/shared/internal-audits.ts", import.meta.url), "utf8");
const msgs = (res, kind) => res.findings.filter((f) => !kind || f.kind === kind).map((f) => f.message);

test("iso-clauses.mjs is what iso-clauses-gen.mjs writes from the workspace's clause library", () => {
  const written = readFileSync(new URL("./iso-clauses.mjs", import.meta.url), "utf8");
  assert.equal(written, render(parse(readFileSync(SOURCE, "utf8"))), "run node iso-clauses-gen.mjs");
  assert.equal(CLAUSES.length, 47);
  assert.equal(CLAUSES[0].number, "4.1");
  assert.equal(CLAUSES.at(-1).number, "10.3");
  assert.deepEqual(CLAUSES.filter((c) => c.oftenExcluded).map((c) => c.number), ["8.3"]);
});

test("finding grades and the coverage window are the workspace Audits tab's", () => {
  const block = APP.slice(APP.indexOf("FINDING_KIND_LABEL: Record"), APP.indexOf("};", APP.indexOf("FINDING_KIND_LABEL: Record")));
  for (const [k, v] of Object.entries(FINDING_KIND_LABEL)) assert.match(block, new RegExp(`${k}: "${v}"`), k);
  assert.match(APP, new RegExp(`AUDIT_COVERAGE_MONTHS = ${AUDIT_COVERAGE_MONTHS};`));
});

test("a complete record raises no gap", () => {
  const rows = { "7.1.5": { result: "conforms", evidence: "Gauge list GL-01, 5 gauges sampled" }, "8.3": { result: "na", finding: "Build to print; scope statement QM-1 section 2" } };
  const res = review({ title: "A", auditor: "Pat", owners: "Lee", doneOn: "2026-11-01", scope: ["7.1.5", "8.3"], rows }, TODAY);
  assert.deepEqual(msgs(res, "gap"), []);
  assert.match(summary(res), /2 clauses in scope, 1 conform, 1 not applicable\. Nothing missing/);
  assert.equal(res.unaudited.length, 45, "8.3 marked N/A is not owed another audit");
});

test("the usual faults are each named", () => {
  const res = review(EXAMPLE, TODAY);
  const gaps = msgs(res, "gap").join("\n");
  assert.match(gaps, /8\.7 Control of nonconforming outputs: in scope with no result/);
  assert.match(gaps, /8\.6 [^:]+: a nonconformity needs the objective evidence/);
  assert.doesNotMatch(gaps, /7\.1\.5[^\n]*objective evidence/);
  assert.match(msgs(res, "note").join("\n"), /7\.2 Competence: conforms, but nothing written/);
  assert.deepEqual(res.findings.filter((f) => f.kind === "action").map((f) => f.clause), ["7.1.5", "8.6"], "observations open no corrective action");
  assert.doesNotMatch(gaps, /own work/, "the lead machinist owns what is audited; the auditor, Dana, is not on that list");
});

test("an auditor named among the owners or interviewed is flagged, case and spacing ignored", () => {
  const base = { scope: ["9.2"], rows: { "9.2": { result: "conforms", evidence: "Audit file 2026" } }, doneOn: "2026-11-01" };
  assert.match(msgs(review({ ...base, auditor: "Sam Ruiz", owners: "Lee, sam ruiz " }, TODAY), "gap").join(), /auditing their own work/);
  assert.match(msgs(review({ ...base, auditor: "Sam Ruiz", auditees: "Sam Ruiz" }, TODAY), "gap").join(), /auditing their own work/);
  assert.doesNotMatch(msgs(review({ ...base, auditor: "Sam Ruiz", owners: "Sam" }, TODAY), "gap").join(), /own work/);
});

test("no scope, no auditor, a future or bad date, N/A without a reason, a finding without words", () => {
  assert.match(msgs(review({}, TODAY), "gap").join(), /No clause is in scope.*No auditor/);
  assert.match(msgs(review({ auditor: "A", scope: ["4.1"], rows: { "4.1": { result: "conforms", evidence: "x" } }, doneOn: "2026-12-01" }, TODAY), "gap").join(), /after today/);
  assert.match(msgs(review({ auditor: "A", scope: ["4.1"], doneOn: "2026-02-30" }, TODAY), "gap").join(), /not a valid date/);
  const na = review({ auditor: "A", scope: ["7.1.5"], rows: { "7.1.5": { result: "na" } } }, TODAY);
  assert.match(msgs(na, "gap").join(), /not applicable with no reason/);
  assert.match(msgs(na, "note").join(), /not applicable is unusual/);
  assert.match(msgs(review({ auditor: "A", scope: ["9.3"], rows: { "9.3": { result: "observation" } } }, TODAY), "gap").join(), /observation with no description/);
});

test("normalise keeps the standard's order, drops unknown clauses, results and prototype keys", () => {
  const r = normalise({ scope: ["10.3", "4.1", "99.9", "constructor"], rows: { "4.1": { result: "toString" }, "10.3": { result: "minor" } } });
  assert.deepEqual(r.scope, ["4.1", "10.3"]);
  assert.equal(r.rows["4.1"].result, "");
  assert.equal(r.rows["10.3"].result, "minor");
});

test("planProgramme covers every clause once, in order, evenly", () => {
  for (const n of [1, 2, 3, 4, 6, 12]) {
    const plan = planProgramme(n);
    assert.equal(plan.length, n);
    assert.deepEqual(plan.flat(), CLAUSES.map((c) => c.number));
    const sizes = plan.map((a) => a.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n}: ${sizes}`);
  }
  const noDesign = planProgramme(4, ["8.3"]);
  assert.equal(noDesign.flat().length, 46);
  assert.ok(!noDesign.flat().includes("8.3"));
  assert.equal(planProgramme(500).length, 12);
  assert.equal(planProgramme("x").length, 1);
});

test("Markdown escapes what was typed and cites no ISO text; CSV guards formulas", () => {
  const evil = { title: "<img src=x onerror=1>", auditor: "=HYPERLINK(\"x\")", scope: ["4.1"], rows: { "4.1": { result: "minor", evidence: "@SUM(A1)", finding: "a | b\nc" } }, doneOn: "2026-11-01" };
  const res = review(evil, TODAY);
  const md = toMarkdown(res);
  assert.doesNotMatch(md, /(^|[^\\])<img/);
  assert.match(md, /\| 4\.1 \| Understanding the organization and its context \| Minor nonconformity \| @SUM\(A1\) \|/);
  assert.match(md, /a \\\| b c/);
  assert.match(md, /Not a certification audit/);
  const csv = toCsv(res);
  assert.match(csv, /^Audit,Done on,Auditor,Clause,Heading,Result,Evidence seen,Finding or reason\r\n/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /'@SUM\(A1\)/);
  assert.equal(csvCell("-5"), "-5");
});

test("carLink hands the nonconformity to the corrective action page in the fragment", () => {
  const res = review(EXAMPLE, TODAY);
  const link = carLink(res, "7.1.5");
  assert.match(link, /^corrective-action-report\.html#/);
  const p = new URLSearchParams(link.split("#")[1]);
  assert.equal(p.get("source"), "internal_audit");
  assert.equal(p.get("clause"), "7.1.5");
  assert.equal(p.get("raisedOn"), "2026-09-18");
  assert.match(p.get("nonconformity"), /Mic #14[\s\S]*Evidence: Gauge list[\s\S]*Q3 audit/);
  const car = readFileSync(new URL("./corrective-action-report.html", import.meta.url), "utf8");
  assert.match(car, /new URLSearchParams\(location\.hash\.slice\(1\)\)/);
  assert.match(car, /<option value="">—<\/option>/);
  const { SOURCES } = await_import_car();
  assert.ok(Object.hasOwn(SOURCES, "internal_audit"));
});

function await_import_car() {
  // car.mjs is plain data at the top; read SOURCES' keys from its text to keep this test synchronous.
  const src = readFileSync(new URL("./car.mjs", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("export const SOURCES = {"), src.indexOf("};", src.indexOf("export const SOURCES = {")));
  return { SOURCES: Object.fromEntries([...block.matchAll(/(\w+): "/g)].map((m) => [m[1], true])) };
}

test("blank checklist lists the clauses with what to look for, grouped by section", () => {
  const md = blankChecklist(["8.6", "4.1"]);
  assert.match(md, /## 4 Context of the organization[\s\S]*### 4\.1 [\s\S]*Look for: [\s\S]*## 8 Operation[\s\S]*### 8\.6 /);
  assert.equal((blankChecklist(CLAUSES.map((c) => c.number)).match(/^### /gm) || []).length, 47);
});

test("the page builds its DOM from text and sends nothing", () => {
  const html = readFileSync(new URL("./iso-9001-internal-audit-checklist.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/);
  assert.match(html, /never the requirement text/);
  assert.match(html, /recordUsage\("audit-check"\)/);
});
