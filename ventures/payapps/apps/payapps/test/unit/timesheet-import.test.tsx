// @vitest-environment happy-dom
// "Hours from a time report" on the certified payroll page (src/shared/certified-payroll-import.ts).
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TimesheetImport } from "../../src/client/components/timesheet-import";
import { blankRow, blankWorker } from "../../src/client/pages/certified-payroll";

afterEach(() => vi.unstubAllGlobals());

const CSV = [
  "Time Activities by Employee Detail",
  "Activity Date,Employee,Customer,Service,Duration",
  '11/16/2026,"Lopez, Ana",VA Clinic,Electrician,8',
  '11/17/2026,"Lopez, Ana",VA Clinic,Electrician,9',
  "11/17/2026,Ben Ortiz,VA Clinic,Laborer,6",
  "11/17/2026,Ben Ortiz,Library,Laborer,2",
].join("\n");

it("reads a by-day report for this job, previews it and fills the form without a request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const ana = blankWorker();
  ana.lastName = "Lopez";
  ana.firstName = "Ana";
  const anaRow = ana.rows[0];
  if (anaRow) {
    anaRow.classification = "Electrician";
    anaRow.stRateCents = 4_200;
  }
  const onFill = vi.fn();
  render(
    <TimesheetImport
      weekEnding="2026-11-21"
      projectName="VA Clinic"
      workers={[ana]}
      make={{ worker: blankWorker, row: blankRow }}
      onFill={onFill}
    />,
  );
  const file = new File([CSV], "time.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Time report"), { target: { files: [file] } });
  expect(await screen.findByText(/header on row 2/)).toBeTruthy();
  // The job is preselected from the job's name, so the Library row is left out.
  expect((screen.getByLabelText("Job in the report") as unknown as HTMLSelectElement).value).toBe(
    "VA Clinic",
  );
  expect(screen.getByText(/2 workers with hours this week; 1 rows of other jobs/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fill the week's hours" }));
  expect(onFill).toHaveBeenCalledTimes(1);
  const [workers] = onFill.mock.calls[0] as [ReturnType<typeof blankWorker>[]];
  expect(workers).toHaveLength(2);
  expect(workers[0]?.rows[0]).toMatchObject({
    classification: "Electrician",
    stRateCents: 4_200,
    st: [0, 800, 900, 0, 0, 0, 0],
  });
  expect(workers[1]).toMatchObject({ lastName: "Ortiz", firstName: "Ben" });
  expect(workers[1]?.rows[0]).toMatchObject({ classification: "Laborer" });
  expect(screen.getByRole("status").textContent).toMatch(/1 worker matched, 1 added/);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses a report dated by pay date and does not fill", async () => {
  const onFill = vi.fn();
  render(
    <TimesheetImport
      weekEnding="2026-11-21"
      projectName="VA Clinic"
      workers={[]}
      make={{ worker: blankWorker, row: blankRow }}
      onFill={onFill}
    />,
  );
  const file = new File(["Check Date,Employee,Hours\n11/21/2026,Ana Lopez,40"], "pay.csv");
  fireEvent.change(screen.getByLabelText("Time report"), { target: { files: [file] } });
  expect(await screen.findByText(/one date per pay period/)).toBeTruthy();
  const button = screen.getByRole("button", {
    name: "Fill the week's hours",
  }) as unknown as HTMLButtonElement;
  expect(button.disabled).toBe(true);
});
