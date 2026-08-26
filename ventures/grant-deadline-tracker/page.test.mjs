import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLateReport } from "./calc.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const dueSeo = readFileSync(new URL("./when-is-my-next-grant-report-due.html", import.meta.url), "utf8");
const writerSeo = readFileSync(new URL("./should-i-hire-a-grant-writer-to-file-this-report.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("the tracker page wires the late-report comparison without a build step", () => {
  assert.match(html, /compareLateReport/);
  assert.match(html, /lateReportNote/);
  assert.match(html, /id="riskAward"/);
  assert.match(html, /id="riskSpent"/);
  assert.match(html, /id="riskInstallment"/);
  assert.match(html, /id="riskRenewal"/);
  assert.match(html, /id="riskClawback"/);
  assert.match(html, /id="riskDue"/);
  assert.match(html, /id="edHours"/);
  assert.match(html, /id="edRate"/);
  assert.match(html, /id="writerHours"/);
  assert.match(html, /id="writerRate"/);
  assert.match(html, /id="lateReport"/);
  assert.match(html, /id="price-risk"/);
  assert.match(html, /id="copyRiskNote"/);
  assert.match(html, /id="fill-risk"/);
  assert.match(html, /late_report_compared/);
  assert.match(html, /late_report_note_copied/);
  assert.match(html, /should-i-hire-a-grant-writer-to-file-this-report\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test("the due-date landing page stays crawlable and sends people to the tracker", () => {
  assert.match(dueSeo, /<title>When Is My Next Grant Report Due\?/);
  assert.match(dueSeo, /name="description"/);
  assert.match(dueSeo, /FAQPage/);
  assert.match(dueSeo, /href="\.\/"/);
  assert.match(dueSeo, /Best-effort hosting, no SLA/);
  assert.match(sitemap, /when-is-my-next-grant-report-due\.html/);
});

test("the grant-writer landing page uses the same worked example the tests lock", () => {
  const comparison = compareLateReport({
    award: 24000,
    spent: 8500,
    nextInstallment: 6000,
    edHours: 14,
    edRate: 42,
    writerHours: 8,
    writerRate: 85,
    nextDate: "2026-09-15",
  }, "2026-08-26");
  assert.match(writerSeo, /<title>Should I hire a grant writer to file this report\?/);
  assert.match(writerSeo, /name="description"/);
  assert.match(writerSeo, /FAQPage/);
  assert.match(writerSeo, /href="\.\/"/);
  assert.match(writerSeo, /Best-effort hosting, no SLA/);
  assert.match(writerSeo, /\$21,500\.00/);
  assert.match(writerSeo, /\$588\.00/);
  assert.match(writerSeo, /\$680\.00/);
  assert.match(writerSeo, /\$20,912\.00/);
  assert.match(writerSeo, /\$20,820\.00/);
  assert.match(writerSeo, /\$1,250/);
  assert.match(writerSeo, /GitHub Sponsors/);
  assert.equal(comparison.remainingAtRisk, 21500);
  assert.equal(comparison.edCost, 588);
  assert.equal(comparison.writerCost, 680);
  assert.equal(comparison.yourself.net, 20912);
  assert.equal(comparison.writer.net, 20820);
  assert.match(sitemap, /should-i-hire-a-grant-writer-to-file-this-report\.html/);
});
