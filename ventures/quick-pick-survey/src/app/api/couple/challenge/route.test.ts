import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/couples", () => ({
  coupleFor: vi.fn(),
  generateInviteCode: () => "CHAL-TEST",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupleChallenge: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { coupleFor } from "@/lib/couples";
import { prisma } from "@/lib/prisma";

type MockUser = { id: string; email: string; passwordHash: string; firstName: string; gender: string | null; seeking: string | null; createdAt: Date };

describe("POST /api/couple/challenge", () => {
  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);
    const res = await POST(new Request("http://localhost/api/couple/challenge", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("creates a new challenge invite link when user is in a paired couple", async () => {
    const mockUser: MockUser = {
      id: "user-1",
      email: "test@example.com",
      passwordHash: "",
      firstName: "Alex",
      gender: null,
      seeking: null,
      createdAt: new Date(),
    };
    vi.mocked(getSessionUser).mockResolvedValueOnce(mockUser);
    vi.mocked(coupleFor).mockResolvedValueOnce({
      couple: {
        id: "couple-1",
        inviteCode: "INV-1",
        creatorId: "user-1",
        joinerId: "user-2",
        createdAt: new Date(),
        joinedAt: new Date(),
        creator: { id: "user-1", firstName: "Alex" },
        joiner: { id: "user-2", firstName: "Partner" },
      },
      partner: { id: "user-2", firstName: "Partner" },
    });
    vi.mocked(prisma.coupleChallenge.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.coupleChallenge.create).mockResolvedValueOnce({
      id: "chal-1",
      inviteCode: "CHAL-TEST",
      challengerCoupleId: "couple-1",
      challengedCoupleId: null,
      deckId: "core-values",
      createdAt: new Date(),
    });

    const req = new Request("http://localhost/api/couple/challenge", {
      method: "POST",
      body: JSON.stringify({ deckId: "core-values" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inviteCode: string; challengeUrl: string };
    expect(body.inviteCode).toBe("CHAL-TEST");
    expect(body.challengeUrl).toBe("/couple/challenge/CHAL-TEST");
  });
});
