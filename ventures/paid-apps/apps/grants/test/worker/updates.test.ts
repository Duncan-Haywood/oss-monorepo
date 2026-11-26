// Company updates: the "What's new?" interview (staleness agenda, supersede only after
// confirmation), quick updates (proposed facts with verbatim quotes), "Confirm still true",
// and tenant isolation. Jobs run inline (APP_ENV=test) with the FakeLlm.
import type { FactDto } from "@shared/api/types";
import type { FactCategory, FactStatus } from "@shared/enums";
import { documents, facts } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestOrg, createTestUser, setupTenant, testDb } from "./helpers";

type Linked = FactDto & {
  supersedes: { id: string; statement: string } | null;
  supersedeProposal: { id: string; statement: string } | null;
};
type QuickUpdate = {
  documentId: string;
  title: string;
  status: string;
  pending: boolean;
  duplicate: boolean;
  facts: Linked[];
};
type Turn = { role: string; content: string; topicKey: string | null };
type Interview = {
  id: string;
  kind: string;
  title: string;
  agenda: string[];
  agendaItems: { key: string; question: string }[];
  turns: Turn[];
};

const json = async <T>(res: Response) => (await res.json()) as T;

async function seedFact(
  orgId: string,
  over: {
    statement: string;
    category: FactCategory;
    asOf?: string | null;
    status?: FactStatus;
    confirmedAt?: Date | null;
    supersedesFactId?: string | null;
  },
) {
  const id = newId("fct");
  const status = over.status ?? "confirmed";
  await testDb()
    .insert(facts)
    .values({
      id,
      orgId,
      category: over.category,
      statement: over.statement,
      asOf: over.asOf ?? null,
      sourceType: "user_entered",
      sourceQuote: "",
      status,
      confidence: 1,
      confirmedAt: status === "confirmed" ? (over.confirmedAt ?? new Date()) : null,
      supersedesFactId: over.supersedesFactId ?? null,
    });
  return id;
}

const getFactRow = async (id: string) =>
  testDb().select().from(facts).where(eq(facts.id, id)).get();

async function answer(orgId: string, as: string, id: string, content: string) {
  const res = await api(`/api/orgs/${orgId}/interviews/${id}/answer`, {
    method: "POST",
    as,
    json: { content, inputMode: "text" },
  });
  expect(res.status).toBe(200);
  return json<{ turns: [Turn, Turn | null]; done: boolean }>(res);
}

