import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { review, stage, normalise, summary, toMarkdown, toCsv, csvCell, CSV_HEAD, EXAMPLE, SOURCES, STAGE_LABEL, VERIFY_AFTER_DAYS } from "./car.mjs";

const TODAY = "2026-11-28";
const has = (res, field, kind) => res.findings.some((f) => f.field === field && (!kind || f.kind === kind));

const GOOD = {
  ref: "CA-0001", raisedOn: "2026-08-01", source: "process", clause: "10.2", partNumber: "P-1 rev A", quantity: "12",
  nonconformity: "12 shafts turned to Ø.4985, drawing calls .5000 ±.0005: undersize by .001.",
  containment: "Held the lot, measured all 60, scrapped 12, released 48 with the inspection record.",
  whys: "Shafts undersize\nTool offset entered as .001 instead of .0001\nOffset typed by hand from a paper note",
  rootCause: "Wear offsets are typed by hand with no second check, so a misplaced decimal reaches the part.",
  elsewhere: "Checked the other two lathes: same hand entry. Included in the action.",
  action: "Added in-process probing after the finish pass on all three lathes, and the setup sheet now requires a first-piece check after any offset change.",
  documents: "Setup sheet SS-04 rev D; control plan CP-12 rev B",
  owner: "Lead machinist", dueOn: "2026-09-01", completedOn: "2026-08-20", verifyDueOn: "2026-11-18",
  verifiedOn: "2026-11-18", effective: "yes", verificationNotes: "Reviewed 14 lots since the change: no undersize shafts, probe logs attached.",
  closedOn: "2026-11-18",
};

