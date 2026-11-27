// Daily reports (/projects/:projectId/daily-reports): one per job and day, the checks on dates,
// temperatures, hours and crew lines, the log's totals, the PDF (one report and a range) and the CSV,
// viewers read-only, and no reach into another company's job or report.
import type { DailyReportDto, DailyReportLogDto, ProjectDto } from "@shared/api/types";
import { addDays } from "@shared/daily-reports";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

const today = () => new Date().toISOString().slice(0, 10);

async function job() {
  const t = await setupTenant("owner");
  const p = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as: t.userId,
    expect: 201,
    json: { name: "Mesa Clinic TI", gcName: "Copper State Builders", originalContractSumCents: 1 },
  });
  return { ...t, as: t.userId, dr: `/api/orgs/${t.orgId}/projects/${p.id}/daily-reports` };
}

const day = (n: number) => addDays(today(), -n);

const report = (reportDate: string) => ({
  reportDate,
  weather: "Clear, wind 15 mph",
  tempHighF: 61,
  tempLowF: 44,
  delayHours: 0,
  crew: [
    { company: null, trade: "Electricians", workers: 4, hoursEach: 8 },
    { company: "Valley Lift Rentals", trade: "Lift operator", workers: 1, hoursEach: 6.5 },
  ],
  workPerformed: "Pulled feeders to panels L1 and L2.\nSet boxes on level 2 grid C-F.",
  equipment: "Scissor lift, 19 ft",
});

