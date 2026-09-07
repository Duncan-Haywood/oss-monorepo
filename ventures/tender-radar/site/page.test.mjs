import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("page persists a local draft and can clear it", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="clear-draft"/);
  assert.match(page, /from "\.\/draft\.mjs"/);
  assert.match(page, /draft_restored/);
  assert.match(page, /draft_cleared/);
  assert.match(page, /Clear saved data/);
  assert.match(page, /Restored your last shortlist inputs/);
});

test("page shows a Days left column and days-until-deadline is exported for it", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /<th>Days left<\/th>/);
  assert.match(page, /daysUntil/);
});

test("every FAQPage question/answer pair is also rendered as visible copy", async () => {
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const ld = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((block) => block["@type"] === "FAQPage");
  assert.ok(ld, "expected a FAQPage JSON-LD block");
  for (const entry of ld.mainEntity) {
    assert.ok(page.includes(entry.name), `question not visible on page: ${entry.name}`);
    assert.ok(page.includes(entry.acceptedAnswer.text), `answer not visible on page: ${entry.acceptedAnswer.text}`);
  }
});

// Regression: sitemap.xml listed only the index and missed both secondary
// pages linked from it (which-tenders… and vs-govwin). Same incomplete
// hand-authored sitemap class fixed fleet-wide in #3292.
test("every .html file in the venture is reachable from the sitemap", async () => {
  const sitemap = await readFile(new URL("./sitemap.xml", import.meta.url), "utf8");
  const htmlFiles = (await readdir(new URL("./", import.meta.url))).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html" || name === "offline.html") continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});
