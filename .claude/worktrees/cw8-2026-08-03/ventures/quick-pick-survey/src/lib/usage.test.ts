import { describe, expect, it } from "vitest";
import { parseUsageBatch } from "@/lib/usage";

describe("parseUsageBatch", () => {
  const occurredAt = Date.now();
  const identity = { clientEventId: "eventkey123456789", sequence: 1, occurredAt };

  it("accepts only the bounded telemetry vocabulary", () => {
    expect(parseUsageBatch({
      sessionKey: "abcdefghijklmnop",
      events: [{ ...identity, event: "answer_save", path: "/app", perspective: "SELF", domain: "values", durationMs: 420, statusCode: 503, success: false }],
    })?.events[0]).toEqual({ ...identity, occurredAt: new Date(occurredAt), event: "answer_save", path: "/app", perspective: "SELF", domain: "values", durationMs: 420, statusCode: 503, success: false });
  });

  it("rejects unknown events and oversized batches", () => {
    expect(parseUsageBatch({ sessionKey: "abcdefghijklmnop", events: [{ ...identity, event: "arbitrary" }] })).toBeNull();
    expect(parseUsageBatch({ sessionKey: "abcdefghijklmnop", events: Array.from({ length: 26 }, (_, sequence) => ({ ...identity, clientEventId: `eventkey123456${sequence.toString().padStart(3, "0")}`, sequence, event: "route_view" })) })).toBeNull();
  });

  it("drops malformed optional context rather than storing it", () => {
    const parsed = parseUsageBatch({
      sessionKey: "abcdefghijklmnop",
      events: [{ ...identity, event: "route_view", path: "https://evil.example", domain: "../../secret", durationMs: 999_999, statusCode: 42 }],
    });
    expect(parsed?.events[0]).toMatchObject({ path: null, domain: null, durationMs: null, statusCode: null });
  });

  it("accepts viral and retention telemetry events", () => {
    for (const eventName of ["couple_invite_created", "couple_joined", "card_shared", "nps_submitted", "streak_milestone", "insight_shared", "retention_return_visit"]) {
      const parsed = parseUsageBatch({
        sessionKey: "abcdefghijklmnop",
        events: [{ ...identity, event: eventName, path: "/app", perspective: "PARTNER" }],
      });
      expect(parsed?.events[0].event).toBe(eventName);
    }
  });

  it("accepts feedback exposure and dismissal events", () => {
    for (const eventName of ["feedback_prompt", "feedback_dismiss"]) {
      const parsed = parseUsageBatch({
        sessionKey: "abcdefghijklmnop",
        events: [{ ...identity, event: eventName, path: "/insights", domain: "top-pick" }],
      });
      expect(parsed?.events[0]).toMatchObject({ event: eventName, domain: "top-pick" });
    }
  });
});
