import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";

import { assess } from "./analyze.mjs";

const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
const secondary = await readFile(
  new URL("./why-a-subpath-site-cannot-govern-its-robots-txt.html", import.meta.url),
  "utf8",
);

test("the entry page is a working tool, not a landing page", () => {
  assert.match(index, /id="siteUrl"/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /id="published"/);
  assert.match(index, /id="governing"/);
  // Wired to the real engine rather than a second implementation of it. A
  // page that re-derives the verdict can disagree with the CLI, and then the
  // tests prove nothing about what the visitor actually sees.
  assert.match(index, /from "\.\/analyze\.mjs"/);
});

test("the page carries the portfolio disclaimers and stays local", () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never leaves your device/i);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

test("the page never claims a clean result is an SEO guarantee or a full audit", () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.match(prose, /not an SEO audit/i);
  assert.match(prose, /not a security audit/i);
});

test("the page states the limit that matters most: crawling still works", () => {
  // Overclaiming here would be the expensive error. A visitor told their site
  // is "not indexed" when only enumeration is broken may rip out a working
  // setup, so the page has to carry the distinction in visible prose.
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.match(prose, /following links is unaffected|linked from a page a crawler already knows/i);
  assert.match(prose, /Nothing errors when this happens/);
});

test("the JSON-LD FAQPage questions match the visible FAQ headings", () => {
  const ldMatch = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(ldMatch, "expected a FAQPage JSON-LD block");
  const ld = ldMatch[0];
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
  assert.ok(headings.length > 0, "expected visible h3 FAQ headings");
  for (const heading of headings) {
    assert.ok(
      ld.includes(heading) || ld.includes(heading.replace(/’/g, "'")),
      `visible heading not found in FAQPage JSON-LD: ${heading}`,
    );
  }
});

test("title and meta description carry the actual search phrase", () => {
  assert.match(index, /<title>[^<]*Subpath Robots Check[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*robots\.txt[^"]*"/);
  // "github pages sitemap" is the phrase people search when they hit this.
  assert.match(index, /<title>[^<]*GitHub Pages Sitemap[^<]*<\/title>/i);
});

test("index links to the secondary docs page", () => {
  assert.match(
    index,
    /href="why-a-subpath-site-cannot-govern-its-robots-txt\.html"/,
    "index must link the secondary docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", () => {
  assert.match(secondary, /href="\.\/"/);
});

test("secondary docs page answers the search question without a warranty gap", () => {
  assert.match(secondary, /robots\.txt/i);
  assert.match(secondary, /FAQPage/);
  assert.match(secondary, /No warranty/);
  assert.match(secondary, /no SLA/i);
});

test("the docs page names what the tool cannot tell you, explicitly", () => {
  assert.match(secondary, /cannot tell you/i);
  assert.match(secondary, /Whether any search engine has actually indexed/i);
  assert.match(secondary, /Compliance with RFC 9309 is voluntary/);
});

test("every .html file in the venture is reachable from the sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  const dir = new URL("./", import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html") continue;
    assert.match(
      sitemap,
      new RegExp(name.replace(/\./g, "\\.")),
      `${name} is missing from sitemap.xml`,
    );
  }
});

// Closest siblings: all four are free, browser-only checks on whether a
// published site is actually reachable by a crawler. Without a crawlable link
// here, a crawler entering on this tool never reaches them in one hop.
test("index links one hop to its closest sibling checkers", () => {
  assert.match(index, /href="\.\.\/sitemap-lastmod-freshness-check\/"/);
  assert.match(index, /href="\.\.\/ai-crawler-access-check\/"/);
  assert.match(index, /href="\.\.\/canonical-tag-check\/"/);
});

test("the worked example the page loads really does produce the documented verdict", () => {
  // Dogfooding, asserted rather than asserted-about: run the page's own
  // example inputs through the engine and check the headline claim holds. A
  // worked example that silently stops reproducing is a page telling a
  // visitor something the tool no longer does.
  const exampleUrl = index.match(/siteUrl\.value = "([^"]+)"/);
  assert.ok(exampleUrl, "expected the example to set a site URL");
  const report = assess({
    siteUrl: exampleUrl[1],
    publishedRobots: [
      "User-agent: *",
      "Allow: /",
      "",
      "Sitemap: https://duncan-haywood.github.io/monorepo-projects/sitemap.xml",
    ].join("\n"),
  });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, "does-not-govern");
  assert.ok(report.findings.some((f) => f.id === "sitemap-never-discovered"));
});

