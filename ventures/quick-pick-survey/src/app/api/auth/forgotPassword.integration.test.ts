import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

import { rateLimitKey } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { jsonRequest, resetData } from "@/test/integration/db";
import { POST as forgotPassword } from "./forgot-password/route";

describe("POST /api/auth/forgot-password", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("returns 400 for invalid email formats", async () => {
    const res = await forgotPassword(
      jsonRequest("http://localhost/api/auth/forgot-password", { email: "not-an-email" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("valid email address");
  });

  it("returns generic success without creating token for non-existent user", async () => {
    const res = await forgotPassword(
      jsonRequest("http://localhost/api/auth/forgot-password", { email: "nobody@example.com" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("creates a password reset token for existing user", async () => {
    const user = await prisma.user.create({
      data: {
        email: "user@example.com",
        firstName: "User",
        passwordHash: "hash123",
      },
    });

    const res = await forgotPassword(
      jsonRequest("http://localhost/api/auth/forgot-password", { email: user.email })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const tokens = await prisma.passwordResetToken.findMany({ where: { email: user.email } });
    expect(tokens.length).toBe(1);
    expect(tokens[0].usedAt).toBeNull();
  });

  it("enforces rate limit per IP", async () => {
    const ip = "198.51.100.55";
    await prisma.anonRequestLog.createMany({
      data: Array.from({ length: 10 }, () => ({ ip: rateLimitKey(ip), route: "forgot-password" })),
    });

    const res = await forgotPassword(
      jsonRequest(
        "http://localhost/api/auth/forgot-password",
        { email: "user@example.com" },
        { "x-forwarded-for": ip }
      )
    );
    expect(res.status).toBe(429);
  });
});
