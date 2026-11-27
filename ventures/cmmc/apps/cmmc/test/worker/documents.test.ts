// ISO 9001 document control: the master list, release / revise / review / withdraw, the history,
// the CSV, the plan gate (readable everywhere, recording on the quality plan), roles and tenants.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

interface Doc {
  id: string;
  docNumber: string;
  revision: string;
  status: string;
  releasedRevision: string | null;
  approvedBy: string | null;
  approvedOn: string | null;
  reviewDue: string | null;
}
interface DocList {
  today: string;
  items: (Doc & {
    review: string;
    suggestedNextRevision: string | null;
    issues: { kind: string }[];
  })[];
  check: { total: number; active: number; released: number; obsolete: number };
  needingReview: { documentId: string }[];
  kinds: { key: string }[];
}
interface Event {
  kind: string;
  revision: string;
  summary: string;
  byName: string;
  on: string;
}

const add = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/documents"), { method: "POST", as, json: body });
const post = (t: Tenant, id: string, action: string, body: unknown, as = t.userId) =>
  api(path(t, `/documents/${id}/${action}`), { method: "POST", as, json: body });
const list = (t: Tenant, as = t.userId) => json<DocList>(api(path(t, "/documents"), { as }));
const history = (t: Tenant, id: string) =>
  json<{ items: Event[] }>(api(path(t, `/documents/${id}/history`), { as: t.userId }));

const procedure = (over: Record<string, unknown> = {}) => ({
  docNumber: "QP-7.5-01",
  title: "Control of documented information",
  kind: "procedure",
  revision: "A",
  location: "Shared drive /Quality/Procedures",
  reviewMonths: 12,
  ...over,
});

