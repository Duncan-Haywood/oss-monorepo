import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";

import { decodeEntities } from "../../platform/pages/entities.mjs";

const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
const versus = await readFile(
  new URL("./vs-manually-checking-nested-references.html", import.meta.url),
  "utf8",
);

test("the entry page is a working tool, not a landing page", () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /analyze\.mjs/);
});

test("the page carries the portfolio disclaimers and names the fetch honestly", () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
  // Unlike pinned-actions-check, this tool DOES make network calls for the
  // transitive step -- the privacy section must say so plainly rather than
  // copying a "makes no network calls" claim that would now be false.
  assert.match(index, /raw\.githubusercontent\.com/);
  assert.match(index, /nothing passes through any server of ours|no server of ours/i);
});

test("the page never claims a clean result means the repository is secure", () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, "");
  const claims = /\b(?:is|are|was|were)\s+secure\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    const asked = following.trimStart().startsWith("?");
    assert.ok(
      denied || asked,
      `unqualified security claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`,
    );
  }
  assert.match(index, /not a security audit/);
});

test("unresolved fetches are never reported as clean", () => {
  assert.match(index, /unresolved/);
  assert.match(index, /not confirmed clean|unconfirmed, not clean|never as clean/i);
});

test("the JSON-LD FAQPage questions match the visible FAQ headings", () => {
  const ldMatch = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(ldMatch, "expected a FAQPage JSON-LD block");
  const ld = ldMatch[0];
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  assert.ok(headings.length > 0, "expected visible h3 FAQ headings");
  for (const heading of headings) {
    assert.ok(ld.includes(heading), `visible heading not found in FAQPage JSON-LD: ${heading}`);
  }
});

test("title and meta description carry the actual search phrase", () => {
  assert.match(index, /<title>[^<]*Transitive[^<]*Pin[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*commit SHA[^"]*"/);
});

test("every .html file in the venture is reachable from the sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  const dir = new URL("./", import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html") continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});

// Reciprocal to pinned-actions-check/page.test.mjs's own assertion on this
// href -- platform/pages/siblings.mjs's orphan budget is 0, so this venture
// must ship with an inbound sibling link from its first commit, not as a
// worklist item to close later.
test("index links one hop to the pinned-actions-check sibling", () => {
  assert.match(
    index,
    /href="\.\.\/pinned-actions-check\/"/,
    'index must link ../pinned-actions-check/ so crawlers reach it in one hop',
  );
});

test("index links one hop to the actions-injection-check sibling", () => {
  assert.match(index, /href="\.\.\/actions-injection-check\/"/);
});

test("index links one hop to the actions-permissions-check sibling", () => {
  assert.match(index, /href="\.\.\/actions-permissions-check\/"/);
});

// The generic-method comparison page (surface-budget.mjs: this venture had
// room for one, and it names no competitor, so it is listed in
// clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than carrying a
// not-affiliated sentence about a party that does not exist).
test("index links to the vs-manually-checking-nested-references comparison page", () => {
  assert.match(index, /href="vs-manually-checking-nested-references\.html"/);
});

test("the comparison page links back to the tool and carries the no-warranty clause", () => {
  assert.match(versus, /href="\.\/index\.html"/, "the comparison page must link back to the tool");
  assert.match(versus, /No warranty\.<\/strong>/);
  assert.match(versus, /not a security audit/);
  assert.match(versus, /Names no specific product or company/, "must state it names no competitor");
});

test("the comparison page declares a title, description, canonical and Open Graph tags", () => {
  const title = versus.match(/<title>([^<]+)<\/title>/);
  assert.ok(title, "vs-manually-checking-nested-references.html has no title");
  assert.ok(title[1].length > 20 && title[1].length < 110, `title length ${title[1].length}`);
  const description = versus.match(/<meta name="description" content="([^"]+)"/);
  assert.ok(description, "vs-manually-checking-nested-references.html has no meta description");
  assert.ok(description[1].length > 80, "meta description is too short to be useful");
  assert.match(versus, /<link rel="canonical"/);
  assert.match(versus, /property="og:title"/);
  assert.match(versus, /property="og:description"/);
  assert.match(versus, /<html lang="en">/);
});

test("the comparison page reaches no network and takes no remote dependency", () => {
  assert.doesNotMatch(versus, /\bfetch\s*\(/);
  assert.doesNotMatch(versus, /XMLHttpRequest|navigator\.sendBeacon|new WebSocket|EventSource/);
  assert.doesNotMatch(versus, /<script[^>]+src=/);
  assert.doesNotMatch(versus, /<link[^>]+href="https?:/);
});

test("the comparison page's FAQPage JSON-LD parses, is non-trivial and matches its visible Q&A exactly", () => {
  const blocks = [...versus.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "vs-manually-checking-nested-references.html has no FAQPage block");
  const names = faq.mainEntity.map((q) => q.name);
  assert.equal(names.length, new Set(names).size, "a question is repeated");
  const text = versus.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");
  const squash = (s) => decodeEntities(s).replace(/\s+/g, " ").trim();
  const visible = squash(text);
  for (const entry of faq.mainEntity) {
    assert.equal(entry["@type"], "Question");
    assert.equal(entry.acceptedAnswer["@type"], "Answer");
    assert.ok(entry.acceptedAnswer.text.length > 120, `"${entry.name}" is answered too thinly to be worth indexing`);
    assert.ok(visible.includes(squash(entry.name)), `question not visible: ${entry.name}`);
    assert.ok(
      visible.includes(squash(entry.acceptedAnswer.text)),
      `answer not visible verbatim for: ${entry.name}`,
    );
  }
});
