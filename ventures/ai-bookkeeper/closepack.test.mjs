import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";
import { closePackHtml, safeColor, safeLogo } from "./closepack.mjs";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";
import { CHECKOUT_URL } from "./checkout.mjs";

const csv = fs.readFileSync(new URL("./fixtures/chase-checking.csv", import.meta.url), "utf8");
const books = importStatement(newBooks(), csv, "1000").books;

test("pack carries letterhead, period, close checks and the three statements", () => {
  const h = closePackHtml(books, { business: "Oak & Pine Books", client: "Acme LLC", from: "2020-01-01", to: "2030-12-31", accent: "#aa3300", date: "2026-11-02" });
  assert.match(h, /Oak &amp; Pine Books/);
  assert.match(h, /Acme LLC/);
  for (const s of ["Close checks", "Profit and loss", "Balance sheet", "Total assets", "Net profit"]) assert.ok(h.includes(s), s);
  assert.match(h, /--a:#aa3300/);
  assert.match(h, /still need an account/); // fresh import: lines unfiled, pack must say so
  assert.match(h, /No warranty/);
});

test("typed text is escaped; no script rides in on logo or colour", () => {
  const h = closePackHtml(books, { business: "<script>alert(1)</script>", client: "<img onerror=x>", notes: "<b onclick=1>", logo: "data:image/svg+xml;base64,AAAA", accent: "red;}</style><script>" });
  assert.ok(!h.includes("<script>alert"));
  assert.ok(!h.includes("<img onerror"));
  assert.ok(!h.includes("<b onclick"));
  assert.equal(safeLogo("data:image/svg+xml;base64,AAAA"), "");
  assert.equal(safeColor("red;}"), "#1f3a5f");
});

test("licence: dark by default, only an explicit live key unlocks, offline never throws", async () => {
  assert.equal(buyLink(CHECKOUT_URL), CHECKOUT_URL || null); // dark when empty, live when golive.py set a link
  assert.equal(cleanKey("short"), null);
  assert.equal(interpret({ valid: true, license_key: { status: "disabled" } }).valid, false);
  const off = await checkLicence("ABCD-1234-EFGH", { url: "https://example.com/v", fetch: async () => { throw new Error("offline"); } });
  assert.equal(off.valid, false);
  const ok = await checkLicence("ABCD-1234-EFGH", { url: "https://example.com/v", fetch: async () => ({ json: async () => ({ valid: true, license_key: { status: "active" } }) }) });
  assert.equal(ok.valid, true);
});
