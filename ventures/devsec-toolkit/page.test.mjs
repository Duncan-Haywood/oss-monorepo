import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");

test("the page is a working tool: a report viewer with a worked example", () => {
  assert.match(index, /id="report-file"/);
  assert.match(index, /id="report-text"/);
  assert.match(index, /id="open-report"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /from "\.\/viewer\.mjs"/);
  assert.match(index, /import\("\.\/example-report\.mjs"\)/);
});

test("the page carries the portfolio disclaimers and stays local", () => {
  assert.match(index, /No warranty/);
  assert.match(index, /not a security audit/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

test("the page never claims a clean scan means the repository is secure", () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, "");
  for (const match of prose.matchAll(/\b(?:is|are|was|were)\s+secure\b/gi)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    const asked = following.trimStart().startsWith("?");
    assert.ok(denied || asked, `unqualified security claim near: ${prose.slice(Math.max(0, match.index - 60), match.index + 40)}`);
  }
});

test("the JSON-LD FAQ matches the visible questions and answers", () => {
  const ld = index.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/);
  assert.ok(ld, "FAQPage block missing");
  const faq = JSON.parse(ld[1]);
  const visible = [...index.matchAll(/<h3>([^<]+)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [m[1], m[2]]);
  const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  for (const q of faq.mainEntity) {
    const hit = visible.find(([h]) => strip(h) === q.name);
    assert.ok(hit, `FAQ question not visible on the page: ${q.name}`);
    assert.equal(strip(hit[1]), q.acceptedAnswer.text);
  }
});

test("every relative link resolves to a file the venture ships or a sibling venture page", () => {
  for (const [, href] of index.matchAll(/href="([^"#]+)"/g)) {
    if (/^(https?|data):/.test(href)) continue;
    const url = new URL(href.endsWith("/") ? `${href}index.html` : href, import.meta.url);
    assert.ok(existsSync(url), `broken link: ${href}`);
  }
});

test("the sitemap lists the page", () => {
  assert.match(sitemap, /<loc>\.\/index\.html<\/loc>/);
});
