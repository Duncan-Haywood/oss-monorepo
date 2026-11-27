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
  for (const m of html.matchAll(/import\("\.\/([\w.-]+\.mjs)"\)/g)) readFileSync(new URL(`./${m[1]}`, import.meta.url));
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

test("create.html offers document-level allowances and charges, and Croatia's out-of-scope labels", () => {
  assert.match(html, /<tbody id="adjustments">/);
  assert.match(html, /data-f="hr_label"[^>]*><option value="">none<\/option><option>POVNAK<\/option><option>PP<\/option><option>PPMV<\/option><option>N<\/option>/);
  assert.match(html, /\.\.\.adjustments\(\)/);
});

// 2026-11-22: facturx-pdf.mjs and report.mjs are about 800 kB compressed; as static imports they held the whole form
// (live totals included) until they had arrived. They load with import() when "Create" is pressed or on first input.
test("create.html keeps the Factur-X writer and the preflight off its static imports", () => {
  const mod = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const statics = [...mod.matchAll(/^\s*import\s*\{[^}]*\}\s*from\s*"([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(statics.sort(), ["./generate.mjs", "./usage.mjs"]);
  assert.match(mod, /import\("\.\/facturx-pdf\.mjs"\), import\("\.\/report\.mjs"\)/);
  assert.match(mod, /\$\("generate"\)\.onclick = async \(\) => \{[\s\S]*?try \{ await loadHeavy\(\); \}[\s\S]*?Object\.hasOwn\(FACTURX_PROFILES/);
});
