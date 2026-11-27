// Shared helpers for worker integration tests.
import { env, exports } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { POLICY_VERSION } from "@shared/legal";
import { createDb } from "@worker/db/client";
import {
  legalAcceptances,
  member,
  organization,
  orgProfile,
  subscriptions,
  user,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";

export const worker = (exports as unknown as { default: Fetcher }).default;
export const BASE = "http://localhost:5173";
export const testDb = () => createDb(env.DB);

export interface ApiInit extends RequestInit {
  json?: unknown;
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

export async function createTestUser(name = "Test User") {
  const id = newId("usr");
  const row = { id, name, email: `${id}@example.test`, emailVerified: true };
  await testDb().insert(user).values(row);
  return row;
}

/** Records that the user accepted the current legal documents (needed before creating an org). */
export async function acceptLegalDocs(userId: string) {
  await testDb().insert(legalAcceptances).values({ userId, policyVersion: POLICY_VERSION });
}

/**
 * An org with one member. Most tests exercise Level 2, so the org gets an operator grant (`comp`,
 * unlimited) unless `plan` is null (the free Level 1 plan, no subscription row).
 */
export async function setupTenant(
  role: MemberRole = "owner",
  orgName = "Acme Machining",
  plan: string | null = "comp",
) {
  const u = await createTestUser();
  const orgId = newId("org");
  const db = testDb();
  await db.insert(organization).values({ id: orgId, name: orgName, slug: orgId });
  await db.insert(orgProfile).values({ orgId, targetLevel: 2, legalName: orgName });
  await db.insert(member).values({ id: newId("mem"), organizationId: orgId, userId: u.id, role });
  if (plan) await db.insert(subscriptions).values({ orgId, planKey: plan, status: "comp" });
  return { user: u, userId: u.id, orgId };
}

export async function addToOrg(orgId: string, userId: string, role: MemberRole) {
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId, role });
}
