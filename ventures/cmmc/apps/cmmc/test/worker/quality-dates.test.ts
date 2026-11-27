// ISO 9001 dates in the calendar: controlled documents' review dates, planned internal audits and
// corrective-action dates reach the downloaded .ics and the subscribable link as counts per date,
// never a title or a nonconformity's text; another organization's records never appear; GET /audits
// answers the dashboard's `attention` list.
import type { CalendarFeedStatus } from "@shared/affirmation-ics";
import type { QualityAttention } from "@shared/internal-audits";
import { describe, expect, it } from "vitest";
import { api, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p: string) => `/api/orgs/${t.orgId}${p}`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ics = (d: string) => d.replace(/-/g, "");
const send = (t: Tenant, p: string, body: unknown) =>
  api(path(t, p), { method: "POST", as: t.userId, json: body });

async function seed(t: Tenant, tag: string) {
  const doc = await json<{ id: string }>(
    send(t, "/documents", {
      docNumber: `QP-${tag}`,
      title: `Secret procedure ${tag}`,
      kind: "procedure",
      revision: "A",
      location: "Shared drive",
      reviewMonths: 12,
    }),
    201,
  );
  await json(send(t, `/documents/${doc.id}/release`, { approvedOn: day(-10) }));
  await json(
    send(t, "/audits", {
      title: `Audit of customer ${tag}`,
      clauseIds: ["iso9001-8.5.1"],
      plannedOn: day(-2),
      auditorName: "Outside auditor",
    }),
    201,
  );
  await json(
    send(t, "/corrective-actions", {
      source: "customer_complaint",
      nonconformity: `Burrs on part ${tag}`,
      raisedOn: day(-5),
      dueOn: day(10),
    }),
    201,
  );
}

describe("ISO 9001 dates in the calendar", () => {
  it("puts counts per date in the download and the link, never titles or another org's dates", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    await seed(t, "MINE");
    await seed(other, "THEIRS");

    const download = await api(path(t, "/affirmations/calendar.ics"), { as: t.userId });
    expect(download.status).toBe(200);
    const file = (await download.text()).replace(/\r\n /g, "");
    // One year after approval, minus ten days, is the review date.
    const reviewDue = new Date(Date.now() - 10 * 86_400_000);
    reviewDue.setUTCFullYear(reviewDue.getUTCFullYear() + 1);
    const due = reviewDue.toISOString().slice(0, 10);
    expect(file).toContain(`UID:cmmc-${t.orgId}-docreview-${ics(due)}@cmmc-workspace`);
    expect(file).toContain("SUMMARY:Document review due: 1 controlled document");
    expect(file).toContain(`UID:cmmc-${t.orgId}-quality-audit-${ics(day(-2))}@cmmc-workspace`);
    expect(file).toContain(`UID:cmmc-${t.orgId}-quality-ca_action-${ics(day(10))}@cmmc-workspace`);
    for (const secret of ["Secret procedure", "Audit of customer", "Burrs on part", "QP-"])
      expect(file).not.toContain(secret);
    expect(file).not.toContain(other.orgId);
    expect(file).not.toContain("THEIRS");

    const feed = await json<CalendarFeedStatus>(
      api(path(t, "/affirmations/calendar-feed"), { method: "POST", as: t.userId }),
      201,
    );
    const linked = await api(new URL(feed.url as string).pathname);
    expect(linked.status).toBe(200);
    const body = (await linked.text()).replace(/\r\n /g, "");
    expect(body).toContain(`-quality-ca_action-${ics(day(10))}@`);
    expect(body).toContain(`-docreview-${ics(due)}@`);
    expect(body).not.toContain("Burrs on part");
    expect(body).not.toContain(other.orgId);
  });

  it("lists the overdue audit and the action due soon for the dashboard", async () => {
    const t = await setupTenant();
    await seed(t, "X");
    const p = await json<{ attention: QualityAttention[] }>(
      api(path(t, "/audits"), { as: t.userId }),
    );
    expect(p.attention.map((a) => [a.kind, a.state, a.due])).toEqual([
      ["audit", "overdue", day(-2)],
      ["ca_action", "due_soon", day(10)],
    ]);
    expect(p.attention[1]?.label).toBe("CA-0001");
  });
});
