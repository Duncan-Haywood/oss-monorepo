import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
