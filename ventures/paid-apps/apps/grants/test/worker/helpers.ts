// Shared helpers for worker integration tests (auth agent may extend; keep these signatures).

import { env, exports } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { createDb } from "@worker/db/client";
import { member, organization, orgProfiles, orgSettings, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";

/** The Worker under test (default export's fetch). */
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

export async function createTestUser(overrides: Partial<{ name: string; email: string }> = {}) {
  const id = newId("org").replace("org_", "usr_");
  const row = {
    id,
    name: overrides.name ?? "Test User",
    email: overrides.email ?? `${id}@example.test`,
    emailVerified: true,
  };
  await testDb().insert(user).values(row);
  return row;
}

/** Creates an org with profile + default settings and adds `userId` with `role`. */
export async function createTestOrg(
  userId: string,
  opts: { name?: string; role?: MemberRole } = {},
) {
  const db = testDb();
  const orgId = newId("org");
  const name = opts.name ?? "Test Org";
  await db.insert(organization).values({ id: orgId, name, slug: orgId });
  await db.insert(orgProfiles).values({ orgId, legalName: name, city: "Gallup", state: "NM" });
  await db.insert(orgSettings).values({ orgId });
  await db.insert(member).values({
    id: newId("org").replace("org_", "mem_"),
    organizationId: orgId,
    userId,
    role: opts.role ?? "owner",
  });
  return { orgId, name };
}

/** Convenience: a user who owns an org. */
export async function setupTenant(role: MemberRole = "owner") {
  const u = await createTestUser();
  const org = await createTestOrg(u.id, { role });
  return { user: u, userId: u.id, orgId: org.orgId };
}

/** `Cookie` request header built from a response's Set-Cookie headers (name=value pairs only). */
export function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter((c) => c && !c.endsWith("="))
    .join("; ");
}

/** Real Better Auth sign-up (email+password). Returns the session cookie for later requests. */
export async function signUp(
  overrides: Partial<{ name: string; email: string; password: string }> = {},
) {
  const email = overrides.email ?? `${newId("org").replace("org_", "u")}@example.test`;
  const password = overrides.password ?? "correct-horse-battery";
  const name = overrides.name ?? "Signed Up User";
  const res = await api("/api/auth/sign-up/email", {
    method: "POST",
    headers: { Origin: BASE },
    json: { email, password, name },
  });
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return { cookie: cookieFrom(res), userId: body.user.id, email, password, name };
}

/** Real Better Auth sign-in. Returns the raw response (check `.ok`) and its session cookie. */
export async function signIn(email: string, password: string) {
  const res = await api("/api/auth/sign-in/email", {
    method: "POST",
    headers: { Origin: BASE },
    json: { email, password },
  });
  return { res, cookie: cookieFrom(res) };
}
