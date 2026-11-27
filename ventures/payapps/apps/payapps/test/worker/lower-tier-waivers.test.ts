// Lower-tier lien waivers per pay application: the Crew gate, adding the suppliers and
// sub-subcontractors ticked from the suggestions (all or nothing), received/requested/owed, the
// summary, last application's list offered on the next one, viewers read but cannot write, another
// company's job and rows answer 404, and deleting a draft pay app takes its list with it. The signed
// waiver's file filed on its row: a pay-app attachment that marks the row received, is listed on the
// row, is named for the party in the backup packet's index, and stays as backup when the row goes.
import type {
  LowerTierWaiverDto,
  LowerTierWaiversDto,
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import type { CashDigest } from "@shared/cash-digest";
import type { LowerTierPayAppToChase } from "@shared/lower-tier-waivers";
import { digestEmail } from "@worker/services/payapps/digest";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Uploads a file to the pay app, filed on a lower-tier waiver row when `waiverId` is set. */
function fileOn(appPath: string, as: string, waiverId: string, name: string) {
  const form = new FormData();
  form.set("file", new File(["%PDF-1.4 truncated"], name));
  form.set("category", "backup");
  if (waiverId) form.set("lowerTierWaiverId", waiverId);
  return api(`${appPath}/attachments`, { method: "POST", as, body: form });
}

async function job() {
  const t = await setupTenant("owner");
  const as = t.userId;
  const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Mesa Clinic TI",
      gcName: "Copper State Builders",
      originalContractSumCents: 10_000_000,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines`, {
    method: "POST",
    as,
    expect: 201,
    json: { itemNumber: "1", description: "Framing and drywall", originalCents: 10_000_000 },
  });
  const newApp = async (periodFrom: string, periodTo: string) => {
    const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom, periodTo, applicationDate: periodTo },
    });
    await call(`${base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as,
      json: {
        lines: [
          {
            sovLineId: d.sovLines[0]?.id,
            workThisPeriodCents: 1_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    return app;
  };
  return { ...t, as, base, url: `${base}/lower-tier-waivers`, newApp };
}

describe("lower-tier waivers", () => {
  it("saves a party's email and fills it on the party's later rows; other companies never see it", async () => {
    const { url, as, orgId, base, newApp } = await job();
    await grantPlan(orgId, "crew", "active");
    const first = await newApp("2026-09-01", "2026-09-30");
    const [abc] = await call<LowerTierWaiverDto[]>(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        payAppId: first.id,
        items: [{ party: "ABC Supply, Inc.", kind: "conditional-progress" }],
      },
    });
    expect(abc?.partyEmail).toBeNull();
    const bad = await api(`${url}/${abc?.id}`, {
      method: "PATCH",
      as,
      json: { partyEmail: "not an address" },
    });
    expect(bad.status).toBe(400);
    const saved = await call<LowerTierWaiverDto>(`${url}/${abc?.id}`, {
      method: "PATCH",
      as,
      json: { partyEmail: " ar@abcsupply.example " },
    });
    expect(saved.partyEmail).toBe("ar@abcsupply.example");

    await call(`${base}/pay-apps/${first.id}/submit`, { method: "POST", as });
    const second = await newApp("2026-10-01", "2026-10-31");
    const list = await call<LowerTierWaiversDto>(`${url}?payAppId=${second.id}`, { as });
    expect(list.partyEmails).toEqual({ "abc supply inc": "ar@abcsupply.example" });
    const added = await call<LowerTierWaiverDto[]>(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        payAppId: second.id,
        items: [
          // Left out: the saved address. Cleared on purpose: none. Typed: that one.
          { party: "abc supply inc", kind: "conditional-progress" },
          { party: "ABC Supply", kind: "conditional-progress", partyEmail: "" },
          { party: "Valley", kind: "conditional-progress", partyEmail: "pm@valley.example" },
        ],
      },
    });
    expect(added.map((r) => r.partyEmail)).toEqual([
      "ar@abcsupply.example",
      null,
      "pm@valley.example",
    ]);
    // A changed party name keeps the address; a blank clears it.
    const renamed = await call<LowerTierWaiverDto>(`${url}/${added[2]?.id}`, {
      method: "PATCH",
      as,
      json: { party: "Valley Insulation" },
    });
    expect(renamed.partyEmail).toBe("pm@valley.example");
    const cleared = await call<LowerTierWaiverDto>(`${url}/${added[2]?.id}`, {
      method: "PATCH",
      as,
      json: { partyEmail: "  " },
    });
    expect(cleared.partyEmail).toBeNull();

    const other = await job();
    await grantPlan(other.orgId, "crew", "active");
    const theirs = await other.newApp("2026-10-01", "2026-10-31");
    const otherList = await call<LowerTierWaiversDto>(`${other.url}?payAppId=${theirs.id}`, {
      as: other.as,
    });
    expect(otherList.partyEmails).toEqual({});
    const [theirAbc] = await call<LowerTierWaiverDto[]>(`${other.url}/bulk`, {
      method: "POST",
      as: other.as,
      expect: 201,
      json: {
        payAppId: theirs.id,
        items: [{ party: "ABC Supply, Inc.", kind: "conditional-progress" }],
      },
    });
    expect(theirAbc?.partyEmail).toBeNull();
  });

  it("reads on Free but adding one needs a plan with lien waivers (402)", async () => {
    const { url, as, newApp } = await job();
    const app = await newApp("2026-10-01", "2026-10-31");
    const list = await call<LowerTierWaiversDto>(`${url}?payAppId=${app.id}`, { as });
    expect(list.canEdit).toBe(false);
    expect(list.items).toEqual([]);
    expect(list.summaries[app.id]?.complete).toBe(false);
    const res = await api(url, {
      method: "POST",
      as,
      json: { payAppId: app.id, party: "ABC Supply", kind: "conditional-progress" },
    });
    expect(res.status).toBe(402);
  });

  it("tracks each party's waiver from owed to requested to received", async () => {
    const { url, as, orgId, newApp } = await job();
    await grantPlan(orgId, "crew", "active");
    const app = await newApp("2026-10-01", "2026-10-31");
    const added = await call<LowerTierWaiverDto[]>(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        payAppId: app.id,
        items: [
          {
            party: "ABC Supply",
            partyKind: "supplier",
            kind: "conditional-progress",
            throughDate: "2026-10-31",
            amountCents: 125_000,
          },
          { party: "Valley Insulation", partyKind: "subcontractor", kind: "conditional-progress" },
        ],
      },
    });
    expect(added.map((r) => [r.party, r.status])).toEqual([
      ["ABC Supply", "owed"],
      ["Valley Insulation", "owed"],
    ]);
    const [abc, valley] = added;
    const asked = await call<LowerTierWaiverDto>(`${url}/${abc?.id}`, {
      method: "PATCH",
      as,
      json: { requestedOn: today() },
    });
    expect(asked.status).toBe("requested");
    expect(asked.daysWaiting).toBe(0);
    expect(asked.amountCents).toBe(125_000);
    const got = await call<LowerTierWaiverDto>(`${url}/${abc?.id}`, {
      method: "PATCH",
      as,
      json: { receivedOn: today(), note: "Signed PDF in the packet" },
    });
    expect(got.status).toBe("received");
    expect(got.daysWaiting).toBeNull();

    const list = await call<LowerTierWaiversDto>(`${url}?payAppId=${app.id}`, { as });
    expect(list.canEdit).toBe(true);
    expect(list.summaries[app.id]).toMatchObject({
      total: 2,
      received: 1,
      outstanding: 1,
      notRequested: 1,
      outstandingParties: ["Valley Insulation"],
      complete: false,
    });

    // A received date in the future, or before the request, is refused.
    const future = await api(`${url}/${valley?.id}`, {
      method: "PATCH",
      as,
      json: { receivedOn: "2999-01-01" },
    });
    expect(future.status).toBe(400);
    const backwards = await api(`${url}/${abc?.id}`, {
      method: "PATCH",
      as,
      json: { requestedOn: today(), receivedOn: "2020-01-01" },
    });
    expect(backwards.status).toBe(400);

    await call(`${url}/${valley?.id}`, { method: "DELETE", as });
    const after = await call<LowerTierWaiversDto>(`${url}?payAppId=${app.id}`, { as });
    expect(after.summaries[app.id]?.complete).toBe(true);
  });

  it("adds a pasted batch all or nothing", async () => {
    const { url, as, orgId, newApp } = await job();
    await grantPlan(orgId, "crew", "active");
    const app = await newApp("2026-10-01", "2026-10-31");
    const res = await api(`${url}/bulk`, {
      method: "POST",
      as,
      json: {
        payAppId: app.id,
        items: [
          { party: "ABC Supply", kind: "conditional-progress" },
          { party: "Late Lumber", kind: "conditional-progress", receivedOn: "2999-01-01" },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Row 2 (Late Lumber)");
    const list = await call<LowerTierWaiversDto>(`${url}?payAppId=${app.id}`, { as });
    expect(list.items).toEqual([]);
  });

  it("offers the last application's list on the next one", async () => {
    const { base, url, as, orgId, newApp } = await job();
    await grantPlan(orgId, "crew", "active");
    const first = await newApp("2026-09-01", "2026-09-30");
    await call(`${base}/pay-apps/${first.id}/submit`, { method: "POST", as });
    await call(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        payAppId: first.id,
        items: [
          { party: "ABC Supply", partyKind: "supplier", kind: "conditional-progress" },
          { party: "abc supply", partyKind: "supplier", kind: "unconditional-progress" },
          { party: "Valley Insulation", partyKind: "subcontractor", kind: "conditional-progress" },
        ],
      },
    });
    const second = await newApp("2026-10-01", "2026-10-31");
    const list = await call<LowerTierWaiversDto>(`${url}?payAppId=${second.id}`, { as });
    expect(list.items).toEqual([]);
    expect(list.previous).toEqual([
      { party: "ABC Supply", partyKind: "supplier" },
      { party: "Valley Insulation", partyKind: "subcontractor" },
    ]);
    // The job-wide read returns every application's rows with a summary for each.
    const all = await call<LowerTierWaiversDto>(url, { as });
    expect(all.items).toHaveLength(3);
    expect(Object.keys(all.summaries)).toEqual([first.id]);
    expect(all.previous).toEqual([]);

    // Deleting the draft application takes its list with it.
    await call(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: { payAppId: second.id, items: [{ party: "ABC Supply", kind: "conditional-progress" }] },
    });
    await call(`${base}/pay-apps/${second.id}`, { method: "DELETE", as });
    const left = await call<LowerTierWaiversDto>(url, { as });
    expect(left.items).toHaveLength(3);
  });

  it("files the signed waiver on its row: received, listed, named in the packet, kept as backup", async () => {
    const { base, url, as, orgId, newApp } = await job();
    const app = await newApp("2026-10-01", "2026-10-31");
    const appPath = `${base}/pay-apps/${app.id}`;
    // On Free the list cannot change, so a file cannot be filed on a row either.
    await grantPlan(orgId, "crew", "active");
    const [abc, valley] = await call<LowerTierWaiverDto[]>(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        payAppId: app.id,
        items: [
          { party: "ABC Supply", kind: "conditional-progress", requestedOn: "2026-11-02" },
          { party: "Valley Insulation", kind: "conditional-progress" },
        ],
      },
    });
    expect(abc?.files).toEqual([]);
    const filed = await fileOn(appPath, as, abc?.id ?? "", "ABC waiver.pdf");
    expect(filed.status).toBe(201);
    const added = (await filed.json()) as { id: string; lowerTierWaiverId: string | null };
    expect(added.lowerTierWaiverId).toBe(abc?.id);

    const list = await call<LowerTierWaiversDto>(`${url}?payAppId=${app.id}`, { as });
    const row = list.items.find((r) => r.id === abc?.id);
    expect(row).toMatchObject({ status: "received", receivedOn: today() });
    expect(row?.files.map((f) => [f.id, f.fileName])).toEqual([[added.id, "ABC waiver.pdf"]]);
    expect(list.items.find((r) => r.id === valley?.id)?.files).toEqual([]);
    // A date already entered is kept when a second copy is filed.
    await call(`${url}/${abc?.id}`, { method: "PATCH", as, json: { receivedOn: "2026-11-05" } });
    expect((await fileOn(appPath, as, abc?.id ?? "", "ABC page 2.pdf")).status).toBe(201);
    const again = await call<LowerTierWaiversDto>(`${url}?payAppId=${app.id}`, { as });
    expect(again.items.find((r) => r.id === abc?.id)).toMatchObject({ receivedOn: "2026-11-05" });
    expect(again.items.find((r) => r.id === abc?.id)?.files).toHaveLength(2);

    // It is one of the pay application's files, and the packet's index names the party.
    const files = await call<{ items: { id: string; lowerTierWaiverId: string | null }[] }>(
      `${appPath}/attachments`,
      { as },
    );
    expect(files.items.find((f) => f.id === added.id)?.lowerTierWaiverId).toBe(abc?.id);
    const packet = await api(`${appPath}/packet.pdf`, { as });
    expect(packet.status).toBe(200);
    const text = Array.from(new Uint8Array(await packet.arrayBuffer()), (x) =>
      String.fromCharCode(x),
    ).join("");
    expect(text).toContain("(ABC waiver.pdf \\(Lower-tier waiver: ABC Supply\\))");

    // Removing the row keeps the files on the pay application as ordinary backup.
    await call(`${url}/${abc?.id}`, { method: "DELETE", as });
    const kept = await call<{ items: { id: string; lowerTierWaiverId: string | null }[] }>(
      `${appPath}/attachments`,
      { as },
    );
    expect(kept.items).toHaveLength(2);
    expect(kept.items.every((f) => f.lowerTierWaiverId === null)).toBe(true);
  });

  it("refuses filing on another application's row, another company's row, or without the plan", async () => {
    const { base, url, as, orgId, newApp } = await job();
    await grantPlan(orgId, "crew", "active");
    const first = await newApp("2026-09-01", "2026-09-30");
    await call(`${base}/pay-apps/${first.id}/submit`, { method: "POST", as });
    const second = await newApp("2026-10-01", "2026-10-31");
    const row = await call<LowerTierWaiverDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { payAppId: first.id, party: "ABC Supply", kind: "conditional-progress" },
    });
    // The row is on application #1: filing it on #2 is not found, and nothing is stored.
    const wrongApp = await fileOn(`${base}/pay-apps/${second.id}`, as, row.id, "w.pdf");
    expect(wrongApp.status).toBe(404);
    const none = await call<{ items: unknown[] }>(`${base}/pay-apps/${second.id}/attachments`, {
      as,
    });
    expect(none.items).toEqual([]);

    // Another company's row id on our own pay application: not found.
    const other = await job();
    await grantPlan(other.orgId, "crew", "active");
    const theirApp = await other.newApp("2026-10-01", "2026-10-31");
    const theirs = await call<LowerTierWaiverDto>(other.url, {
      method: "POST",
      as: other.as,
      expect: 201,
      json: { payAppId: theirApp.id, party: "Their Supplier", kind: "conditional-progress" },
    });
    const cross = await fileOn(`${base}/pay-apps/${first.id}`, as, theirs.id, "x.pdf");
    expect(cross.status).toBe(404);

    // Canceled back to Free: the row's waiver cannot be filed (402), an ordinary file still uploads.
    await grantPlan(orgId, "crew", "canceled");
    expect((await fileOn(`${base}/pay-apps/${first.id}`, as, row.id, "f.pdf")).status).toBe(402);
    expect((await fileOn(`${base}/pay-apps/${first.id}`, as, "", "plain.pdf")).status).toBe(201);
  });

  it("viewers read but cannot write; another company's job and rows answer 404", async () => {
    const { url, as, orgId, newApp, base } = await job();
    await grantPlan(orgId, "crew", "active");
    const app = await newApp("2026-10-01", "2026-10-31");
    const row = await call<LowerTierWaiverDto>(url, {
      method: "POST",
      as,
      expect: 201,
      json: { payAppId: app.id, party: "ABC Supply", kind: "conditional-progress" },
    });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const seen = await call<LowerTierWaiversDto>(`${url}?payAppId=${app.id}`, { as: viewer.id });
    expect(seen.items).toHaveLength(1);
    const denied = await api(`${url}/${row.id}`, {
      method: "PATCH",
      as: viewer.id,
      json: { receivedOn: today() },
    });
    expect(denied.status).toBe(403);

    const other = await job();
    await grantPlan(other.orgId, "crew", "active");
    // Their own job, our row id: not found.
    const cross = await api(`${other.url}/${row.id}`, {
      method: "PATCH",
      as: other.as,
      json: { receivedOn: today() },
    });
    expect(cross.status).toBe(404);
    // Our pay app on their job: not found.
    const crossApp = await api(other.url, {
      method: "POST",
      as: other.as,
      json: { payAppId: app.id, party: "X", kind: "conditional-progress" },
    });
    expect(crossApp.status).toBe(404);
    // Our job, as them: not a member.
    const outsider = await api(`${base}/lower-tier-waivers`, { as: other.as });
    expect([403, 404]).toContain(outsider.status);
  });

  it("lists the waivers still out across active jobs, in the weekly email, never another company's", async () => {
    const { url, as, orgId, newApp, base } = await job();
    await grantPlan(orgId, "crew", "active");
    const one = await newApp("2026-09-01", "2026-09-30");
    await call(`${base}/pay-apps/${one.id}/submit`, { method: "POST", as });
    const two = await newApp("2026-10-01", "2026-10-31");
    const out = `/api/orgs/${orgId}/lower-tier-waivers/outstanding`;
    const list = async (who = as) =>
      (await call<{ items: LowerTierPayAppToChase[] }>(out, { as: who })).items;
    expect(await list()).toEqual([]);
    await call(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        payAppId: one.id,
        items: [
          { party: "ABC Supply", kind: "conditional-progress", requestedOn: daysAgo(12) },
          {
            party: "Valley Rebar",
            kind: "conditional-progress",
            receivedOn: daysAgo(1),
            requestedOn: daysAgo(5),
          },
        ],
      },
    });
    const added = await call<LowerTierWaiverDto[]>(`${url}/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        payAppId: two.id,
        items: [
          { party: "ABC Supply", kind: "conditional-progress", requestedOn: daysAgo(3) },
          { party: "Ferguson", kind: "conditional-progress" },
        ],
      },
    });
    const items = await list();
    // Longest wait first; the received row drops out.
    expect(
      items.map((a) => [a.payAppNumber, a.outstanding, a.notRequested, a.daysWaiting, a.parties]),
    ).toEqual([
      [1, 1, 0, 12, ["ABC Supply"]],
      [2, 2, 1, 3, ["ABC Supply", "Ferguson"]],
    ]);
    expect(items[0]?.projectName).toBe("Mesa Clinic TI");

    // The weekly email preview carries the same list, linked to each pay application's panel.
    const preview = (
      await call<{ preview: CashDigest | null }>(`/api/orgs/${orgId}/digest`, { as })
    ).preview;
    if (!preview) throw new Error("expected a preview");
    expect(preview.lowerTier.map((a) => a.payAppNumber)).toEqual([1, 2]);
    expect(preview.summary).toContain(
      "Lower-tier lien waivers still out: 3 on 2 pay applications.",
    );
    const mail = digestEmail(
      preview,
      { orgId, orgName: "Drywall Co", userName: "Sam" },
      { APP_URL: "https://app.example" },
    );
    expect(mail.text).toContain("Lower-tier waivers still out");
    expect(mail.text).toContain(
      `Mesa Clinic TI, pay app 2 to Copper State Builders: 2 lower-tier waivers still out (ABC Supply and Ferguson), asked for 3 days ago, 1 not asked for yet. https://app.example/orgs/${orgId}/projects/`,
    );
    expect(mail.text).toContain(`/pay-apps/${two.id}#lower-tier-waivers`);
    expect(mail.html).toContain(`/pay-apps/${two.id}#lower-tier-waivers`);

    // Filing the signed waiver marks it received: it drops off.
    const ferguson = added.find((r) => r.party === "Ferguson");
    const res = await fileOn(`${base}/pay-apps/${two.id}`, as, ferguson?.id ?? "", "ferguson.pdf");
    expect(res.status).toBe(201);
    expect((await list()).find((a) => a.payAppNumber === 2)?.parties).toEqual(["ABC Supply"]);

    // A viewer reads it; another company sees only its own, and cannot read ours.
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect(await list(viewer.id)).toHaveLength(2);
    const other = await setupTenant("owner");
    const theirs = await call<{ items: unknown[] }>(
      `/api/orgs/${other.orgId}/lower-tier-waivers/outstanding`,
      { as: other.userId },
    );
    expect(theirs.items).toEqual([]);
    expect((await api(out, { as: other.userId })).status).toBe(404);

    // A closed job is finished: its list leaves the page and the email.
    await call(base, { method: "PATCH", as, json: { status: "closed" } });
    expect(await list()).toEqual([]);
  });
});