test("user input is never interpolated as markup", () => {
  // Everything the visitor pastes reaches the DOM through textContent or a
  // text node. An innerHTML assignment anywhere in this page would turn a
  // pasted robots.txt into markup the page executes.
  const script = index.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(script, "expected the module script");
  assert.doesNotMatch(script[1], /innerHTML/);
  assert.doesNotMatch(script[1], /outerHTML/);
  assert.doesNotMatch(script[1], /insertAdjacentHTML/);
  assert.doesNotMatch(script[1], /document\.write/);
});

test("the page counts only named feature events, and says which", () => {
  assert.match(index, /record\("check_run"\)/);
  assert.match(index, /record\("example_loaded"\)/);
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, "");
  assert.match(prose, /check_run/);
  assert.match(prose, /example_loaded/);
  assert.match(prose, /Do Not Track and Global Privacy Control are honoured/);
});

// The comparison page is this venture's organic-discovery surface for
// searchers who have just done the obvious manual thing (opened robots.txt
// and read it) and either got the wrong file or wondered what they might be
// missing. A crawler that never reaches it is a channel that does not exist.
const VS_PAGE = "vs-checking-robots-txt-by-eye.html";

test("index links to the comparison page", async () => {
  assert.match(index, new RegExp(`href="${VS_PAGE.replace(/\./g, "\\.")}"`));
});

test("the comparison page links back to the checker and its FAQPage JSON-LD matches the visible text", async () => {
  const vs = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(vs, /href="\.\/"/);
  const blocks = [...vs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  const visible = vs.replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim: ${name}`);
    assert.ok(visible.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test("the comparison page carries the disclaimers and is listed in the venture sitemap", async () => {
  const vs = await readFile(new URL(`./${VS_PAGE}`, import.meta.url), "utf8");
  assert.match(vs, /No warranty/);
  assert.match(vs, /Nothing leaves your browser/);
  assert.match(vs, /names no specific product/i);
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, new RegExp(VS_PAGE.replace(/\./g, "\\.")));
});

test("the comparison page does not repeat a question the index page already answers", async () => {
  const faqOf = async (name) => {
    const html = await readFile(new URL(`./${name}`, import.meta.url), "utf8");
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b["@type"] === "FAQPage");
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const vsQuestions = await faqOf(VS_PAGE);
  const indexQuestions = await faqOf("index.html");
  const overlap = [...vsQuestions].filter((q) => indexQuestions.has(q));
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(", ")}`);
});

// The comparison table claims this checker applies RFC 9309's longest-match
// rule where eyeballing tends to get it backwards. Prove it against the real
// engine: a longer, more specific Allow beats a shorter Disallow that also
// matches, even though the Disallow could look more prominent to a reader.
test("the comparison page's longest-match claim holds against the real engine", async () => {
  const governing = [
    "User-agent: *",
    "Disallow: /repo/",
    "Allow: /repo/public/",
  ].join("\n");
  const report = assess({
    siteUrl: "https://example.github.io/repo/public/",
    governingRobots: governing,
  });
  assert.equal(report.ok, true);
  assert.ok(
    report.findings.some((f) => f.id === "allowed-by-origin-root"),
    "expected the longer, more specific Allow rule to win over the shorter Disallow",
  );
});
