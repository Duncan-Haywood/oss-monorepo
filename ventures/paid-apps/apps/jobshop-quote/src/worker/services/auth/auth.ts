// Better Auth (email + password) backed by our Drizzle/D1 tables; pattern from apps/grants, as in apps/payapps.
// Orgs (shops), members and invitations are our own tables (services/orgs).
//
// Email verification: sign-up sends a link to `${APP_URL}/verify-email?token=` (SPA page, which calls
// GET /api/auth/verify-email?token=), and email+password sign-in is refused until the address is
// verified (requiresEmailVerification). Password reset: `${APP_URL}/reset-password?token=` (SPA page,
// which calls POST /api/auth/reset-password); tokens are single-use, expire after 1 hour, and a reset
// revokes every session of the user. Mail goes through ctx.email (ports/email.ts).
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { eq } from "drizzle-orm";
import { account, session, user, verification } from "../../db/schema";
import type { Env } from "../../env";
import {
  type AuthEmailDeps,
  type EmailUser,
  existingAccountEmail,
  resetPasswordEmail,
  resetPasswordLink,
  sendAuthEmail,
  verificationEmail,
  verifyEmailLink,
} from "./emails";
import { hashPassword, verifyPassword } from "./password";

export const MIN_PASSWORD_LENGTH = 10;
export const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
export const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

/** Worker tests opt in to required email verification with this header (`1`); APP_ENV=test only. */
export const TEST_REQUIRE_EMAIL_VERIFICATION_HEADER = "x-test-require-email-verification";

export function isHardened(env: Pick<Env, "APP_ENV" | "APP_URL">): boolean {
  return env.APP_ENV === "production" || /^https:\/\//i.test(env.APP_URL ?? "");
}

/**
 * Whether email+password sign-in requires a verified address. Always on for production/HTTPS and
 * wherever real email is sent. Off only in APP_ENV=test (tests opt in per request) and in the local
 * plain-http offline demo (FAKE_EXTERNALS=true: mail goes to an in-memory fake nobody can open).
 */
export function requiresEmailVerification(
  env: Pick<Env, "APP_ENV" | "APP_URL" | "FAKE_EXTERNALS">,
): boolean {
  if (isHardened(env)) return true;
  return !(env.APP_ENV === "test" || env.FAKE_EXTERNALS === "true");
}

export interface CreateAuthOptions {
  /** Overrides requiresEmailVerification(env). */
  requireEmailVerification?: boolean;
}

/** Per-request options. The test opt-in header is ignored outside APP_ENV=test. */
export function authOptionsForRequest(env: Pick<Env, "APP_ENV">, req: Request): CreateAuthOptions {
  if (env.APP_ENV === "test" && req.headers.get(TEST_REQUIRE_EMAIL_VERIFICATION_HEADER) === "1") {
    return { requireEmailVerification: true };
  }
  return {};
}

export function createAuth(deps: AuthEmailDeps, opts: CreateAuthOptions = {}) {
  const { env, db } = deps;
  // Better Auth falls back to a well-known default secret; never allow that on a real deployment.
  if (!env.AUTH_SECRET && isHardened(env)) throw new Error("AUTH_SECRET is not configured");
  const prod = isHardened(env);
  const appUrl = env.APP_URL.replace(/\/+$/, "");
  const requireVerification = opts.requireEmailVerification ?? requiresEmailVerification(env);
  return betterAuth({
    appName: "Job Shop Quote",
    baseURL: `${appUrl}/api/auth`,
    basePath: "/api/auth",
    secret: env.AUTH_SECRET,
    trustedOrigins: [new URL(appUrl).origin],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 128,
      autoSignIn: true, // only when verification is not required (Better Auth skips it otherwise)
      requireEmailVerification: requireVerification,
      password: { hash: hashPassword, verify: verifyPassword },
      // Better Auth's `url` targets /api/auth/reset-password/:token; we link to the SPA instead.
      sendResetPassword: async ({ user: u, token }: { user: EmailUser; token: string }) => {
        await sendAuthEmail(
          deps,
          "reset-password",
          u,
          resetPasswordEmail(u, resetPasswordLink(env, token)),
        );
      },
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user: u }: { user: { id: string } }) => {
        // The emailed reset link proves control of the mailbox.
        await db.update(user).set({ emailVerified: true }).where(eq(user.id, u.id));
        deps.logger.info("auth.password_reset", { userId: u.id });
      },
      // Sign-up with an existing address returns a generic success (no enumeration); tell the owner.
      onExistingUserSignUp: async ({ user: u }: { user: EmailUser }) => {
        await sendAuthEmail(deps, "existing-account", u, existingAccountEmail(u, env));
      },
    },
    emailVerification: {
      // Better Auth's `url` targets /api/auth/verify-email; we link to the SPA page instead.
      sendVerificationEmail: async ({ user: u, token }: { user: EmailUser; token: string }) => {
        await sendAuthEmail(
          deps,
          "verify-email",
          u,
          verificationEmail(u, verifyEmailLink(env, token)),
        );
      },
      sendOnSignUp: requireVerification,
      sendOnSignIn: false, // the sign-in page offers an explicit (rate-limited) resend instead
      autoSignInAfterVerification: true,
      expiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    disabledPaths: ["/list-sessions"],
    rateLimit: {
      // Memory storage is per-isolate: best effort. The durable limits are in D1, in front of this
      // handler (middleware/auth-rate-limit.ts); email sends are also throttled per user in D1.
      enabled: prod,
      storage: "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/*": { window: 60, max: 10 },
        "/sign-up/*": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 10 },
      },
    },
    advanced: {
      useSecureCookies: prod,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: prod, path: "/" },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    telemetry: { enabled: false },
  });
}
