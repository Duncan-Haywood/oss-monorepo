// Shared helpers for worker integration tests.
import { env, exports } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { createDb } from "@worker/db/client";
import { member, organization, shopSettings, user } from "@worker/db/schema";
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

/** JSON body of a response, failing the test with the body text on an unexpected status. */
export async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  const text = await r.text();
  if (r.status !== status) throw new Error(`expected ${status}, got ${r.status}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function createTestUser() {
  const id = newId("usr");
  const row = { id, name: "Test User", email: `${id}@example.test`, emailVerified: true };
  await testDb().insert(user).values(row);
  return row;
}

export async function createTestOrg(userId: string, role: MemberRole = "owner") {
  const db = testDb();
  const orgId = newId("org");
  await db.insert(organization).values({ id: orgId, name: "Test Shop", slug: orgId });
  await db.insert(shopSettings).values({
    orgId,
    displayName: "Test Shop",
    laborMarkupBps: 2500,
    materialMarkupBps: 1500,
    outsideServiceMarkupBps: 2000,
    minimumLineCents: 25_000,
    defaultQuantities: [1, 10],
  });
  await db.insert(member).values({ id: newId("mem"), organizationId: orgId, userId, role });
  return orgId;
}

export async function addMember(orgId: string, role: MemberRole) {
  const u = await createTestUser();
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId: u.id, role });
  return u.id;
}

export async function setupTenant() {
  const u = await createTestUser();
  const orgId = await createTestOrg(u.id);
  return { userId: u.id, orgId, path: (p = "") => `/api/orgs/${orgId}${p}` };
}

/** A small rate card via the API: one mill, one per-lb aluminum, one stock-priced stainless, two finishes. */
export async function seedRateCard(t: { userId: string; path: (p?: string) => string }) {
  const post = <T>(p: string, body: unknown) =>
    json<T>(api(t.path(`/rate-card${p}`), { method: "POST", as: t.userId, json: body }), 201);
  const mill = await post<{ id: string }>("/machines", {
    name: "Haas VF-2",
    kind: "mill_3axis",
    hourlyRateCents: 9_500,
  });
  const al = await post<{ id: string }>("/materials", {
    name: "Aluminum 6061-T6 plate",
    pricingBasis: "per_lb",
    pricePerLbCents: 450,
    densityLbPerIn3: 0.0975,
    scrapBps: 1_000,
    minChargeCents: 2_500,
  });
  const ss = await post<{ id: string }>("/materials", {
    name: "303 Stainless bar",
    pricingBasis: "per_stock",
    stockPriceCents: 12_000,
    stockDescription: "0.75 in round x 12 ft",
  });
  const anodize = await post<{ id: string }>("/finishing-ops", {
    name: "Anodize Type II black",
    perPartCents: 300,
    lotChargeCents: 15_000,
    outsideService: true,
  });
  const passivate = await post<{ id: string }>("/finishing-ops", {
    name: "Passivate",
    perPartCents: 50,
    lotChargeCents: 7_500,
    outsideService: true,
  });
  return { mill: mill.id, al: al.id, ss: ss.id, anodize: anodize.id, passivate: passivate.id };
}
