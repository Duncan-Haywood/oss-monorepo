import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/couples", () => ({
  coupleFor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    coupleChallenge: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getSessionUser } from "@/lib/auth";
import { coupleFor } from "@/lib/couples";
import { prisma } from "@/lib/prisma";

type MockUser = { id: string; email: string; passwordHash: string; firstName: string; gender: string | null; seeking: string | null; createdAt: Date };

function createGetRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function createPostRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "POST" });
}

describe("/api/couple/challenge/[code]", () => {
  describe("GET", () => {
    it("returns 400 if code is empty", async () => {
      const res = await GET(createGetRequest("http://localhost/api/couple/challenge/"), {
        params: Promise.resolve({ code: "   " }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid challenge code.");
    });

    it("returns 404 if challenge does not exist", async () => {
      vi.mocked(prisma.coupleChallenge.findUnique).mockResolvedValueOnce(null);
      const res = await GET(createGetRequest("http://localhost/api/couple/challenge/CHAL-404"), {
        params: Promise.resolve({ code: "CHAL-404" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Challenge not found.");
    });

    it("returns challenge details on valid code with redeemed state", async () => {
      vi.mocked(prisma.coupleChallenge.findUnique).mockResolvedValueOnce({
        id: "chal-1",
        inviteCode: "CHAL-TEST",
        deckId: "core-values",
        createdAt: new Date("2026-08-01T00:00:00Z"),
        challengerCoupleId: "couple-1",
        challengedCoupleId: "couple-2",
        challengerCouple: {
          id: "couple-1",
          inviteCode: "INV-1",
          creatorId: "u-1",
          joinerId: "u-2",
          createdAt: new Date(),
          joinedAt: new Date(),
          creator: { id: "u-1", firstName: "Alex" },
          joiner: { id: "u-2", firstName: "Jordan" },
        },
        challengedCouple: {
          id: "couple-2",
          inviteCode: "INV-2",
          creatorId: "u-3",
          joinerId: "u-4",
          createdAt: new Date(),
          joinedAt: new Date(),
          creator: { id: "u-3", firstName: "Sam" },
          joiner: { id: "u-4", firstName: "Pat" },
        },
      } as unknown as Awaited<ReturnType<typeof prisma.coupleChallenge.findUnique>>);

      const res = await GET(createGetRequest("http://localhost/api/couple/challenge/CHAL-TEST"), {
        params: Promise.resolve({ code: "CHAL-TEST" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.inviteCode).toBe("CHAL-TEST");
      expect(data.deckId).toBe("core-values");
      expect(data.challengerNames).toBe("Alex & Jordan");
      expect(data.challengedNames).toBe("Sam & Pat");
      expect(data.isRedeemed).toBe(true);
    });

    it("returns 500 when database query throws", async () => {
      vi.mocked(prisma.coupleChallenge.findUnique).mockRejectedValueOnce(new Error("DB failure"));
      const res = await GET(createGetRequest("http://localhost/api/couple/challenge/CHAL-ERR"), {
        params: Promise.resolve({ code: "CHAL-ERR" }),
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Could not retrieve challenge.");
    });
  });

  describe("POST", () => {
    it("rejects unauthenticated requests with 401", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce(null);
      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/CHAL-TEST"), {
        params: Promise.resolve({ code: "CHAL-TEST" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 if code is empty", async () => {
      const mockUser: MockUser = {
        id: "user-1",
        email: "alex@test.com",
        passwordHash: "",
        firstName: "Alex",
        gender: null,
        seeking: null,
        createdAt: new Date(),
      };
      vi.mocked(getSessionUser).mockResolvedValueOnce(mockUser);
      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/"), {
        params: Promise.resolve({ code: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects user not in paired couple with 400", async () => {
      const mockUser: MockUser = {
        id: "user-single",
        email: "single@test.com",
        passwordHash: "",
        firstName: "Sam",
        gender: null,
        seeking: null,
        createdAt: new Date(),
      };
      vi.mocked(getSessionUser).mockResolvedValueOnce(mockUser);
      vi.mocked(coupleFor).mockResolvedValueOnce(null);

      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/CHAL-TEST"), {
        params: Promise.resolve({ code: "CHAL-TEST" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("must be paired");
    });

    it("returns 404 if challenge does not exist", async () => {
      const mockUser: MockUser = {
        id: "user-3",
        email: "taylor@test.com",
        passwordHash: "",
        firstName: "Taylor",
        gender: null,
        seeking: null,
        createdAt: new Date(),
      };
      vi.mocked(getSessionUser).mockResolvedValueOnce(mockUser);
      vi.mocked(coupleFor).mockResolvedValueOnce({
        couple: {
          id: "couple-2",
          inviteCode: "INV-2",
          creatorId: "user-3",
          joinerId: "user-4",
          createdAt: new Date(),
          joinedAt: new Date(),
          creator: { id: "user-3", firstName: "Taylor" },
          joiner: { id: "user-4", firstName: "Morgan" },
        },
        partner: { id: "user-4", firstName: "Morgan" },
      } as unknown as Awaited<ReturnType<typeof coupleFor>>);
      vi.mocked(prisma.coupleChallenge.findUnique).mockResolvedValueOnce(null);

      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/CHAL-MISSING"), {
        params: Promise.resolve({ code: "CHAL-MISSING" }),
      });
      expect(res.status).toBe(404);
    });

    it("rejects accepting own couple's challenge with 400", async () => {
      const mockUser: MockUser = {
        id: "user-1",
        email: "alex@test.com",
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
          joiner: { id: "user-2", firstName: "Jordan" },
        },
        partner: { id: "user-2", firstName: "Jordan" },
      } as unknown as Awaited<ReturnType<typeof coupleFor>>);
      vi.mocked(prisma.coupleChallenge.findUnique).mockResolvedValueOnce({
        id: "chal-1",
        inviteCode: "CHAL-TEST",
        challengerCoupleId: "couple-1",
        challengedCoupleId: null,
        deckId: "core-values",
        createdAt: new Date(),
      } as unknown as Awaited<ReturnType<typeof prisma.coupleChallenge.findUnique>>);

      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/CHAL-TEST"), {
        params: Promise.resolve({ code: "CHAL-TEST" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("You cannot accept your own challenge.");
    });

    it("rejects challenge already accepted by another couple with 409", async () => {
      const mockUser: MockUser = {
        id: "user-3",
        email: "taylor@test.com",
        passwordHash: "",
        firstName: "Taylor",
        gender: null,
        seeking: null,
        createdAt: new Date(),
      };
      vi.mocked(getSessionUser).mockResolvedValueOnce(mockUser);
      vi.mocked(coupleFor).mockResolvedValueOnce({
        couple: {
          id: "couple-2",
          inviteCode: "INV-2",
          creatorId: "user-3",
          joinerId: "user-4",
          createdAt: new Date(),
          joinedAt: new Date(),
          creator: { id: "user-3", firstName: "Taylor" },
          joiner: { id: "user-4", firstName: "Morgan" },
        },
        partner: { id: "user-4", firstName: "Morgan" },
      } as unknown as Awaited<ReturnType<typeof coupleFor>>);
      vi.mocked(prisma.coupleChallenge.findUnique).mockResolvedValueOnce({
        id: "chal-1",
        inviteCode: "CHAL-TEST",
        challengerCoupleId: "couple-1",
        challengedCoupleId: "couple-3",
        deckId: "core-values",
        createdAt: new Date(),
      } as unknown as Awaited<ReturnType<typeof prisma.coupleChallenge.findUnique>>);

      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/CHAL-TEST"), {
        params: Promise.resolve({ code: "CHAL-TEST" }),
      });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("already been accepted");
    });

    it("successfully accepts challenge when eligible", async () => {
      const mockUser: MockUser = {
        id: "user-3",
        email: "taylor@test.com",
        passwordHash: "",
        firstName: "Taylor",
        gender: null,
        seeking: null,
        createdAt: new Date(),
      };
      vi.mocked(getSessionUser).mockResolvedValueOnce(mockUser);
      vi.mocked(coupleFor).mockResolvedValueOnce({
        couple: {
          id: "couple-2",
          inviteCode: "INV-2",
          creatorId: "user-3",
          joinerId: "user-4",
          createdAt: new Date(),
          joinedAt: new Date(),
          creator: { id: "user-3", firstName: "Taylor" },
          joiner: { id: "user-4", firstName: "Morgan" },
        },
        partner: { id: "user-4", firstName: "Morgan" },
      } as unknown as Awaited<ReturnType<typeof coupleFor>>);
      vi.mocked(prisma.coupleChallenge.findUnique).mockResolvedValueOnce({
        id: "chal-1",
        inviteCode: "CHAL-TEST",
        challengerCoupleId: "couple-1",
        challengedCoupleId: null,
        deckId: "core-values",
        createdAt: new Date(),
      } as unknown as Awaited<ReturnType<typeof prisma.coupleChallenge.findUnique>>);
      vi.mocked(prisma.coupleChallenge.update).mockResolvedValueOnce({
        id: "chal-1",
        inviteCode: "CHAL-TEST",
        challengerCoupleId: "couple-1",
        challengedCoupleId: "couple-2",
        deckId: "core-values",
        createdAt: new Date(),
      } as unknown as Awaited<ReturnType<typeof prisma.coupleChallenge.update>>);

      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/CHAL-TEST"), {
        params: Promise.resolve({ code: "CHAL-TEST" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.inviteCode).toBe("CHAL-TEST");
    });

    it("returns 500 when database update throws", async () => {
      const mockUser: MockUser = {
        id: "user-3",
        email: "taylor@test.com",
        passwordHash: "",
        firstName: "Taylor",
        gender: null,
        seeking: null,
        createdAt: new Date(),
      };
      vi.mocked(getSessionUser).mockResolvedValueOnce(mockUser);
      vi.mocked(coupleFor).mockResolvedValueOnce({
        couple: {
          id: "couple-2",
          inviteCode: "INV-2",
          creatorId: "user-3",
          joinerId: "user-4",
          createdAt: new Date(),
          joinedAt: new Date(),
          creator: { id: "user-3", firstName: "Taylor" },
          joiner: { id: "user-4", firstName: "Morgan" },
        },
        partner: { id: "user-4", firstName: "Morgan" },
      } as unknown as Awaited<ReturnType<typeof coupleFor>>);
      vi.mocked(prisma.coupleChallenge.findUnique).mockResolvedValueOnce({
        id: "chal-1",
        inviteCode: "CHAL-TEST",
        challengerCoupleId: "couple-1",
        challengedCoupleId: null,
        deckId: "core-values",
        createdAt: new Date(),
      } as unknown as Awaited<ReturnType<typeof prisma.coupleChallenge.findUnique>>);
      vi.mocked(prisma.coupleChallenge.update).mockRejectedValueOnce(new Error("DB error"));

      const res = await POST(createPostRequest("http://localhost/api/couple/challenge/CHAL-TEST"), {
        params: Promise.resolve({ code: "CHAL-TEST" }),
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Could not accept challenge.");
    });
  });
});

