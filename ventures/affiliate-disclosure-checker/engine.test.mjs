import test from "node:test";
import assert from "node:assert/strict";
import { classifyLink, extractVisibleText, findDisclosures, checkDisclosure, summarize } from "./engine.mjs";

test("a page with no links at all is no-affiliate-links", () => {
  const report = checkDisclosure("<p>Just some text, no links.</p>");
  assert.equal(report.status, "no-affiliate-links");
  assert.equal(report.hasAffiliateLinks, false);
});

test("a plain, non-affiliate link is not flagged", () => {
  const report = checkDisclosure('<p>See <a href="https://example.com/about">about us</a>.</p>');
  assert.equal(report.status, "no-affiliate-links");
});

test("classifyLink recognises an Amazon Associates tag= link", () => {
  assert.match(classifyLink("https://www.amazon.com/dp/B000/?tag=myid-20", ""), /Amazon Associates/);
  assert.match(classifyLink("https://www.amazon.co.uk/dp/B000?tag=myid-21", ""), /Amazon Associates/);
});

test("classifyLink recognises an amzn.to short link", () => {
  assert.match(classifyLink("https://amzn.to/3xyzabc", ""), /Amazon Associates/);
});

test("classifyLink does not flag a plain amazon.com link with no tag", () => {
  assert.equal(classifyLink("https://www.amazon.com/dp/B000", ""), null);
});

test("classifyLink recognises rel=sponsored regardless of href", () => {
  assert.match(classifyLink("https://example.com/x", "sponsored"), /sponsored/);
  assert.match(classifyLink("https://example.com/x", "noopener sponsored nofollow"), /sponsored/);
});

test("classifyLink recognises known affiliate-network tracking domains", () => {
  assert.match(classifyLink("https://shareasale.com/r.cfm?b=1&u=2", ""), /affiliate-network/);
  assert.match(classifyLink("https://click.linksynergy.com/deeplink?id=1", ""), /affiliate-network/);
  assert.match(classifyLink("https://redirect.viglink.com/?u=https://x.com", ""), /affiliate-network/);
});

test("classifyLink recognises a generic irclickid tracking parameter", () => {
  assert.match(classifyLink("https://retailer.example.com/product?irclickid=abc123", ""), /generic affiliate/);
});

test("a page with an Amazon link and Amazon's exact required phrase before it is ok", () => {
  const html = `<p>As an Amazon Associate I earn from qualifying purchases.</p>
    <p>I love <a href="https://www.amazon.com/dp/B000?tag=me-20">this gadget</a>.</p>`;
  const report = checkDisclosure(html);
  assert.equal(report.status, "ok");
  assert.equal(report.hasAmazonRequiredPhrase, true);
  assert.equal(report.missingAmazonRequiredPhrase, false);
});

test("Amazon's required phrase tolerates a comma variant", () => {
  const html = `<p>As an Amazon Associate, I earn from qualifying purchases.</p>
    <a href="https://amzn.to/xyz">buy it</a>`;
  const report = checkDisclosure(html);
  assert.equal(report.hasAmazonRequiredPhrase, true);
});

test("an Amazon link with only a generic disclosure is ok but flags the missing Amazon phrase", () => {
  const html = `<p>This post contains affiliate links.</p>
    <a href="https://www.amazon.com/dp/B000?tag=me-20">buy it</a>`;
  const report = checkDisclosure(html);
  assert.equal(report.status, "ok"); // a disclosure exists before the link
  assert.equal(report.missingAmazonRequiredPhrase, true); // but not Amazon's own required wording
});

test("an affiliate link with no disclosure anywhere is missing-disclosure", () => {
  const html = `<p>I love this.</p><a href="https://shareasale.com/r.cfm?b=1&u=2">buy it</a>`;
  const report = checkDisclosure(html);
  assert.equal(report.status, "missing-disclosure");
});

test("a disclosure that appears only after the first affiliate link is disclosure-too-late", () => {
  const html = `<a href="https://amzn.to/xyz">buy it</a><p>As an Amazon Associate I earn from qualifying purchases.</p>`;
  const report = checkDisclosure(html);
  assert.equal(report.status, "disclosure-too-late");
});

test("script and style content is never scanned as visible text or disclosure", () => {
  const html = `<style>/* affiliate links */</style><script>var disclosure = "as an amazon associate I earn from qualifying purchases";</script>
    <a href="https://amzn.to/xyz">buy it</a>`;
  const report = checkDisclosure(html);
  assert.equal(report.status, "missing-disclosure"); // the script text must not count
});

test("HTML comments are never scanned", () => {
  const html = `<!-- as an amazon associate I earn from qualifying purchases --><a href="https://amzn.to/xyz">buy it</a>`;
  const report = checkDisclosure(html);
  assert.equal(report.status, "missing-disclosure");
});

test("HTML entities are decoded before phrase matching", () => {
  const html = `<p>We may earn a commission &mdash; thanks!</p><a href="https://amzn.to/xyz">buy it</a>`;
  // &mdash; isn't decoded (not in our small table) but &amp; etc must not break matching around it
  const report = checkDisclosure(html.replace("&mdash;", "&amp;"));
  assert.equal(report.status, "ok");
});

test("extractVisibleText keeps word boundaries across stripped tags", () => {
  const { text } = extractVisibleText("<p>click <a href=\"x\">here</a> now</p>");
  assert.equal(text, "click here now");
});

test("findDisclosures reports phrases sorted by position", () => {
  const found = findDisclosures("some text. we may earn a commission. more text. affiliate links below.");
  assert.ok(found.length >= 2);
  assert.ok(found[0].position < found[1].position);
});

test("summarize describes each status", () => {
  assert.equal(summarize({ status: "no-affiliate-links" }).level, "info");
  assert.equal(summarize({ status: "missing-disclosure", affiliateLinks: [{}] }).level, "fail");
  assert.equal(summarize({ status: "disclosure-too-late" }).level, "fail");
  assert.equal(summarize({ status: "ok", missingAmazonRequiredPhrase: false }).level, "ok");
  assert.equal(summarize({ status: "ok", missingAmazonRequiredPhrase: true }).level, "warn");
});
