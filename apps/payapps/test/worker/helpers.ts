// Shared helpers for worker integration tests.
import { env, exports } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { createDb } from "@worker/db/client";
import { member, organization, subscriptions, user } from "@worker/db/schema";
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

/** api() that asserts the status and returns the parsed JSON body. */
export async function call<T = Record<string, unknown>>(
  path: string,
  init: ApiInit & { expect?: number } = {},
): Promise<T> {
  const { expect: status = 200, ...rest } = init;
  const res = await api(path, rest);
  const text = await res.text();
  if (res.status !== status) {
    throw new Error(
      `${init.method ?? "GET"} ${path}: expected ${status}, got ${res.status} ${text}`,
    );
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function createTestUser() {
  const id = newId("usr");
  const row = { id, name: "Test User", email: `${id}@example.test`, emailVerified: true };
  await testDb().insert(user).values(row);
  return row;
}

export async function setupTenant(role: MemberRole = "owner") {
  const u = await createTestUser();
  const orgId = newId("org");
  await testDb().insert(organization).values({ id: orgId, name: "Test Mechanical", slug: orgId });
  await addToOrg(orgId, u.id, role);
  return { user: u, userId: u.id, orgId };
}

export async function addToOrg(orgId: string, userId: string, role: MemberRole) {
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId, role });
}

/** Operator-style plan grant (comp by default) so tests can exceed the Free plan's limits. */
export async function grantPlan(
  orgId: string,
  planKey = "comp",
  status: "comp" | "active" | "past_due" | "canceled" = "comp",
) {
  await testDb()
    .insert(subscriptions)
    .values({ orgId, planKey, status })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: { planKey, status } });
}
