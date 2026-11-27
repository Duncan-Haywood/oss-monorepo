import { test } from "node:test";
import assert from "node:assert/strict";
import { preflightDocuments } from "./report.mjs";
import { auditPackHtml, safeColor, safeLogo, esc } from "./auditpack.mjs";
import { CHECKOUT_URL } from "./checkout.mjs";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";

const good = { invoice_number: "A-1", issue_date: "2026-01-05", currency: "EUR", supplier: { id: "DE123", name: "Supplier GmbH" }, customer: { id: "DE456", name: "Customer GmbH" }, lines: [{ description: "Consulting", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }], totals: { net: 200, tax: 38, gross: 238 } };
const bad = { ...good, invoice_number: "A-2", totals: { net: 200, tax: 38, gross: 999 } };
const run = () => preflightDocuments([{ name: "good.json", source: JSON.stringify(good) }, { name: "<b>bad</b>.json", source: JSON.stringify(bad) }, { name: "junk.json", source: "{nope" }]);

test("the pack lists every file, the rules and the limits", async () => {
  const r = await run();
  const h = auditPackHtml(r, { title: "Q1 audit", author: "A. Accountant", contact: "a@example.com", date: "2026-11-03", scope: "Q1 sales invoices" });
  assert.match(h, /<h1>Q1 audit<\/h1>/);
  assert.match(h, /A\. Accountant · 2026-11-03 · a@example\.com/);
  assert.match(h, /good\.json<\/code><\/td><td class="pass">PASS/);
  assert.match(h, /class="fail">FAIL/);
  assert.match(h, /Files that could not be read/);
  assert.match(h, /not<\/strong> a declaration that an invoice is legally valid/);
  assert.match(h, /Scope:<\/strong> Q1 sales invoices/);
  for (const rule of Object.keys(r.reports[1].errors.reduce((a, e) => ({ ...a, [e.rule]: 1 }), {}))) assert.ok(h.includes(`<code>${rule}</code>`));
});

test("typed text, file names and findings are escaped; colour and logo are restricted", async () => {
  const r = await run();
  const h = auditPackHtml(r, { title: "<script>x</script>", author: "<i>i</i>", notes: "<u>n</u>", scope: "<img src=x>", accent: "red;}</style><script>", logo: "data:image/svg+xml;base64,AAAA" });
  for (const bad of ["<script>", "<i>i</i>", "<u>n</u>", "<img src=x", "<b>bad</b>", "svg+xml"]) assert.ok(!h.includes(bad), bad);
  assert.equal(safeColor("#12abEF"), "#12abEF");
  assert.equal(safeColor("red"), "#1f5f86");
  assert.ok(safeLogo("data:image/png;base64,iVBOR"));
  assert.equal(safeLogo("https://x.test/a.png"), "");
  assert.equal(esc(null), "");
});

test("an empty or all-pass run still renders honestly", async () => {
  const ok = await preflightDocuments([{ name: "good.json", source: JSON.stringify(good) }]);
  const h = auditPackHtml(ok, {});
  assert.match(h, /Overall: PASS/);
  assert.match(h, /No findings in the supported checks/);
  assert.match(auditPackHtml({ reports: [], readErrors: [] }, {}), /No invoice was checked/);
});

test("stays dark until a checkout link is set, and unlock never throws", async () => {
  assert.equal(buyLink(CHECKOUT_URL), CHECKOUT_URL || null);
  assert.equal(buyLink("http://x.test"), null);
  assert.equal(cleanKey("short"), null);
  assert.equal(interpret({ valid: true, license_key: { status: "disabled" } }).valid, false);
  assert.equal(interpret({ valid: true, license_key: { status: "active" } }).valid, true);
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: "" })).valid, false);
  const boom = async () => { throw new Error("offline"); };
  assert.equal((await checkLicence("ABCD-1234-EFGH", { url: "https://x.test/v", fetch: boom })).valid, false);
});

test("the committed sample pack is what the code produces today", async () => {
  const { samplePack } = await import("./build-sample-pack.mjs");
  const { readFileSync } = await import("node:fs");
  assert.equal(readFileSync(new URL("./sample-audit-pack.html", import.meta.url), "utf8"), await samplePack());
});
