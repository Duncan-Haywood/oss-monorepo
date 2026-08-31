import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function readPage() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, "..", "24h-vs-48h-cancellation-notice.html"), "utf8");
}

test("notice explainer embeds valid JSON-LD and the disclaimer", () => {
  const html = readPage();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1);
  for (const [, json] of blocks) {
    const parsed = JSON.parse(json);
    assert.equal(parsed["@context"], "https://schema.org");
  }
  assert.match(html, /No warranty\./);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /\$3,432/);
  assert.match(html, /does not put another client in the chair/);
});
