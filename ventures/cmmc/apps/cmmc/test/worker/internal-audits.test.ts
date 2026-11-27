// ISO 9001 internal audits and corrective actions: the programme, findings, a corrective action
// opened from a finding and run to close, the independence check, the CSV, the plan gate (readable
// everywhere, recording on the quality plan), roles and tenants.
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
const daysAhead = (n: number) => daysAgo(-n);

interface Audit {
  id: string;
  status: string;
  auditorName: string;
  completedOn: string | null;
}
interface Ca {
  id: string;
  ref: string;
  source: string;
  clauseId: string | null;
  nonconformity: string;
  raisedOn: string;
  verifyDueOn: string | null;
  verifiedOn: string | null;
  effective: boolean | null;
  closedOn: string | null;
  verificationNotes: string;
}
interface Programme {
  audits: (Audit & {
    timing: string;
    findings: { id: string; correctiveActionRef: string | null }[];
  })[];
  correctiveActions: (Ca & { stage: string; auditId: string | null })[];
  check: {
    audits: { planned: number; done: number; overdue: number };
    clauses: { applicable: number; covered: number; uncovered: string[] };
    correctiveActions: { open: number; closed: number };
    issues: { kind: string; message: string }[];
  };
  findingKinds: { key: string }[];
}

const send = (t: Tenant, p: string, method: string, body?: unknown, as = t.userId) =>
  api(path(t, p), { method, as, ...(body === undefined ? {} : { json: body }) });
const programme = (t: Tenant, as = t.userId) => json<Programme>(api(path(t, "/audits"), { as }));

const plan = (over: Record<string, unknown> = {}) => ({
  title: "Production and inspection audit",
  clauseIds: ["iso9001-8.5.1", "iso9001-8.6", "iso9001-7.1.5"],
  plannedOn: daysAgo(3),
  auditorName: "Jordan (outside auditor)",
  ...over,
});