describe("update interview", () => {
  it("builds a short agenda with stale themes first and non-leading questions", async () => {
    const { orgId, userId } = await setupTenant();
    // Last year's enrollment (dated, stale) and a recently confirmed program fact (fresh).
    await seedFact(orgId, {
      category: "population_served",
      statement: "Test Org served 320 students in 2025.",
      asOf: "2025",
    });
    await seedFact(orgId, {
      category: "program",
      statement: "Test Org runs a construction trades program.",
    });

    const res = await api(`/api/orgs/${orgId}/interviews`, {
      method: "POST",
      as: userId,
      json: { kind: "update" },
    });
    expect(res.status).toBe(201);
    const iv = await json<Interview>(res);
    expect(iv.kind).toBe("update");
    expect(iv.title).toMatch(/^What's new\? — /);
    expect(iv.agenda.length).toBeGreaterThanOrEqual(5);
    expect(iv.agenda.length).toBeLessThanOrEqual(7);
    // Dated facts first; the fresh programs theme is ranked last and dropped from the 6 slots.
    expect(iv.agenda[0]).toBe("update_outcomes");
    expect(iv.agenda).not.toContain("update_programs");
    const first = iv.turns.at(-1);
    expect(first?.role).toBe("interviewer");
    expect(first?.topicKey).toBe("update_outcomes");
    expect(first?.content).toContain("2025");
    expect(first?.content).toMatch(/No change/i);
    // Non-leading: the question says how old the data is, never the number itself.
    expect(first?.content).not.toContain("320");
  });

  it("supersedes an outdated fact only after the new fact is confirmed", async () => {
    const { orgId, userId } = await setupTenant();
    const oldId = await seedFact(orgId, {
      category: "population_served",
      statement: "Test Org served 320 students in 2025.",
      asOf: "2025",
    });

    const iv = await json<Interview>(
      await api(`/api/orgs/${orgId}/interviews`, {
        method: "POST",
        as: userId,
        json: { kind: "update" },
      }),
    );
    const a1 = await answer(orgId, userId, iv.id, "In 2026, Test Org served 412 students.");
    expect(a1.done).toBe(false);
    // "No change" is a complete answer: no follow-up on the same topic.
    const a2 = await answer(orgId, userId, iv.id, "No change.");
    expect(a2.turns[1]?.topicKey).not.toBe(a1.turns[1]?.topicKey);
    expect(a2.turns[1]?.content).toMatch(/^No problem/);

    const done = await api(`/api/orgs/${orgId}/interviews/${iv.id}/complete`, {
      method: "POST",
      as: userId,
    });
    expect(done.status).toBe(200);

    const proposed = await json<{ items: Linked[] }>(
      await api(`/api/orgs/${orgId}/facts?status=proposed`, { as: userId }),
    );
    expect(proposed.items.some((f) => /no change/i.test(f.statement))).toBe(false);
    const update = proposed.items.find((f) => f.statement.includes("412"));
    expect(update).toBeDefined();
    if (!update) return;
    expect(update.sourceType).toBe("interview");
    expect(update.sourceQuote).toBe("In 2026, Test Org served 412 students.");
    expect(update.asOf).toBe("2026");
    expect(update.supersedesFactId).toBe(oldId);
    expect(update.supersedes?.id).toBe(oldId);

    // Proposed only: the old fact is untouched but shows the pending proposal.
    expect((await getFactRow(oldId))?.status).toBe("confirmed");
    const confirmedList = await json<{ items: Linked[] }>(
      await api(`/api/orgs/${orgId}/facts?status=confirmed`, { as: userId }),
    );
    expect(confirmedList.items.find((f) => f.id === oldId)?.supersedeProposal?.id).toBe(update.id);

    const conf = await api(`/api/orgs/${orgId}/facts/${update.id}/confirm`, {
      method: "POST",
      as: userId,
    });
    expect(conf.status).toBe(200);
    const old = await getFactRow(oldId);
    expect(old?.status).toBe("superseded");
    expect(old?.supersededById).toBe(update.id);
    const fresh = await getFactRow(update.id);
    expect(fresh?.status).toBe("confirmed");
    expect(fresh?.lastConfirmedAt).toBeInstanceOf(Date);
  });

  it("rejecting the proposal leaves the older fact in place", async () => {
    const { orgId, userId } = await setupTenant();
    const oldId = await seedFact(orgId, {
      category: "financial",
      statement: "Test Org has an annual budget of $900,000 in 2025.",
      asOf: "2025",
    });
    const res = await api(`/api/orgs/${orgId}/updates`, {
      method: "POST",
      as: userId,
      json: { text: "Test Org has an annual budget of $1,200,000 in 2026.", inputMode: "text" },
    });
    const body = await json<QuickUpdate>(res);
    const proposal = body.facts.find((f) => f.supersedesFactId === oldId);
    expect(proposal?.supersedes?.id).toBe(oldId);
    if (!proposal) return;
    await api(`/api/orgs/${orgId}/facts/${proposal.id}/reject`, { method: "POST", as: userId });
    expect((await getFactRow(oldId))?.status).toBe("confirmed");
    expect((await getFactRow(oldId))?.supersededById).toBeNull();
  });
});

describe("quick update", () => {
  it("stores an update note and returns proposed facts with verbatim quotes", async () => {
    const { orgId, userId } = await setupTenant();
    const text =
      "In 2026 we enrolled 58 apprentices in the Trades Academy. We also partnered with Gallup Housing Authority this fall.";
    const res = await api(`/api/orgs/${orgId}/updates`, {
      method: "POST",
      as: userId,
      json: { text, inputMode: "voice" },
    });
    expect(res.status).toBe(201);
    const body = await json<QuickUpdate>(res);
    expect(body.pending).toBe(false);
    expect(body.status).toBe("ready");
    expect(body.title).toMatch(/^Update — \d{4}-\d{2}-\d{2}$/);
    expect(body.facts.length).toBeGreaterThan(0);
    for (const f of body.facts) {
      expect(f.status).toBe("proposed");
      expect(f.sourceDocumentId).toBe(body.documentId);
      expect(f.sourceQuote.length).toBeGreaterThan(8);
      expect(text).toContain(f.sourceQuote);
    }
    const doc = await testDb()
      .select()
      .from(documents)
      .where(and(eq(documents.id, body.documentId), eq(documents.orgId, orgId)))
      .get();
    expect(doc?.kind).toBe("update_note");
    expect(doc?.notes).toBe("Quick update (dictated)");

    // Confirm one inline, then the status shows a recent update (no check-in nudge).
    const first = body.facts[0];
    if (!first) return;
    const conf = await api(`/api/orgs/${orgId}/facts/${first.id}/confirm`, {
      method: "POST",
      as: userId,
    });
    expect(conf.status).toBe(200);
    const again = await json<QuickUpdate>(
      await api(`/api/orgs/${orgId}/updates/${body.documentId}`, { as: userId }),
    );
    expect(again.facts.find((f) => f.id === first.id)?.status).toBe("confirmed");
    const status = await json<{ lastUpdateAt: string | null; checkInDue: boolean }>(
      await api(`/api/orgs/${orgId}/updates/status`, { as: userId }),
    );
    expect(status.lastUpdateAt).not.toBeNull();
    expect(status.checkInDue).toBe(false);
  });

  it("validates input and requires editor role", async () => {
    const { orgId, userId } = await setupTenant();
    const empty = await api(`/api/orgs/${orgId}/updates`, {
      method: "POST",
      as: userId,
      json: { text: " ", inputMode: "text" },
    });
    expect(empty.status).toBe(400);
    const viewer = await createTestUser();
    const { orgId: viewerOrg } = await createTestOrg(viewer.id, { role: "viewer" });
    const denied = await api(`/api/orgs/${viewerOrg}/updates`, {
      method: "POST",
      as: viewer.id,
      json: { text: "We hired a new program director in 2026.", inputMode: "text" },
    });
    expect(denied.status).toBe(403);
  });
});

describe("staleness", () => {
  it("flags outdated facts until someone confirms they are still true", async () => {
    const { orgId, userId } = await setupTenant();
    const stale = await seedFact(orgId, {
      category: "staff",
      statement: "Test Org has 12 staff members as of 2024.",
      asOf: "2024",
    });
    const before = await json<{ staleFactCount: number; checkInDue: boolean }>(
      await api(`/api/orgs/${orgId}/updates/status`, { as: userId }),
    );
    expect(before.staleFactCount).toBe(1);
    expect(before.checkInDue).toBe(true);

    const res = await api(`/api/orgs/${orgId}/facts/${stale}/still-true`, {
      method: "POST",
      as: userId,
    });
    expect(res.status).toBe(200);
    expect((await json<FactDto>(res)).lastConfirmedAt).not.toBeNull();
    const after = await json<{ staleFactCount: number }>(
      await api(`/api/orgs/${orgId}/updates/status`, { as: userId }),
    );
    expect(after.staleFactCount).toBe(0);

    const proposed = await seedFact(orgId, {
      category: "staff",
      statement: "Test Org has 14 staff members.",
      status: "proposed",
    });
    const conflict = await api(`/api/orgs/${orgId}/facts/${proposed}/still-true`, {
      method: "POST",
      as: userId,
    });
    expect(conflict.status).toBe(409);
  });
});

describe("tenant isolation", () => {
  it("keeps updates, still-true and supersede inside the org", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const created = await json<QuickUpdate>(
      await api(`/api/orgs/${a.orgId}/updates`, {
        method: "POST",
        as: a.userId,
        json: { text: "In 2026 we opened a second workshop in Gallup.", inputMode: "text" },
      }),
    );
    // B can't read A's update through either org, or post into A's org.
    expect(
      (await api(`/api/orgs/${a.orgId}/updates/${created.documentId}`, { as: b.userId })).status,
    ).toBe(404);
    expect(
      (await api(`/api/orgs/${b.orgId}/updates/${created.documentId}`, { as: b.userId })).status,
    ).toBe(404);
    expect(
      (
        await api(`/api/orgs/${a.orgId}/updates`, {
          method: "POST",
          as: b.userId,
          json: { text: "We served 9,000 people in 2026.", inputMode: "text" },
        })
      ).status,
    ).toBe(404);
    expect((await api(`/api/orgs/${a.orgId}/updates/status`, { as: b.userId })).status).toBe(404);

    // A's fact can't be bumped from B's org.
    const aFact = await seedFact(a.orgId, {
      category: "staff",
      statement: "Test Org has 12 staff members as of 2024.",
      asOf: "2024",
    });
    expect(
      (
        await api(`/api/orgs/${b.orgId}/facts/${aFact}/still-true`, {
          method: "POST",
          as: b.userId,
        })
      ).status,
    ).toBe(404);
    expect((await getFactRow(aFact))?.lastConfirmedAt).toBeNull();

    // A proposal in B that (wrongly) points at A's fact never supersedes it on confirmation.
    const bProposal = await seedFact(b.orgId, {
      category: "staff",
      statement: "Test Org has 15 staff members as of 2026.",
      asOf: "2026",
      status: "proposed",
      supersedesFactId: aFact,
    });
    const conf = await api(`/api/orgs/${b.orgId}/facts/${bProposal}/confirm`, {
      method: "POST",
      as: b.userId,
    });
    expect(conf.status).toBe(200);
    const after = await getFactRow(aFact);
    expect(after?.status).toBe("confirmed");
    expect(after?.supersededById).toBeNull();
    // And B's fact list never reveals A's fact as a link.
    const list = await json<{ items: Linked[] }>(
      await api(`/api/orgs/${b.orgId}/facts`, { as: b.userId }),
    );
    expect(list.items.every((f) => f.supersedes === null && f.supersedeProposal === null)).toBe(
      true,
    );
  });
});
