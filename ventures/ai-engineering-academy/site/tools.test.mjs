import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractToolMetadata,
  rewriteToolPage,
  renderToolsHub,
  renderSitemap,
  renderRobots,
  shortName,
} from "./tools.mjs";

const SAMPLE = `<!doctype html>
<html lang="en">
<head>
<title>Resistor Color Code &amp; Ohm's Law Calculator</title>
<meta name="description" content="Free browser-local resistor calculators.
No signup." />
<link rel="icon" href="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" />
</head>
<body>
<main><h1>Hi</h1>
<p>Part of <a href="../../README.md">AI Engineering Academy</a>.</p>
<p>See the <a href="../led-resistor-calculator/">LED calculator</a>.</p>
</main>
</body>
</html>`;

const TOOLS = [
  { slug: "resistor-calculator", title: "Resistor Calculator", description: "A." },
  { slug: "led-resistor-calculator", title: "LED Series Resistor Calculator", description: "B." },
  { slug: "voltage-divider-calculator", title: "Voltage Divider Calculator", description: "C." },
];

test("extracts title, description and icon from a tool's own page", () => {
  const meta = extractToolMetadata(SAMPLE, "resistor-calculator");
  assert.equal(meta.slug, "resistor-calculator");
  // Entities in the source <title> are decoded, so the hub can re-escape
  // once instead of shipping a double-escaped "&amp;amp;".
  assert.equal(meta.title, "Resistor Color Code & Ohm's Law Calculator");
  assert.equal(meta.description, "Free browser-local resistor calculators. No signup.");
  assert.match(meta.icon, /^data:image\/svg\+xml,/);
});

test("a tool with no description fails the build instead of shipping a blank card", () => {
  const html = "<html><head><title>T</title></head><body></body></html>";
  assert.throws(
    () => extractToolMetadata(html, "broken-tool"),
    /broken-tool.*description/s
  );
});

test("a tool with no title fails the build", () => {
  const html = '<html><head><meta name="description" content="d"></head></html>';
  assert.throws(() => extractToolMetadata(html, "nameless"), /nameless.*<title>/s);
});

test("hub page escapes tool metadata exactly once", () => {
  const hub = renderToolsHub([
    { slug: "x", title: "A & B", description: '5 > 3 "quoted"' },
  ]);
  assert.match(hub, /<a href="x\/">A &amp; B<\/a>/);
  assert.ok(hub.includes("5 &gt; 3"));
  assert.ok(!hub.includes("&amp;amp;"), "must not double-escape");
});

test("hub page links every tool and stays valid when there are none", () => {
  const hub = renderToolsHub(TOOLS);
  for (const t of TOOLS) {
    assert.ok(hub.includes(`href="${t.slug}/"`), `missing link to ${t.slug}`);
  }
  const empty = renderToolsHub([]);
  assert.match(empty, /No calculators are published yet/);
  assert.ok(
    !empty.includes('<li class="tool-card"'),
    "empty state must not emit an empty list"
  );
  assert.ok(!empty.includes('<ul class="tool-list"'));
});

test("hub page carries the disclaimer and privacy statement", () => {
  const hub = renderToolsHub(TOOLS);
  assert.match(hub, /No warranty/);
  assert.match(hub, /not\s+engineering advice/);
  assert.match(hub, /Privacy/);
  assert.match(hub, /localStorage/);
});

test("hub page emits machine-readable ItemList for AI and search discovery", () => {
  const hub = renderToolsHub(TOOLS);
  const match = hub.match(
    /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/
  );
  assert.ok(match, "no JSON-LD block found");
  const data = JSON.parse(match[1]);
  assert.equal(data["@type"], "ItemList");
  assert.equal(data.itemListElement.length, TOOLS.length);
  assert.equal(data.itemListElement[0].position, 1);
  assert.equal(data.itemListElement[0].item.offers.price, "0");
  assert.equal(data.itemListElement[0].item.url, "resistor-calculator/");
});

