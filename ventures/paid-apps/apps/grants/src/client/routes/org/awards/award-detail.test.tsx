// @vitest-environment happy-dom
import { makeFact } from "@client/components/application/test-fixtures";
import type { AwardListItem, AwardReportDetail, AwardReportDto } from "@shared/api/awards";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  PromisedVsAchievedTable,
  ReportGaps,
  ReportSchedule,
  ReportSections,
  reportCitationContext,
} from "./award-detail";
import { AwardsTable, dueLabel } from "./awards";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/mock" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ orgId: "org_1", awardId: "awd_1" }),
}));

const reportRow = (over: Partial<AwardReportDto> = {}): AwardReportDto => ({
  id: "rpt_1",
  orgId: "org_1",
  awardId: "awd_1",
  kind: "interim",
  periodStart: "2027-01-01",
  periodEnd: "2027-07-02",
  dueAt: "2027-07-02T00:00:00.000Z",
  status: "in_review",
  versionContent: null,
  versionNumber: 1,
  groundingReport: null,
  flags: [],
  checkinInterviewIds: ["int_1"],
  submittedAt: null,
  submittedRef: null,
  submittedBy: null,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
  ...over,
});

const award = {
  id: "awd_1",
  orgId: "org_1",
  applicationId: "app_1",
  projectId: null,
  title: "Carpentry Pathways",
  funderName: "Acme Foundation",
  amountCents: 5_000_000,
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  grantNumber: "AF-14",
  termsNotes: "",
  factId: "fct_award",
  createdBy: null,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
};

const enrolled = makeFact({
  id: "fct_enrolled",
  statement: "The organization enrolled 52 youth between January and May 2027.",
  category: "outcome",
  asOf: "2027-05",
});

function makeReport(over: Partial<AwardReportDetail> = {}): AwardReportDetail {
  return {
    ...reportRow(),
    versionContent: {
      sections: [
        {
          key: "outcomes",
          title: "Outcomes and metrics",
          paragraphs: [
            {
              id: "r3.p1",
              claims: [
                {
                  id: "r3.p1.c1",
                  text: "We enrolled 52 youth.",
                  kind: "factual",
                  factIds: ["fct_enrolled"],
                },
              ],
            },
          ],
          gaps: [
            { question: 'What result did you achieve for "We will place 40 graduates"?', why: "x" },
          ],
        },
      ],
      comparisons: [
        {
          goalId: "g1",
          promised: "We will place 40 graduates in construction jobs.",
          sourceClaimId: "s2.p1.c1",
          achieved: null,
          status: "unknown",
          factIds: [],
        },
        {
          goalId: "g2",
          promised: "We will enroll 60 youth.",
          sourceClaimId: "s2.p1.c2",
          achieved: "We enrolled 52 youth.",
          status: "partially_met",
          factIds: ["fct_enrolled"],
        },
      ],
    },
    award,
    citedFacts: [enrolled],
    gaps: [
      {
        sectionKey: "outcomes",
        question: 'What result did you achieve for "We will place 40 graduates"?',
        why: "x",
      },
    ],
    checkinInterview: { id: "int_1", status: "active", title: "Report check-in" },
    ...over,
  };
}

describe("PromisedVsAchievedTable", () => {
  it("shows achieved results with citations and leaves unknown results blank", () => {
    const report = makeReport();
    const ctx = reportCitationContext("org_1", report);
    render(
      <PromisedVsAchievedTable comparisons={report.versionContent?.comparisons ?? []} ctx={ctx} />,
    );
    const table = screen.getByRole("table", { name: "Promised vs. achieved" });
    const [, unknownRow, metRow] = within(table).getAllByRole("row");
    expect(unknownRow).toHaveTextContent("We will place 40 graduates in construction jobs.");
    expect(unknownRow).toHaveTextContent("No fact dated in this period shows the result yet.");
    expect(unknownRow).toHaveTextContent("No result on file");
    expect(
      within(unknownRow as HTMLElement).queryByRole("button", { name: /citation/i }),
    ).toBeNull();
    expect(metRow).toHaveTextContent("We enrolled 52 youth.");
    expect(metRow).toHaveTextContent("Partly met");
    // Same fact as the narrative claim -> same citation number.
    expect(
      within(metRow as HTMLElement).getByRole("button", { name: "View citation 1" }),
    ).toBeTruthy();
  });
});

describe("ReportGaps", () => {
  it("lists open questions and links to the report check-in", () => {
    render(<ReportGaps orgId="org_1" report={makeReport()} />);
    expect(screen.getByText("1 question only your team can answer")).toBeTruthy();
    expect(screen.getByText(/We will place 40 graduates/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Answer in a check-in/ })).toBeTruthy();
  });

  it("renders nothing when there are no gaps", () => {
    const { container } = render(<ReportGaps orgId="org_1" report={makeReport({ gaps: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ReportSections", () => {
  it("edits a section and saves the rebuilt claims, keeping citations of unchanged sentences", async () => {
    const report = makeReport();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ReportSections
        report={report}
        ctx={reportCitationContext("org_1", report)}
        canEdit
        onSaveSection={onSave}
      />,
    );
    expect(screen.getByRole("button", { name: "View citation 1" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Edit Outcomes and metrics" }));
    const box = screen.getByLabelText("Paragraph 1");
    await userEvent.type(box, " We trained 9 mentors.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [key, paragraphs] = onSave.mock.calls[0] ?? [];
    expect(key).toBe("outcomes");
    expect(paragraphs[0].claims[0]).toMatchObject({ id: "r3.p1.c1", factIds: ["fct_enrolled"] });
    // A new sentence with a number is an uncited factual claim (the verifier will flag it).
    expect(paragraphs[0].claims[1]).toMatchObject({
      text: "We trained 9 mentors.",
      kind: "factual",
      factIds: [],
    });
  });
});

describe("awards list + schedule", () => {
  it("shows each award's next report and how soon it is due", () => {
    const now = new Date("2027-06-20T00:00:00Z");
    expect(dueLabel("2027-07-02T00:00:00Z", now)).toEqual({
      text: "Due in 12 days",
      tone: "warning",
    });
    expect(dueLabel("2027-06-18T00:00:00Z", now).tone).toBe("danger");
    const item: AwardListItem = { ...award, reports: [reportRow()], nextReport: reportRow() };
    render(<AwardsTable orgId="org_1" items={[item]} />);
    expect(screen.getByRole("link", { name: "Carpentry Pathways" })).toHaveAttribute(
      "href",
      "/orgs/org_1/awards/awd_1",
    );
    expect(screen.getByText("Interim report")).toBeTruthy();
    expect(screen.getByText("$50,000")).toBeTruthy();
  });

  it("selects a report from the schedule", async () => {
    const onSelect = vi.fn();
    render(
      <ReportSchedule
        reports={[reportRow(), reportRow({ id: "rpt_2", kind: "final", status: "upcoming" })]}
        selectedId="rpt_1"
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onSelect).toHaveBeenCalledWith("rpt_2");
  });
});
