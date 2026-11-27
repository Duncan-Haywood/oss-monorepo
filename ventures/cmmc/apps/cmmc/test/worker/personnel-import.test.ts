// Roster and training-completion import: preview without writing, apply, re-import changes nothing,
// training dates only move forward, completion exports only update people already here, the plan
// gate, roles, audit and tenant isolation.
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

interface Preview {
  mode: "roster" | "completions";
  changes: { line: number; name: string; kind: "new" | "update"; fields: string[] }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  courses: { key: string; name: string; rows: number; counts: string[] }[];
  existing: number;
  applied: boolean;
}
interface Person {
  id: string;
  name: string;
  email: string;
  cuiAccess: boolean;
  securityDuties: boolean;
  jobTitle: string;
  awarenessOn: string | null;
  insiderThreatOn: string | null;
  leftOn: string | null;
}

const ROSTER = [
  "Name,Email,Job title,Security duties,Duties,Security awareness training",
  "Ana Ruiz,ana@example.com,Programmer,No,,2026-02-01",
  "Ben Ode,ben@example.com,IT lead,Yes,Firewall and backups,2026-03-01",
].join("\n");

const COMPLETIONS = [
  "First Name,Last Name,Email,Module Name,Status,Completion Date",
  "Ana,Ruiz,ANA@example.com,Security Awareness 2026,Completed,2026-06-01",
  "Ben,Ode,ben@example.com,Security Awareness 2026,Completed,2026-01-15",
  "Dee,Kay,dee@example.com,Security Awareness 2026,Completed,2026-06-01",
].join("\n");

const run = (t: Tenant, body: Record<string, unknown>, as = t.userId) =>
  api(path(t, "/people/import"), { method: "POST", as, json: body });
const people = (t: Tenant, as = t.userId) =>
  json<{ items: Person[] }>(api(path(t, "/people"), { as })).then((r) => r.items);

