// Records which of our pages sent a new account (shared/signup-source.ts). The browser keeps the
// `from` of the "Start free" link it arrived on and posts it once, after the first sign-in, which
// may be days later (email confirmation in another tab). Kept once per account and only while the
// account is new, so a later visit from another page never rewrites where it came from.
import { normalizeSignupSource, SIGNUP_SOURCE_WINDOW_DAYS } from "@shared/signup-source";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { signupSources, user } from "../db/schema";

const DAY_MS = 86_400_000;

export type RecordSourceResult =
  | { recorded: true; source: string }
  | { recorded: false; reason: "invalid" | "already-recorded" | "account-not-new" };

export async function recordSignupSource(
  ctx: AppContext,
  userId: string,
  raw: string,
): Promise<RecordSourceResult> {
  const source = normalizeSignupSource(raw);
  if (!source) return { recorded: false, reason: "invalid" };
  const u = await ctx.db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  if (!u || ctx.now().getTime() - u.createdAt.getTime() > SIGNUP_SOURCE_WINDOW_DAYS * DAY_MS) {
    return { recorded: false, reason: "account-not-new" };
  }
  const inserted = await ctx.db
    .insert(signupSources)
    .values({ userId, source, createdAt: ctx.now() })
    .onConflictDoNothing()
    .returning({ userId: signupSources.userId })
    .all();
  return inserted.length
    ? { recorded: true, source }
    : { recorded: false, reason: "already-recorded" };
}
