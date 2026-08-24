"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  OPERATOR_SESSION_COOKIE,
  isOperatorAuthConfigured,
  operatorSessionCookieOptions,
  sessionMaxAgeSeconds,
  tryCreateSessionFromPassword,
} from "@/lib/auth/operator";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

/** Tighter window for password-guessing — 5 attempts per 60s. */
const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 60_000 };

export async function loginOperatorAction(formData: FormData): Promise<void> {
  if (!isOperatorAuthConfigured()) {
    redirect("/dashboard?auth=unconfigured");
  }

  const hdrs = await headers();
  const clientIp = clientIpFromHeaders(hdrs);
  const rate = checkRateLimit(`login:${clientIp}`, LOGIN_RATE_LIMIT);
  if (!rate.allowed) {
    const next = safeNextPath(String(formData.get("next") ?? "/dashboard"));
    redirect(
      `/dashboard/login?error=rate_limited&next=${encodeURIComponent(next)}`,
    );
  }

  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/dashboard"));

  const token = tryCreateSessionFromPassword(password);
  if (!token) {
    redirect(`/dashboard/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const jar = await cookies();
  jar.set(
    OPERATOR_SESSION_COOKIE,
    token,
    operatorSessionCookieOptions(sessionMaxAgeSeconds()),
  );

  redirect(next);
}

export async function logoutOperatorAction(): Promise<void> {
  const jar = await cookies();
  jar.set(OPERATOR_SESSION_COOKIE, "", operatorSessionCookieOptions(0));
  redirect("/dashboard/login");
}
