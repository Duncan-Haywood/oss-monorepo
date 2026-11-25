import { test } from "node:test";
import assert from "node:assert/strict";
import { portalFee, yearOfPortalFees, PORTALS } from "./portals.mjs";

test("Textura: 0.22% of contract value, Oracle's own worked example ($50,000 -> $110)", () => {
  const r = portalFee({ contract: "50,000", portal: "textura" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.fee, 11000);
});

test("Textura: capped at $5,000 (about $2.3M and up), $3,750 on projects created before 20 Jan 2023", () => {
  assert.equal(portalFee({ contract: 10000000, portal: "textura" }).fee, 500000);
  assert.equal(portalFee({ contract: 2000000, portal: "textura" }).fee, 440000);
  assert.equal(portalFee({ contract: 2300000, portal: "textura" }).fee, 500000);
  assert.equal(portalFee({ contract: 10000000, portal: "textura", before2023: true }).fee, 375000);
  assert.match(portalFee({ contract: 10000000, portal: "textura" }).rule, /capped/);
});

test("Textura lower-tier sub: flat $100 whatever the value", () => {
  assert.equal(portalFee({ contract: 900000, portal: "textura", subTier: true }).fee, 10000);
});

test("Procore Pay: 0.2% with a $4,000 cap per commitment; $0 when the GC pays", () => {
  assert.equal(portalFee({ contract: 250000, portal: "procore" }).fee, 50000);
  assert.equal(portalFee({ contract: 3000000, portal: "procore" }).fee, 400000);
  assert.equal(portalFee({ contract: 5000000, portal: "procore" }).fee, 400000);
  assert.equal(portalFee({ contract: 250000, portal: "procore", gcPays: true }).fee, 0);
});

test("Trimble Pay when invited is free to the sub", () => {
  assert.equal(portalFee({ contract: 250000, portal: "trimble" }).fee, 0);
});

test("bad input is an error, never a zero fee", () => {
  for (const contract of ["", " ", "abc", "1e5", "0", "-5000", null]) {
    assert.ok(portalFee({ contract, portal: "textura" }).errors.length, String(contract));
  }
  assert.ok(portalFee({ contract: 1000, portal: "nope" }).errors.length);
  assert.ok(yearOfPortalFees({ jobs: "2.5", averageContract: 1000, portal: "textura" }).errors.length);
  assert.ok(yearOfPortalFees({ jobs: "", averageContract: 1000, portal: "textura" }).errors.length);
});

test("a year of portal fees: one fee per subcontract", () => {
  const r = yearOfPortalFees({ jobs: "8", averageContract: "400000", portal: "textura" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.perJob, 88000);
  assert.equal(r.total, 704000);
});

test("every portal cites the vendor's own help pages", () => {
  for (const p of Object.values(PORTALS)) assert.match(p.source, /^https:\/\/(docs\.oracle\.com|support\.procore\.com|help\.trimble\.com)\//);
});
