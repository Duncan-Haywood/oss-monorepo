import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { POST } from "@/app/api/usage/route";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { jsonRequest, resetData } from "@/test/integration/db";

describe("usage telemetry", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("stores only validated fields and hashes the browser session key", async () => {
    const sessionKey = "browserSessionKey123456";
    const response = await POST(jsonRequest("http://localhost/api/usage", {
      sessionKey,
      events: [{
        clientEventId: "clientEventKey123456",
        sequence: 7,
        occurredAt: Date.now(),
        event: "answer_save",
        path: "/app",
        perspective: "SELF",
        domain: "shared-life",
        durationMs: 321,
        success: true,
        ignored: "never stored",
      }],
    }, { "x-forwarded-for": "203.0.113.5" }));

    expect(response.status).toBe(200);
    const stored = await prisma.usageEvent.findFirstOrThrow();
    expect(stored).toMatchObject({
      sessionKeyHash: hashToken(sessionKey),
      clientEventId: "clientEventKey123456",
      sequence: 7,
      event: "answer_save",
      path: "/app",
      perspective: "SELF",
      domain: "shared-life",
      durationMs: 321,
      success: true,
    });
    expect(stored.sessionKeyHash).not.toContain(sessionKey);
  });

  it("rejects an event outside the allowlist", async () => {
    const response = await POST(jsonRequest("http://localhost/api/usage", {
      sessionKey: "browserSessionKey123456",
      events: [{ clientEventId: "clientEventKey123456", sequence: 1, occurredAt: Date.now(), event: "record_everything" }],
    }));
    expect(response.status).toBe(400);
    expect(await prisma.usageEvent.count()).toBe(0);
  });

  it("deduplicates a retry whose first response was lost", async () => {
    const request = () => jsonRequest("http://localhost/api/usage", {
      sessionKey: "browserSessionKey123456",
      events: [{ clientEventId: "sameClientEvent12345", sequence: 1, occurredAt: Date.now(), event: "route_view", path: "/app" }],
    }, { "x-forwarded-for": "203.0.113.6" });
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect(await prisma.usageEvent.count()).toBe(1);
  });
});
