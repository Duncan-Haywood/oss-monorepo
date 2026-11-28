// Cyber incident register (IR.L2-3.6.1, 3.6.2; DFARS 252.204-7012): record, the clocks and stage on
// the list, validation, every plan, roles (admins alone delete), audit, the CSV and Markdown record,
// the calendar's image-hold date, and tenants.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

interface Incident {
  id: string;
  title: string;
  stage: string;
  clocks: { reportDue: string; overdue: boolean; preserveUntil: string | null };
  applicability: { required: boolean | null };
  checklist: { id: string; done: boolean }[];
  issues: { kind: string }[];
}
interface IncidentList {
  items: Incident[];
  attention: { incidentId: string; stage: string; overdue: boolean }[];
  steps: { id: string; cite: string }[];
  reportHours: number;
  quotes: Record<string, string>;
}

const add = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/incidents"), { method: "POST", as, json: body });
const list = (t: Tenant, as = t.userId) => json<IncidentList>(api(path(t, "/incidents"), { as }));

const phish = () => ({
  title: "Phished mailbox",
  clause: "yes",
  affects: "cdi",
  discoveredAt: hoursAgo(10),
});

describe("incidents", () => {
  it("records an incident on the free plan and runs the 72-hour clock", async () => {
    const t = await setupTenant("owner", "Free Shop", null);
    const inc = await json<Incident>(add(t, phish()), 201);
    expect(inc.stage).toBe("report");
    expect(inc.applicability.required).toBe(true);
    expect(inc.clocks.overdue).toBe(false);
    const l = await list(t);
    expect(l.reportHours).toBe(72);
    expect(l.quotes.rapidly).toContain("within 72 hours of discovery");
    expect(l.attention).toMatchObject([{ incidentId: inc.id, stage: "report", overdue: false }]);
    expect(l.steps.map((s) => s.id)).toContain("preserve");
  });

  it("reporting starts the 90-day hold; a sub owes its higher tier the number", async () => {
    const t = await setupTenant();
    const inc = await json<Incident>(
      add(t, { ...phish(), role: "sub", higherTier: "Prime Aero" }),
      201,
    );
    const reported = await json<Incident>(
      api(path(t, `/incidents/${inc.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { reportedAt: hoursAgo(2), reportNumber: "ICF-2026-0001", steps: { report: true } },
      }),
    );
    expect(reported.stage).toBe("preserve");
    expect(reported.clocks.preserveUntil).not.toBeNull();
    expect(reported.issues.map((i) => i.kind)).toEqual(["higher_tier"]);
    expect(reported.checklist.find((s) => s.id === "report")?.done).toBe(true);
    expect((await list(t)).attention[0]).toMatchObject({ stage: "preserve" });

    const ics = await (await api(path(t, "/affirmations/calendar.ics"), { as: t.userId })).text();
    expect(ics).toContain("Incident image hold ends: 1 incident");
  });

  it("an overdue unreported incident is flagged", async () => {
    const t = await setupTenant();
    const inc = await json<Incident>(add(t, { ...phish(), discoveredAt: hoursAgo(80) }), 201);
    expect(inc.clocks.overdue).toBe(true);
    expect(inc.issues.map((i) => i.kind)).toEqual(["report_overdue"]);
  });

  it("refuses a future discovery, a report before discovery, local times and unknown steps", async () => {
    const t = await setupTenant();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect((await add(t, { ...phish(), discoveredAt: future })).status).toBe(400);
    expect((await add(t, { ...phish(), discoveredAt: "2026-11-02T15:30" })).status).toBe(400);
    expect(
      (await add(t, { ...phish(), discoveredAt: hoursAgo(5), reportedAt: hoursAgo(6) })).status,
    ).toBe(400);
    expect((await add(t, { ...phish(), steps: { bogus: true } })).status).toBe(400);
    const inc = await json<Incident>(add(t, phish()), 201);
    // A patch is checked as the row will be after it.
    expect(
      (
        await api(path(t, `/incidents/${inc.id}`), {
          method: "PATCH",
          as: t.userId,
          json: { higherTierNotifiedAt: hoursAgo(1) },
        })
      ).status,
    ).toBe(400);
  });

  it("exports the register as CSV and one incident as a Markdown record", async () => {
    const t = await setupTenant();
    const inc = await json<Incident>(add(t, { ...phish(), title: "=cmd|calc" }), 201);
    const csv = await api(path(t, "/incidents/export.csv"), { as: t.userId });
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("'=cmd|calc");
    const md = await api(path(t, `/incidents/${inc.id}/record.md`), { as: t.userId });
    expect(md.status).toBe(200);
    const text = await md.text();
    expect(text).toContain("# Cyber incident record:");
    expect(text).toContain("Acme Machining");
    expect(text).toContain("72-hour report due");
  });

  it("viewers read; editors record but cannot delete; admins delete; writes are audited", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    const editor = await createTestUser("Editor");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await addToOrg(t.orgId, editor.id, "editor");
    await list(t, viewer.id);
    expect((await add(t, phish(), viewer.id)).status).toBe(403);
    const inc = await json<Incident>(add(t, phish(), editor.id), 201);
    const del = (as: string) => api(path(t, `/incidents/${inc.id}`), { method: "DELETE", as });
    expect((await del(editor.id)).status).toBe(403);
    await json(
      api(path(t, `/incidents/${inc.id}`), {
        method: "PATCH",
        as: editor.id,
        json: { summary: "Credential phish" },
      }),
    );
    await json(del(t.userId));
    const log = await json<{ items: { action: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(["incident.create", "incident.update", "incident.delete"]),
    );
  });

  it("keeps each organization's incidents to itself", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    const inc = await json<Incident>(add(t, phish()), 201);
    const viaOther = (method: string, p = "", body?: unknown) =>
      api(path(other, `/incidents/${inc.id}${p}`), { method, as: other.userId, json: body });
    expect((await api(path(t, "/incidents"), { as: other.userId })).status).toBe(404);
    expect((await viaOther("PATCH", "", { title: "Taken" })).status).toBe(404);
    expect((await viaOther("GET", "/record.md")).status).toBe(404);
    expect((await viaOther("DELETE")).status).toBe(404);
    expect((await list(other)).items).toEqual([]);
  });
});
