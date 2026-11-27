// Legal documents are public; each user's acceptance of the current version is recorded.
import type { MeDto } from "@shared/api/types";
import type { LegalDocDto, LegalDocSummary, LegalStatusDto } from "@shared/legal";
import { LEGAL_DOC_KEYS, POLICY_VERSION } from "@shared/legal";
import { legalAcceptances } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, call, createTestUser, testDb } from "./helpers";

describe("legal documents", () => {
  it("lists and serves every document without a session", async () => {
    const list = await call<{ items: LegalDocSummary[] }>("/api/legal");
    expect(list.items.map((d) => d.key)).toEqual([...LEGAL_DOC_KEYS]);
    for (const key of LEGAL_DOC_KEYS) {
      const doc = await call<LegalDocDto>(`/api/legal/${key}`);
      expect(doc.version).toBe(POLICY_VERSION);
      expect(doc.markdown.startsWith(`# ${doc.title}`)).toBe(true);
    }
  });

  it("404s an unknown document", async () => {
    const res = await api("/api/legal/__proto__");
    expect(res.status).toBe(404);
  });
});

describe("legal acceptance", () => {
  it("starts unaccepted, records the current version once, and reports it on /api/me", async () => {
    const u = await createTestUser();
    const before = await call<MeDto>("/api/me", { as: u.id });
    expect(before.legal).toEqual({ version: POLICY_VERSION, acceptedAt: null });

    const first = await call<LegalStatusDto>("/api/me/legal/accept", {
      method: "POST",
      as: u.id,
      json: { version: POLICY_VERSION },
    });
    expect(first.acceptedAt).not.toBeNull();
    const again = await call<LegalStatusDto>("/api/me/legal/accept", {
      method: "POST",
      as: u.id,
      json: { version: POLICY_VERSION },
    });
    expect(again.acceptedAt).toBe(first.acceptedAt);

    const after = await call<MeDto>("/api/me", { as: u.id });
    expect(after.legal.acceptedAt).toBe(first.acceptedAt);
    const rows = await testDb()
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, u.id));
    expect(rows).toHaveLength(1);
  });

  it("refuses an acceptance of a version other than the current one", async () => {
    const u = await createTestUser();
    await call("/api/me/legal/accept", {
      method: "POST",
      as: u.id,
      json: { version: "2000-01-01" },
      expect: 400,
    });
    const me = await call<MeDto>("/api/me", { as: u.id });
    expect(me.legal.acceptedAt).toBeNull();
  });

  it("needs a session", async () => {
    await call("/api/me/legal/accept", {
      method: "POST",
      json: { version: POLICY_VERSION },
      expect: 401,
    });
  });

  it("one user's acceptance does not count for another", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await call("/api/me/legal/accept", {
      method: "POST",
      as: a.id,
      json: { version: POLICY_VERSION },
    });
    const me = await call<MeDto>("/api/me", { as: b.id });
    expect(me.legal.acceptedAt).toBeNull();
  });
});
