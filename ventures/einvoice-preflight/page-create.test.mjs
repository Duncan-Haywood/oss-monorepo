import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildJsonReport, preflightDocuments } from "./report.mjs";
import { generateInvoice } from "./generate.mjs";

const html = readFileSync(new URL("./create.html", import.meta.url), "utf8");

test("create.html carries the disclaimer, donate link and local-only claim", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /sponsors\/Duncan-Haywood/);
  assert.match(html, /never uploaded/);
  assert.match(html, /<title>[^<]*invoice creator/i);
});

test("create.html imports only modules that exist and read the report shape the page uses", async () => {
  for (const m of html.matchAll(/from "\.\/([\w.-]+\.mjs)"/g)) readFileSync(new URL(`./${m[1]}`, import.meta.url));
  const r = generateInvoice({
    number: "1", issue_date: "2026-01-01",
    seller: { name: "a", city: "b", country: "DE", vat_id: "DE136695976" }, buyer: { name: "c", country: "DE" },
    lines: [{ description: "x", unit_price: 1, tax_percent: 19 }],
  }, { profile: "en16931" });
  const check = buildJsonReport(await preflightDocuments([{ name: r.filename, source: r.xml }]));
  assert.ok(Array.isArray(check.errors), "page reads check.errors");
});

test("create.html links only to pages the front-door mirror can serve (no README.md link)", () => {
  assert.doesNotMatch(html, /href="README\.md"/);
});
