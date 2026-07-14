"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  OPERATOR_SESSION_COOKIE,
  isOperatorAuthConfigured,
  operatorSessionCookieOptions,
  sessionMaxAgeSeconds,
  tryCreateSessionFromPassword,
} from "@/lib/auth/operator";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export async function loginOperatorAction(formData: FormData): Promise<void> {
  if (!isOperatorAuthConfigured()) {
    redirect("/dashboard?auth=unconfigured");
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
