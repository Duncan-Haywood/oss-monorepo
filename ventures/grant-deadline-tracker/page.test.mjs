import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLateReport } from "./calc.mjs";
import { faqEntries, injectChrome } from "../../platform/pages/build.mjs";

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

test("an invalid risk input clears every stale field in the late-report comparison, not just the message", () => {
  // Before this fix, renderRisk()'s catch block only overwrote #riskMessage
  // with the error sentence. Cash at risk, writer cost, kept-after-hiring,
  // the miss/file-yourself/hire-writer comparison rows, and the copyable
  // board note all kept showing the last valid comparison. A visitor who
  // missed the one-line message could easily read those stale figures as
  // the answer for the invalid inputs (spent over award, a clawback over
  // 100%) now in the form.
  const catchMatch = html.match(/if \(count\) countUsage\("late_report_compared"\);\s*\} catch \(error\) \{([\s\S]*?)\n\s*\}\n\s*\}/);
  assert.ok(catchMatch, "renderRisk()'s catch block was not found");
  const body = catchMatch[1];
  assert.match(body, /\$\("riskMessage"\)\.textContent = error\.message/, "the error message is never shown");
  for (const id of ["riskAtRisk", "riskWriterCost", "riskKept", "riskNote"]) {
    assert.match(
      body,
      new RegExp(`\\$\\("${id}"\\)\\.textContent = ""`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /\$\("riskRows"\)\.innerHTML = ""/, "the stale comparison rows are not cleared");
  assert.match(body, /\$\("lateReport"\)\.dataset\.note = ""/, "the stale board note dataset survives for Copy to hand out");
});

test("the entry page's FAQ derivation is not suppressed by its own explanatory comment", () => {
  // The source carries only a *comment* explaining that FAQPage schema is
  // derived by build.mjs, not an authored block. build.mjs used to check for
  // the literal substring "FAQPage" anywhere in the page -- including inside
  // that comment -- so it read the explanation as "this venture already
  // wrote its own" and skipped derivation, shipping no FAQPage schema at all
  // despite six real question headings below. faqEntries() alone can't catch
  // this: it derives correctly from the source; the loss only appears in
  // injectChrome's output. 2026-08-31.
  const entries = faqEntries(html);
  assert.ok(entries.length >= 6, `expected at least 6 derived FAQ entries, got ${entries.length}`);
  const questions = entries.map((e) => e.question);
  assert.ok(questions.some((q) => /next grant report due/i.test(q)));
  assert.ok(questions.some((q) => /hire a grant writer/i.test(q)));

  const built = injectChrome(html, {
    slug: "grant-deadline-tracker",
    toRoot: "../",
    total: 169,
    related: [],
    canonical: "https://e.test/grant-deadline-tracker/",
    isEntry: true,
  });
  assert.match(built, /"@type":"FAQPage"/, "the derived schema must actually be injected, not suppressed by the comment");
});
