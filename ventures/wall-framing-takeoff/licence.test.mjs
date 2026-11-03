import { test } from "node:test";
import assert from "node:assert/strict";
import { buyLink, cleanKey, interpret, checkLicence } from "./licence.mjs";

test("buyLink accepts only plain https URLs", () => {
  assert.equal(buyLink("https://shop.example.com/v1/licenses/validate"), "https://shop.example.com/v1/licenses/validate");
  for (const bad of ["http://x.com", "javascript:alert(1)", "https://user:pw@x.com/", "https://user@x.com/", "", null, undefined, "not a url", "ftp://x.com"]) {
    assert.equal(buyLink(bad), null, String(bad));
  }
});

test("cleanKey trims and rejects odd or short/long tokens", () => {
  assert.equal(cleanKey("  ABCD-1234-EFGH  "), "ABCD-1234-EFGH");
  for (const bad of ["short", "-ABCDEFGH", "ABCD 1234 EFGH", "ABCD_1234_EFGH", "é".repeat(10), "A".repeat(101), "", null, undefined, "AB\nCDEFGHIJ"]) {
    assert.equal(cleanKey(bad), null, JSON.stringify(bad));
  }
  assert.ok(cleanKey("A".repeat(100)));
});

test("interpret unlocks only on explicit valid:true with a live key", () => {
  assert.deepEqual(interpret({ valid: true }), { valid: true, reason: "" });
  assert.deepEqual(interpret({ valid: true, license_key: { status: "active" } }), { valid: true, reason: "" });
  assert.equal(interpret({ valid: true, license_key: { status: "expired" } }).valid, false);
  assert.equal(interpret({ valid: true, license_key: { status: "disabled" } }).valid, false);
  assert.match(interpret({ valid: false, license_key: { status: "expired" } }).reason, /expired/);
  assert.match(interpret({ valid: false, license_key: { status: "disabled" } }).reason, /disabled/);
  for (const j of [null, undefined, "yes", 1, [], {}, { valid: "true" }, { valid: 1 }]) {
    assert.equal(interpret(j).valid, false, JSON.stringify(j));
  }
  assert.equal(interpret({ valid: false, error: "x".repeat(500) }).reason.length, 120);
  assert.equal(interpret({ valid: false, error: 5 }).reason, "key not recognised");
});

test("checkLicence never throws and sends only the cleaned key", async () => {
  const url = "https://shop.example.com/validate";
  let seen;
  const ok = async (u, init) => { seen = { u, init }; return { json: async () => ({ valid: true }) }; };
  assert.deepEqual(await checkLicence(" ABCD-1234-EFGH ", { fetch: ok, url }), { valid: true, reason: "" });
  assert.equal(seen.u, url);
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.body, "license_key=ABCD-1234-EFGH");

  seen = undefined;
  assert.equal((await checkLicence("bad key!", { fetch: ok, url })).valid, false);
  assert.equal(seen, undefined, "malformed key must not reach the network");
  assert.match((await checkLicence("ABCD-1234-EFGH", { fetch: ok, url: "http://insecure" })).reason, /unavailable/);

  const down = async () => { throw new Error("offline"); };
  assert.match((await checkLicence("ABCD-1234-EFGH", { fetch: down, url })).reason, /could not reach/);
  const html = async () => ({ json: async () => { throw new SyntaxError("<html>"); } });
  assert.equal((await checkLicence("ABCD-1234-EFGH", { fetch: html, url })).valid, false);
});
