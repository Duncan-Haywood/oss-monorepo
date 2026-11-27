// @vitest-environment happy-dom
// "Fill hours from PayApps timesheets" on the certified payroll page (src/shared/timesheet-certified.ts).
import type { TimesheetCertifiedHours } from "@shared/timesheet-certified";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TimesheetFill } from "../../src/client/components/timesheet-fill";
import { blankRow, blankWorker } from "../../src/client/pages/certified-payroll";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

it("reads the job's week from the timesheets and fills the form", async () => {
  const hours: TimesheetCertifiedHours = {
    weekEnding: "2026-11-28",
    workweeksRead: ["2026-11-22", "2026-11-29"],
    aligned: false,
    entries: [
      {
        lastName: "Lopez",
        firstName: "Ana",
        mi: "",
        classification: "Electrician",
        st: [0, 800, 800, 800, 800, 800, 0],
        ot: [0, 0, 0, 0, 0, 0, 200],
        rows: 6,
      },
    ],
    otherJobs: [{ name: "Ana Lopez", hundredths: 400 }],
    noTrade: [],
  };
  const fetchMock = vi.fn(async (_url: string) => json(hours));
  vi.stubGlobal("fetch", fetchMock);
  const ana = blankWorker();
  ana.lastName = "Lopez";
  ana.firstName = "Ana";
  const onFill = vi.fn();
  render(
    <TimesheetFill
      orgId="o1"
      projectId="p1"
      weekEnding="2026-11-28"
      workers={[ana]}
      make={{ worker: blankWorker, row: blankRow }}
      onFill={onFill}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Fill hours from PayApps timesheets" }));
  const status = await screen.findByRole("status");
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
    "/api/orgs/o1/projects/p1/certified-payroll/timesheet-hours?weekEnding=2026-11-28",
  );
  expect(status.textContent).toContain("40 hours straight time and 2 overtime");
  expect(status.textContent).toContain("1 worker matched, 0 added");
  expect(status.textContent).toContain("workweeks ending 2026-11-22 and 2026-11-29");
  expect(status.textContent).toContain("Ana Lopez 4 h");
  const [workers] = onFill.mock.calls[0] ?? [];
  expect(workers[0].rows[0]).toMatchObject({
    classification: "Electrician",
    st: [0, 800, 800, 800, 800, 800, 0],
    ot: [0, 0, 0, 0, 0, 0, 200],
  });
});

it("changes nothing when the job has no timesheet hours that week", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json({
        weekEnding: "2026-11-28",
        workweeksRead: [],
        aligned: true,
        entries: [],
        otherJobs: [],
        noTrade: [],
      }),
    ),
  );
  const onFill = vi.fn();
  render(
    <TimesheetFill
      orgId="o1"
      projectId="p1"
      weekEnding="2026-11-28"
      workers={[]}
      make={{ worker: blankWorker, row: blankRow }}
      onFill={onFill}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Fill hours from PayApps timesheets" }));
  expect((await screen.findByRole("status")).textContent).toContain("No hours on this job");
  expect(onFill).not.toHaveBeenCalled();
});
