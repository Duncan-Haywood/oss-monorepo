// Written security policies: the starter text, the draft -> approved -> revised lifecycle, reviews,
// downloads, the SSP section, the plan gate, roles, audit and tenant isolation.
import { addMonths } from "@shared/security-policies";
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;
const today = () => new Date().toISOString().slice(0, 10);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

interface Detail {
  family: string;
  requirements: { id: string; nistId: string; text: string }[];
  policy: {
    title: string;
    body: string;
    status: "draft" | "approved";
    version: number;
    ownerUserId: string | null;
    ownerName: string | null;
    reviewMonths: number;
    approvedOn: string | null;
    reviewDue: string | null;
  } | null;
  review: string;
  history: { kind: string; version: number; day: string; actorName: string | null }[];
  template: string;
}
interface List {
  items: { family: string; review: string; policy: { version: number } | null }[];
  counts: { total: number; written: number; approved: number; inForce: number; overdue: number };
}

const put = (t: Tenant, family: string, body: unknown, as = t.userId) =>
  api(path(t, `/policies/${family}`), { method: "PUT", as, json: body });
const post = (t: Tenant, family: string, what: "approve" | "review", as = t.userId) =>
  api(path(t, `/policies/${family}/${what}`), { method: "POST", as });
const detail = (t: Tenant, family: string, as = t.userId) =>
  json<Detail>(api(path(t, `/policies/${family}`), { as }));