test("tool pages get a nav strip back to the hub and across to siblings", () => {
  const out = rewriteToolPage(SAMPLE, TOOLS, "resistor-calculator");
  assert.match(out, /All free calculators/);
  assert.ok(out.includes('href="../"'), "hub link missing");
  assert.ok(out.includes('href="../led-resistor-calculator/"'));
  assert.ok(out.includes('href="../voltage-divider-calculator/"'));
  assert.ok(
    !out.includes('class="site-strip-links"><a href="../resistor-calculator/"'),
    "a tool must not cross-link to itself"
  );
});

test("nav strip is injected inside <body>, not before the doctype", () => {
  const out = rewriteToolPage(SAMPLE, TOOLS, "resistor-calculator");
  assert.ok(out.startsWith("<!doctype html>"), "doctype must stay first");
  assert.ok(
    out.indexOf('class="site-strip"') > out.indexOf("<body>"),
    "nav strip must follow <body>"
  );
});

test("repo-relative README links are repointed at the built overview page", () => {
  const out = rewriteToolPage(SAMPLE, TOOLS, "resistor-calculator");
  assert.ok(!out.includes("README.md"), "a .md href would 404 for a visitor");
  assert.ok(out.includes('href="../../index.html"'));
});

test("a tool's own sibling links are left intact", () => {
  const out = rewriteToolPage(SAMPLE, TOOLS, "resistor-calculator");
  // The tool authored this link itself; it already resolves in dist/.
  assert.ok(out.includes('<a href="../led-resistor-calculator/">LED calculator</a>'));
});

test("rewriting still produces a usable page when <body> is absent", () => {
  const out = rewriteToolPage("<html><p>x</p></html>", TOOLS, "x");
  assert.match(out, /site-strip/);
  assert.match(out, /<p>x<\/p>/);
});

test("shortName trims the trailing 'Calculator' for nav links", () => {
  assert.equal(shortName("Voltage Divider Calculator"), "Voltage Divider");
  assert.equal(shortName("Calculator"), "Calculator", "must not blank out the name");
  assert.equal(shortName("Ohm's Law"), "Ohm's Law");
});

test("shortName reduces a long SEO title to its leading clause", () => {
  assert.equal(
    shortName("Resistor Color Code, LED Resistor & Ohm's Law Calculator"),
    "Resistor Color Code"
  );
  // A long name with no clause break is left alone rather than cut mid-word.
  const unbroken = "Supercalifragilistic Impedance Analyzer";
  assert.equal(shortName(unbroken), unbroken);
});

test("sitemap is omitted rather than filled with a placeholder host", () => {
  assert.equal(renderSitemap(["", "tools/"], ""), null);
  assert.equal(renderSitemap(["", "tools/"], undefined), null);
});

test("sitemap lists every path against the configured base URL", () => {
  const xml = renderSitemap(
    ["", "brief.html", "tools/", "tools/resistor-calculator/"],
    "https://example.com/"
  );
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.ok(xml.includes("<loc>https://example.com/</loc>"));
  assert.ok(xml.includes("<loc>https://example.com/brief.html</loc>"));
  assert.ok(xml.includes("<loc>https://example.com/tools/</loc>"));
  assert.ok(xml.includes("<loc>https://example.com/tools/resistor-calculator/</loc>"));
  // A trailing slash on the base must not produce "example.com//brief.html".
  assert.ok(!xml.includes("com//"));
});

test("robots.txt allows crawling and points at the sitemap when known", () => {
  const bare = renderRobots("");
  assert.match(bare, /User-agent: \*/);
  assert.match(bare, /Allow: \//);
  assert.ok(!bare.includes("Sitemap:"), "no sitemap line without a base URL");

  const withBase = renderRobots("https://example.com/");
  assert.ok(withBase.includes("Sitemap: https://example.com/sitemap.xml"));
});