test("CSV header is the CMMC Workspace corrective-action log's header, column for column", () => {
  const src = readFileSync(new URL("../cmmc/apps/cmmc/src/shared/internal-audits.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function correctiveActionLogCsv"));
  const head = fn.slice(fn.indexOf("const head = ["), fn.indexOf("];", fn.indexOf("const head = [")));
  const cols = [...head.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(cols, CSV_HEAD);
});

test("sources and stages match the workspace's labels", () => {
  const src = readFileSync(new URL("../cmmc/apps/cmmc/src/shared/internal-audits.ts", import.meta.url), "utf8");
  for (const [k, v] of Object.entries(SOURCES)) assert.ok(src.includes(`${k}: "${v}"`), k);
  for (const [k, v] of Object.entries(STAGE_LABEL)) assert.ok(src.includes(`${k}: "${v}"`), k);
  assert.match(src, new RegExp(`addDays\\(completedOn, ${VERIFY_AFTER_DAYS}\\)`));
});

test("a complete, closed report raises nothing", () => {
  const res = review(GOOD, TODAY);
  assert.equal(res.stage, "closed");
  assert.deepEqual(res.findings, []);
  assert.match(summary(res), /Nothing an auditor would obviously send back/);
});

test("stage follows what is filled in", () => {
  const n = (o) => stage(normalise({ ...GOOD, ...o }));
  assert.equal(n({}), "closed");
  assert.equal(n({ closedOn: "" }), "verify");
  assert.equal(n({ closedOn: "", completedOn: "" }), "action");
  assert.equal(n({ closedOn: "", rootCause: "" }), "cause");
  assert.equal(n({ closedOn: "", effective: "no" }), "not_effective");
});

test("the invented example trips the usual faults", () => {
  const res = review(EXAMPLE, TODAY);
  assert.equal(res.stage, "verify");
  assert.ok(has(res, "rootCause", "note"), "blame");
  assert.ok(has(res, "action", "note"), "training only");
  assert.ok(has(res, "elsewhere", "note"));
  assert.ok(has(res, "documents", "note"));
  const v = res.findings.find((f) => f.field === "verifyDueOn");
  assert.match(v.message, /2027-02-08/);
  assert.ok(!res.findings.some((f) => f.kind === "gap"), JSON.stringify(res.findings));
});

test("blame wording is caught; a process cause is not", () => {
  for (const rc of ["Human error", "Operator error", "Machinist forgot to check", "Did not follow the procedure", "Carelessness", "Employee didn't follow instructions"]) {
    assert.ok(has(review({ ...GOOD, rootCause: rc }, TODAY), "rootCause", "note"), rc);
  }
  assert.ok(!has(review(GOOD, TODAY), "rootCause"));
  assert.ok(!has(review({ ...GOOD, rootCause: "The fixture lets the part seat 180° out with no stop." }, TODAY), "rootCause"));
});

test("training-only actions are flagged, training plus a change is not", () => {
  assert.ok(has(review({ ...GOOD, action: "Retrained the operator on the inspection procedure." }, TODAY), "action", "note"));
  assert.ok(has(review({ ...GOOD, action: "Reminded all inspectors to be more careful." }, TODAY), "action", "note"));
  assert.ok(!has(review({ ...GOOD, action: "Revised work instruction WI-3 to add a go/no-go check, and trained both shifts on it." }, TODAY), "action"));
});

test("correction copied into the action, and a cause that restates the problem", () => {
  assert.ok(has(review({ ...GOOD, action: GOOD.containment }, TODAY), "action", "gap"));
  assert.ok(has(review({ ...GOOD, rootCause: GOOD.nonconformity }, TODAY), "rootCause", "gap"));
  assert.ok(has(review({ ...GOOD, action: "TBD", closedOn: "", verifiedOn: "", effective: "", completedOn: "" }, TODAY), "action", "gap"));
});

test("missing pieces are gaps", () => {
  const res = review({ raisedOn: "2026-11-20" }, TODAY);
  for (const f of ["nonconformity", "containment", "rootCause"]) assert.ok(has(res, f, "gap"), f);
  assert.ok(has(res, "ref", "note"));
  assert.ok(has(res, "dueOn", "note"));
  assert.ok(has(review({ ...GOOD, rootCause: "", closedOn: "", verifiedOn: "", effective: "" }, TODAY), "rootCause", "gap"));
});

test("dates: order, the future, overdue and due soon", () => {
  assert.ok(has(review({ ...GOOD, raisedOn: "2026-12-30" }, TODAY), "raisedOn", "gap"));
  assert.ok(has(review({ ...GOOD, raisedOn: "2026-02-30" }, TODAY), "raisedOn", "gap"));
  assert.ok(has(review({ ...GOOD, completedOn: "2026-07-01" }, TODAY), "completedOn", "gap"));
  assert.ok(has(review({ ...GOOD, verifiedOn: "2026-08-10" }, TODAY), "verifiedOn", "gap"));
  const open = { ...GOOD, completedOn: "", verifyDueOn: "", verifiedOn: "", effective: "", verificationNotes: "", closedOn: "" };
  assert.ok(has(review({ ...open, dueOn: "2026-11-01" }, TODAY), "dueOn", "gap"));
  assert.ok(has(review({ ...open, dueOn: "2026-12-05" }, TODAY), "dueOn", "soon"));
  assert.ok(!has(review({ ...open, dueOn: "2027-01-30" }, TODAY), "dueOn"));
  const verify = { ...GOOD, verifiedOn: "", effective: "", verificationNotes: "", closedOn: "" };
  assert.ok(has(review({ ...verify, verifyDueOn: "2026-11-01" }, TODAY), "verifyDueOn", "gap"));
  assert.ok(has(review({ ...verify, verifyDueOn: "2026-12-01" }, TODAY), "verifyDueOn", "soon"));
});

test("effectiveness: not effective, no notes, closed without a check", () => {
  const ne = review({ ...GOOD, effective: "no", closedOn: "" }, TODAY);
  assert.equal(ne.stage, "not_effective");
  assert.ok(has(ne, "effective", "gap"));
  assert.ok(has(review({ ...GOOD, verificationNotes: "" }, TODAY), "verificationNotes", "gap"));
  assert.ok(has(review({ ...GOOD, effective: "", verifiedOn: "" }, TODAY), "closedOn", "gap"));
  assert.ok(has(review({ ...GOOD, effective: "" }, TODAY), "effective", "gap"));
});

test("CSV: workspace columns, formula cells neutralised, whys kept", () => {
  const csv = toCsv(review({ ...GOOD, nonconformity: "=HYPERLINK(\"x\")", owner: "+cmd" }, TODAY));
  const [head] = csv.split("\r\n");
  assert.equal(head, CSV_HEAD.join(","));
  assert.match(csv, /"'=HYPERLINK\(""x""\)/);
  assert.match(csv, /,'\+cmd,/);
  assert.match(csv, /Why 1: Shafts undersize/);
  assert.equal(csvCell("-5"), "-5");
  assert.equal(csvCell("-x"), "'-x");
});

test("Markdown escapes what it is given and lists open points", () => {
  const out = toMarkdown(review({ ...EXAMPLE, nonconformity: "<script>alert(1)</script> *bold*" }, TODAY));
  assert.ok(!out.toLowerCase().includes("<script>"), "raw tag survived");
  assert.ok(out.includes("\\<script\\>"), "tag escaped");
  assert.match(out, /\\\*bold\\\*/);
  assert.match(out, /## Open points/);
  assert.match(out, /1\. Why\? Bore was undersize/);
});

test("the page builds the DOM from text and keeps nothing", () => {
  const html = readFileSync(new URL("./corrective-action-report.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /localStorage|setItem\(|fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /import \{[^}]*review[^}]*\} from "\.\/car\.mjs"/);
  assert.match(html, /recordUsage\("car-check"\)/);
  assert.match(html, /pattern/i);
});
