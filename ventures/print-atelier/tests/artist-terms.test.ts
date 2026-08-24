import { test } from "node:test";
import assert from "node:assert/strict";
import { ARTIST_TERMS_DISCLAIMER, ARTIST_TERMS_SECTIONS } from "../src/lib/artist-terms";

test("every section has a title, summary, and at least one detail", () => {
  for (const section of ARTIST_TERMS_SECTIONS) {
    assert.ok(section.id.length > 0, "section id must not be empty");
    assert.ok(section.title.length > 0, `${section.id} must have a title`);
    assert.ok(section.summary.length > 0, `${section.id} must have a summary`);
    assert.ok(section.details.length > 0, `${section.id} must have at least one detail`);
    for (const detail of section.details) {
      assert.ok(detail.length > 0, `${section.id} must not have an empty detail`);
    }
  }
});

test("section ids are unique", () => {
  const ids = ARTIST_TERMS_SECTIONS.map((section) => section.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("covers all four onboarding consent checkboxes, plus copyright context", () => {
  const consentKeys = ARTIST_TERMS_SECTIONS.map((section) => section.consentKey).filter(
    (key): key is NonNullable<typeof key> => key !== null,
  );
  assert.deepEqual(
    new Set(consentKeys),
    new Set(["podLicense", "adRights", "aiRoomScenes", "payoutAcknowledgement"]),
  );
  assert.equal(ARTIST_TERMS_SECTIONS.length, consentKeys.length + 1, "exactly one context-only section (copyright)");
});

test("payout section discloses the demo has no live payments yet", () => {
  const payoutSection = ARTIST_TERMS_SECTIONS.find((section) => section.consentKey === "payoutAcknowledgement");
  assert.ok(payoutSection);
  const combined = [payoutSection.summary, ...payoutSection.details].join(" ").toLowerCase();
  assert.ok(combined.includes("demo") || combined.includes("modeled"), "payout section must disclose demo/modeled data");
});

test("disclaimer states this is not legal advice and not the binding agreement", () => {
  const lower = ARTIST_TERMS_DISCLAIMER.toLowerCase();
  assert.ok(lower.includes("not legal advice"));
  assert.ok(lower.includes("not the binding agreement") || lower.includes("not binding"));
});
