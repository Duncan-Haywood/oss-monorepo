import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { jsonRequest, resetData } from "@/test/integration/db";
import { POST as submitUsage } from "./route";

describe("POST /api/usage", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("returns 400 for invalid telemetry batch payload", async () => {
    const res = await submitUsage(jsonRequest("http://localhost/api/usage", { invalid: "payload" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid usage batch");
  });

  it("saves valid telemetry events", async () => {
    const payload = {
      sessionKey: "session-key-1234567890-test",
      events: [
        {
          clientEventId: "usage-event-00000001",
          sequence: 0,
          occurredAt: Date.now(),
          event: "survey_start",
          domain: "behaviors",
        },
      ],
    };

    const res = await submitUsage(jsonRequest("http://localhost/api/usage", payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const count = await prisma.usageEvent.count();
    expect(count).toBe(1);
  });
});