describe("internal audits and corrective actions", () => {
  it("runs an audit to a finding, a corrective action from it, and its close", async () => {
    const t = await setupTenant();
    const a = await json<Audit>(send(t, "/audits", "POST", plan()), 201);
    let p = await programme(t);
    expect(p.audits[0]?.timing).toBe("overdue");
    expect(p.check.audits.overdue).toBe(1);
    expect(p.check.clauses.applicable).toBeGreaterThan(40);
    expect(p.check.clauses.covered).toBe(3);

    expect(
      (await send(t, `/audits/${a.id}/complete`, "POST", { completedOn: daysAhead(2) })).status,
    ).toBe(400);
    const done = await json<Audit>(
      send(t, `/audits/${a.id}/complete`, "POST", {
        completedOn: daysAgo(2),
        summary: "Two cells and final inspection sampled.",
      }),
    );
    expect(done).toMatchObject({ status: "done", completedOn: daysAgo(2) });

    const f = await json<{ id: string }>(
      send(t, `/audits/${a.id}/findings`, "POST", {
        kind: "minor",
        clauseId: "iso9001-7.1.5",
        description: "Micrometer M-14 used past its calibration date.",
        evidence: "Cal sticker 2026-08; job 4471 inspection sheet.",
      }),
      201,
    );
    p = await programme(t);
    expect(p.check.issues.some((i) => i.message.includes("has no corrective action"))).toBe(true);

    const ca = await json<Ca>(
      send(t, `/audits/${a.id}/findings/${f.id}/corrective-action`, "POST", {
        ownerUserId: t.userId,
        dueOn: daysAhead(20),
        containment: "M-14 tagged out; lot 4471 re-inspected.",
      }),
      201,
    );
    expect(ca).toMatchObject({
      ref: "CA-0001",
      source: "internal_audit",
      clauseId: "iso9001-7.1.5",
      raisedOn: daysAgo(2),
    });
    expect(ca.nonconformity).toContain("Micrometer M-14");
    expect(
      (await send(t, `/audits/${a.id}/findings/${f.id}/corrective-action`, "POST", {})).status,
    ).toBe(409);
    // The finding and the audit are kept once an action came from them.
    expect((await send(t, `/audits/${a.id}/findings/${f.id}`, "DELETE")).status).toBe(409);
    expect((await send(t, `/audits/${a.id}`, "DELETE")).status).toBe(409);

    // Effect is checked only once the cause and action are in.
    const early = await send(t, `/corrective-actions/${ca.id}/verify`, "POST", {
      checkedOn: todayIso(),
      effective: true,
      notes: "ok",
    });
    expect(early.status).toBe(400);
    expect(
      (await send(t, `/corrective-actions/${ca.id}`, "PATCH", { completedOn: daysAgo(1) })).status,
    ).toBe(400);
    const acted = await json<Ca>(
      send(t, `/corrective-actions/${ca.id}`, "PATCH", {
        rootCause: "No recall list; calibration due dates only on the stickers.",
        action: "Recall list in the gauge log, checked weekly by the QC lead.",
        completedOn: daysAgo(1),
      }),
    );
    expect(acted.verifyDueOn).not.toBeNull();

    const failed = await json<Ca>(
      send(t, `/corrective-actions/${ca.id}/verify`, "POST", {
        checkedOn: todayIso(),
        effective: false,
        notes: "Gauge G-3 found overdue in the next sample.",
      }),
    );
    expect(failed).toMatchObject({ effective: false, closedOn: null });
    p = await programme(t);
    expect(p.correctiveActions[0]?.stage).toBe("not_effective");

    // A new action starts a new check; the earlier one stays in the notes.
    const retry = await json<Ca>(
      send(t, `/corrective-actions/${ca.id}`, "PATCH", {
        action: "Gauge log in the MRP with a lock-out on overdue gauges.",
        completedOn: todayIso(),
      }),
    );
    expect(retry).toMatchObject({ verifiedOn: null, effective: null });
    expect(retry.verificationNotes).toContain("not effective");
    const closed = await json<Ca>(
      send(t, `/corrective-actions/${ca.id}/verify`, "POST", {
        checkedOn: todayIso(),
        effective: true,
        notes: "All 31 gauges in date; lock-out tested on G-3.",
      }),
    );
    expect(closed.closedOn).toBe(todayIso());
    expect((await send(t, `/corrective-actions/${ca.id}`, "PATCH", { action: "x" })).status).toBe(
      409,
    );
    expect((await send(t, `/corrective-actions/${ca.id}`, "DELETE")).status).toBe(409);
    p = await programme(t);
    expect(p.check.correctiveActions).toMatchObject({ open: 0, closed: 1 });
    expect(p.correctiveActions[0]?.auditId).toBe(a.id);
    expect(p.audits[0]?.findings[0]?.correctiveActionRef).toBe("CA-0001");
  });

  it("flags an auditor who owns a clause in scope, and numbers stand-alone actions", async () => {
    const t = await setupTenant();
    await json(
      send(t, "/quality/iso9001-8.6", "PATCH", { status: "in_place", ownerUserId: t.userId }),
    );
    await json(
      send(
        t,
        "/audits",
        "POST",
        plan({ auditorName: undefined, auditorUserId: t.userId, plannedOn: daysAhead(90) }),
      ),
      201,
    );
    const p = await programme(t);
    expect(p.audits[0]?.auditorName).toBe("Test User");
    expect(p.check.issues.some((i) => i.message.includes("owns 8.6"))).toBe(true);

    const c1 = await json<Ca>(
      send(t, "/corrective-actions", "POST", {
        source: "customer_complaint",
        nonconformity: "Burrs on 40 brackets, PO 1182.",
        raisedOn: daysAgo(5),
      }),
      201,
    );
    const c2 = await json<Ca>(
      send(t, "/corrective-actions", "POST", {
        source: "supplier",
        nonconformity: "Bar stock certs missing heat number.",
        raisedOn: daysAgo(1),
      }),
      201,
    );
    expect([c1.ref, c2.ref]).toEqual(["CA-0001", "CA-0002"]);
    expect(
      (
        await send(t, "/corrective-actions", "POST", {
          source: "other",
          nonconformity: "x",
          raisedOn: daysAhead(1),
        })
      ).status,
    ).toBe(400);
    await json(send(t, `/corrective-actions/${c2.id}`, "DELETE"));
    const res = await api(path(t, "/corrective-actions/export.csv"), { as: t.userId });
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("CA-0001");
    expect(csv).toContain("Customer complaint");
    expect(csv).not.toContain("CA-0002");
  });

  it("refuses unknown clauses, outside auditors without a name and outsiders as owner", async () => {
    const t = await setupTenant();
    expect((await send(t, "/audits", "POST", plan({ clauseIds: ["iso9001-99"] }))).status).toBe(
      400,
    );
    expect((await send(t, "/audits", "POST", plan({ auditorName: "" }))).status).toBe(400);
    const outsider = await createTestUser("Outsider");
    expect(
      (await send(t, "/audits", "POST", plan({ auditorName: "", auditorUserId: outsider.id })))
        .status,
    ).toBe(400);
    const a = await json<Audit>(
      send(t, "/audits", "POST", plan({ plannedOn: daysAhead(10) })),
      201,
    );
    await json(send(t, `/audits/${a.id}/cancel`, "POST"));
    expect(
      (await send(t, `/audits/${a.id}/findings`, "POST", { kind: "minor", description: "x" }))
        .status,
    ).toBe(409);
    await json(send(t, `/audits/${a.id}`, "DELETE"));
    expect((await programme(t)).audits).toHaveLength(0);
  });

  it("is readable on every plan; recording needs Level 2 + Quality", async () => {
    for (const p of [null, "level2"]) {
      const t = await setupTenant("owner", "Shop", p);
      expect((await programme(t)).audits).toEqual([]);
      const res = await send(t, "/audits", "POST", plan());
      expect(res.status).toBe(402);
      expect(await res.text()).toContain("needs the Level 2 + Quality plan");
    }
  });

  it("lets viewers read but not write, and keeps tenants apart", async () => {
    const t = await setupTenant();
    const a = await json<Audit>(send(t, "/audits", "POST", plan()), 201);
    const ca = await json<Ca>(
      send(t, "/corrective-actions", "POST", {
        source: "process",
        nonconformity: "Wrong revision drawing at the saw.",
        raisedOn: daysAgo(1),
      }),
      201,
    );
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await programme(t, viewer.id)).audits).toHaveLength(1);
    expect((await send(t, "/audits", "POST", plan(), viewer.id)).status).toBe(403);
    expect(
      (await send(t, `/corrective-actions/${ca.id}`, "PATCH", { rootCause: "x" }, viewer.id))
        .status,
    ).toBe(403);

    const other = await setupTenant("owner", "Other Shop");
    const cross = await api(`/api/orgs/${other.orgId}/audits/${a.id}/complete`, {
      method: "POST",
      as: other.userId,
      json: { completedOn: todayIso() },
    });
    expect(cross.status).toBe(404);
    const crossCa = await api(`/api/orgs/${other.orgId}/corrective-actions/${ca.id}`, {
      method: "PATCH",
      as: other.userId,
      json: { rootCause: "x" },
    });
    expect(crossCa.status).toBe(404);
    expect((await programme(other)).correctiveActions).toHaveLength(0);
    expect((await api(path(t, "/audits"), { as: other.userId })).status).toBe(404);
  });
});
