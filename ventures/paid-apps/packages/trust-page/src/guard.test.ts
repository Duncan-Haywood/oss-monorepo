import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertHonestText, isValidSource, TrustClaimError, validateProfile } from "./guard.ts";
import { grantsProfile } from "./profiles/grants.ts";
import type { TrustProfile } from "./types.ts";

const withClaim = (
  text: string,
  sources: string[] = ["apps/grants/wrangler.jsonc"],
): TrustProfile => ({
  ...grantsProfile,
  sections: { ...grantsProfile.sections, access: [{ text, status: "in_place", sources }] },
});

describe("assertHonestText", () => {
  for (const bad of [
    "We are SOC 2 compliant",
    "SOC2 Type II audited",
    "ISO 27001 certified",
    "ISO/IEC 27001:2022",
    "PCI-DSS level 1",
    "HIPAA ready",
    "Listed on the CSA STAR registry",
    "GDPR-compliant hosting",
    "Our certification covers this",
    "independently attested controls",
    "bank-grade encryption",
    "100% secure",
    "we guarantee uptime",
  ]) {
    it(`refuses: ${bad}`, () => {
      assert.throws(() => assertHonestText(bad, "t"), TrustClaimError);
    });
  }
  it("allows plain factual text", () => {
    assertHonestText("Passwords are stored only as salted PBKDF2-SHA-256 hashes.", "t");
    assertHonestText("Two-factor authentication is not offered yet.", "t");
  });
});

describe("validateProfile", () => {
  it("accepts the shipped profiles' shape", () => {
    validateProfile(grantsProfile);
  });
  it("refuses certification wording inside a claim", () => {
    assert.throws(
      () => validateProfile(withClaim("Hosted on SOC 2 audited infrastructure")),
      TrustClaimError,
    );
  });
  it("refuses a claim without a source", () => {
    assert.throws(() => validateProfile(withClaim("Something true", [])), /at least one source/);
  });
  it("refuses an empty section", () => {
    const p = { ...grantsProfile, sections: { ...grantsProfile.sections, backups: [] } };
    assert.throws(() => validateProfile(p), /backups is empty/);
  });
  it("refuses a bad security contact and a bad date", () => {
    assert.throws(
      () => validateProfile({ ...grantsProfile, securityContact: "security@x.test" }),
      /mailto/,
    );
    assert.throws(
      () => validateProfile({ ...grantsProfile, reviewedOn: "2026-02-30" }),
      /reviewedOn/,
    );
  });
  it("refuses trustUrlCheckedOn without a valid date or url", () => {
    const [first, ...rest] = grantsProfile.subprocessors;
    assert.ok(first);
    const bad = { ...first, trustUrlCheckedOn: "yesterday" };
    assert.throws(
      () => validateProfile({ ...grantsProfile, subprocessors: [bad, ...rest] }),
      /YYYY-MM-DD/,
    );
  });
  it("refuses duplicate subprocessor ids", () => {
    const [first] = grantsProfile.subprocessors;
    assert.ok(first);
    assert.throws(
      () => validateProfile({ ...grantsProfile, subprocessors: [first, first] }),
      /duplicate/,
    );
  });
});

describe("isValidSource", () => {
  it("accepts repo paths and https URLs only", () => {
    assert.equal(isValidSource("apps/grants/docs/RUNBOOK.md#7-accidental-deletion"), true);
    assert.equal(isValidSource("https://developers.cloudflare.com/d1/"), true);
    assert.equal(isValidSource("../outside.md"), false);
    assert.equal(isValidSource("/etc/passwd"), false);
    assert.equal(isValidSource("http://insecure.example"), false);
    assert.equal(isValidSource(""), false);
  });
});
