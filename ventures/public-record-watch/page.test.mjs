import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("page carries the no-warranty clause and a local-only privacy line", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, tax, financial, medical, or engineering advice/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /never uploaded/i);
});

test("page wires evidence, usage, and app scripts", () => {
  assert.match(page, /id="before-paste"/);
  assert.match(page, /id="after-paste"/);
  assert.match(page, /src="evidence\.js"/);
  assert.match(page, /src="usage\.js"/);
  assert.match(page, /src="app\.js"/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /recordUsage/);
  assert.match(app, /snapshot_compared/);
  assert.match(app, /buildReport/);
});

test("page explicitly disclaims uploading exports anywhere", () => {
  assert.doesNotMatch(page, /upload (your|the) (snapshot|export)/i);
  assert.match(page, /never uploaded/i);
});

test("page states it does not rank people or decide suitability", () => {
  assert.match(page, /does not create personal profiles, rank people, decide/i);
});

test("offers a worked example so a first visit does not start on an empty box", () => {
  assert.match(page, /id="load-example"/);
  assert.match(page, /worked example/i);
});

test("privacy opt-out checkbox is present and wired for usage counting", () => {
  assert.match(page, /id="optout"/);
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /setUsageEnabled/);
  assert.match(app, /isUsageEnabled/);
});

test("example fixtures referenced by app.js are real, authorized snapshots checked into the venture", () => {
  const before = JSON.parse(readFileSync(new URL("./examples/before.json", import.meta.url), "utf8"));
  const after = JSON.parse(readFileSync(new URL("./examples/after.json", import.meta.url), "utf8"));
  assert.ok(before.authorized && before.register && before.source_url && Array.isArray(before.records));
  assert.ok(after.authorized && after.register && after.source_url && Array.isArray(after.records));
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /examples\/before\.json/);
  assert.match(app, /examples\/after\.json/);
});

test("page carries FAQ-shaped questions for AI/search discovery", () => {
  const questions = [...page.matchAll(/<h3>([^<]+\?)<\/h3>/g)];
  assert.ok(questions.length >= 3, "expected several question-shaped h3 headings");
});

// Regression: sitemap.xml shipped with #2201's browser front end still only
// listed `./README.md` -- a leftover from before this venture had any HTML
// at all. robots.txt points crawlers at this sitemap, so a search engine or
// AI assistant following it found a markdown file and never learned the
// tool itself (index.html) or its FAQ landing page
// (how-do-i-track-changes-to-a-public-register.html, added by #2039/#2043)
// existed. PRODUCT_PLAYBOOK.md's discoverability checklist requires "a
// sitemap... that lets assistants crawl" as part of the definition of done;
// a sitemap pointing at prose instead of the product fails that on arrival.
test("sitemap lists the actual product pages, not just README.md", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.doesNotMatch(sitemap, /README\.md/);
  assert.match(sitemap, /<loc>\.\/<\/loc>/);
  assert.match(sitemap, /how-do-i-track-changes-to-a-public-register\.html/);
});

test("every .html file in the venture is reachable from the sitemap", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  const dir = new URL("./", import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html") continue; // carried as the bare "./" entry
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});