describe("document control", () => {
  it("runs a document from draft through two releases, a review and withdrawal", async () => {
    const t = await setupTenant();
    const d = await json<Doc>(add(t, procedure()), 201);
    expect(d).toMatchObject({ status: "draft", revision: "A", releasedRevision: null });
    let l = await list(t);
    expect(l.items[0]?.issues.some((i) => i.kind === "gap")).toBe(true);
    expect(l.kinds.length).toBeGreaterThan(5);

    const r1 = await json<Doc>(post(t, d.id, "release", { approvedOn: daysAgo(30) }));
    expect(r1).toMatchObject({ status: "released", releasedRevision: "A", approvedBy: t.userId });
    expect(r1.reviewDue).not.toBeNull();

    // A released revision is not edited in place.
    const inPlace = await api(path(t, `/documents/${d.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { revision: "A1" },
    });
    expect(inPlace.status).toBe(409);

    const rev = await json<Doc>(post(t, d.id, "revise", {}));
    expect(rev).toMatchObject({ status: "draft", revision: "B", releasedRevision: "A" });
    l = await list(t);
    expect(l.check.released).toBe(1);

    // A second release needs a change summary.
    const noSummary = await post(t, d.id, "release", { approvedOn: daysAgo(10) });
    expect(noSummary.status).toBe(400);
    const r2 = await json<Doc>(
      post(t, d.id, "release", { approvedOn: daysAgo(10), changeSummary: "Added e-signatures" }),
    );
    expect(r2).toMatchObject({ status: "released", releasedRevision: "B" });

    await json(post(t, d.id, "review", { reviewedOn: todayIso() }));
    const h = await history(t, d.id);
    expect(h.items.map((e) => `${e.kind}:${e.revision}`)).toEqual([
      "reviewed:B",
      "released:B",
      "released:A",
    ]);
    expect(h.items[1]?.summary).toBe("Added e-signatures");
    expect(h.items[2]?.summary).toBe("First release.");

    // Released documents are withdrawn, not deleted.
    const del = await api(path(t, `/documents/${d.id}`), { method: "DELETE", as: t.userId });
    expect(del.status).toBe(409);
    const noReason = await post(t, d.id, "obsolete", { on: todayIso(), reason: " " });
    expect(noReason.status).toBe(400);
    const o = await json<Doc>(
      post(t, d.id, "obsolete", { on: todayIso(), reason: "Superseded by QP-7.5-02" }),
    );
    expect(o).toMatchObject({ status: "obsolete", revision: "B", reviewDue: null });
    expect((await post(t, d.id, "revise", {})).status).toBe(409);
    expect((await history(t, d.id)).items[0]).toMatchObject({ kind: "obsoleted" });
    l = await list(t);
    expect(l.check).toMatchObject({ total: 1, active: 0, obsolete: 1 });
  });

  it("refuses duplicate numbers, a re-used revision, future dates and an outside approver", async () => {
    const t = await setupTenant();
    const d = await json<Doc>(add(t, procedure()), 201);
    expect((await add(t, procedure())).status).toBe(409);
    expect((await post(t, d.id, "release", { approvedOn: "2999-01-01" })).status).toBe(400);
    const outsider = await createTestUser("Outsider");
    const bad = await post(t, d.id, "release", { approvedOn: todayIso(), approvedBy: outsider.id });
    expect(bad.status).toBe(400);
    await json(post(t, d.id, "release", { approvedOn: daysAgo(5) }));
    expect((await post(t, d.id, "revise", { revision: "A" })).status).toBe(400);
    await json(post(t, d.id, "revise", {}));
    // Renaming the draft back to a released revision is refused at release.
    await json(
      api(path(t, `/documents/${d.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { revision: "A" },
      }),
    );
    const reused = await post(t, d.id, "release", { approvedOn: todayIso(), changeSummary: "x" });
    expect(reused.status).toBe(409);
    expect(await reused.text()).toContain("released before");
  });

  it("deletes a never-released draft and needs an issuer for an external drawing", async () => {
    const t = await setupTenant();
    const ext = await add(
      t,
      procedure({ docNumber: "DWG-4471", kind: "drawing", origin: "external" }),
    );
    expect(ext.status).toBe(400);
    expect(await ext.text()).toContain("who issues");
    const ok = await json<Doc>(
      add(
        t,
        procedure({
          docNumber: "DWG-4471",
          kind: "drawing",
          origin: "external",
          issuer: "Customer",
        }),
      ),
      201,
    );
    await json(api(path(t, `/documents/${ok.id}`), { method: "DELETE", as: t.userId }));
    expect((await list(t)).items).toHaveLength(0);
  });

  it("exports the master list as CSV with the approver's name", async () => {
    const t = await setupTenant();
    const d = await json<Doc>(add(t, procedure({ title: "=cmd()" })), 201);
    await json(post(t, d.id, "release", { approvedOn: daysAgo(1) }));
    const res = await api(path(t, "/documents/export.csv"), { as: t.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("QP-7.5-01,'=cmd(),Procedure,Internal,,A,Released");
    expect(csv).toContain("Test User");
  });

  it("is readable on every plan; recording needs Level 2 + Quality", async () => {
    for (const plan of [null, "level2"]) {
      const t = await setupTenant("owner", "Shop", plan);
      expect((await list(t)).items).toEqual([]);
      const res = await add(t, procedure());
      expect(res.status).toBe(402);
      expect(await res.text()).toContain("needs the Level 2 + Quality plan");
    }
  });

  it("lets viewers read but not write, and keeps tenants apart", async () => {
    const t = await setupTenant();
    const d = await json<Doc>(add(t, procedure()), 201);
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await list(t, viewer.id)).items).toHaveLength(1);
    expect((await add(t, procedure({ docNumber: "X" }), viewer.id)).status).toBe(403);
    expect((await post(t, d.id, "release", { approvedOn: todayIso() }, viewer.id)).status).toBe(
      403,
    );

    const other = await setupTenant("owner", "Other Shop");
    // Same number in another org is fine; the first org's document is invisible there.
    await json(add(other, procedure()), 201);
    const cross = await api(`/api/orgs/${other.orgId}/documents/${d.id}/release`, {
      method: "POST",
      as: other.userId,
      json: { approvedOn: todayIso() },
    });
    expect(cross.status).toBe(404);
    const crossHistory = await api(`/api/orgs/${other.orgId}/documents/${d.id}/history`, {
      as: other.userId,
    });
    expect(crossHistory.status).toBe(404);
    // And a member of the other org cannot reach the first org at all.
    const outsiderRead = await api(path(t, "/documents"), { as: other.userId });
    expect(outsiderRead.status).toBe(404);
  });
});
