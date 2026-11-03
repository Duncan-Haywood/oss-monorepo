import test from "node:test";
import assert from "node:assert/strict";
import { checkSpf, checkDmarc, checkDkim, checkRecord, checkAll, bulkSenderGaps } from "./authcheck.mjs";

const levels = (r) => r.issues.map((i) => i.level);

test("clean SPF passes with no issues", () => {
  const r = checkSpf('"v=spf1 include:_spf.google.com ~all"');
  assert.equal(r.ok, true); assert.equal(r.issues.length, 0); assert.equal(r.lookups, 1);
});
test("SPF +all is an error, ?all a warning, missing all a warning", () => {
  assert.equal(checkSpf("v=spf1 +all").ok, false);
  assert.deepEqual(levels(checkSpf("v=spf1 a ?all")), ["warn"]);
  assert.deepEqual(levels(checkSpf("v=spf1 a")), ["warn"]);
});
test("SPF counts lookups and errors above 10", () => {
  const inc = Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(" ");
  const r = checkSpf(`v=spf1 ${inc} -all`);
  assert.equal(r.lookups, 11); assert.equal(r.ok, false);
});
test("SPF ip4 and all do not count as lookups; ptr warns", () => {
  const r = checkSpf("v=spf1 ip4:1.2.3.4 ptr -all");
  assert.equal(r.lookups, 1); assert.ok(r.issues.some((i) => /ptr/.test(i.msg)));
});
test("SPF without version is an error", () => assert.equal(checkSpf("include:x ~all").ok, false));
test("split quoted TXT strings are joined", () => {
  assert.equal(checkSpf('"v=spf1 include:a.example " "include:b.example -all"').lookups, 2);
});

test("DMARC p=none warns, reject with rua is clean", () => {
  assert.equal(checkDmarc("v=DMARC1; p=none; rua=mailto:d@example.com").ok, true);
  assert.ok(levels(checkDmarc("v=DMARC1; p=none; rua=mailto:d@example.com")).includes("warn"));
  assert.equal(checkDmarc("v=DMARC1; p=reject; rua=mailto:d@example.com").issues.length, 0);
});
test("DMARC missing p, bad p, bad pct and bad rua are errors", () => {
  assert.equal(checkDmarc("v=DMARC1; rua=mailto:a@b.co").ok, false);
  assert.equal(checkDmarc("v=DMARC1; p=block").ok, false);
  assert.equal(checkDmarc("v=DMARC1; p=reject; pct=150").ok, false);
  assert.equal(checkDmarc("v=DMARC1; p=reject; rua=d@example.com").ok, false);
});
test("DMARC pct<100 on enforcement warns", () => {
  assert.ok(checkDmarc("v=DMARC1; p=quarantine; pct=25; rua=mailto:a@b.co").issues.some((i) => /25%/.test(i.msg)));
});

const key2048 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA" + "A".repeat(348);
test("DKIM 2048-bit key clean; short key warns; empty p is revoked", () => {
  assert.equal(checkDkim(`v=DKIM1; k=rsa; p=${key2048}`).issues.length, 0);
  const short = checkDkim("v=DKIM1; k=rsa; p=" + "A".repeat(216));
  assert.equal(short.approxBits, 1024); assert.ok(levels(short).includes("warn"));
  assert.equal(checkDkim("v=DKIM1; p=").ok, false);
});
test("DKIM bad base64 and testing flag", () => {
  assert.equal(checkDkim("v=DKIM1; p=abc$def").ok, false);
  assert.ok(checkDkim(`v=DKIM1; t=y; p=${key2048}`).issues.some((i) => /testing/.test(i.msg)));
});

test("checkRecord dispatches by content and rejects unknown", () => {
  assert.equal(checkRecord("v=spf1 -all").type, "SPF");
  assert.equal(checkRecord("v=DMARC1; p=none").type, "DMARC");
  assert.equal(checkRecord(`v=DKIM1; p=${key2048}`).type, "DKIM");
  assert.equal(checkRecord("hello").type, "unknown");
});
test("checkAll skips blanks and comments; gaps list what is missing", () => {
  const rs = checkAll("# mine\n\nv=spf1 -all\n");
  assert.equal(rs.length, 1);
  assert.equal(bulkSenderGaps(rs).length, 2);
  assert.equal(bulkSenderGaps(checkAll(`v=spf1 -all\nv=DMARC1; p=none\nv=DKIM1; p=${key2048}`)).length, 0);
});
