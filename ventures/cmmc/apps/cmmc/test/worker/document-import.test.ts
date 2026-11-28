// Master list import: preview without writing, apply with releases, reviews and withdrawals in the
// history, approvers and owners matched to members, numbers already listed left alone (so the
// register's own export reads back as no change), the plan gate, roles, audit and tenants.
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
  changes: {
    docNumber: string;
    status: string;
    revision: string;
    approver: string;
    approverMatched: boolean;
    owner: string;
    reviewDue: string | null;
  }[];
  alreadyListed: number;
  issues: { line: number | null; message: string }[];
  existing: number;
  applied: boolean;
}
interface DocList {
  items: {
    id: string;
    docNumber: string;
    status: string;
    revision: string;
    releasedRevision: string | null;
    approvedBy: string | null;
    approvedOn: string | null;
    ownerUserId: string | null;
    reviewDue: string | null;
    review: string;
    issues: { kind: string; message: string }[];
  }[];
}
interface Event {
  kind: string;
  revision: string;
  summary: string;
  byName: string;
  on: string;
}

const send = (t: Tenant, body: Record<string, unknown>, as = t.userId) =>
  api(path(t, "/documents/import"), { method: "POST", as, json: body });
const list = (t: Tenant) => json<DocList>(api(path(t, "/documents"), { as: t.userId }));
const history = (t: Tenant, id: string) =>
  json<{ items: Event[] }>(api(path(t, `/documents/${id}/history`), { as: t.userId }));

const year = new Date().getUTCFullYear();
const LIST = [
  "Doc No,Title,Type,Rev,Status,Approved By,Approved On,Last reviewed,Review every,Owner,Location",
  `QM-001,Quality Manual,Manual,C,Released,Test User,${year - 2}-03-14,${year - 1}-03-10,12,Test User,Q drive`,
  `F-820,Receiving Inspection Checklist,Form,D,Released,Dana Smith,${year - 1}-07-02,,24,,Receiving bench`,
  "WI-210,Deburr Work Instruction,,A,Draft,,,,,,Shop binder",
  `QP-8.7-01,Nonconforming Product,Procedure,A,Obsolete,Test User,${year - 6}-02-01,,,,Archive`,
].join("\n");

describe("master list import", () => {
  it("previews without writing, then adds the documents with their history", async () => {
    const t = await setupTenant();
    const p = await json<Preview>(send(t, { csv: LIST }));
    expect(p.applied).toBe(false);
    expect(p.changes.map((c) => [c.docNumber, c.status, c.revision])).toEqual([
      ["QM-001", "released", "C"],
      ["F-820", "released", "D"],
      ["WI-210", "draft", "A"],
      ["QP-8.7-01", "obsolete", "A"],
    ]);
    expect(p.changes[0]).toMatchObject({
      approver: "Test User",
      approverMatched: true,
      owner: "Test User",
      // From the last review, not the approval two years back.
      reviewDue: `${year}-03-10`,
    });
    expect(p.changes[1]).toMatchObject({ approver: "Dana Smith", approverMatched: false });
    expect(p.issues.map((i) => i.message).join(" ")).toContain(
      '"Dana Smith" is not one member of this workspace',
    );
    expect((await list(t)).items).toEqual([]);

    const a = await json<Preview>(send(t, { csv: LIST, apply: true }));
    expect(a.applied).toBe(true);
    const l = await list(t);
    const by = (n: string) => l.items.find((d) => d.docNumber === n);
    expect(by("QM-001")).toMatchObject({
      status: "released",
      releasedRevision: "C",
      approvedBy: t.userId,
      approvedOn: `${year - 2}-03-14`,
      ownerUserId: t.userId,
      reviewDue: `${year}-03-10`,
    });
    // An approver who is not a member: released, with the gap the register already shows.
    expect(by("F-820")).toMatchObject({ releasedRevision: "D", approvedBy: null });
    expect(
      by("F-820")
        ?.issues.map((i) => i.message)
        .join(" "),
    ).toContain("no approver");
    expect(by("WI-210")).toMatchObject({ status: "draft", releasedRevision: null });
    expect(by("QP-8.7-01")).toMatchObject({ status: "obsolete", reviewDue: null });

    const qm = await history(t, by("QM-001")?.id as string);
    expect(qm.items.map((e) => [e.kind, e.revision, e.on, e.byName])).toEqual([
      ["reviewed", "C", `${year - 1}-03-10`, ""],
      ["released", "C", `${year - 2}-03-14`, "Test User"],
    ]);
    const f = await history(t, by("F-820")?.id as string);
    expect(f.items[0]).toMatchObject({ kind: "released", byName: "Dana Smith" });
    const ob = await history(t, by("QP-8.7-01")?.id as string);
    expect(ob.items.map((e) => e.kind)).toEqual(["obsoleted", "released"]);
    expect(ob.items[0]?.summary).toContain("no withdrawal date");

    // The same list again, and the register's own export, change nothing.
    const again = await json<Preview>(send(t, { csv: LIST }));
    expect(again.changes).toEqual([]);
    expect(again.alreadyListed).toBe(4);
    const exported = await (await api(path(t, "/documents/export.csv"), { as: t.userId })).text();
    const back = await json<Preview>(send(t, { csv: exported, apply: true }));
    expect(back.changes).toEqual([]);
    expect(back.alreadyListed).toBe(4);

    const log = await (await api(path(t, "/audit-log"), { as: t.userId })).text();
    expect(log.match(/document\.import/g)).toHaveLength(1);
  });

  it("previews on every plan; adding needs Level 2 + Quality", async () => {
    for (const plan of [null, "level2"]) {
      const t = await setupTenant("owner", "Shop", plan);
      const p = await json<Preview>(send(t, { csv: LIST }));
      expect(p.changes).toHaveLength(4);
      const res = await send(t, { csv: LIST, apply: true });
      expect(res.status).toBe(402);
      expect((await list(t)).items).toEqual([]);
    }
  });

  it("keeps viewers out and tenants apart", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect((await send(t, { csv: LIST }, viewer.id)).status).toBe(403);
    const other = await setupTenant("owner", "Other shop");
    expect((await send(t, { csv: LIST }, other.userId)).status).toBe(404);
    await json<Preview>(send(t, { csv: LIST, apply: true }));
    expect((await list(other)).items).toEqual([]);
  });

  it("matches an approver by email and leaves an ambiguous name blank", async () => {
    const t = await setupTenant();
    const a = await createTestUser("Chris Park");
    const b = await createTestUser("Chris Park");
    const c = await createTestUser("Robin Diaz");
    for (const u of [a, b, c]) await addToOrg(t.orgId, u.id, "editor");
    const csv = [
      "Document number,Title,Revision,Approved by,Approved on",
      `QP-1,One,A,Chris Park,${year - 1}-01-05`,
      `QP-2,Two,A,${c.email.toUpperCase()},${year - 1}-01-05`,
    ].join("\n");
    const p = await json<Preview>(send(t, { csv }));
    expect(p.changes.map((x) => [x.docNumber, x.approver, x.approverMatched])).toEqual([
      ["QP-1", "Chris Park", false],
      ["QP-2", "Robin Diaz", true],
    ]);
  });
});
