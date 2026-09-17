import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeEntities,
  visibleText,
  squash,
  divergence,
  extractJsonLdBlocks,
  extractClaims,
  checkPage,
  summarize,
} from "./engine.mjs";

// --- decodeEntities / visibleText -----------------------------------------

test("decodeEntities resolves named, decimal, and hex references and leaves unknown ones alone", () => {
  assert.equal(decodeEntities("A &amp; B"), "A & B");
  assert.equal(decodeEntities("caf&eacute;-unknown &#233; &#xe9;"), "caf&eacute;-unknown é é");
  assert.equal(decodeEntities("V&micro;s &tau;ime"), "Vµs τime");
});

test("visibleText strips script/style, closes up inline tags, and decodes entities", () => {
  const html = `<style>h1{color:red}</style><script>var x = "hidden";</script>
    <h1>V<sub>out</sub> &amp; V<sub>in</sub></h1><p>Block<br>break stays a space.</p>`;
  const text = visibleText(html);
  assert.ok(text.includes("Vout & Vin"), text);
  assert.ok(!text.includes("hidden"));
  assert.ok(!text.includes("color:red"));
});

test("squash lower-cases and collapses whitespace", () => {
  assert.equal(squash("  Hello   World \n"), "hello world");
});

// --- divergence -------------------------------------------------------------

test("divergence is null for an exact match", () => {
  assert.equal(divergence("the deposit is refundable", "in short, the deposit is refundable within 14 days"), null);
});

test("divergence points at the first differing character", () => {
  const onPage = "the deposit is refundable within 30 days of move-out";
  const authored = "the deposit is refundable within 14 days of move-out";
  const gap = divergence(authored, onPage);
  assert.equal(gap.index, "the deposit is refundable within ".length);
  assert.ok(gap.authored.includes("within 14"), gap.authored);
  assert.ok(gap.onPage.includes("within 30"), gap.onPage);
});

test("divergence reports index 0 and an empty onPage excerpt when nothing matches at all", () => {
  const gap = divergence("completely absent text", "some other page entirely");
  assert.equal(gap.index, 0);
  assert.equal(gap.onPage, "");
});

test("divergence on an empty needle is null (nothing to check)", () => {
  assert.equal(divergence("", "anything"), null);
});

// --- extractJsonLdBlocks -----------------------------------------------------

test("extractJsonLdBlocks parses every ld+json script and reports a malformed one without losing the rest", () => {
  const html = `
    <script type="application/ld+json">{"@type":"Product","name":"Widget"}</script>
    <script type="application/ld+json">{not valid json}</script>
    <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>`;
  const blocks = extractJsonLdBlocks(html);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].data["@type"], "Product");
  assert.match(blocks[1].error, /not valid JSON/);
  assert.equal(blocks[2].data["@type"], "Organization");
});

test("extractJsonLdBlocks decodes HTML entities inside the script body", () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Widgets &amp; Gadgets"}</script>`;
  const [block] = extractJsonLdBlocks(html);
  assert.equal(block.data.name, "Widgets & Gadgets");
});

// --- extractClaims: one test per schema type ------------------------------

test("FAQPage: extracts each question and answer as separate claims", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
    {"@type":"Question","name":"Is this free?","acceptedAnswer":{"@type":"Answer","text":"Yes, entirely."}},
    {"@type":"Question","name":"Does it upload anything?","acceptedAnswer":{"@type":"Answer","text":"No."}}
  ]}</script>`;
  const { claims, errors } = extractClaims(html);
  assert.deepEqual(errors, []);
  const texts = claims.map((c) => c.text);
  assert.deepEqual(texts, ["Is this free?", "Yes, entirely.", "Does it upload anything?", "No."]);
  assert.ok(claims.every((c) => c.type === "FAQPage"));
});

test("HowTo: extracts name, description, and each step's name/text, flattening a HowToSection", () => {
  const html = `<script type="application/ld+json">{"@type":"HowTo","name":"Fix a leak","description":"A short repair.",
    "step":[
      {"@type":"HowToStep","name":"Shut off water","text":"Close the main valve."},
      {"@type":"HowToSection","name":"Replace the washer","itemListElement":[
        {"@type":"HowToStep","name":"Remove the handle","text":"Unscrew the handle."}
      ]}
    ]}</script>`;
  const { claims } = extractClaims(html);
  const byField = Object.fromEntries(claims.map((c) => [c.field + ":" + c.label, c.text]));
  assert.equal(claims.find((c) => c.field === "name").text, "Fix a leak");
  assert.equal(claims.find((c) => c.field === "description").text, "A short repair.");
  const stepTexts = claims.filter((c) => c.field === "stepText").map((c) => c.text);
  assert.deepEqual(stepTexts, ["Close the main valve.", "Unscrew the handle."]);
  const stepNames = claims.filter((c) => c.field === "stepName").map((c) => c.text);
  assert.deepEqual(stepNames, ["Shut off water", "Remove the handle"]);
  void byField;
});

test("Article/BlogPosting/NewsArticle: extracts headline and description", () => {
  for (const type of ["Article", "BlogPosting", "NewsArticle"]) {
    const html = `<script type="application/ld+json">{"@type":"${type}","headline":"Big News","description":"A summary."}</script>`;
    const { claims } = extractClaims(html);
    assert.deepEqual(claims.map((c) => [c.field, c.text]), [["headline", "Big News"], ["description", "A summary."]]);
    assert.equal(claims[0].type, type);
  }
});

test("Product: extracts name and description", () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"Widget","description":"Does widget things."}</script>`;
  const { claims } = extractClaims(html);
  assert.deepEqual(claims.map((c) => [c.field, c.text]), [["name", "Widget"], ["description", "Does widget things."]]);
});

