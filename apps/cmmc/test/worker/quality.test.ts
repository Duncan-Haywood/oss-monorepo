// ISO 9001 clause checklist: status, the not-applicable reason, evidence shared with CMMC
// requirements, the plan gate, the report, and tenant isolation.
import type { QualityChecklistResponse } from "@shared/quality";
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

async function upload(t: Tenant, controlId: string | null, title = "Training matrix 2026") {
  const form = new FormData();
  form.set("file", new File(["who was trained on what"], "training.txt", { type: "text/plain" }));
  form.set("title", title);
  form.set("noCui", "true");
  if (controlId) form.set("controlId", controlId);
  return json<{ id: string }>(
    api(path(t, "/evidence"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

const checklist = (t: Tenant, as = t.userId) =>
  json<QualityChecklistResponse>(api(path(t, "/quality"), { as }));
const patch = (t: Tenant, clause: string, body: unknown, as = t.userId) =>
  api(path(t, `/quality/${clause}`), { method: "PATCH", as, json: body });

describe("ISO 9001 checklist", () => {
  it("lists every clause, unassessed, with the copyright and verification note", async () => {
    const t = await setupTenant();
    const data = await checklist(t);
    expect(data.standard).toBe("ISO 9001:2015");
    expect(data.verification.checkedAgainstCopy).toBe(false);
    expect(data.items.length).toBe(data.readiness.total);
    expect(data.items.every((i) => i.status === "not_assessed")).toBe(true);
    expect(data.readiness.percentInPlace).toBeNull();
  });

  it("records status and notes, and needs a reason for not applicable", async () => {
    const t = await setupTenant();
    await json(patch(t, "iso9001-9.2", { status: "in_place", notes: "Audit programme 2026" }));
    const bad = await patch(t, "iso9001-8.3", { status: "not_applicable" });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Say why the clause does not apply");
    await json(
      patch(t, "iso9001-8.3", {
        status: "not_applicable",
        notes: "Build to customer print only; no design responsibility.",
      }),
    );
    const data = await checklist(t);
    expect(data.items.find((i) => i.number === "9.2")).toMatchObject({
      status: "in_place",
      notes: "Audit programme 2026",
    });
    expect(data.readiness.notApplicable).toBe(1);
    // 9.2 is in place with no file: flagged for the auditor's first question.
    expect(data.readiness.inPlaceWithoutEvidence).toEqual(["9.2"]);
    expect((await patch(t, "iso9001-99.9", { status: "gap" })).status).toBe(404);
  });

  it("shows evidence from the related CMMC requirement and links other files directly", async () => {
    const t = await setupTenant();
    const training = await upload(t, "AT.L2-3.2.2");
    const policy = await upload(t, null, "Quality policy, signed");
    let data = await checklist(t);
    const c72 = data.items.find((i) => i.number === "7.2");
    expect(c72?.evidence).toEqual([
      expect.objectContaining({ id: training.id, via: "AT.L2-3.2.2", linkId: null }),
    ]);
    await json(
      api(path(t, "/quality/iso9001-5.2/evidence"), {
        method: "POST",
        as: t.userId,
        json: { evidenceId: policy.id },
      }),
      201,
    );
    // Linking twice is a no-op.
    await json(
      api(path(t, "/quality/iso9001-5.2/evidence"), {
        method: "POST",
        as: t.userId,
        json: { evidenceId: policy.id },
      }),
      201,
    );
    data = await checklist(t);
    const c52 = data.items.find((i) => i.number === "5.2");
    expect(c52?.evidence).toHaveLength(1);
    const linkId = c52?.evidence[0]?.linkId as string;
    expect(linkId).toBeTruthy();

    // Deleting the file removes its clause links too.
    await json(api(path(t, `/evidence/${policy.id}`), { method: "DELETE", as: t.userId }));
    data = await checklist(t);
    expect(data.items.find((i) => i.number === "5.2")?.evidence).toEqual([]);
    expect(
      (await api(path(t, `/quality/links/${linkId}`), { method: "DELETE", as: t.userId })).status,
    ).toBe(404);
  });

  it("unlinks a file without deleting it", async () => {
    const t = await setupTenant();
    const f = await upload(t, null, "Management review minutes");
    await json(
      api(path(t, "/quality/iso9001-9.3/evidence"), {
        method: "POST",
        as: t.userId,
        json: { evidenceId: f.id },
      }),
      201,
    );
    const linkId = (await checklist(t)).items.find((i) => i.number === "9.3")?.evidence[0]?.linkId;
    await json(api(path(t, `/quality/links/${linkId}`), { method: "DELETE", as: t.userId }));
    expect((await checklist(t)).items.find((i) => i.number === "9.3")?.evidence).toEqual([]);
    const files = await json<{ items: { id: string }[] }>(
      api(path(t, "/evidence"), { as: t.userId }),
    );
    expect(files.items.map((i) => i.id)).toContain(f.id);
  });

  it("is readable on every plan; recording needs Level 2 + Quality", async () => {
    for (const plan of [null, "level2"]) {
      const t = await setupTenant("owner", "Shop", plan);
      await checklist(t);
      const res = await patch(t, "iso9001-4.1", { status: "gap" });
      expect(res.status).toBe(402);
      expect(await res.text()).toContain("needs the Level 2 + Quality plan");
    }
    const team = await setupTenant("owner", "Team Shop", "team");
    await json(patch(team, "iso9001-4.1", { status: "gap" }));
    const info = await json<{ plan: { quality: boolean; name: string } }>(
      api(`/api/orgs/${team.orgId}`, { as: team.userId }),
    );
    expect(info.plan).toMatchObject({ quality: true, name: "Level 2 + Quality" });
  });

  it("viewers read but cannot record", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await checklist(t, viewer.id);
    expect((await patch(t, "iso9001-4.1", { status: "gap" }, viewer.id)).status).toBe(403);
  });

  it("downloads a markdown self-check that says it is not a certification", async () => {
    const t = await setupTenant();
    await json(patch(t, "iso9001-10.2", { status: "partial", notes: "NCR | CAR forms drafted" }));
    const res = await api(path(t, "/quality/report"), { as: t.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("iso-9001-self-check.md");
    const md = await res.text();
    expect(md).toContain("# ISO 9001:2015 self-check: Acme Machining");
    expect(md).toContain("It is not a certification");
    expect(md).toContain("Open items: 10.2");
    // A pipe in the notes cannot break the table.
    expect(md).toContain("NCR \\| CAR forms drafted");
  });

  it("assigns clause owners from this org's members and names them in the report", async () => {
    const t = await setupTenant();
    const qm = await createTestUser("Dana Quality");
    await addToOrg(t.orgId, qm.id, "editor");
    const other = await setupTenant();
    await json(patch(t, "iso9001-7.2", { status: "gap", ownerUserId: qm.id }));
    await json(patch(t, "iso9001-7.5.3", { status: "partial" }));
    // Someone from another organization, or an id that is nobody, cannot own a clause.
    const foreign = await patch(t, "iso9001-7.5.3", { ownerUserId: other.userId });
    expect(foreign.status).toBe(400);
    expect(await foreign.text()).toContain("Owner must be a member");
    // Changing the status alone keeps the owner.
    await json(patch(t, "iso9001-7.2", { status: "partial" }));
    let data = await checklist(t);
    expect(data.items.find((i) => i.number === "7.2")?.ownerUserId).toBe(qm.id);
    expect(data.items.find((i) => i.number === "7.5.3")?.ownerUserId).toBeNull();
    expect(data.readiness.openWithoutOwner).toEqual(["7.5.3"]);
    const md = await (await api(path(t, "/quality/report"), { as: t.userId })).text();
    expect(md).toContain("| Clause | Status | Owner | Notes | Evidence |");
    expect(md).toMatch(/\| 7\.2 Competence \| Partly in place \| Dana Quality \|/);
    expect(md).toContain("Open items with no owner: 7.5.3");
    // Clearing the owner puts the clause back on the unowned list.
    await json(patch(t, "iso9001-7.2", { ownerUserId: null }));
    data = await checklist(t);
    expect(data.readiness.openWithoutOwner).toEqual(["7.2", "7.5.3"]);
  });

  it("keeps organizations apart", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const fileA = await upload(a, null, "A's audit");
    await json(patch(a, "iso9001-9.2", { status: "in_place" }));
    // B cannot link A's file, read A's checklist, or see A's answers in its own.
    const link = await api(path(b, "/quality/iso9001-9.2/evidence"), {
      method: "POST",
      as: b.userId,
      json: { evidenceId: fileA.id },
    });
    expect(link.status).toBe(404);
    expect((await api(path(a, "/quality"), { as: b.userId })).status).toBe(404);
    const bData = await checklist(b);
    expect(bData.items.find((i) => i.number === "9.2")?.status).toBe("not_assessed");
    await json(
      api(path(a, "/quality/iso9001-9.2/evidence"), {
        method: "POST",
        as: a.userId,
        json: { evidenceId: fileA.id },
      }),
      201,
    );
    const linkId = (await checklist(a)).items.find((i) => i.number === "9.2")?.evidence[0]?.linkId;
    const del = await api(path(b, `/quality/links/${linkId}`), { method: "DELETE", as: b.userId });
    expect(del.status).toBe(404);
  });
});
