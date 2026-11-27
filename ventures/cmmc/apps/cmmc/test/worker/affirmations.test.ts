// SPRS affirmation record: who affirmed, when, with which score, and what falls due next.
import type { AffirmationDto, AffirmationsResponse } from "@shared/affirmation";
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const body = (over: Record<string, unknown> = {}) => ({
  level: 2,
  kind: "assessment",
  cmmcStatus: "final",
  cmmcStatusDate: "2026-03-02",
  affirmedOn: "2026-03-05",
  officialName: "J. Smith",
  officialTitle: "President",
  officialContact: "jsmith@example.test",
  sprsScore: 104,
  ...over,
});

const post = (t: Tenant, b = body(), as = t.userId) =>
  api(path(t, "/affirmations"), { method: "POST", as, json: b });

describe("affirmations", () => {
  it("records an affirmation and works out the next dates", async () => {
    const t = await setupTenant();
    const created = await json<AffirmationDto>(post(t), 201);
    expect(created).toMatchObject({
      level: 2,
      sprsScore: 104,
      officialName: "J. Smith",
      recordedByName: "Test User",
    });
    // No SSP recorded yet, so the workspace has no score to set beside the user's.
    expect(created.workspaceScore).toBeNull();
    const list = await json<AffirmationsResponse>(api(path(t, "/affirmations"), { as: t.userId }));
    expect(list.items).toHaveLength(1);
    const l2 = list.schedules.find((s) => s.level === 2);
    expect(l2?.deadlines.map((d) => [d.key, d.due])).toEqual([
      ["annual_affirmation", "2027-03-05"],
      ["self_assessment", "2029-03-02"],
    ]);
    expect(list.schedules.find((s) => s.level === 1)?.last).toBeNull();
  });

  it("stores the workspace's own score next to the one entered in SPRS", async () => {
    const t = await setupTenant();
    const res = await api(path(t, "/controls/CA.L2-3.12.4"), {
      method: "PATCH",
      as: t.userId,
      json: { status: "implemented" },
    });
    expect(res.status).toBe(200);
    const created = await json<AffirmationDto>(post(t), 201);
    expect(typeof created.workspaceScore).toBe("number");
  });

  it("refuses an incomplete or impossible record with the reasons", async () => {
    const t = await setupTenant();
    const res = await post(t, body({ officialContact: "", affirmedOn: "2026-02-30" }));
    expect(res.status).toBe(400);
    const res2 = await post(t, body({ level: 1, cmmcStatus: "conditional" }));
    expect(res2.status).toBe(400);
    expect(await res2.text()).toContain("Level 1 has no conditional status");
  });

  it("only admins record or delete; every member reads", async () => {
    const t = await setupTenant();
    const editor = await createTestUser("Editor");
    await addToOrg(t.orgId, editor.id, "editor");
    expect((await post(t, body(), editor.id)).status).toBe(403);
    const created = await json<AffirmationDto>(post(t), 201);
    await json(api(path(t, "/affirmations"), { as: editor.id }));
    const del = await api(path(t, `/affirmations/${created.id}`), {
      method: "DELETE",
      as: editor.id,
    });
    expect(del.status).toBe(403);
    await json(api(path(t, `/affirmations/${created.id}`), { method: "DELETE", as: t.userId }));
    const list = await json<AffirmationsResponse>(api(path(t, "/affirmations"), { as: t.userId }));
    expect(list.items).toHaveLength(0);
  });

  it("Level 1 affirmations on the free plan; Level 2 ones need the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Free Shop", null);
    const l1 = body({ level: 1, sprsScore: null });
    await json(post(t, l1), 201);
    const res = await post(t);
    expect(res.status).toBe(402);
    expect(await res.text()).toContain("Recording Level 2 affirmations needs the Level 2 plan");
  });

  it("keeps organizations apart", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const created = await json<AffirmationDto>(post(a), 201);
    const list = await json<AffirmationsResponse>(api(path(b, "/affirmations"), { as: b.userId }));
    expect(list.items).toHaveLength(0);
    // B's admin cannot delete A's record through B's org, nor reach A's org at all.
    const del = await api(path(b, `/affirmations/${created.id}`), {
      method: "DELETE",
      as: b.userId,
    });
    expect(del.status).toBe(404);
    expect((await api(path(a, "/affirmations"), { as: b.userId })).status).toBe(404);
  });

  it("serves the due dates as a calendar file, to members of the org only", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await json<AffirmationDto>(post(a), 201);
    const res = await api(path(a, "/affirmations/calendar.ics"), { as: a.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain("cmmc-due-dates.ics");
    const ics = (await res.text()).replace(/\r\n /g, "");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270305");
    expect(ics).toContain("DTSTART;VALUE=DATE:20290302");
    expect(ics).toContain(`UID:cmmc-${a.orgId}-l2-annual_affirmation@cmmc-workspace`);
    expect(ics).toContain("TRIGGER;RELATED=START:-P7D");
    // B has nothing recorded, so its calendar is empty; it cannot read A's at all.
    const mine = await api(path(b, "/affirmations/calendar.ics"), { as: b.userId });
    expect(await mine.text()).not.toContain("BEGIN:VEVENT");
    expect((await api(path(a, "/affirmations/calendar.ics"), { as: b.userId })).status).toBe(404);
  });
});

describe("org info", () => {
  it("names the plan whose limits apply, so the controls page can go read only", async () => {
    const free = await setupTenant("owner", "Free Shop", null);
    const info = await json<{ plan: { key: string; level2: boolean } }>(
      api(`/api/orgs/${free.orgId}`, { as: free.userId }),
    );
    expect(info.plan).toEqual({ key: "free", name: "Level 1", level2: false, quality: false });
    const paid = await setupTenant();
    const info2 = await json<{ plan: { level2: boolean } }>(
      api(`/api/orgs/${paid.orgId}`, { as: paid.userId }),
    );
    expect(info2.plan.level2).toBe(true);
  });
});
