// Delays against the job's schedule: a daily report names the activity its lost hours held up, the
// delay log groups them (JSON and PDF), and the log is kept with a change order as backup for the
// time it asks for. Another job's or company's activity is refused; deleting an activity keeps the
// report, untied; viewers read but cannot attach.
import type {
  DailyReportDto,
  DailyReportLogDto,
  DelayLogDto,
  ProjectDetailDto,
  ProjectDto,
  ScheduleActivityDto,
} from "@shared/api/types";
import { addDays } from "@shared/daily-reports";
import { UNTIED_LABEL } from "@shared/schedule-delays";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);
const day = (n: number) => addDays(today(), -n);

async function job(name = "Riverside Clinic") {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name, gcName: "Harbor Builders", originalContractSumCents: 5_000_000 },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  let project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Rough-in", originalCents: 5_000_000 }] },
  });
  project = await call<ProjectDetailDto>(`${base}/change-orders`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      number: "CO-4",
      description: "Time for the late framing on level 2",
      scheduleDays: 3,
      items: [{ sovLineId: project.sovLines[0]?.id, amountCents: 100_000 }],
    },
  });
  const activity = (name: string) =>
    call<ScheduleActivityDto>(`${base}/schedule`, {
      method: "POST",
      as,
      expect: 201,
      json: { name, startOn: day(20), finishOn: addDays(today(), 10) },
    });
  const a1 = await activity("Underground");
  const a2 = await activity("Rough-in, level 2");
  return {
    ...t,
    as,
    base,
    dr: `${base}/daily-reports`,
    coId: project.changeOrders[0]?.id ?? "",
    a1,
    a2,
  };
}

const pdfText = async (res: Response) => new TextDecoder().decode(await res.arrayBuffer());

