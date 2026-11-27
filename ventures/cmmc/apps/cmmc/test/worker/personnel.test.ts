// Personnel and training records: create, edit, the checks, the refresher interval, CSV export,
// the plan gate, roles, audit and tenant isolation.
import { addDays } from "@shared/affirmation";
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

interface Person {
  id: string;
  name: string;
  securityDuties: boolean;
  awarenessOn: string | null;
  leftOn: string | null;
  departureKind: string | null;
  accessRemovedOn: string | null;
}
interface Records {
  items: Person[];
  refreshMonths: number;
  today: string;
  check: {
    active: number;
    departed: number;
    issues: { personId: string | null; controlId: string; message: string }[];
    requirements: { controlId: string; applies: number; covered: number; text: string }[];
  };
  trainings: { key: string; controlId: string }[];
  refreshChoices: number[];
  refreshNote: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const add = (t: Tenant, body: unknown, as = t.userId) =>
  api(path(t, "/people"), { method: "POST", as, json: body });
const records = (t: Tenant, as = t.userId) => json<Records>(api(path(t, "/people"), { as }));

describe("personnel and training records", () => {
  it("records people and reports the gaps per requirement", async () => {
    const t = await setupTenant();
    const empty = await records(t);
    expect(empty.items).toEqual([]);
    expect(empty.refreshMonths).toBe(12);
    expect(empty.refreshNote).toContain("does not set how often");
    expect(empty.trainings.map((x) => x.controlId)).toEqual([
      "AT.L2-3.2.1",
      "AT.L2-3.2.2",
      "AT.L2-3.2.3",
    ]);

    const recent = addDays(today(), -30);
    const ana = await json<Person>(
      add(t, {
        name: "Ana Ruiz",
        jobTitle: "Owner",
        email: "ana@example.com",
        securityDuties: true,
        dutiesDescription: "Firewall rules and backups",
        screenedOn: "2024-01-02",
        accessGrantedOn: "2024-01-08",
        awarenessOn: recent,
        roleBasedOn: recent,
        insiderThreatOn: recent,
      }),
      201,
    );
    await json(add(t, { name: "Ben Ode", screenedOn: "2024-03-01", awarenessOn: recent }), 201);
    const data = await records(t);
    expect(data.check.active).toBe(2);
    expect(data.check.issues.map((i) => i.message)).toEqual([
      "Ben Ode: no insider threat awareness date recorded.",
    ]);
    const r391 = data.check.requirements.find((r) => r.controlId === "PS.L2-3.9.1");
    expect(r391).toMatchObject({ applies: 2, covered: 2 });
    expect(r391?.text).toContain("Screen individuals prior to authorizing access");

    // Ana leaves; the departure needs the access removal date.
    const left = await json<Person>(
      api(path(t, `/people/${ana.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { leftOn: addDays(today(), -2), departureKind: "termination" },
      }),
    );
    expect(left.departureKind).toBe("termination");
    const after = await records(t);
    expect(after.check.departed).toBe(1);
    expect(after.check.issues.map((i) => i.controlId)).toContain("PS.L2-3.9.2");
    expect(after.check.issues.map((i) => i.message)).toContain(
      "Nobody is marked as having security duties. 3.2.2 expects those duties assigned to named people (often the owner or an outside IT provider's contact).",
    );

    // Clearing the departure date clears the rest of the departure.
    const back = await json<Person>(
      api(path(t, `/people/${ana.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { leftOn: null },
      }),
    );
    expect(back).toMatchObject({ leftOn: null, departureKind: null, accessRemovedOn: null });
  });

  it("refuses future dates, bad dates and a departure without its date", async () => {
    const t = await setupTenant();
    const future = await add(t, { name: "Cy", awarenessOn: addDays(today(), 1) });
    expect(future.status).toBe(400);
    expect(await future.text()).toContain("a date in the future cannot be recorded yet");
    expect((await add(t, { name: "Cy", screenedOn: "2026-13-01" })).status).toBe(400);
    expect((await add(t, { name: "Cy", screenedOn: "yesterday" })).status).toBe(400);
    const half = await add(t, { name: "Cy", departureKind: "transfer" });
    expect(half.status).toBe(400);
    expect(await half.text()).toContain("Enter the date they left");
    expect((await add(t, { name: "Cy", email: "not-an-email" })).status).toBe(400);
  });

  it("uses the organization's refresher interval; only admins on Level 2 set it", async () => {
    const t = await setupTenant();
    await json(
      add(t, { name: "Dee", screenedOn: "2024-01-01", awarenessOn: addDays(today(), -200) }),
      201,
    );
    const yearly = await records(t);
    expect(yearly.check.issues.some((i) => i.message.startsWith("Dee: security awareness"))).toBe(
      false,
    );

    const editor = await createTestUser("Editor");
    await addToOrg(t.orgId, editor.id, "editor");
    const put = (months: number, as = t.userId) =>
      api(path(t, "/people/settings"), { method: "PUT", as, json: { refreshMonths: months } });
    expect((await put(6, editor.id)).status).toBe(403);
    expect((await put(7)).status).toBe(400);
    const halfYearly = await json<Records>(put(6));
    expect(halfYearly.refreshMonths).toBe(6);
    expect(halfYearly.check.issues.map((i) => i.message)).toContainEqual(
      expect.stringMatching(/^Dee: security awareness was due again on /),
    );

    const free = await setupTenant("owner", "Free Shop", null);
    const res = await api(path(free, "/people/settings"), {
      method: "PUT",
      as: free.userId,
      json: { refreshMonths: 6 },
    });
    expect(res.status).toBe(402);
  });

  it("exports the roster as CSV with next due dates", async () => {
    const t = await setupTenant();
    await json(
      add(t, { name: "=cmd|calc", screenedOn: "2024-01-01", awarenessOn: "2026-01-15" }),
      201,
    );
    const csv = await api(path(t, "/people/export.csv"), { as: t.userId });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-disposition")).toContain("personnel-training.csv");
    expect(csv.headers.get("cache-control")).toContain("no-store");
    const text = await csv.text();
    expect(text).toContain("'=cmd|calc,");
    expect(text).toContain("2026-01-15,2027-01-15");
  });

  it("is readable on every plan; recording needs the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Shop", null);
    await records(t);
    const res = await add(t, { name: "Eli" });
    expect(res.status).toBe(402);
    expect(await res.text()).toContain("Recording personnel and training needs the Level 2 plan");
  });

  it("viewers read but cannot record; writes are audited", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await records(t, viewer.id);
    expect((await add(t, { name: "Fay" }, viewer.id)).status).toBe(403);
    const p = await json<Person>(add(t, { name: "Fay" }), 201);
    expect(
      (await api(path(t, `/people/${p.id}`), { method: "DELETE", as: viewer.id })).status,
    ).toBe(403);
    await json(api(path(t, `/people/${p.id}`), { method: "DELETE", as: t.userId }));
    const log = await json<{ items: { action: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.map((e) => e.action)).toEqual(
      expect.arrayContaining(["person.create", "person.delete"]),
    );
  });

  it("puts the counts, never the names, under 3.2.x and 3.9.x in the SSP", async () => {
    const t = await setupTenant();
    const recent = addDays(today(), -30);
    await json(
      add(t, {
        name: "Ana Ruiz",
        email: "ana@example.com",
        cuiAccess: true,
        securityDuties: true,
        dutiesDescription: "Backups",
        screenedOn: "2024-01-02",
        accessGrantedOn: "2024-01-08",
        awarenessOn: recent,
        roleBasedOn: recent,
        insiderThreatOn: recent,
      }),
      201,
    );
    await json(add(t, { name: "Ben Ode", awarenessOn: recent }), 201);
    const { markdown } = await json<{ markdown: string }>(
      api(path(t, "/ssp?level=2"), { as: t.userId }),
    );
    const at = `Personnel records (People tab, as of ${today()})`;
    expect(markdown).toContain(
      `- ${at}: 2 of 2 current people have up-to-date security awareness training. Refresher interval: every 12 months`,
    );
    expect(markdown).toContain(
      `- ${at}: 1 of 2 current people have up-to-date insider threat training. Refresher interval: every 12 months (the organization's choice; NIST SP 800-171 Rev. 2 sets none). 1 open gap(s) listed on the People tab.`,
    );
    expect(markdown).toContain(`- ${at}: No departures or transfers recorded.`);
    expect(markdown).not.toMatch(/Ana Ruiz|Ben Ode|ana@example\.com/);

    const level1 = await json<{ markdown: string }>(api(path(t, "/ssp?level=1"), { as: t.userId }));
    expect(level1.markdown).not.toContain("Personnel records");
  });

  it("keeps each organization's people to itself", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    const mine = await json<Person>(add(t, { name: "Gus" }), 201);
    expect((await api(path(t, "/people"), { as: other.userId })).status).toBe(404);
    expect((await api(path(t, "/people/export.csv"), { as: other.userId })).status).toBe(404);
    const viaOther = (m: string, body?: unknown) =>
      api(path(other, `/people/${mine.id}`), { method: m, as: other.userId, json: body });
    expect((await viaOther("PATCH", { name: "Taken" })).status).toBe(404);
    expect((await viaOther("DELETE")).status).toBe(404);
    expect((await records(other)).items).toEqual([]);
    expect((await records(t)).items.map((i) => i.name)).toEqual(["Gus"]);
  });
});
