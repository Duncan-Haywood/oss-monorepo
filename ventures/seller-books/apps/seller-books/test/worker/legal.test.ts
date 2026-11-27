// Legal documents are public; each user's acceptance of the current version is recorded.
// Adapted from apps/jobshop-quote/test/worker/legal.test.ts.
import type { LegalDocDto, LegalDocSummary, LegalStatusDto } from "@shared/legal";
import { LEGAL_DOC_KEYS, POLICY_VERSION } from "@shared/legal";
import { legalAcceptances } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, createTestOrg, createTestUser, json, setupTenant, testDb } from "./helpers";

interface MeLegal {
  legal: LegalStatusDto;
}

const accept = (as: string | undefined, version: string) =>
  api("/api/me/legal/accept", {
    method: "POST",
    as,
    headers: { Origin: BASE },
    json: { version },
  });

const me = async (as: string) => json<MeLegal>(await api("/api/me", { as }));

describe("legal documents", () => {
  it("lists and serves every document without a session", async () => {
    const list = await json<{ items: LegalDocSummary[] }>(await api("/api/legal"));
    expect(list.items.map((d) => d.key)).toEqual([...LEGAL_DOC_KEYS]);
    for (const key of LEGAL_DOC_KEYS) {
      const res = await api(`/api/legal/${key}`);
      expect(res.status).toBe(200);
      const doc = await json<LegalDocDto>(res);
      expect(doc.version).toBe(POLICY_VERSION);
      expect(doc.markdown.startsWith(`# ${doc.title}`)).toBe(true);
      expect(doc.markdown).toContain("Seller Books");
    }
  });

  it("404s an unknown document", async () => {
    expect((await api("/api/legal/__proto__")).status).toBe(404);
    expect((await api("/api/legal/cookies")).status).toBe(404);
  });
});

describe("legal acceptance", () => {
  it("starts unaccepted, records the current version once, and reports it on /api/me", async () => {
    const u = await createTestUser(undefined, { acceptTerms: false });
    expect((await me(u.id)).legal).toEqual({ version: POLICY_VERSION, acceptedAt: null });

    const res1 = await accept(u.id, POLICY_VERSION);
    expect(res1.status).toBe(200);
    const first = await json<LegalStatusDto>(res1);
    expect(first.acceptedAt).not.toBeNull();
    const again = await json<LegalStatusDto>(await accept(u.id, POLICY_VERSION));
    expect(again.acceptedAt).toBe(first.acceptedAt);

    expect((await me(u.id)).legal.acceptedAt).toBe(first.acceptedAt);
    const rows = await testDb()
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, u.id));
    expect(rows).toHaveLength(1);
  });

  it("refuses an acceptance of a version other than the current one", async () => {
    const u = await createTestUser(undefined, { acceptTerms: false });
    expect((await accept(u.id, "2000-01-01")).status).toBe(400);
    expect((await me(u.id)).legal.acceptedAt).toBeNull();
  });

  it("needs a session", async () => {
    expect((await accept(undefined, POLICY_VERSION)).status).toBe(401);
  });

  it("one user's acceptance does not count for another", async () => {
    const a = await createTestUser(undefined, { acceptTerms: false });
    const b = await createTestUser(undefined, { acceptTerms: false });
    await accept(a.id, POLICY_VERSION);
    expect((await me(b.id)).legal.acceptedAt).toBeNull();
  });
});

// The API itself refuses the books until the current version is accepted (middleware/legal.ts),
// so the Terms bind before any use, not only in the browser's "Before you continue" card.
describe("the terms are enforced by the API", () => {
  const unaccepted = () => createTestUser(undefined, { acceptTerms: false });
  const get = (path: string, as: string) => api(path, { as });
  const post = (path: string, as: string, body: unknown) =>
    api(path, { method: "POST", as, headers: { Origin: BASE }, json: body });

  it("refuses a member's shop routes with terms_not_accepted until they accept", async () => {
    const u = await unaccepted();
    const orgId = await createTestOrg(u.id);
    for (const path of ["", "/sales", "/reports/pnl", "/members", "/billing"]) {
      const res = await get(`/api/orgs/${orgId}${path}`, u.id);
      expect(res.status, path).toBe(403);
      const body = await json<{ error: { code: string; details: { version: string } } }>(res);
      expect(body.error.code).toBe("terms_not_accepted");
      expect(body.error.details.version).toBe(POLICY_VERSION);
    }
    const write = await post(`/api/orgs/${orgId}/mileage`, u.id, {
      date: "2026-03-01",
      miles: 12,
      purpose: "Thrift run",
    });
    expect(write.status).toBe(403);

    expect((await accept(u.id, POLICY_VERSION)).status).toBe(200);
    expect((await get(`/api/orgs/${orgId}/sales`, u.id)).status).toBe(200);
  });

  it("refuses creating a shop until the user accepts", async () => {
    const u = await unaccepted();
    const refused = await post("/api/orgs", u.id, { name: "Closet Finds" });
    expect(refused.status).toBe(403);
    expect((await json<{ error: { code: string } }>(refused)).error.code).toBe(
      "terms_not_accepted",
    );
    expect((await json<{ items: unknown[] }>(await get("/api/orgs", u.id))).items).toHaveLength(0);

    await accept(u.id, POLICY_VERSION);
    expect((await post("/api/orgs", u.id, { name: "Closet Finds" })).status).toBe(201);
  });

  it("answers a non-member 404, not the terms 403, so shop ids cannot be probed", async () => {
    const owner = await setupTenant();
    const stranger = await unaccepted();
    expect((await get(`/api/orgs/${owner.orgId}/sales`, stranger.id)).status).toBe(404);
  });

  it("does not count an acceptance of an earlier version", async () => {
    const u = await unaccepted();
    const orgId = await createTestOrg(u.id);
    await testDb().insert(legalAcceptances).values({ userId: u.id, policyVersion: "2000-01-01" });
    expect((await get(`/api/orgs/${orgId}/sales`, u.id)).status).toBe(403);
  });

  it("leaves /api/me, the shop list and accepting an invitation open", async () => {
    const owner = await setupTenant();
    const invitee = await unaccepted();
    expect((await get("/api/me", invitee.id)).status).toBe(200);
    expect((await get("/api/orgs", invitee.id)).status).toBe(200);

    const invite = await post(`/api/orgs/${owner.orgId}/members/invitations`, owner.userId, {
      email: invitee.email,
      role: "viewer",
    });
    expect(invite.status).toBe(201);
    const token = new URL((await json<{ url: string }>(invite)).url).searchParams.get("token");
    const joined = await post("/api/invitations/accept", invitee.id, { token });
    expect(joined.status).toBe(200);
    // ...and the shop itself waits for the terms, as the browser asks on first opening it.
    expect((await get(`/api/orgs/${owner.orgId}/sales`, invitee.id)).status).toBe(403);
    await accept(invitee.id, POLICY_VERSION);
    expect((await get(`/api/orgs/${owner.orgId}/sales`, invitee.id)).status).toBe(200);
  });
});
