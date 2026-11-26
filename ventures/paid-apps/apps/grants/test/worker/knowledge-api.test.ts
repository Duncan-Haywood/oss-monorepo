import type { FactDto, ProjectDto } from "@shared/api/types";
import { auditLog, facts, member } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "./helpers";

async function seedProposed(
  orgId: string,
  statement: string,
  category: FactDto["category"] = "outcome",
) {
  const id = newId("fct");
  await testDb().insert(facts).values({
    id,
    orgId,
    category,
    statement,
    sourceType: "document",
    sourceQuote: statement,
    status: "proposed",
    confidence: 0.8,
  });
  return id;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe("facts API", () => {
  it("creates user_entered facts as confirmed and lists/filters them", async () => {
    const { orgId, userId } = await setupTenant();
    const res = await api(`/api/orgs/${orgId}/facts`, {
      method: "POST",
      as: userId,
      json: { category: "mission", statement: "Test Org helps families in Gallup.", asOf: "2026" },
    });
    expect(res.status).toBe(201);
    const fact = await json<FactDto>(res);
    expect(fact).toMatchObject({
      status: "confirmed",
      sourceType: "user_entered",
      confirmedBy: userId,
      createdBy: userId,
      sourceQuote: "",
    });
    await seedProposed(orgId, "Test Org trained 142 students in 2024.");

    const all = await json<{ items: FactDto[] }>(
      await api(`/api/orgs/${orgId}/facts`, { as: userId }),
    );
    expect(all.items).toHaveLength(2);
    const proposed = await json<{ items: FactDto[] }>(
      await api(`/api/orgs/${orgId}/facts?status=proposed`, { as: userId }),
    );
    expect(proposed.items.map((f) => f.statement)).toEqual([
      "Test Org trained 142 students in 2024.",
    ]);
    const q = await json<{ items: FactDto[] }>(
      await api(`/api/orgs/${orgId}/facts?q=families&category=mission`, { as: userId }),
    );
    expect(q.items.map((f) => f.id)).toEqual([fact.id]);
    const bad = await api(`/api/orgs/${orgId}/facts?status=bogus`, { as: userId });
    expect(bad.status).toBe(400);
  });

  it("confirm / reject / bulk-confirm / patch with provenance and audit", async () => {
    const { orgId, userId } = await setupTenant("editor");
    const a = await seedProposed(orgId, "Test Org trained 142 students in 2024.");
    const b = await seedProposed(orgId, "Test Org has 12 instructors.", "staff");
    const c = await seedProposed(orgId, "Test Org has 9 board members.", "governance");

    const conf = await json<FactDto>(
      await api(`/api/orgs/${orgId}/facts/${a}/confirm`, { method: "POST", as: userId }),
    );
    expect(conf).toMatchObject({ status: "confirmed", confirmedBy: userId });

    const rej = await api(`/api/orgs/${orgId}/facts/${b}/reject`, {
      method: "POST",
      as: userId,
      json: { reason: "Outdated" },
    });
    expect(await json<FactDto>(rej)).toMatchObject({
      status: "rejected",
      rejectionReason: "Outdated",
    });

    const patched = await json<FactDto>(
      await api(`/api/orgs/${orgId}/facts/${c}`, {
        method: "PATCH",
        as: userId,
        json: { statement: "Test Org has a 9-member board of directors." },
      }),
    );
    expect(patched).toMatchObject({
      status: "proposed", // PATCH never confirms
      statement: "Test Org has a 9-member board of directors.",
      originalStatement: "Test Org has 9 board members.",
      sourceQuote: "Test Org has 9 board members.",
      editedBy: userId,
      createdBy: userId,
    });
    const noStatus = await api(`/api/orgs/${orgId}/facts/${c}`, {
      method: "PATCH",
      as: userId,
      json: { status: "confirmed" },
    });
    expect(noStatus.status).toBe(400);

    const bulk = await json<{ confirmed: number; ids: string[] }>(
      await api(`/api/orgs/${orgId}/facts/bulk-confirm`, {
        method: "POST",
        as: userId,
        json: { ids: [a, b, c, "fct_nope"] },
      }),
    );
    expect(bulk).toEqual({ confirmed: 1, ids: [c] });

    const summary = await json<{
      byStatus: Record<string, number>;
      byCategory: Record<string, number>;
      coverage: { topic: string; factCount: number; status: string }[];
    }>(await api(`/api/orgs/${orgId}/facts/summary`, { as: userId }));
    expect(summary.byStatus).toMatchObject({
      confirmed: 2,
      rejected: 1,
      proposed: 0,
      superseded: 0,
    });
    expect(summary.byCategory).toMatchObject({ outcome: 1, governance: 1, staff: 0 });
    expect(summary.coverage.find((x) => x.topic === "governance")).toMatchObject({
      factCount: 1,
      status: "good",
    });
    expect(summary.coverage.find((x) => x.topic === "financials")?.status).toBe("missing");

    const actions = (
      await testDb().select().from(auditLog).where(eq(auditLog.orgId, orgId)).all()
    ).map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "fact.confirmed",
        "fact.rejected",
        "fact.updated",
        "fact.bulk_confirmed",
      ]),
    );
  });

  it("requires editor for writes; viewers and reviewers can read", async () => {
    const owner = await setupTenant();
    const factId = await seedProposed(owner.orgId, "Test Org trained 142 students in 2024.");
    for (const role of ["viewer", "reviewer"] as const) {
      const u = await createTestUser();
      await testDb()
        .insert(member)
        .values({
          id: newId("org").replace("org_", "mem_"),
          organizationId: owner.orgId,
          userId: u.id,
          role,
        });
      expect((await api(`/api/orgs/${owner.orgId}/facts`, { as: u.id })).status).toBe(200);
      expect(
        (
          await api(`/api/orgs/${owner.orgId}/facts/${factId}/confirm`, {
            method: "POST",
            as: u.id,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await api(`/api/orgs/${owner.orgId}/facts`, {
            method: "POST",
            as: u.id,
            json: { category: "mission", statement: "Nope nope nope" },
          })
        ).status,
      ).toBe(403);
    }
  });

  it("isolates tenants: other orgs' facts are 404", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const factId = await seedProposed(a.orgId, "Org A trained 142 students in 2024.");
    // Non-member of org A
    expect((await api(`/api/orgs/${a.orgId}/facts`, { as: b.userId })).status).toBe(404);
    // Member of B addressing A's fact through B's org
    for (const [method, path] of [
      ["GET", `/facts/${factId}`],
      ["POST", `/facts/${factId}/confirm`],
      ["POST", `/facts/${factId}/reject`],
      ["PATCH", `/facts/${factId}`],
    ] as const) {
      const res = await api(`/api/orgs/${b.orgId}${path}`, {
        method,
        as: b.userId,
        json: method === "PATCH" ? { statement: "Hijacked statement" } : undefined,
      });
      expect(res.status).toBe(404);
    }
    const bulk = await json<{ confirmed: number }>(
      await api(`/api/orgs/${b.orgId}/facts/bulk-confirm`, {
        method: "POST",
        as: b.userId,
        json: { ids: [factId] },
      }),
    );
    expect(bulk.confirmed).toBe(0);
    const row = await testDb().select().from(facts).where(eq(facts.id, factId)).get();
    expect(row?.status).toBe("proposed");
    // projectId from another org is refused
    const pa = await json<ProjectDto>(
      await api(`/api/orgs/${a.orgId}/projects`, {
        method: "POST",
        as: a.userId,
        json: { title: "A project" },
      }),
    );
    const cross = await api(`/api/orgs/${b.orgId}/facts`, {
      method: "POST",
      as: b.userId,
      json: { category: "project", statement: "Cross tenant link", projectId: pa.id },
    });
    expect(cross.status).toBe(400);
  });
});

