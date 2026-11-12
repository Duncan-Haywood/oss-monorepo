import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashToken, SESSION_COOKIE } from "@/lib/auth";
import { setCookie, clearCookies } from "./cookieMock";

/**
 * Helpers shared by the integration tests.
 *
 * The seeded content — surveys and their items — is treated as fixture and
 * never truncated: rebuilding 441 items between tests would dominate the run
 * time, and no test mutates them. Everything a session produces is cleared, including
 * the pooled prior stored on Survey rows.
 */

/** Everything written by a session, in an order that satisfies the FKs. */
const DYNAMIC_TABLES = [
  "Trial",
  "FinancialTrial",
  "ParticipantItemRating",
  "SurveyFit",
  "Participant",
  "UserSession",
  "Couple",
  "GeneratedInsight",
  "InsightFeedback",
  "UserReport",
  "LlmUsage",
  "LoginAttempt",
  "AdminLoginAttempt",
  "AnonRequestLog",
  "User",
];

export async function resetData(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${DYNAMIC_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  );
  // The one derived value stored on a seeded row: the survey's pooled prior
  // for the insights set (lib/surveyPrior.ts), computed from session answers.
  await prisma.survey.updateMany({ data: { setPriorPhi: null, setPriorRespondents: null, setPriorAnswers: null, setPriorAt: null } });
  clearCookies();
}

export async function surveyIdBySlug(slug: string): Promise<string> {
  const survey = await prisma.survey.findUnique({ where: { slug }, select: { id: true } });
  if (!survey) throw new Error(`No seeded survey "${slug}" — run npx prisma db seed`);
  return survey.id;
}

/** A participant on a seeded survey, with no answers behind it. */
export async function createParticipant(
  slug: string,
  overrides: { firstName?: string; perspective?: "SELF" | "PARTNER" | "PARTNER_GUESS"; userId?: string } = {}
) {
  return prisma.participant.create({
    data: {
      surveyId: await surveyIdBySlug(slug),
      firstName: overrides.firstName ?? "Test",
      perspective: overrides.perspective ?? "PARTNER",
      userId: overrides.userId ?? null,
    },
  });
}

/**
 * An account. The password hash is a literal rather than a real bcrypt call —
 * these tests never sign in through the password path, they attach a session
 * directly, and 12 rounds of bcrypt per test is 300ms of nothing.
 */
export async function createAccount(email = `u${randomBytes(4).toString("hex")}@example.com`, firstName = "Test") {
  return prisma.user.create({
    data: { email, firstName, passwordHash: "not-a-real-hash" },
  });
}

/** Makes subsequent handler calls in this file behave as that signed-in user. */
export async function signInAs(userId: string): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.userSession.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  setCookie(SESSION_COOKIE, raw);
}

export function signOut(): void {
  clearCookies();
}

/** A POST at a route handler, shaped the way the handler expects to receive it. */
export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as never;
}
