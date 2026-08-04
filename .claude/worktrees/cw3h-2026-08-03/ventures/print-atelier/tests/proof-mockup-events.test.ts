import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  clearProofMockupSendEventsLedger,
  createProofMockupSendEvent,
  getProofMockupSendEventsHistory,
  recordProofMockupSendEvent,
  summarizeProofMockupSendEvents,
} from "../src/lib/proof-mockup-events.ts";

beforeEach(() => {
  clearProofMockupSendEventsLedger();
});

test("createProofMockupSendEvent constructs valid event object with defaults", () => {
  const event = createProofMockupSendEvent({
    prospectHandle: "@artist.jane",
    artistName: "Jane Doe",
    artworkSlug: "vibrant-flora",
    channel: "dm",
    copyVersion: "v1.0-transparent-math",
    sceneCount: 3,
    payoutLine: "$24.00 per $80.00 print",
  });

  assert.ok(event.eventId.startsWith("pm_send_"));
  assert.equal(event.prospectHandle, "@artist.jane");
  assert.equal(event.artistName, "Jane Doe");
  assert.equal(event.artworkSlug, "vibrant-flora");
  assert.equal(event.channel, "dm");
  assert.equal(event.copyVersion, "v1.0-transparent-math");
  assert.equal(event.sceneCount, 3);
  assert.equal(event.status, "sent");
});

test("recordProofMockupSendEvent persists and filters by prospect handle", () => {
  const ev1 = createProofMockupSendEvent({
    prospectHandle: "@artist.jane",
    artistName: "Jane Doe",
    artworkSlug: "vibrant-flora",
    channel: "dm",
    copyVersion: "v1.0",
    sceneCount: 3,
    payoutLine: "$24.00",
  });

  const ev2 = createProofMockupSendEvent({
    prospectHandle: "@marcus.art",
    artistName: "Marcus Vance",
    artworkSlug: "urban-geometry",
    channel: "email",
    copyVersion: "v1.1",
    sceneCount: 4,
    payoutLine: "$30.00",
  });

  recordProofMockupSendEvent(ev1);
  recordProofMockupSendEvent(ev2);

  const historyAll = getProofMockupSendEventsHistory();
  assert.equal(historyAll.length, 2);

  const janeHistory = getProofMockupSendEventsHistory("@artist.jane");
  assert.equal(janeHistory.length, 1);
  assert.equal(janeHistory[0]?.artistName, "Jane Doe");
});

test("summarizeProofMockupSendEvents computes channel and artwork slug breakdowns", () => {
  recordProofMockupSendEvent(
    createProofMockupSendEvent({
      prospectHandle: "@artist.jane",
      artistName: "Jane Doe",
      artworkSlug: "vibrant-flora",
      channel: "dm",
      copyVersion: "v1.0",
      sceneCount: 3,
      payoutLine: "$24.00",
    }),
  );

  recordProofMockupSendEvent(
    createProofMockupSendEvent({
      prospectHandle: "@artist.jane",
      artistName: "Jane Doe",
      artworkSlug: "vibrant-flora",
      channel: "email",
      copyVersion: "v1.0",
      sceneCount: 3,
      payoutLine: "$24.00",
    }),
  );

  const summary = summarizeProofMockupSendEvents();
  assert.equal(summary.totalSent, 2);
  assert.equal(summary.channelBreakdown.dm, 1);
  assert.equal(summary.channelBreakdown.email, 1);
  assert.equal(summary.artworkSlugBreakdown["vibrant-flora"], 2);
  assert.equal(summary.deliveryRate, 100);
});
