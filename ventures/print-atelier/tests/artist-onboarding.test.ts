import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateArtistOnboardingReadiness,
  createEmptyArtistOnboardingIntake,
  linkCaptureSessionToIntake,
  submitArtistOnboardingIntake,
  validateArtistOnboardingIntake,
} from "../src/lib/artist-onboarding.ts";

test("validateArtistOnboardingIntake requires profile and all consent fields", () => {
  const draft = createEmptyArtistOnboardingIntake();
  const validation = validateArtistOnboardingIntake(draft);

  assert.equal(validation.valid, false);
  assert.ok(validation.errors.length >= 4);
  assert.equal(validation.missingConsent.length, 4);
});

test("calculateArtistOnboardingReadiness reaches ready with full intake and capture link", () => {
  const intake = createEmptyArtistOnboardingIntake({
    name: "Alex Jenkins",
    email: "alex@studio.com",
    handle: "@alexjenkinsart",
    medium: "Oil painting",
    consent: {
      podLicense: true,
      adRights: true,
      aiRoomScenes: true,
      payoutAcknowledgement: true,
    },
    captureSessionId: "cap_test_123",
  });

  const readiness = calculateArtistOnboardingReadiness(intake);

  assert.equal(readiness.score, 100);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.blockers.length, 0);
});

test("submitArtistOnboardingIntake marks ready-for-review when validation passes", () => {
  const intake = createEmptyArtistOnboardingIntake({
    name: "Alex Jenkins",
    email: "alex@studio.com",
    handle: "@alexjenkinsart",
    medium: "Oil painting",
    consent: {
      podLicense: true,
      adRights: true,
      aiRoomScenes: true,
      payoutAcknowledgement: true,
    },
    captureSessionId: "cap_test_456",
  });

  const { intake: submitted, validation } = submitArtistOnboardingIntake(intake);

  assert.equal(validation.valid, true);
  assert.equal(submitted.status, "ready-for-review");
});

test("linkCaptureSessionToIntake advances status when capture is linked", () => {
  const intake = createEmptyArtistOnboardingIntake({
    name: "Alex Jenkins",
    email: "alex@studio.com",
    handle: "@alexjenkinsart",
    medium: "Oil painting",
    status: "submitted",
    consent: {
      podLicense: true,
      adRights: true,
      aiRoomScenes: true,
      payoutAcknowledgement: true,
    },
  });

  const linked = linkCaptureSessionToIntake(intake, "cap_linked_789");

  assert.equal(linked.captureSessionId, "cap_linked_789");
  assert.equal(linked.status, "ready-for-review");
});