test("LocalBusiness/Organization and a named subtype: extracts name and description", () => {
  for (const type of ["LocalBusiness", "Organization", "Restaurant", "Attorney"]) {
    const html = `<script type="application/ld+json">{"@type":"${type}","name":"Acme","description":"We do things."}</script>`;
    const { claims } = extractClaims(html);
    assert.deepEqual(claims.map((c) => [c.field, c.text]), [["name", "Acme"], ["description", "We do things."]]);
  }
});

test("Organization subtype not on the curated list is still caught by the suffix heuristic", () => {
  const html = `<script type="application/ld+json">{"@type":"HomeAndConstructionBusiness","name":"Acme Roofing","description":"Roof repair."}</script>`;
  const { claims } = extractClaims(html);
  assert.deepEqual(claims.map((c) => c.field), ["name", "description"]);
});

test("Review: extracts reviewBody and author.name, and accepts a bare string author", () => {
  const html = `<script type="application/ld+json">{"@type":"Review","reviewBody":"Worked great.","author":{"@type":"Person","name":"Jamie"}}</script>`;
  const { claims } = extractClaims(html);
  assert.deepEqual(claims.map((c) => [c.field, c.text]), [["reviewBody", "Worked great."], ["authorName", "Jamie"]]);

  const html2 = `<script type="application/ld+json">{"@type":"Review","reviewBody":"Solid.","author":"Alex"}</script>`;
  const { claims: claims2 } = extractClaims(html2);
  assert.deepEqual(claims2.map((c) => [c.field, c.text]), [["reviewBody", "Solid."], ["authorName", "Alex"]]);
});

test("finds a type nested anywhere in the tree: a Review inside a Product, an FAQPage as a WebPage's mainEntity", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Widget",
    "review":{"@type":"Review","reviewBody":"Nice.","author":{"name":"Sam"}}}</script>
    <script type="application/ld+json">{"@type":"WebPage","mainEntity":{"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"Free?","acceptedAnswer":{"@type":"Answer","text":"Yes."}}]}}</script>`;
  const { claims } = extractClaims(html);
  assert.ok(claims.some((c) => c.type === "Product" && c.text === "Widget"));
  assert.ok(claims.some((c) => c.type === "Review" && c.text === "Nice."));
  assert.ok(claims.some((c) => c.type === "FAQPage" && c.text === "Yes."));
});

test("a type this tool does not check (e.g. BreadcrumbList) yields no claims", () => {
  const html = `<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>`;
  const { claims } = extractClaims(html);
  assert.deepEqual(claims, []);
});

test("@graph is walked the same as a top-level array", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"Product","name":"Widget"},
    {"@type":"Organization","name":"Acme"}
  ]}</script>`;
  const { claims } = extractClaims(html);
  assert.deepEqual(claims.map((c) => c.text), ["Widget", "Acme"]);
});

// --- checkPage / summarize: the end-to-end contract -------------------------

test("checkPage passes every claim whose text is visible on the page, verbatim", () => {
  const html = `<h2>Is this free?</h2><p>Yes, entirely.</p>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"Is this free?","acceptedAnswer":{"@type":"Answer","text":"Yes, entirely."}}]}</script>`;
  const report = checkPage(html);
  assert.equal(report.results.length, 2);
  assert.ok(report.results.every((r) => r.pass));
  assert.equal(summarize(report).status, "ok");
});

test("checkPage fails a claim whose JSON-LD text is not on the page, with a divergence excerpt", () => {
  const html = `<h2>Is this free?</h2><p>Yes, for the first 14 days.</p>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"Is this free?","acceptedAnswer":{"@type":"Answer","text":"Yes, for the first 30 days."}}]}</script>`;
  const report = checkPage(html);
  const answer = report.results.find((r) => r.field === "answer");
  assert.equal(answer.pass, false);
  assert.ok(answer.divergence.authored.includes("30")); // the JSON-LD's own (wrong) text
  assert.ok(answer.divergence.onPage.includes("14")); // what the page actually says
  assert.equal(summarize(report).status, "drift");
});

test("checkPage treats inline-tag markup and entity spelling differences as a match, not drift", () => {
  const html = `<p>V<sub>out</sub> is limited to 3.3&nbsp;V &amp; must not exceed it.</p>
    <script type="application/ld+json">{"@type":"Article","headline":"Voltage limits","description":"Vout is limited to 3.3 V & must not exceed it."}</script>`;
  const report = checkPage(html);
  assert.ok(report.results.find((r) => r.field === "description").pass);
});

test("summarize reports 'none' when the page has no checkable structured data", () => {
  const report = checkPage("<p>Just a plain page.</p>");
  assert.equal(report.results.length, 0);
  assert.equal(summarize(report).status, "none");
});

test("summarize reports 'error' when nothing checkable was found and a JSON-LD block failed to parse", () => {
  const report = checkPage(`<script type="application/ld+json">{broken}</script>`);
  assert.equal(report.results.length, 0);
  assert.equal(report.errors.length, 1);
  assert.equal(summarize(report).status, "error");
});

test("a malformed JSON-LD block does not hide claims found in a sibling block", () => {
  const html = `<h2>Free?</h2><p>Yes.</p>
    <script type="application/ld+json">{broken}</script>
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
      {"@type":"Question","name":"Free?","acceptedAnswer":{"@type":"Answer","text":"Yes."}}]}</script>`;
  const report = checkPage(html);
  assert.equal(report.errors.length, 1);
  assert.equal(report.results.length, 2);
  assert.ok(report.results.every((r) => r.pass));
  assert.equal(summarize(report).status, "ok"); // claims all pass; the parse error is noted, not fatal
});
