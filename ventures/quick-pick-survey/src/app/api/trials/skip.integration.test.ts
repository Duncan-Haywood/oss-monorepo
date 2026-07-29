import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { prisma } from "@/lib/prisma";
import { createParticipant, jsonRequest, resetData, surveyIdBySlug } from "@/test/integration/db";
import { POST as skipTrial } from "./skip/route";

describe("POST /api/trials/skip", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("requires trialId and kind", async () => {
    const res = await skipTrial(jsonRequest("http://localhost/api/trials/skip", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("trialId and kind are required");
  });

  it("records skip on an ITEMS trial", async () => {
    const surveyId = await surveyIdBySlug("behaviours");
    const participant = await createParticipant("behaviours");

    const items = await prisma.item.findMany({ where: { surveyId }, take: 2 });
    const trial = await prisma.trial.create({
      data: {
        participantId: participant.id,
        itemAId: items[0].id,
        itemBId: items[1].id,
      },
    });

    const res = await skipTrial(
      jsonRequest("http://localhost/api/trials/skip", {
        trialId: trial.id,
        kind: "ITEMS",
        clientMsToAnswer: 1500,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyHandled).toBe(false);

    const updated = await prisma.trial.findUnique({ where: { id: trial.id } });
    expect(updated?.interactionMethod).toBe("skip");
    expect(updated?.clientMsToAnswer).toBe(1500);
  });

  it("returns alreadyHandled true when skipping an already handled trial", async () => {
    const surveyId = await surveyIdBySlug("behaviours");
    const participant = await createParticipant("behaviours");
    const items = await prisma.item.findMany({ where: { surveyId }, take: 2 });

    const trial = await prisma.trial.create({
      data: {
        participantId: participant.id,
        itemAId: items[0].id,
        itemBId: items[1].id,
        result: "A",
        interactionMethod: "click",
      },
    });

    const res = await skipTrial(
      jsonRequest("http://localhost/api/trials/skip", {
        trialId: trial.id,
        kind: "ITEMS",
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyHandled).toBe(true);
  });
});
