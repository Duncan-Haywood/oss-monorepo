// Shared helpers for worker integration tests.
import { env, exports } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { POLICY_VERSION } from "@shared/legal";
import { createDb } from "@worker/db/client";
import { legalAcceptances, member, organization, subscriptions, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";

export const worker = (exports as unknown as { default: Fetcher }).default;
export const BASE = "http://localhost:5173";
export const testDb = () => createDb(env.DB);

export interface ApiInit extends RequestInit {
  json?: unknown;
  /** Act as this user (test-only header honored when APP_ENV=test). */
  as?: string;
}

export function api(path: string, init: ApiInit = {}) {
  const { json, as, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  if (as) headers.set(TEST_USER_HEADER, as);
  return worker.fetch(`${BASE}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
}

/**
 * A verified user who has accepted the current legal documents (the API refuses the books
 * without that, middleware/legal.ts); pass `acceptTerms: false` for one who has not.
 */
export async function createTestUser(email?: string, { acceptTerms = true } = {}) {
  const id = newId("mem").replace("mem_", "usr_");
  const row = { id, name: "Test User", email: email ?? `${id}@example.test`, emailVerified: true };
  await testDb().insert(user).values(row);
  if (acceptTerms) await acceptCurrentTerms(id);
  return row;
}

/** Records that the user accepted the current POLICY_VERSION, as POST /api/me/legal/accept does. */
export async function acceptCurrentTerms(userId: string) {
  await testDb()
    .insert(legalAcceptances)
    .values({ userId, policyVersion: POLICY_VERSION })
    .onConflictDoNothing();
}

export async function createTestOrg(
  userId: string,
  role: MemberRole = "owner",
  name = "Test Shop",
) {
  const orgId = newId("org");
  await testDb().insert(organization).values({ id: orgId, name, slug: orgId });
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId, role });
  return orgId;
}

/**
 * A user and an org. The org gets a complimentary plan by default so tests of the books are not
 * limited by the Free plan; pass `plan: null` for a Free org, or a plan key for that plan (active).
 */
export async function setupTenant(role: MemberRole = "owner", plan: string | null = "comp") {
  const u = await createTestUser();
  const orgId = await createTestOrg(u.id, role);
  if (plan) await grantPlan(orgId, plan, plan === "comp" ? "comp" : "active");
  return { userId: u.id, email: u.email, orgId };
}

export async function grantPlan(
  orgId: string,
  planKey: string,
  status: "comp" | "active" | "canceled",
) {
  await testDb()
    .insert(subscriptions)
    .values({ orgId, planKey, status })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: { planKey, status } });
}

export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
