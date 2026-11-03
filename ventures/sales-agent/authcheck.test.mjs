import test from "node:test";
import assert from "node:assert/strict";
import { checkSpf, checkDmarc, checkDkim, checkAuth } from "./authcheck.mjs";
const rules = (r) => r.findings.map((x) => x.rule);
const key2048 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA" + "A".repeat(350);

test("a normal SPF record is clean apart from the softfail note", () => {
  const r = checkSpf('"v=spf1 include:_spf.google.com ip4:203.0.113.5 ~all"');
  assert.deepEqual(r.findings.filter((x) => x.level !== "info"), []);
  assert.equal(r.lookups, 1); assert.equal(r.all, "~all");
});
test("missing, doubled and +all SPF are errors", () => {
  assert.ok(rules(checkSpf([])).includes("spf-missing"));
  assert.ok(rules(checkSpf(["v=spf1 -all", "v=spf1 ~all"])).includes("spf-multiple"));
  assert.ok(rules(checkSpf("v=spf1 +all")).includes("spf-plus-all"));
});
test("more than 10 lookups is an error; ptr and ?all warn", () => {
  const inc = Array.from({ length: 11 }, (_, i) => `include:s${i}.example`).join(" ");
  assert.ok(rules(checkSpf(`v=spf1 ${inc} -all`)).includes("spf-lookups"));
  const r = checkSpf("v=spf1 ptr ?all");
  assert.ok(rules(r).includes("spf-ptr") && rules(r).includes("spf-neutral"));
});
test("split TXT strings are joined and a typo is flagged", () => {
  const r = checkSpf('"v=spf1 include:a.example " "-all"');
  assert.equal(r.all, "-all");
  assert.ok(rules(checkSpf("v=spf1 inclde:a.example -all")).includes("spf-term"));
});
test("DMARC: missing, wrong first tag, none, enforcing", () => {
  assert.ok(rules(checkDmarc("")).includes("dmarc-missing"));
  assert.ok(rules(checkDmarc("p=reject; v=DMARC1")).includes("dmarc-version"));
  const none = checkDmarc("v=DMARC1; p=none");
  assert.ok(rules(none).includes("dmarc-none") && rules(none).includes("dmarc-rua"));
  const ok = checkDmarc("v=DMARC1; p=reject; rua=mailto:d@example.com");
  assert.deepEqual(ok.findings.filter((x) => x.level !== "info"), []);
});
test("DMARC: bad policy, rua without mailto, pct, sp=none", () => {
  assert.ok(rules(checkDmarc("v=DMARC1; p=block")).includes("dmarc-policy"));
  assert.ok(rules(checkDmarc("v=DMARC1; p=reject; rua=d@example.com")).includes("dmarc-rua-format"));
  assert.ok(rules(checkDmarc("v=DMARC1; p=reject; pct=25; sp=none; rua=mailto:a@b.co")).includes("dmarc-pct"));
  assert.ok(rules(checkDmarc("v=DMARC1; p=reject; sp=none; rua=mailto:a@b.co")).includes("dmarc-sp"));
});
test("DKIM: 2048-bit key passes, short key and revoked key flagged", () => {
  assert.deepEqual(checkDkim(`v=DKIM1; k=rsa; p=${key2048}`).findings, []);
  assert.equal(checkDkim(`v=DKIM1; p=${key2048}`).bits, 2048);
  assert.ok(rules(checkDkim("v=DKIM1; p=" + "A".repeat(216))).includes("dkim-short-key"));
  assert.ok(rules(checkDkim("v=DKIM1; p=")).includes("dkim-revoked"));
  assert.ok(rules(checkDkim("")).includes("dkim-missing"));
  assert.ok(rules(checkDkim(`v=DKIM1; t=y; p=${key2048}`)).includes("dkim-testing"));
  assert.ok(rules(checkDkim('v=DKIM1; p="abc def!"')).includes("dkim-key-chars"));
});
test("checkAuth combines the parts and ok follows errors", () => {
  const r = checkAuth({ spf: "v=spf1 -all", dmarc: "v=DMARC1; p=reject; rua=mailto:a@b.co", dkim: `v=DKIM1; p=${key2048}` });
  assert.equal(r.ok, true);
  assert.equal(checkAuth({}).ok, false);
  assert.ok(checkAuth({ spf: "v=spf1 +all" }).errors.some((x) => x.part === "spf"));
});