describe("security policies", () => {
  it("lists all 14 families and serves a starter text built from the org's records", async () => {
    const t = await setupTenant();
    const list = await json<List>(api(path(t, "/policies"), { as: t.userId }));
    expect(list.items).toHaveLength(14);
    expect(list.counts).toMatchObject({ total: 14, written: 0, inForce: 0 });
    expect(list.items.every((i) => i.review === "none")).toBe(true);

    // An accepted statement becomes the procedure; an AI draft never does.
    await json(
      api(path(t, "/controls/PS.L2-3.9.1"), {
        method: "PATCH",
        as: t.userId,
        json: { statement: "HR screens every hire before account creation." },
      }),
    );
    await json(
      api(path(t, "/controls/PS.L2-3.9.2"), {
        method: "PATCH",
        as: t.userId,
        json: { draftStatement: "UNREVIEWED DRAFT TEXT" },
      }),
    );
    const d = await detail(t, "PS");
    expect(d.policy).toBeNull();
    expect(d.requirements.map((r) => r.nistId)).toEqual(["3.9.1", "3.9.2"]);
    expect(d.template).toContain("Acme Machining will:");
    expect(d.template).toContain("HR screens every hire before account creation.");
    expect(d.template).not.toContain("UNREVIEWED DRAFT TEXT");

    const bad = await api(path(t, "/policies/XX"), { as: t.userId });
    expect(bad.status).toBe(404);
  });

  it("drafts, approves, revises and reviews, keeping each approved text", async () => {
    const t = await setupTenant();
    const created = await json<Detail>(put(t, "AT", {}));
    expect(created.policy).toMatchObject({
      title: "Awareness and Training Policy",
      status: "draft",
      version: 1,
      reviewMonths: 12,
      reviewDue: null,
    });
    expect(created.policy?.body).toBe(created.template);
    expect(created.review).toBe("never_approved");

    const approved = await json<Detail>(post(t, "AT", "approve"));
    expect(approved.policy).toMatchObject({
      status: "approved",
      version: 1,
      approvedOn: today(),
      reviewDue: addMonths(today(), 12),
    });
    expect(approved.review).toBe("current");
    expect(approved.history).toEqual([
      expect.objectContaining({
        kind: "approved",
        version: 1,
        day: today(),
        actorName: "Test User",
      }),
    ]);
    // Approving twice is refused.
    expect((await post(t, "AT", "approve")).status).toBe(409);

    // Owner and interval are settings: no new version.
    const settings = await json<Detail>(put(t, "AT", { ownerUserId: t.userId, reviewMonths: 24 }));
    expect(settings.policy).toMatchObject({
      status: "approved",
      version: 1,
      ownerName: "Test User",
    });

    // A text change starts version 2 as a draft; version 1 stays in force.
    const v1Body = approved.policy?.body ?? "";
    const revised = await json<Detail>(
      put(t, "AT", { body: `${v1Body}\n\nPhishing drills quarterly.` }),
    );
    expect(revised.policy).toMatchObject({ status: "draft", version: 2, approvedOn: today() });
    expect(revised.review).toBe("current");
    const list = await json<List>(api(path(t, "/policies"), { as: t.userId }));
    expect(list.counts).toMatchObject({ written: 1, approved: 0, inForce: 1 });

    // Downloads: the current draft, and the approved version 1 from the history.
    const draftFile = await api(path(t, "/policies/AT/download"), { as: t.userId });
    expect(draftFile.headers.get("Content-Disposition")).toContain("policy-at-v2-draft.md");
    const draftMd = await draftFile.text();
    expect(draftMd).toContain("| Status | Draft (not approved) |");
    expect(draftMd).toContain("Phishing drills quarterly.");
    const v1 = await api(path(t, "/policies/AT/download?version=1"), { as: t.userId });
    const v1Md = await v1.text();
    expect(v1Md).toContain("| Status | Approved by Test User on");
    expect(v1Md).not.toContain("Phishing drills quarterly.");
    expect((await api(path(t, "/policies/AT/download?version=2"), { as: t.userId })).status).toBe(
      404,
    );

    // Reviewing applies to version 1 (the one in force) and uses the new 24-month interval.
    const reviewed = await json<Detail>(post(t, "AT", "review"));
    expect(reviewed.policy?.reviewDue).toBe(addMonths(today(), 24));
    expect(reviewed.history.at(-1)).toMatchObject({ kind: "reviewed", version: 1 });

    const v2 = await json<Detail>(post(t, "AT", "approve"));
    expect(v2.policy).toMatchObject({ status: "approved", version: 2 });
    expect(v2.history.map((h) => `${h.kind}:${h.version}`)).toEqual([
      "approved:1",
      "reviewed:1",
      "approved:2",
    ]);

    // The audit log records the actions, never the text.
    const log = await json<{ items: { action: string; targetId: string }[] }>(
      api(path(t, "/audit-log"), { as: t.userId }),
    );
    const actions = log.items.map((i) => `${i.action} ${i.targetId}`);
    expect(actions).toEqual(
      expect.arrayContaining([
        "policy.create AT",
        "policy.approve AT:v1",
        "policy.revise AT",
        "policy.review AT:v1",
        "policy.approve AT:v2",
      ]),
    );
    expect(JSON.stringify(log)).not.toContain("Phishing");
  });

  it("refuses a review before approval, an empty text and a non-member owner", async () => {
    const t = await setupTenant();
    await json(put(t, "IR", { title: "Incident Response Plan", body: "## Plan\n\nCall Pat." }));
    expect((await post(t, "IR", "review")).status).toBe(409);
    expect((await put(t, "IR", { body: "  " })).status).toBe(400);
    const stranger = await createTestUser("Stranger");
    expect((await put(t, "IR", { ownerUserId: stranger.id })).status).toBe(400);
    expect((await put(t, "IR", { reviewMonths: 7 })).status).toBe(400);
    const d = await detail(t, "IR");
    expect(d.policy).toMatchObject({
      title: "Incident Response Plan",
      body: "## Plan\n\nCall Pat.",
    });
  });

  it("prints section 8 of the SSP and the policy manual", async () => {
    const t = await setupTenant();
    await json(put(t, "AC", {}));
    await json(post(t, "AC", "approve"));
    await json(put(t, "MA", { body: "Draft maintenance policy." }));
    const ssp = await json<{ markdown: string }>(api(path(t, "/ssp?level=2"), { as: t.userId }));
    expect(ssp.markdown).toContain("## 8. Security policies");
    expect(ssp.markdown).toContain(
      `| Access Control (AC) | Access Control Policy | 1 | ${today()} | ${addMonths(today(), 12)} |`,
    );
    expect(ssp.markdown).toContain("| Maintenance (MA) | Maintenance Policy | None (draft only) |");
    expect(ssp.markdown).toContain("| Personnel Security (PS) | _Not written_ |");

    const manual = await api(path(t, "/policies/export.md"), { as: t.userId });
    expect(manual.status).toBe(200);
    const md = await manual.text();
    expect(md).toContain("# Security policies — Acme Machining");
    expect(md).toContain("\n## Access Control Policy\n");
    expect(md).toContain("Draft maintenance policy.");
  });

  it("is read only without the Level 2 plan, and gates roles", async () => {
    const free = await setupTenant("owner", "Free Shop", null);
    expect((await detail(free, "SC")).template).toContain("Free Shop will:");
    expect((await put(free, "SC", {})).status).toBe(402);

    const t = await setupTenant();
    const viewer = await createTestUser("Viewer");
    const editor = await createTestUser("Editor");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await addToOrg(t.orgId, editor.id, "editor");
    expect((await put(t, "CM", {}, viewer.id)).status).toBe(403);
    await json(put(t, "CM", {}, editor.id));
    expect((await post(t, "CM", "approve", editor.id)).status).toBe(403);
    expect((await api(path(t, "/policies/CM"), { method: "DELETE", as: editor.id })).status).toBe(
      403,
    );
    // Viewers read and download.
    expect((await api(path(t, "/policies/CM/download"), { as: viewer.id })).status).toBe(200);
    await json(api(path(t, "/policies/CM"), { method: "DELETE", as: t.userId }));
    expect((await detail(t, "CM")).policy).toBeNull();
  });

  it("keeps each organization's policies to itself", async () => {
    const a = await setupTenant("owner", "Org A");
    const b = await setupTenant("owner", "Org B");
    await json(put(a, "RA", { body: "Org A risk assessment secret." }));
    // B's member cannot reach A's org at all.
    const cross = await api(path(a, "/policies/RA"), { as: b.userId });
    expect([403, 404]).toContain(cross.status);
    const crossDl = await api(path(a, "/policies/RA/download"), { as: b.userId });
    expect([403, 404]).toContain(crossDl.status);
    // B's own RA is empty and its manual does not carry A's text.
    expect((await detail(b, "RA")).policy).toBeNull();
    const md = await (await api(path(b, "/policies/export.md"), { as: b.userId })).text();
    expect(md).not.toContain("Org A risk assessment secret.");
  });

  it("puts approved policies' review dates in the calendar file and the subscribed link", async () => {
    const a = await setupTenant("owner", "Org A");
    const b = await setupTenant("owner", "Org B");
    await json(put(a, "AT", { title: "Private training title", body: "Private procedure text." }));
    await json(post(a, "AT", "approve"));
    // A draft that was never approved has no review date, so no event.
    await json(put(a, "CM", { body: "Draft only." }));
    const due = addMonths(today(), 12).replace(/-/g, "");
    const read = async (t: Tenant, as: string) =>
      (await (await api(path(t, "/affirmations/calendar.ics"), { as })).text()).replace(
        /\r\n /g,
        "",
      );

    const ics = await read(a, a.userId);
    expect(ics).toContain(`UID:cmmc-${a.orgId}-policy-AT@cmmc-workspace`);
    expect(ics).toContain(`DTSTART;VALUE=DATE:${due}`);
    expect(ics).toContain("SUMMARY:Policy review: Awareness and Training (AT)");
    expect(ics).not.toContain("policy-CM");
    // Only the family's fixed name leaves: not the title, the text or the owner.
    expect(ics).not.toContain("Private training title");
    expect(ics).not.toContain("Private procedure text");
    expect(ics).not.toContain("Test User");

    // "Reviewed, no changes" keeps the one event (same UID) on the same or a later date.
    await json(post(a, "AT", "review"));
    const again = await read(a, a.userId);
    expect(again.match(/-policy-AT@/g)).toHaveLength(1);

    // The subscribed link carries the same event, with no session.
    const made = await json<{ url: string }>(
      api(path(a, "/affirmations/calendar-feed"), { method: "POST", as: a.userId }),
      201,
    );
    const feed = (await (await api(new URL(made.url).pathname)).text()).replace(/\r\n /g, "");
    expect(feed).toContain(`UID:cmmc-${a.orgId}-policy-AT@cmmc-workspace`);

    // Another organization's calendar has none of it.
    expect(await read(b, b.userId)).not.toContain("policy-AT");
  });
});
