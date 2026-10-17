import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReport, buildWorker, toCsv, parsePaste, sampleReport, DAYS } from "./wh347.mjs";

const page = readFileSync(new URL("./wh347-report.html", import.meta.url), "utf8");
const w = (o = {}) => ({ name: "T", idLast4: "1234", classification: "Laborer", days: [8, 8, 8, 8, 8, 0, 0], otherHours: 0, requiredBase: 30, requiredFringe: 10, actualBase: 30, planFringe: 10, cashFringe: 0, fica: 0, withholding: 0, otherDeductions: 0, ...o });

test("a 40 hour week at the determination is compliant with no overtime", () => {
  const r = buildWorker(w());
  assert.equal(r.projectHours, 40);
  assert.equal(r.overtimeHours, 0);
  assert.equal(r.gross, 1200);
  assert.equal(r.underpayment, 0);
  assert.deepEqual(r.flags, []);
});

test("overtime premium goes on base plus cash fringe, never on plan fringe", () => {
  const r = buildWorker(w({ days: [10, 10, 10, 10, 6, 0, 0], planFringe: 6, cashFringe: 4 }));
  assert.equal(r.overtimeHours, 6);
  assert.equal(r.gross, 40 * 34 + 6 * 51);
  assert.equal(r.underpayment, 0);
  assert.ok(r.flags.some((f) => /Cash fringe counted/.test(f)));
});

test("plan fringe only: a week paid exactly at the combined rate is underpaid once overtime is worked", () => {
  const r = buildWorker(w({ days: [10, 10, 10, 10, 6, 0, 0] }));
  assert.equal(r.underpayment, 0);
  const low = buildWorker(w({ days: [10, 10, 10, 10, 6, 0, 0], actualBase: 28 }));
  assert.ok(low.underpayment > 0);
  assert.ok(low.flags.some((f) => /Underpaid/.test(f)));
});

test("hours on other jobs come first, so overtime lands on this project", () => {
  const r = buildWorker(w({ days: [8, 8, 8, 0, 0, 0, 0], otherHours: 20 }));
  assert.equal(r.projectHours, 24);
  assert.equal(r.overtimeHours, 4);
  assert.equal(r.straightHours, 20);
  const none = buildWorker(w({ days: [8, 8, 8, 0, 0, 0, 0], otherHours: 40 }));
  assert.equal(none.overtimeHours, 24);
});

test("net is gross less deductions and negative net is flagged", () => {
  const r = buildWorker(w({ fica: 91.8, withholding: 100, otherDeductions: 8.2 }));
  assert.equal(r.deductions, 200);
  assert.equal(r.net, 1000);
  const neg = buildWorker(w({ withholding: 5000 }));
  assert.ok(neg.flags.some((f) => /more than gross/.test(f)));
});

test("a full SSN is refused, not echoed", () => {
  assert.throws(() => buildWorker(w({ idLast4: "123-45-6789" })), /last four digits/);
  assert.throws(() => buildWorker(w({ idLast4: "12ab" })), /digits only/);
  assert.ok(buildWorker(w({ idLast4: "" })).flags.some((f) => /last four/.test(f)));
});

test("bad numbers and impossible days are refused", () => {
  assert.throws(() => buildWorker(w({ actualBase: "abc" })), /base rate paid/);
  assert.throws(() => buildWorker(w({ days: [25, 0, 0, 0, 0, 0, 0] })), /24/);
  assert.throws(() => buildWorker(w({ fica: -1 })), /FICA/);
});

test("report totals add up and the example flags what it should", () => {
  const r = buildReport(sampleReport());
  assert.equal(r.workers.length, 3);
  assert.equal(r.totals.gross, 3731.5);
  assert.equal(r.totals.underpayment, 26);
  assert.equal(r.totals.projectHours, 110);
  assert.equal(r.ready, false);
  assert.ok(r.advice.some((a) => /Underpayment/.test(a)));
});

test("a clean report with a full header is ready", () => {
  const r = buildReport({ header: { contractor: "X", project: "Y", payrollNo: "1", weekEnding: "2026-10-04" }, workers: [w()] });
  assert.equal(r.ready, true);
  assert.throws(() => buildReport({ header: { weekEnding: "10/04/2026" }, workers: [w()] }), /Week ending/);
  assert.throws(() => buildReport({ header: {}, workers: [] }), /at least one worker/);
});

test("csv has a header, a row per worker, a total, and quotes commas", () => {
  const r = buildReport({ header: {}, workers: [w({ name: "Smith, J" })] });
  const lines = toCsv(r).split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^"Smith, J",1234,Laborer/);
  assert.match(lines[2], /^TOTAL/);
});

test("pasted rows map to columns and skip a header line", () => {
  const rows = parsePaste("name\tid\tcls\n" + "A\t1111\tLaborer\t8\t8\t8\t8\t8\t0\t0\t0\t30\t10\t30\t10\t0\t0\t0\t0\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].days[0], "8");
  assert.equal(buildWorker(rows[0]).gross, 1200);
  assert.equal(DAYS.length, 7);
});

test("page: disclaimers, no network, no share link, ids exist", () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not legal, tax, payroll, or compliance advice/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|sendBeacon|location\.hash/);
  for (const id of ["contractor", "project", "contractNo", "payrollNo", "weekEnding", "add", "build", "example", "csv", "print", "usageOptOut"]) assert.match(page, new RegExp(`id="${id}"`));
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(blocks.length, 2);
  for (const b of blocks) JSON.parse(b[1]);
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(page);
  assert.doesNotThrow(() => new Function(m[1].replace(/^\s*import .*$/gm, "")));
});
