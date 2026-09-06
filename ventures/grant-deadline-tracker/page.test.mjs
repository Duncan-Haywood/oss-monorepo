import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLateReport } from "./calc.mjs";
import { faqEntries, injectChrome } from "../../platform/pages/build.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const dueSeo = readFileSync(new URL("./when-is-my-next-grant-report-due.html", import.meta.url), "utf8");
const writerSeo = readFileSync(new URL("./should-i-hire-a-grant-writer-to-file-this-report.html", import.meta.url), "utf8");
const instrumentlSeo = readFileSync(new URL("./vs-instrumentl.html", import.meta.url), "utf8");
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
  assert.match(html, /id="copyRiskLink"/);
  assert.match(html, /risk_share_link_copied/);
  assert.match(html, /risk_shared_link_opened/);
  assert.match(html, /from "\.\/share\.mjs"/);
  assert.match(html, /should-i-hire-a-grant-writer-to-file-this-report\.html/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test("the tracker wires the calendar (.ics) export without a build step", () => {
  assert.match(html, /icsCalendar/);
  assert.match(html, /id="exportIcs"/);
  assert.match(html, /text\/calendar/);
  assert.match(html, /grant-deadlines\.ics/);
  assert.match(html, /ics-exported/);
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

test("the tracker links to its Instrumentl comparison page and is listed in the sitemap", () => {
  assert.match(html, /vs-instrumentl\.html/);
  assert.match(sitemap, /vs-instrumentl\.html/);
});

test("the vs-Instrumentl comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer", () => {
  assert.match(instrumentlSeo, /<title>This tracker vs\. Instrumentl/);
  assert.match(instrumentlSeo, /name="description"/);
  assert.match(instrumentlSeo, /"@type":"FAQPage"/);
  assert.match(instrumentlSeo, /href="\.\/"/);
  assert.match(instrumentlSeo, /instrumentl\.com\/pricing/);
  assert.match(instrumentlSeo, /rel="nofollow noopener"/);
  assert.match(instrumentlSeo, /not affiliated with, endorsed by, or sponsored by Instrumentl/i);
  // No dollar figure for Instrumentl's own pricing is asserted anywhere on this
  // page: that number could not be verified against a primary source reachable
  // from this environment, so the comparison stays functional (what job each
  // tool does) rather than citing a price this repo cannot confirm.
  assert.doesNotMatch(instrumentlSeo, /Instrumentl[^.]*\$\d/);
  assert.match(instrumentlSeo, /Best-effort hosting, no SLA/);
  assert.match(instrumentlSeo, /GitHub Sponsors/);
});

test("an invalid risk input clears the stale comparison instead of leaving it next to a silent error", () => {
  // Before this fix, a rejected input in the "cash at risk" panel (a negative
  // number, non-numeric text) overwrote only #riskMessage with the error
  // sentence and left the three stat call-outs, the three-path comparison
  // table, and the board-ready note all showing the last valid comparison. A
  // visitor could easily miss the one-line message and read those stale
  // figures as the answer for the inputs now on screen.
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, "app script not found");
  const script = scriptMatch[1];
  const fnMatch = script.match(/function renderRisk\([\s\S]*?\n {2}\}/);
  assert.ok(fnMatch, "renderRisk() not found");
  const catchMatch = fnMatch[0].match(/\} catch \(error\) \{([\s\S]*?)\n {4}\}/);
  assert.ok(catchMatch, "renderRisk() catch block not found");
  const body = catchMatch[1];
  for (const id of ["riskAtRisk", "riskWriterCost", "riskKept", "riskNote"]) {
    assert.match(
      body,
      new RegExp(`\\$\\("${id}"\\)\\.textContent\\s*=\\s*""`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /\$\("riskRows"\)\.innerHTML\s*=/, "the stale comparison table rows are never cleared");
  assert.match(body, /\$\("lateReport"\)\.dataset\.note\s*=\s*""/, "the stale board-ready note is never cleared");
  assert.match(body, /error\.message/, "the error message is never shown");
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
