// Legal documents are public; each user's acceptance of the current version is recorded.
// Adapted from apps/payapps/test/worker/legal.test.ts.
import type { LegalDocDto, LegalDocSummary, LegalStatusDto } from "@shared/legal";
import { LEGAL_DOC_KEYS, POLICY_VERSION } from "@shared/legal";
import { legalAcceptances } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, createTestUser, json, testDb } from "./helpers";

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

describe("legal documents", () => {
  it("lists and serves every document without a session", async () => {
    const list = await json<{ items: LegalDocSummary[] }>(api("/api/legal"));
    expect(list.items.map((d) => d.key)).toEqual([...LEGAL_DOC_KEYS]);
    for (const key of LEGAL_DOC_KEYS) {
      const doc = await json<LegalDocDto>(api(`/api/legal/${key}`));
      expect(doc.version).toBe(POLICY_VERSION);
      expect(doc.markdown.startsWith(`# ${doc.title}`)).toBe(true);
      expect(doc.markdown).toContain("Job Shop Quote");
    }
  });

  it("404s an unknown document", async () => {
    expect((await api("/api/legal/__proto__")).status).toBe(404);
    expect((await api("/api/legal/cookies")).status).toBe(404);
  });
});

describe("legal acceptance", () => {
  it("starts unaccepted, records the current version once, and reports it on /api/me", async () => {
    const u = await createTestUser();
    const before = await json<MeLegal>(api("/api/me", { as: u.id }));
    expect(before.legal).toEqual({ version: POLICY_VERSION, acceptedAt: null });

    const first = await json<LegalStatusDto>(accept(u.id, POLICY_VERSION));
    expect(first.acceptedAt).not.toBeNull();
    const again = await json<LegalStatusDto>(accept(u.id, POLICY_VERSION));
    expect(again.acceptedAt).toBe(first.acceptedAt);

    const after = await json<MeLegal>(api("/api/me", { as: u.id }));
    expect(after.legal.acceptedAt).toBe(first.acceptedAt);
    const rows = await testDb()
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, u.id));
    expect(rows).toHaveLength(1);
  });

  it("refuses an acceptance of a version other than the current one", async () => {
    const u = await createTestUser();
    await json(accept(u.id, "2000-01-01"), 400);
    const me = await json<MeLegal>(api("/api/me", { as: u.id }));
    expect(me.legal.acceptedAt).toBeNull();
  });

  it("needs a session", async () => {
    await json(accept(undefined, POLICY_VERSION), 401);
  });

  it("one user's acceptance does not count for another", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await json(accept(a.id, POLICY_VERSION));
    const me = await json<MeLegal>(api("/api/me", { as: b.id }));
    expect(me.legal.acceptedAt).toBeNull();
  });
});
