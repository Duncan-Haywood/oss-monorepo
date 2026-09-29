import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeBill, analyze, codeKind, requestLetter, summaryText, reportCsv, sampleCsv, detectDelimiter, decodeBuffer, money } from "./calc.mjs";

const run = (csv, opts) => {
  const n = normalizeBill(parseCsv(csv, detectDelimiter(csv)));
  assert.ok(!n.error, n.error);
  return { n, a: analyze(n.records, opts) };
};
const H = "Date of Service,CPT,Description,Qty,Charge\n";

test("csv parser handles quotes, CRLF and BOM", () => {
  const p = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(p.rows, [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("decodeBuffer honours UTF-16 and BOM", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), "a");
  assert.equal(decodeBuffer(new Uint8Array([0xff, 0xfe, 0x61, 0x00])), "a");
});

test("money formats with thousands separators", () => assert.equal(money(1234.5), "1,234.50"));

test("codeKind classifies CPT, HCPCS, revenue and other", () => {
  assert.equal(codeKind("99284"), "cpt");
  assert.equal(codeKind("J1885"), "hcpcs");
  assert.equal(codeKind("0250"), "revenue");
  assert.equal(codeKind(""), "none");
  assert.equal(codeKind("ABC"), "other");
});

test("missing charge column is an error naming the header", () => {
  const n = normalizeBill(parseCsv("Date,CPT,Description\n1/1/26,99213,Visit\n"));
  assert.match(n.error, /charge column/i);
});

test("needs a header and a row", () => assert.match(normalizeBill(parseCsv("a,b\n")).error, /header row/));

test("total rows and blank charges are skipped with a reason", () => {
  const { n } = run(H + "3/1/26,99213,Visit,1,100\n,,Total,,100\n3/1/26,,Note,,\n");
  assert.equal(n.records.length, 1);
  assert.equal(n.skipped.length, 2);
});

test("parenthesised and dollar amounts parse; text amounts are skipped", () => {
  const { n } = run(H + '3/1/26,99213,Visit,1,"$1,100.50"\n3/1/26,36415,Credit,1,(45.00)\n3/1/26,85025,Bad,1,abc\n');
  assert.equal(n.records[0].charge, 1100.5);
  assert.equal(n.records[1].charge, -45);
  assert.equal(n.skipped.length, 1);
});

test("identical lines are flagged as a possible duplicate with the repeat amount", () => {
  const { a } = run(H + "3/1/26,71046,Chest xray,1,500\n3/1/26,71046,Chest xray,1,500\n3/1/26,71046,Chest xray,1,500\n");
  const f = a.findings.find((x) => x.kind === "duplicate");
  assert.ok(f);
  assert.equal(f.amount, 1000);
  assert.equal(f.severity, "high");
});

test("same code on different dates is not a duplicate", () => {
  const { a } = run(H + "3/1/26,71046,Chest xray,1,500\n3/2/26,71046,Chest xray,1,500\n");
  assert.equal(a.findings.filter((x) => x.kind === "duplicate").length, 0);
});

test("a once-a-day code billed twice with different charges is a quantity question", () => {
  const { a } = run(H + "3/1/26,99213,Visit,1,200\n3/1/26,99213,Visit follow,1,150\n");
  const f = a.findings.find((x) => x.kind === "quantity");
  assert.ok(f);
  assert.equal(f.amount, 200);
});

test("quantity 2 on a once-a-day code is flagged; not double-reported with duplicates", () => {
  const { a } = run(H + "3/1/26,36415,Venipuncture,2,90\n");
  assert.equal(a.findings.filter((x) => x.kind === "quantity").length, 1);
  const d = run(H + "3/1/26,36415,Venipuncture,1,45\n3/1/26,36415,Venipuncture,1,45\n").a;
  assert.equal(d.findings.filter((x) => x.kind === "quantity").length, 0);
  assert.equal(d.findings.filter((x) => x.kind === "duplicate").length, 1);
});

test("large unit counts on other codes are info only, never in the questioned total", () => {
  const { a } = run(H + "3/1/26,J1885,Drug,12,120\n");
  assert.equal(a.findings[0].severity, "info");
  assert.equal(a.summary.questioned, 0);
});

test("components billed with their panel are unbundling; amount is the components", () => {
  const { a } = run(H + "3/1/26,80053,CMP,1,300\n3/1/26,82947,Glucose,1,80\n3/1/26,84520,BUN,1,70\n");
  const f = a.findings.find((x) => x.kind === "unbundling");
  assert.equal(f.amount, 150);
  assert.match(f.title, /82947, 84520 billed with 80053/);
});

test("components without the panel are not flagged", () => {
  const { a } = run(H + "3/1/26,82947,Glucose,1,80\n3/1/26,84520,BUN,1,70\n");
  assert.equal(a.findings.length, 0);
});

test("components on a different date than the panel are not flagged", () => {
  const { a } = run(H + "3/1/26,80053,CMP,1,300\n3/2/26,82947,Glucose,1,80\n");
  assert.equal(a.findings.filter((x) => x.kind === "unbundling").length, 0);
});

test("a distinct-service modifier downgrades unbundling to info with no dollars", () => {
  const { a } = run(H + "3/1/26,80053,CMP,1,300\n3/1/26,82947-59,Glucose,1,80\n");
  const f = a.findings.find((x) => x.kind === "unbundling");
  assert.equal(f.severity, "info");
  assert.equal(f.amount, 0);
});

test("two ER levels the same day flag the lower-priced line", () => {
  const { a } = run(H + "3/1/26,99284,ER 4,1,1800\n3/1/26,99283,ER 3,1,1200\n");
  const f = a.findings.find((x) => x.kind === "family");
  assert.equal(f.amount, 1200);
});

test("arithmetic: charge - paid - adjustment must equal patient responsibility", () => {
  const csv = "Date,CPT,Description,Charge,Insurance Paid,Adjustment,Patient Responsibility\n3/1/26,99213,Visit,200,100,50,50\n3/1/26,85025,CBC,100,40,30,60\n";
  const { a } = run(csv);
  const f = a.findings.filter((x) => x.kind === "arithmetic");
  assert.equal(f.length, 1);
  assert.equal(f[0].amount, 30);
  assert.equal(a.summary.arithChecked, 2);
  assert.equal(a.summary.patientOwed, 110);
});

test("negative adjustments are treated as reductions, like positive ones", () => {
  const csv = "Date,CPT,Description,Charge,Insurance Paid,Adjustment,Patient Responsibility\n3/1/26,99213,Visit,200,100,-50,50\n";
  assert.equal(run(csv).a.findings.length, 0);
});

test("uncoded charge lines produce an info finding asking for the itemized bill", () => {
  const { a } = run(H + "3/1/26,,Supplies,1,132\n");
  assert.equal(a.findings[0].kind, "uncoded");
  assert.equal(a.summary.questioned, 0);
});

test("questioned never exceeds the bill total", () => {
  const { a } = run(H + "3/1/26,71046,X,1,100\n3/1/26,71046,X,1,100\n");
  assert.ok(a.summary.questioned <= a.summary.total);
});

test("findings are ordered high before medium before info", () => {
  const { a } = run(sampleCsv());
  const rank = { high: 0, medium: 1, info: 2 };
  for (let i = 1; i < a.findings.length; i++) assert.ok(rank[a.findings[i - 1].severity] <= rank[a.findings[i].severity]);
});

test("sample bill surfaces every rule family", () => {
  const { a } = run(sampleCsv());
  const kinds = new Set(a.findings.map((f) => f.kind));
  for (const k of ["duplicate", "unbundling", "family", "arithmetic", "uncoded"]) assert.ok(kinds.has(k), k);
});

test("request letter lists the questions, asks for a hold and never accuses", () => {
  const { a } = run(sampleCsv());
  const t = requestLetter(a, { patient: "A. Patient", provider: "General Hospital" });
  assert.match(t, /General Hospital/);
  assert.match(t, /do not send my account to collections|do not send it to collections/);
  assert.match(t, /itemized statement/);
  assert.doesNotMatch(t, /fraud|overcharg|illegal/i);
});

test("letter with no findings still asks for a review", () => {
  const { a } = run(H + "3/1/26,99213,Visit,1,100\n");
  assert.match(requestLetter(a), /coding and charge review/);
});

test("summary and csv exports carry every finding", () => {
  const { a } = run(sampleCsv());
  assert.match(summaryText(a), /not findings that the bill is wrong/);
  assert.equal(reportCsv(a).trim().split("\n").length, a.findings.length + 1);
});

test("semicolon-delimited files are read", () => {
  const csv = "Date;CPT;Description;Qty;Charge\n3/1/26;99213;Visit;1;100\n";
  assert.equal(run(csv).n.records.length, 1);
});
