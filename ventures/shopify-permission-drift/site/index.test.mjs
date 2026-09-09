import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.html"), "utf8");

test("landing copy names the Shopify permission problem in the first screen", () => {
  assert.match(html, /<title>Shopify Permission Drift Record/);
  assert.match(html, /meta name="description"/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /FAQPage/);
  assert.match(html, /HowTo/);
});

test("user-facing disclaimer and privacy line are on the page", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, financial, security, or compliance advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /GitHub Sponsors/);
});

test("primary actions exist for compare, example, export, and ticket copy", () => {
  assert.match(html, /id="compareBtn"/);
  assert.match(html, /id="exampleBtn"/);
  assert.match(html, /id="downloadBtn"/);
  assert.match(html, /id="copyBtn"/);
  assert.match(html, /id="before"/);
  assert.match(html, /id="after"/);
  assert.match(html, /href="\.\/capture.html"/);
});

test("links to the CRA evidence desk", () => {
  assert.match(html, /href="\.\.\/cra-evidence-desk\/"/, "the sibling-tool link is missing");
});