describe("projects API", () => {
  it("CRUD with mirrored project facts in detail", async () => {
    const { orgId, userId } = await setupTenant();
    const created = await api(`/api/orgs/${orgId}/projects`, {
      method: "POST",
      as: userId,
      json: {
        title: "Welding lab",
        summary: "A welding lab for the trades program.",
        location: "Gallup, NM",
        budgetNeededCents: 25_000_000,
        priority: 1,
      },
    });
    expect(created.status).toBe(201);
    const p = await json<ProjectDto>(created);
    expect(p).toMatchObject({ title: "Welding lab", priority: 1, createdBy: userId });

    const list = await json<{ items: (ProjectDto & { factCount: number })[] }>(
      await api(`/api/orgs/${orgId}/projects`, { as: userId }),
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.factCount).toBe(3);

    const detail = await json<ProjectDto & { facts: FactDto[] }>(
      await api(`/api/orgs/${orgId}/projects/${p.id}`, { as: userId }),
    );
    expect(detail.facts.map((f) => f.statement).sort()).toEqual([
      'Test Org\'s project "Welding lab" location: Gallup, NM',
      'Test Org\'s project "Welding lab" needs $250,000 in funding.',
      'Test Org\'s project "Welding lab": A welding lab for the trades program.',
    ]);
    expect(detail.facts.every((f) => f.status === "confirmed" && f.projectId === p.id)).toBe(true);

    const patched = await api(`/api/orgs/${orgId}/projects/${p.id}`, {
      method: "PATCH",
      as: userId,
      json: { budgetNeededCents: 30_000_000, location: "" },
    });
    expect(patched.status).toBe(200);
    const detail2 = await json<ProjectDto & { facts: FactDto[] }>(
      await api(`/api/orgs/${orgId}/projects/${p.id}`, { as: userId }),
    );
    expect(detail2.budgetNeededCents).toBe(30_000_000);
    expect(detail2.facts.map((f) => f.statement).sort()).toEqual([
      'Test Org\'s project "Welding lab" needs $300,000 in funding.',
      'Test Org\'s project "Welding lab": A welding lab for the trades program.',
    ]);
    const superseded = await testDb()
      .select()
      .from(facts)
      .where(and(eq(facts.orgId, orgId), eq(facts.status, "superseded")))
      .all();
    expect(superseded).toHaveLength(2);

    const del = await api(`/api/orgs/${orgId}/projects/${p.id}`, { method: "DELETE", as: userId });
    expect(del.status).toBe(200);
    expect((await api(`/api/orgs/${orgId}/projects/${p.id}`, { as: userId })).status).toBe(404);
  });

  it("enforces roles and tenant isolation", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const p = await json<ProjectDto>(
      await api(`/api/orgs/${a.orgId}/projects`, {
        method: "POST",
        as: a.userId,
        json: { title: "X" },
      }),
    );
    expect((await api(`/api/orgs/${a.orgId}/projects/${p.id}`, { as: b.userId })).status).toBe(404);
    expect((await api(`/api/orgs/${b.orgId}/projects/${p.id}`, { as: b.userId })).status).toBe(404);
    expect(
      (
        await api(`/api/orgs/${b.orgId}/projects/${p.id}`, {
          method: "PATCH",
          as: b.userId,
          json: { title: "Y" },
        })
      ).status,
    ).toBe(404);
    expect(
      (await api(`/api/orgs/${b.orgId}/projects/${p.id}`, { method: "DELETE", as: b.userId }))
        .status,
    ).toBe(404);
    const v = await setupTenant("viewer");
    expect(
      (
        await api(`/api/orgs/${v.orgId}/projects`, {
          method: "POST",
          as: v.userId,
          json: { title: "Z" },
        })
      ).status,
    ).toBe(403);
  });
});
