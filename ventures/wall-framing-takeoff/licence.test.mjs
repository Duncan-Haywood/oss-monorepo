import test from "node:test";
import assert from "node:assert/strict";
import { paidPathOn, cleanKey, interpretValidation, checkLicence, validateRequest } from "./licence.mjs";
import * as shipped from "./licence-config.mjs";
import { bidPackageHtml, safeLogo, safeAccent } from "./bidpackage.mjs";
import { proposal } from "./bidletter.mjs";

const cfg = { CHECKOUT_URL: "https://buy.example/x", LICENCE_ORG_ID: "org_1", VALIDATE_URL: "https://v.example/validate" };

test("shipped config is dark: no Buy button, no network call", async () => {
  assert.equal(paidPathOn(shipped), false);
  let called = false;
  const r = await checkLicence("abcdefgh12", shipped, async () => { called = true; });
  assert.equal(called, false);
  assert.equal(r.off, true);
});
test("paid path needs https link and org id", () => {
  assert.equal(paidPathOn(cfg), true);
  assert.equal(paidPathOn({ ...cfg, CHECKOUT_URL: "http://x" }), false);
  assert.equal(paidPathOn({ ...cfg, LICENCE_ORG_ID: " " }), false);
  assert.equal(paidPathOn({ ...cfg, CHECKOUT_URL: "javascript:alert(1)" }), false);
});
test("key cleaning", () => { assert.equal(cleanKey(" ABCD-1234_x "), "ABCD-1234_x"); assert.equal(cleanKey("a b"), ""); assert.equal(cleanKey("<script>"), ""); });
test("validate request carries key and org only", () => {
  const { init } = validateRequest("KEY12345", cfg);
  assert.deepEqual(JSON.parse(init.body), { key: "KEY12345", organization_id: "org_1" });
});
test("interpretation", () => {
  assert.equal(interpretValidation(200, { status: "granted" }).valid, true);
  assert.equal(interpretValidation(200, { status: "revoked" }).valid, false);
  assert.equal(interpretValidation(404, null).valid, false);
  assert.equal(interpretValidation(500, null).retry, true);
  assert.equal(interpretValidation(200, { status: "granted", expires_at: "2020-01-01T00:00:00Z" }, Date.parse("2026-01-01")).valid, false);
  assert.equal(interpretValidation(200, { status: "granted", expires_at: "2030-01-01T00:00:00Z" }, Date.parse("2026-01-01")).valid, true);
});
test("checkLicence handles network failure and bad json", async () => {
  assert.equal((await checkLicence("KEY12345", cfg, async () => { throw new Error("x"); })).retry, true);
  assert.equal((await checkLicence("KEY12345", cfg, async () => ({ status: 200, json: async () => { throw new Error("x"); } }))).valid, false);
  assert.equal((await checkLicence("KEY12345", cfg, async () => ({ status: 200, json: async () => ({ status: "granted" }) }))).valid, true);
  assert.match((await checkLicence("", cfg)).reason, /Paste/);
});

const b = {
  lines: [{ section: "Sheathing", item: "Wall sheets", qty: 10, unit: "sheets", unitPrice: 30, amount: 300 }],
  sections: [{ name: "Sheathing", subtotal: 300, unpriced: 0 }], materials: 300, tax: 0, contingency: 0, total: 300, bid: 360, unpriced: [],
};
test("bid package escapes everything typed and rejects unsafe logo/accent", () => {
  const q = proposal(b, { client: "<b>Ann</b>", project: "A&B", date: "2026-11-02", terms: ["<img src=x onerror=1>"] });
  const html = bidPackageHtml(q, [{ item: "2x4 <x>", qty: 5, unit: "ea" }], { company: "<script>alert(1)</script>", logo: "javascript:alert(1)", accent: "red;}</style><script>", licenceNo: "L-1" });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("javascript:"));
  assert.match(html, /border-top:10px solid #1f4e79/);
  assert.match(html, /360\.00/);
  assert.match(html, /Contractor licence no\. L-1/);
  assert.equal(safeLogo("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(safeLogo("data:image/svg+xml;base64,AAAA"), "");
  assert.equal(safeAccent("#abcdef"), "#abcdef");
});
test("bid package refuses when the proposal is not ok", () => {
  assert.match(bidPackageHtml({ ok: false, error: "no <price>" }), /not issued.*no &lt;price&gt;/);
});