describe("daily reports", () => {
  it("adds one report per day, totals the crew and lists newest first", async () => {
    const { dr, as } = await job();
    const empty = await call<DailyReportLogDto>(dr, { as });
    expect(empty.items).toEqual([]);
    expect(empty.canEdit).toBe(true);
    expect(empty.suggestedDate).toBe(today());
    expect(empty.summary).toMatchObject({ reports: 0, manHours: 0, missing: { total: 0 } });

    const a = await call<DailyReportDto>(dr, {
      method: "POST",
      as,
      expect: 201,
      json: report(day(1)),
    });
    expect(a).toMatchObject({ reportDate: day(1), workers: 5, manHours: 38.5 });
    expect(a.crew[0]).toEqual({ company: null, trade: "Electricians", workers: 4, hoursEach: 8 });
    expect(a.createdByName).toBeTruthy();
    // Blank text is stored as not entered.
    const b = await call<DailyReportDto>(dr, {
      method: "POST",
      as,
      expect: 201,
      json: { reportDate: today(), weather: "  ", delays: "Rain from 1 pm", delayHours: 2.5 },
    });
    expect(b).toMatchObject({ weather: null, crew: [], workers: 0, delayHours: 2.5 });

    const log = await call<DailyReportLogDto>(dr, { as });
    expect(log.items.map((r) => r.reportDate)).toEqual([today(), day(1)]);
    expect(log.summary).toMatchObject({
      reports: 2,
      manHours: 38.5,
      delayDays: 1,
      delayHours: 2.5,
      firstDate: day(1),
      lastDate: today(),
    });

    // The same day again is refused with the reason; so is moving another report onto it.
    const dupe = await api(dr, { method: "POST", as, json: report(today()) });
    expect(dupe.status).toBe(409);
    expect(await dupe.text()).toMatch(/already a daily report/);
    const move = await api(`${dr}/${a.id}`, { method: "PATCH", as, json: { reportDate: today() } });
    expect(move.status).toBe(409);
  });

  it("refuses dates, temperatures, hours and crew lines that do not make sense", async () => {
    const { dr, as } = await job();
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ reportDate: addDays(today(), 3) }, /after today/],
      [{ reportDate: "2026-02-30" }, /YYYY-MM-DD/],
      [{ reportDate: day(1), tempHighF: 40, tempLowF: 50 }, /low temperature is above/],
      [{ reportDate: day(1), delayHours: 2.1 }, /quarter hours/],
      [
        {
          reportDate: day(1),
          crew: [{ company: null, trade: "Laborers", workers: 2, hoursEach: 7.3 }],
        },
        /Crew line 1/,
      ],
    ];
    for (const [json, msg] of bad) {
      const r = await api(dr, { method: "POST", as, json });
      expect(r.status, JSON.stringify(json)).toBe(400);
      expect(await r.text()).toMatch(msg);
    }
    // Tomorrow (UTC) is accepted: a contractor west of UTC files tonight's report after UTC midnight.
    await call(dr, { method: "POST", as, expect: 201, json: { reportDate: addDays(today(), 1) } });
  });

  it("edits a report, keeps what was not sent, and deletes it", async () => {
    const { dr, as } = await job();
    const a = await call<DailyReportDto>(dr, {
      method: "POST",
      as,
      expect: 201,
      json: report(day(2)),
    });
    const edited = await call<DailyReportDto>(`${dr}/${a.id}`, {
      method: "PATCH",
      as,
      json: { safety: "Toolbox talk: ladder use", equipment: "" },
    });
    expect(edited).toMatchObject({
      safety: "Toolbox talk: ladder use",
      equipment: null,
      weather: "Clear, wind 15 mph",
      manHours: 38.5,
    });
    // Changing the temperatures checks them with the ones already saved.
    const r = await api(`${dr}/${a.id}`, { method: "PATCH", as, json: { tempHighF: 30 } });
    expect(r.status).toBe(400);
    await call(`${dr}/${a.id}`, { method: "DELETE", as });
    expect((await call<DailyReportLogDto>(dr, { as })).items).toEqual([]);
    expect((await api(`${dr}/${a.id}`, { method: "DELETE", as })).status).toBe(404);
  });

  it("counts weekdays since the first report with none, through yesterday", async () => {
    const { dr, as } = await job();
    // Reports 14 and 2 days ago: the weekdays between them (and yesterday) are missing.
    await call(dr, { method: "POST", as, expect: 201, json: { reportDate: day(14) } });
    await call(dr, { method: "POST", as, expect: 201, json: { reportDate: day(2) } });
    const { summary } = await call<DailyReportLogDto>(dr, { as });
    let expected = 0;
    for (let n = 1; n <= 13; n++) {
      if (n === 2) continue;
      const wd = new Date(`${day(n)}T00:00:00Z`).getUTCDay();
      if (wd !== 0 && wd !== 6) expected++;
    }
    expect(summary.missing.total).toBe(expected);
    expect(summary.missing.days).not.toContain(day(2));
    expect(summary.missing.days).not.toContain(today());
  });

  it("leaves the company's own holidays out of the missing days, not another company's", async () => {
    const mine = await job();
    const theirs = await job();
    for (const j of [mine, theirs]) {
      await call(j.dr, { method: "POST", as: j.as, expect: 201, json: { reportDate: day(14) } });
      await call(j.dr, { method: "POST", as: j.as, expect: 201, json: { reportDate: day(2) } });
    }
    const isWeekday = (iso: string) => ![0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
    const holiday = [3, 4, 5].map(day).find(isWeekday) as string;
    await call(`/api/orgs/${mine.orgId}/schedule/holidays`, {
      method: "POST",
      as: mine.as,
      expect: 201,
      json: { holidays: [{ on: holiday, name: "Shop day" }] },
    });
    const a = (await call<DailyReportLogDto>(mine.dr, { as: mine.as })).summary.missing;
    const b = (await call<DailyReportLogDto>(theirs.dr, { as: theirs.as })).summary.missing;
    expect(a.days).not.toContain(holiday);
    expect(a.holidays).toEqual([{ on: holiday, name: "Shop day" }]);
    expect(a.total).toBe(b.total - 1);
    expect(b.days).toContain(holiday);
    expect(b.holidays).toEqual([]);
  });

  it("downloads one report or a range as PDF, and the log as CSV", async () => {
    const { dr, as } = await job();
    const a = await call<DailyReportDto>(dr, {
      method: "POST",
      as,
      expect: 201,
      json: { ...report(day(3)), notes: '=HYPERLINK("http://x")' },
    });
    await call(dr, { method: "POST", as, expect: 201, json: report(day(1)) });

    const one = await api(`${dr}/${a.id}/report.pdf`, { as });
    expect(one.status).toBe(200);
    expect(one.headers.get("Content-Type")).toBe("application/pdf");
    expect(one.headers.get("Content-Disposition")).toContain(
      `daily-report-${day(3)}-mesa-clinic-ti.pdf`,
    );
    const bytes = new Uint8Array(await one.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const range = await api(`${dr}/range.pdf?from=${day(7)}&to=${today()}`, { as });
    expect(range.status).toBe(200);
    expect(range.headers.get("Content-Disposition")).toContain(
      `daily-reports-${day(3)}-to-${day(1)}`,
    );
    // An empty range, a reversed one and one over three months are refused with the reason.
    expect((await api(`${dr}/range.pdf?from=${day(30)}&to=${day(20)}`, { as })).status).toBe(404);
    expect((await api(`${dr}/range.pdf?from=${day(1)}&to=${day(3)}`, { as })).status).toBe(400);
    expect((await api(`${dr}/range.pdf?from=${day(200)}&to=${today()}`, { as })).status).toBe(400);

    const csv = await api(`${dr}/log.csv`, { as });
    expect(csv.status).toBe(200);
    const text = await csv.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toMatch(/^Date,Day,Weather,High F,Low F,Hours lost,Workers,Man-hours,Crew/);
    // Oldest first; the own crew is named after the company; a formula is neutralised.
    expect(text.indexOf(day(3))).toBeLessThan(text.indexOf(day(1)));
    expect(text).toContain("Lift operator 1 x 6.5 h");
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(text).not.toMatch(/,=HYPERLINK/);
  });

  it("lets viewers read but not write, and keeps other companies out", async () => {
    const { dr, as, orgId } = await job();
    const a = await call<DailyReportDto>(dr, {
      method: "POST",
      as,
      expect: 201,
      json: report(day(1)),
    });
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    const seen = await call<DailyReportLogDto>(dr, { as: viewer.id });
    expect(seen.items).toHaveLength(1);
    expect(seen.canEdit).toBe(false);
    expect((await api(`${dr}/${a.id}/report.pdf`, { as: viewer.id })).status).toBe(200);
    expect((await api(dr, { method: "POST", as: viewer.id, json: report(day(2)) })).status).toBe(
      403,
    );
    expect(
      (await api(`${dr}/${a.id}`, { method: "PATCH", as: viewer.id, json: { notes: "x" } })).status,
    ).toBe(403);
    expect((await api(`${dr}/${a.id}`, { method: "DELETE", as: viewer.id })).status).toBe(403);

    const other = await setupTenant("owner");
    for (const [path, method] of [
      [dr, "GET"],
      [`${dr}/log.csv`, "GET"],
      [`${dr}/${a.id}/report.pdf`, "GET"],
      [`${dr}/${a.id}`, "DELETE"],
    ] as const) {
      expect((await api(path, { method, as: other.userId })).status, path).toBe(404);
    }
    // Their own job, our report's id: not found.
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "Theirs", gcName: "GC", originalContractSumCents: 1 },
    });
    const theirDr = `/api/orgs/${other.orgId}/projects/${theirs.id}/daily-reports`;
    expect(
      (await api(`${theirDr}/${a.id}`, { method: "PATCH", as: other.userId, json: { notes: "x" } }))
        .status,
    ).toBe(404);
    expect((await api(`${theirDr}/${a.id}/report.pdf`, { as: other.userId })).status).toBe(404);
    expect((await call<DailyReportLogDto>(dr, { as })).items[0]?.notes).toBeNull();
  });
});
