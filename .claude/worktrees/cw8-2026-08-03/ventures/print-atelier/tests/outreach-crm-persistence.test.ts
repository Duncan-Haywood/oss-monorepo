import test from "node:test";
import assert from "node:assert/strict";
import {
  recordProspectCrmEntry,
  getProspectCrmRecords,
  clearProspectCrmRecords,
  updateProspectReplyState,
  summarizeProspectCrmPipeline,
} from "../src/lib/outreach-crm-persistence";

test("records outreach CRM prospect entry and retrieves cleanly", () => {
  clearProspectCrmRecords();

  const record = recordProspectCrmEntry({
    artistHandle: "@nordic_prints",
    artistName: "Astrid Lindgren",
    sourceChannel: "instagram_dm",
    fitScore: 92,
    replyIntent: "upload_link_request",
    nextActionState: "send_onboard_link",
    skuGuardrailStatus: "safe",
  });

  assert.equal(record.artistHandle, "@nordic_prints");
  assert.equal(record.replyIntent, "upload_link_request");
  assert.equal(record.skuGuardrailStatus, "safe");

  const records = getProspectCrmRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].prospectId, record.prospectId);
});

test("updates reply intent and next action state", () => {
  clearProspectCrmRecords();

  const record = recordProspectCrmEntry({
    artistHandle: "@minimal_art",
    artistName: "Sven Nordin",
    sourceChannel: "email",
    fitScore: 85,
    replyIntent: "pending",
    nextActionState: "wait_reply",
    skuGuardrailStatus: "safe",
  });

  const updated = updateProspectReplyState(
    record.prospectId,
    "mockup_request",
    "send_mockup_kit",
  );

  assert.notEqual(updated, null);
  assert.equal(updated?.replyIntent, "mockup_request");
  assert.equal(updated?.nextActionState, "send_mockup_kit");
});

test("summarizes prospect CRM pipeline accurately", () => {
  clearProspectCrmRecords();

  recordProspectCrmEntry({
    artistHandle: "@artist1",
    artistName: "Artist One",
    sourceChannel: "instagram_dm",
    fitScore: 90,
    replyIntent: "upload_link_request",
    nextActionState: "send_onboard_link",
    skuGuardrailStatus: "safe",
  });

  recordProspectCrmEntry({
    artistHandle: "@artist2",
    artistName: "Artist Two",
    sourceChannel: "behance",
    fitScore: 88,
    replyIntent: "upload_link_request",
    nextActionState: "send_onboard_link",
    skuGuardrailStatus: "held",
  });

  recordProspectCrmEntry({
    artistHandle: "@artist3",
    artistName: "Artist Three",
    sourceChannel: "instagram_dm",
    fitScore: 75,
    replyIntent: "rights_question",
    nextActionState: "send_rights_faq",
    skuGuardrailStatus: "safe",
  });

  const summary = summarizeProspectCrmPipeline();
  assert.equal(summary.totalProspects, 3);
  assert.equal(summary.uploadReadyCount, 1); // Only safe guardrail count
  assert.equal(summary.heldGuardrailCount, 1);
  assert.equal(summary.byChannel.instagram_dm, 2);
  assert.equal(summary.byChannel.behance, 1);
});