describe("personnel import", () => {
  it("previews a roster, applies it, and changes nothing on a second import", async () => {
    const t = await setupTenant();
    const preview = await json<Preview>(run(t, { csv: ROSTER }));
    expect(preview.mode).toBe("roster");
    expect(preview.changes.map((c) => [c.line, c.name, c.kind])).toEqual([
      [2, "Ana Ruiz", "new"],
      [3, "Ben Ode", "new"],
    ]);
    expect(await people(t)).toEqual([]);
    const applied = await json<Preview>(run(t, { csv: ROSTER, apply: true }));
    expect(applied.applied).toBe(true);
    const saved = await people(t);
    expect(
      saved.map((p) => [p.name, p.email, p.securityDuties, p.cuiAccess, p.awarenessOn]),
    ).toEqual([
      ["Ana Ruiz", "ana@example.com", false, true, "2026-02-01"],
      ["Ben Ode", "ben@example.com", true, true, "2026-03-01"],
    ]);
    const again = await json<Preview>(run(t, { csv: ROSTER }));
    expect(again.changes).toEqual([]);
    expect(again.unchanged).toBe(2);

    const log = await json<{ items: { action: string; targetId: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    expect(log.items.filter((e) => e.action === "person.import").map((e) => e.targetId)).toEqual([
      "new:2,updated:0",
    ]);
  });

  it("blank cells keep, and an older training date never replaces a newer one", async () => {
    const t = await setupTenant();
    await json(run(t, { csv: ROSTER, apply: true }));
    const later = [
      "Name,Email,Job title,Security awareness training",
      "ana ruiz,,,2025-01-01",
      "Ben Ode,,Owner,",
    ].join("\n");
    const preview = await json<Preview>(run(t, { csv: later, apply: true }));
    expect(preview.changes.map((c) => [c.name, c.fields])).toEqual([["Ben Ode", ["jobTitle"]]]);
    expect(preview.unchanged).toBe(1);
    const saved = await people(t);
    expect(saved.find((p) => p.name === "Ana Ruiz")?.awarenessOn).toBe("2026-02-01");
    expect(saved.find((p) => p.name === "Ben Ode")?.jobTitle).toBe("Owner");
  });

  it("applies a completion export by email to people already here, per the chosen course", async () => {
    const t = await setupTenant();
    await json(run(t, { csv: ROSTER, apply: true }));
    const unmapped = await json<Preview>(run(t, { csv: COMPLETIONS }));
    expect(unmapped.mode).toBe("completions");
    expect(unmapped.courses).toEqual([
      { key: "security awareness 2026", name: "Security Awareness 2026", rows: 3, counts: [] },
    ]);
    expect(unmapped.changes).toEqual([]);

    const courseMap = { "security awareness 2026": ["awareness", "insiderThreat"] };
    const preview = await json<Preview>(run(t, { csv: COMPLETIONS, courseMap, apply: true }));
    expect(preview.changes.map((c) => [c.name, c.kind, c.fields])).toEqual([
      ["Ana Ruiz", "update", ["awarenessOn", "insiderThreatOn"]],
      ["Ben Ode", "update", ["insiderThreatOn"]],
    ]);
    // Dee is not on the roster: a course list is not a list of system users.
    expect(preview.issues.map((i) => i.message).join("\n")).toContain(
      "Dee Kay is not on the People list",
    );
    const saved = await people(t);
    expect(saved).toHaveLength(2);
    const ana = saved.find((p) => p.name === "Ana Ruiz");
    expect([ana?.awarenessOn, ana?.insiderThreatOn]).toEqual(["2026-06-01", "2026-06-01"]);
    const ben = saved.find((p) => p.name === "Ben Ode");
    // Ben's 2026-01-15 completion is older than the recorded 2026-03-01 awareness date.
    expect([ben?.awarenessOn, ben?.insiderThreatOn]).toEqual(["2026-03-01", "2026-01-15"]);
  });

  it("lists a row whose result would be invalid and leaves it out", async () => {
    const t = await setupTenant();
    const csv = "Name,Left or transferred on\nAna,2026-05-01\n";
    const preview = await json<Preview>(run(t, { csv }));
    expect(preview.changes).toEqual([]);
    expect(preview.issues[0]?.message).toContain("left the organization or transferred");
  });

  it("does not match a same-name person whose recorded email differs", async () => {
    const t = await setupTenant();
    await json(run(t, { csv: ROSTER, apply: true }));
    const csv = "Name,Email\nAna Ruiz,ana.other@example.com\n";
    const preview = await json<Preview>(run(t, { csv }));
    expect(preview.changes.map((c) => [c.name, c.kind])).toEqual([["Ana Ruiz", "new"]]);
  });

  it("previews on every plan; applying needs the Level 2 plan", async () => {
    const t = await setupTenant("owner", "Shop", null);
    expect((await json<Preview>(run(t, { csv: ROSTER }))).changes).toHaveLength(2);
    expect((await run(t, { csv: ROSTER, apply: true })).status).toBe(402);
    expect(await people(t)).toEqual([]);
  });

  it("is for editors; viewers cannot import", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await run(t, { csv: ROSTER }, viewer.id)).status).toBe(403);
    expect((await run(t, { csv: ROSTER, apply: true }, viewer.id)).status).toBe(403);
  });

  it("refuses a course choice that is not a training", async () => {
    const t = await setupTenant();
    const res = await run(t, { csv: COMPLETIONS, courseMap: { x: ["admin"] } });
    expect(res.status).toBe(400);
  });

  it("matches and writes only inside the caller's organization", async () => {
    const t = await setupTenant();
    const other = await setupTenant("owner", "Other Shop");
    await json(run(t, { csv: ROSTER, apply: true }));
    expect((await run(t, { csv: ROSTER, apply: true }, other.userId)).status).toBe(404);
    const theirs = await json<Preview>(run(other, { csv: ROSTER }));
    expect(theirs.existing).toBe(0);
    expect(theirs.changes.every((c) => c.kind === "new")).toBe(true);
    // A completion export in the other org finds none of t's people.
    const courseMap = { "security awareness 2026": ["awareness"] };
    const comp = await json<Preview>(run(other, { csv: COMPLETIONS, courseMap, apply: true }));
    expect(comp.changes).toEqual([]);
    expect((await people(t)).find((p) => p.name === "Ana Ruiz")?.awarenessOn).toBe("2026-02-01");
  });
});
