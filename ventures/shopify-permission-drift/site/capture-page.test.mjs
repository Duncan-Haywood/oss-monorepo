import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.html"), "utf8");

test("capture page states the value, disclaimer, and local privacy line", () => {
  assert.match(html, /Turn an authorized app export into an inventory/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, financial, security, or compliance advice/);
  assert.match(html, /never leaves this browser/);
  assert.match(html, /inventory_normalized/);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /declared scopes/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /Compare → drift record/);
});