describe("schedule delays", () => {
  it("ties a report's lost hours to an activity and groups them in the log", async () => {
    const { dr, base, as, a1, a2 } = await job();
    const r1 = await call<DailyReportDto>(dr, {
      method: "POST",
      as,
      expect: 201,
      json: {
        reportDate: day(3),
        delayHours: 6,
        delays: "Framer not done on grid C-F; crew stood down",
        delayActivityId: a2.id,
      },
    });
    expect(r1.delayActivityId).toBe(a2.id);
    expect(r1.delayActivityLabel).toBe("A-002 Rough-in, level 2");
    await call(dr, {
      method: "POST",
      as,
      expect: 201,
      json: { reportDate: day(2), delayHours: 2.5, delayActivityId: a2.id, weather: "Rain" },
    });
    await call(dr, {
      method: "POST",
      as,
      expect: 201,
      json: { reportDate: day(1), delayHours: 1 },
    });
    // No hours and no activity: not a delay day.
    await call(dr, {
      method: "POST",
      as,
      expect: 201,
      json: { reportDate: day(4), delayHours: 0 },
    });

    const reports = await call<DailyReportLogDto>(dr, { as });
    expect(reports.activities.map((a) => a.label)).toEqual([
      "A-001 Underground",
      "A-002 Rough-in, level 2",
    ]);

    const log = await call<DelayLogDto>(`${base}/schedule/delays`, { as });
    expect(log.dayCount).toBe(3);
    expect(log.hours).toBe(9.5);
    expect(log.canEdit).toBe(true);
    expect(log.groups.map((g) => [g.label, g.dayCount, g.hours])).toEqual([
      ["A-002 Rough-in, level 2", 2, 8.5],
      [UNTIED_LABEL, 1, 1],
    ]);
    expect(log.groups[0]?.days[0]?.cause).toBe("Framer not done on grid C-F; crew stood down");

    const one = await call<DelayLogDto>(
      `${base}/schedule/delays?activityId=${a2.id}&from=${day(2)}`,
      { as },
    );
    expect(one.groups).toHaveLength(1);
    expect(one.dayCount).toBe(1);
    expect((await api(`${base}/schedule/delays?activityId=nope`, { as })).status).toBe(404);
    expect((await api(`${base}/schedule/delays?from=${day(1)}&to=${day(3)}`, { as })).status).toBe(
      400,
    );

    const pdf = await api(`${base}/schedule/delays.pdf?activityId=${a2.id}`, { as });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Content-Disposition")).toContain(
      "delay-log-a-002-riverside-clinic.pdf",
    );
    const text = await pdfText(pdf);
    expect(text).toContain("Delay log");
    expect(text).toContain("A-002 Rough-in, level 2");
    expect(text).toContain("Framer not done on grid C-F");
    expect(text).toContain("Prepared with PayApps from the daily reports");

    // Untie, re-tie, and a delete of the activity keeps the report, untied.
    const r1Path = `${dr}/${r1.id}`;
    const changed = await call<DailyReportDto>(r1Path, {
      method: "PATCH",
      as,
      json: { delayActivityId: a1.id },
    });
    expect(changed.delayActivityLabel).toBe("A-001 Underground");
    await call(`${base}/schedule/${a1.id}`, { method: "DELETE", as });
    const after = await call<DailyReportDto>(r1Path, { method: "PATCH", as, json: {} });
    expect(after.delayActivityId).toBeNull();
    expect(after.delayHours).toBe(6);
    const log2 = await call<DelayLogDto>(`${base}/schedule/delays`, { as });
    expect(log2.groups.find((g) => g.activityId === null)?.dayCount).toBe(2);
  });

  it("attaches the delay log to a change order as backup, listed with its files", async () => {
    const { dr, base, as, coId, a2, orgId } = await job("Harbor Garage");
    const co = `${base}/change-orders/${coId}`;
    // Nothing to print yet.
    const empty = await api(`${co}/delay-backup`, { method: "POST", as, json: {} });
    expect(empty.status).toBe(400);
    expect(await empty.text()).toMatch(/No daily report/);

    await call(dr, {
      method: "POST",
      as,
      expect: 201,
      json: { reportDate: day(2), delayHours: 8, delayActivityId: a2.id, delays: "No access" },
    });
    const added = await call<{ fileName: string; category: string }>(`${co}/delay-backup`, {
      method: "POST",
      as,
      expect: 201,
      json: { activityId: a2.id },
    });
    expect(added.fileName).toBe("delay-log-a-002-harbor-garage.pdf");
    expect(added.category).toBe("backup");
    const files = await call<{ items: { id: string; fileName: string }[] }>(`${co}/attachments`, {
      as,
    });
    const kept = files.items.find((f) => f.fileName === added.fileName);
    expect(kept).toBeTruthy();
    const text = await pdfText(await api(`${co}/attachments/${kept?.id}`, { as }));
    expect(text).toContain("Backup for change order CO-4");
    expect(text).toContain("3 calendar days requested");

    // Viewers read the log but cannot attach it.
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const seen = await call<DelayLogDto>(`${base}/schedule/delays`, { as: viewer.id });
    expect(seen.canEdit).toBe(false);
    expect(
      (await api(`${co}/delay-backup`, { method: "POST", as: viewer.id, json: {} })).status,
    ).toBe(403);
  });

  it("refuses another job's or company's activity and keeps other companies out", async () => {
    const mine = await job("Job A");
    const other = await job("Job B");
    // Another company's activity on my report.
    const res = await api(mine.dr, {
      method: "POST",
      as: mine.as,
      json: { reportDate: day(1), delayHours: 2, delayActivityId: other.a1.id },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/not on this job's schedule/);
    // Another company's log and attach route.
    expect((await api(`${other.base}/schedule/delays`, { as: mine.as })).status).toBe(404);
    expect(
      (
        await api(`${other.base}/change-orders/${other.coId}/delay-backup`, {
          method: "POST",
          as: mine.as,
          json: {},
        })
      ).status,
    ).toBe(404);
    // My log asked for another company's activity.
    expect(
      (await api(`${mine.base}/schedule/delays?activityId=${other.a1.id}`, { as: mine.as })).status,
    ).toBe(404);
  });
});
