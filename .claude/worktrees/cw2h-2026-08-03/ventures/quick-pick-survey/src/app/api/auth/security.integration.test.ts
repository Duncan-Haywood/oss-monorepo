import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("@/test/integration/cookieMock"));

import { createSession, hashPassword, hashToken, verifyPassword } from "@/lib/auth";
import { rateLimitKey } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { jsonRequest, resetData } from "@/test/integration/db";
import { POST as resetPassword } from "./reset-password/route";
import { POST as signup } from "./signup/route";

describe("authentication hardening", () => {
  beforeEach(async () => {
    await resetData();
  });

  it("limits successful account creation per IP", async () => {
    const ip = "203.0.113.44";
    await prisma.anonRequestLog.createMany({
      data: Array.from({ length: 8 }, () => ({ ip: rateLimitKey(ip), route: "auth/signup" })),
    });

    const response = await signup(
      jsonRequest(
        "http://localhost/api/auth/signup",
        { firstName: "Ada", email: "ada@example.com", password: "secure-password-123" },
        { "x-forwarded-for": ip }
      )
    );

    expect(response.status).toBe(429);
    expect(await prisma.user.count()).toBe(0);
  });

  it("allows only one concurrent claimant to use a reset token", async () => {
    const oldPassword = "old-password-123";
    const user = await prisma.user.create({
      data: {
        email: "ada@example.com",
        firstName: "Ada",
        passwordHash: await hashPassword(oldPassword),
      },
    });
    const token = "a".repeat(64);
    await prisma.passwordResetToken.create({
      data: {
        email: user.email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const [first, second] = await Promise.all([
      resetPassword(
        jsonRequest("http://localhost/api/auth/reset-password", {
          token,
          newPassword: "first-password-123",
        })
      ),
      resetPassword(
        jsonRequest("http://localhost/api/auth/reset-password", {
          token,
          newPassword: "second-password-123",
        })
      ),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 400]);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const accepted =
      (await verifyPassword("first-password-123", updated.passwordHash)) ||
      (await verifyPassword("second-password-123", updated.passwordHash));
    expect(accepted).toBe(true);
  });

  it("caps one account at ten active sessions and removes expired rows", async () => {
    const user = await prisma.user.create({
      data: { email: "sessions@example.com", firstName: "Session", passwordHash: "unused" },
    });
    await prisma.userSession.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({
        userId: user.id,
        tokenHash: hashToken(`existing-${index}`),
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });
    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken("expired"),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    await createSession(user.id);

    expect(await prisma.userSession.count({ where: { userId: user.id } })).toBe(10);
    expect(await prisma.userSession.count({ where: { expiresAt: { lt: new Date() } } })).toBe(0);
  });
});
