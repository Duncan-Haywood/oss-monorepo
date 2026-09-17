import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { faqEntries, injectChrome } from "../../platform/pages/build.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("./when-is-the-ny-llc-transparency-act-deadline.html", import.meta.url), "utf8");
const comparison = readFileSync(new URL("./vs-reading-client-alerts.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("the entry page wires the category/deadline check and the worksheet without a build step", () => {
  assert.match(html, /from "\.\/calc\.mjs"/);
  assert.match(html, /id="formed-in-ny"/);
  assert.match(html, /id="authorized-in-ny"/);
  assert.match(html, /id="formed-outside-us"/);
  assert.match(html, /id="nexus-date"/);
  assert.match(html, /id="check-category"/);
  assert.match(html, /id="category-report"/);
  assert.match(html, /id="deadline-value"/);
  assert.match(html, /id="deadline-countdown"/);
  assert.match(html, /category_checked/);
  assert.match(html, /id="owner-rows"/);
  assert.match(html, /id="add-owner"/);
  assert.match(html, /owner_added/);
  assert.match(html, /owner_removed/);
  assert.match(html, /id="preview-organizer"/);
  assert.match(html, /id="download-organizer"/);
  assert.match(html, /organizer_downloaded/);
  assert.match(html, /id="download-csv"/);
  assert.match(html, /csv_downloaded/);
  assert.match(html, /id="persist-toggle"/);
  assert.match(html, /persist_enabled/);
});

test("the entry page carries the standard disclaimer, privacy, and hosting clauses", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /never contacts New York State|does not.*contact New York State/i);
  assert.match(html, /Do Not Track and Global Privacy Control are honoured/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test("the entry page never claims to file anything on the user's behalf", () => {
  assert.doesNotMatch(html, /we (will|have) file(d)? this for you/i);
  assert.match(html, /you remain the filer|you file (it|them) yourself|files? .* yourself/i);
});

test("the beneficial-owner worksheet is never put into a shareable URL", () => {
  // Deliberate: unlike this fleet's calculators, this venture ships no
  // share.mjs / copy-link control at all, because encoding beneficial-owner
  // PII (name, address, date of birth, government ID number) into a URL
  // hash would put it in browser history, referrer headers if ever pasted
  // into a link preview, and anyone who reuses the link. See VENTURE.yaml.
  assert.doesNotMatch(html, /share\.mjs/);
  assert.doesNotMatch(html, /id="copy-link"/);
});

// siblings.mjs named grant-deadline-tracker as the nearest tool with no
// inbound link when this venture graduated (both in "Compliance checks &
// evidence records"). The reciprocal link is asserted in that venture's own
// page.test.mjs; this closes the pair from this side.
test("index links one hop to the grant-deadline-tracker sibling", () => {
  assert.match(
    html,
    /href="\.\.\/grant-deadline-tracker\/"/,
    "index must link ../grant-deadline-tracker/ so crawlers reach it in one hop",
  );
  assert.match(html, /grant deadline tracker/i);
});

test("the persistence toggle is opt-in and off by default", () => {
  assert.match(html, /off by default/);
  assert.match(html, /Not saved\. Reloading this page clears the worksheet/);
});

test("the guide page stays crawlable, is listed in the sitemap, and links back to the tool", () => {
  assert.match(guide, /<title>When Is the NY LLC Transparency Act Deadline\?/);
  assert.match(guide, /name="description"/);
  assert.match(guide, /"@type":"FAQPage"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /Best-effort hosting, no SLA/);
  assert.match(guide, /No warranty/);
  assert.match(sitemap, /when-is-the-ny-llc-transparency-act-deadline\.html/);
});

test("the comparison page stays crawlable, is listed in the sitemap, and links back to the tool", () => {
  assert.match(comparison, /<title>NY LLC Transparency Act Tracker vs\. Reading Law-Firm Client Alerts/);
  assert.match(comparison, /name="description"/);
  assert.match(comparison, /"@type":"FAQPage"/);
  assert.match(comparison, /href="\.\/"/);
  assert.match(comparison, /Best-effort hosting, no SLA/);
  assert.match(comparison, /No warranty/);
  assert.match(sitemap, /vs-reading-client-alerts\.html/);
  assert.match(html, /href="vs-reading-client-alerts\.html"/, "the tool must link its own comparison page");
});

test("the comparison page names no firm and concedes the alternative's real strength", () => {
  // A comparison page that only flatters its own tool is marketing, not a
  // comparison, and this venture's subject matter makes that worse than
  // usual: the alternative here is written by licensed attorneys, and a
  // reader talked out of consulting one is the concrete harm. The page must
  // keep saying so, and must stay a *generic-method* comparison -- naming a
  // firm would put this venture over surface-budget's named-product rules
  // and pick a fight with a real business for no reader benefit.
  assert.match(comparison, /names no specific firm or product/i);
  assert.match(comparison, /licensed attorneys/);
  assert.match(comparison, /[Dd]oes this tracker replace a lawyer\?/);
  assert.match(comparison, /not legal advice/i);
});

test("the comparison page does not overclaim the category check as a determination", () => {
  // The whole venture's liability posture rests on "likely", never
  // "is". A comparison page is exactly where that slips, because the
  // format invites a confident column.
  assert.doesNotMatch(comparison, /tells you whether you must file/i);
  assert.doesNotMatch(comparison, /determines your (filing )?(status|category)/i);
  assert.match(comparison, /likely/);
  assert.match(comparison, /rather than a\s+determination of your actual filing status/);
});

test("the comparison page repeats the no-share-link and opt-in-persistence posture", () => {
  // These two are the venture's deliberate departures from the fleet
  // pattern. A marketing surface that forgot them would be advertising a
  // weaker privacy promise than the tool actually keeps.
  assert.match(comparison, /no copy-a-link feature at all|ships no\s+copy-a-link feature at all/);
  assert.match(comparison, /off by default/);
  assert.match(comparison, /never uploads anything/);
});

test("the comparison page never claims to file anything on the user's behalf", () => {
  assert.doesNotMatch(comparison, /we (will|have) file(d)? this for you/i);
  assert.match(comparison, /you remain the filer/i);
});

test("the guide page names the federal Corporate Transparency Act as a distinct filing", () => {
  assert.match(guide, /Corporate Transparency Act/);
  assert.match(guide, /FinCEN/);
  assert.match(guide, /does not satisfy the other/);
});

test("the entry page's FAQ derivation is not suppressed by its own explanatory markup", () => {
  const entries = faqEntries(html);
  assert.ok(entries.length >= 5, `expected at least 5 derived FAQ entries, got ${entries.length}`);
  const questions = entries.map((e) => e.question);
  assert.ok(questions.some((q) => /actually has to file/i.test(q)));
  assert.ok(questions.some((q) => /uploaded anywhere/i.test(q)));

  const built = injectChrome(html, {
    slug: "ny-llc-transparency-act-tracker",
    toRoot: "../",
    total: 320,
    related: [],
    canonical: "https://e.test/ny-llc-transparency-act-tracker/",
    isEntry: true,
  });
  assert.match(built, /"@type":"FAQPage"/, "the derived schema must actually be injected");
});
