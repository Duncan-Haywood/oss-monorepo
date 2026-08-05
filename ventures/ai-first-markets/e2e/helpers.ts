import { SignJWT } from "jose";
import type { BrowserContext } from "@playwright/test";
import { AUTH_COOKIE_NAME } from "../src/lib/auth";

export async function setAuthenticatedSession(
  context: BrowserContext,
  email = "test@example.com",
  baseURL = "http://127.0.0.1:3110",
) {
  const secret = new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-only-secret-change-in-production",
  );
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    email,
    name: "Test User",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24 * 7)
    .sign(secret);

  const urlObj = new URL(baseURL);
  await context.addCookies([
    {
      name: AUTH_COOKIE_NAME,
      value: token,
      domain: urlObj.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
