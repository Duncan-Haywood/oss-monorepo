// Better Auth instance (email+password, optional Google OAuth) backed by our Drizzle/D1 tables.
// Orgs, members and invitations are NOT Better Auth's: they are our own tables & routes
// (see routes/org/members.ts and services/auth/members.ts).
//
// Email verification: sign-up sends a link to `${APP_URL}/verify-email?token=` (SPA page, which calls
// GET /api/auth/verify-email?token=), and email+password sign-in is refused until the address is
// verified (see requiresEmailVerification). Password reset: `${APP_URL}/reset-password?token=` (SPA
// page, which calls POST /api/auth/reset-password); tokens are single-use (Better Auth consumes the
// verification row), expire after 1 hour, and a reset revokes every session of the user.

import { normalizeBasePath } from "@shared/base-path";
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
import { truncateIp } from "./sessions";

export const MIN_PASSWORD_LENGTH = 10;
export const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24;
export const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

/** Worker tests opt in to required email verification with this header (`1`); APP_ENV=test only. */
export const TEST_REQUIRE_EMAIL_VERIFICATION_HEADER = "x-test-require-email-verification";

/**
 * Secure cookies + rate limiting apply to production AND to any deployment served over HTTPS
 * (staging, previews, or a deploy that kept wrangler.jsonc's default APP_ENV="development").
 * Only plain-http local dev/tests go without them.
 */
export function isHardened(env: Pick<Env, "APP_ENV" | "APP_URL">): boolean {
  return env.APP_ENV === "production" || /^https:\/\//i.test(env.APP_URL ?? "");
}

/**
 * Whether email+password sign-in requires a verified address. Always on for production/HTTPS and
 * wherever real email is sent. Off only in APP_ENV=test (tests opt in per request) and in the local
 * plain-http offline demo (FAKE_EXTERNALS=true: email goes to an in-memory fake nobody can open).
 */
export function requiresEmailVerification(
  env: Pick<Env, "APP_ENV" | "APP_URL" | "FAKE_EXTERNALS" | "DEMO_MODE">,
): boolean {
  // Public demo deployments (both flags set by the demo deploy) never send real email, so
  // verification could never complete there. Real deployments set neither flag.
  if (env.DEMO_MODE === "true" && env.FAKE_EXTERNALS === "true") return false;
  if (isHardened(env)) return true;
  return !(env.APP_ENV === "test" || env.FAKE_EXTERNALS === "true");
}

/**
 * Better Auth's public URLs under the app's base path. With APP_URL https://marisstella.app/grants
 * (BASE_PATH /grants) the auth endpoints live at /grants/api/auth/* (OAuth callbacks included) and the
 * session cookies are scoped to /grants, so they never reach the rest of the host.
 */
export function authUrls(env: Pick<Env, "APP_URL" | "BASE_PATH">) {
  const appUrl = env.APP_URL.replace(/\/+$/, "");
  const base = normalizeBasePath(env.BASE_PATH);
  return {
    // A baseURL with a path is used as is, so the router matches `${base}/api/auth/*`
    // (routes/auth.ts hands Better Auth the request with the base path put back).
    baseURL: `${appUrl}/api/auth`,
    basePath: `${base}/api/auth`,
    origin: new URL(appUrl).origin,
    cookiePath: base || "/",
  };
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

function buildOptions(deps: AuthEmailDeps, opts: CreateAuthOptions) {
  const { env, db } = deps;
  const prod = isHardened(env);
  const urls = authUrls(env);
  const requireVerification = opts.requireEmailVerification ?? requiresEmailVerification(env);
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : undefined;
  return {
    appName: "Grant Autopilot",
    baseURL: urls.baseURL,
    basePath: urls.basePath,
    secret: env.AUTH_SECRET,
    trustedOrigins: [urls.origin],
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
    ...(google ? { socialProviders: google } : {}),
    session: {
      expiresIn: 60 * 60 * 24 * 14, // 14 days
      updateAge: 60 * 60 * 24, // refresh expiry at most daily
    },
    databaseHooks: {
      session: {
        create: {
          // Never store a full client IP (ARCHITECTURE: hash/truncate IPs before storing).
          before: async (s: { ipAddress?: string | null }) => ({
            data: { ...s, ipAddress: truncateIp(s.ipAddress) },
          }),
        },
      },
    },
    // Built-in list-sessions returns raw session tokens to JS; use GET /api/me/sessions instead.
    disabledPaths: ["/list-sessions"],
    rateLimit: {
      // Memory storage is per-isolate (module-level map) — best effort, but cheap and offline-safe.
      // Email sends are additionally throttled per user in D1 (services/auth/emails.ts).
      enabled: prod,
      storage: "memory" as const,
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
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: prod,
        path: urls.cookiePath,
      },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    telemetry: { enabled: false },
  };
}

export function createAuth(deps: AuthEmailDeps, opts: CreateAuthOptions = {}) {
  // Better Auth falls back to a well-known default secret; never allow that on a real deployment.
  if (!deps.env.AUTH_SECRET && isHardened(deps.env))
    throw new Error("AUTH_SECRET is not configured");
  return betterAuth(buildOptions(deps, opts));
}

export type Auth = ReturnType<typeof createAuth>;
