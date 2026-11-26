// @vitest-environment happy-dom
import type { QualityReportDto } from "@shared/quality";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QualityPanel } from "./quality-panel";
import { json, mockFetch } from "./test-fixtures";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/mock">{children}</a>,
  useNavigate: () => navigate,
  useParams: () => ({ orgId: "org_1" }),
}));

const BASE = "/api/orgs/org_1/applications/app_1/quality";

const DTO: QualityReportDto = {
  versionId: "ver_1",
  applicationId: "app_1",
  current: true,
  model: "claude-opus-5-5",
  createdAt: "2026-11-19T10:00:00.000Z",
  report: {
    versionId: "ver_1",
    overallScore: 2.5,
    maxScore: 5,
    droppedFactIds: 1,
    droppedSuggestions: 1,
    promptVersion: "quality-v1",
    checkedAt: 0,
    sections: [
      {
        sectionKey: "need",
        title: "Statement of need",
        status: "scored",
        score: 2.5,
        criteria: [
          {
            criterion: "Documented community need",
            score: 4,
            weight: 0.5,
            source: "section",
            rationale: "Specific county data supports the need.",
            strengths: ["Cites county poverty rate"],
            gaps: [],
            suggestions: [
              {
                id: "need#c1.g1",
                kind: "restructure",
                text: "Open with the county data.",
                factIds: [],
                question: null,
              },
            ],
          },
          {
            criterion: "Training outcomes",
            score: 1,
            weight: 0.5,
            source: "section",
            rationale: "Outcomes are barely mentioned.",
            strengths: [],
            gaps: ["No completion data"],
            suggestions: [
              {
                id: "need#c2.g1",
                kind: "emphasize",
                text: "Bring forward the 2025 cohort results.",
                factIds: ["fct_1"],
                question: null,
              },
              {
                id: "need#c2.g2",
                kind: "missing_evidence",
                text: "How many participants completed the program in 2025?",
                factIds: [],
                question: "How many participants completed the program in 2025?",
              },
            ],
          },
        ],
      },
    ],
  },
};

function renderPanel(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  navigate.mockReset();
});

describe("QualityPanel", () => {
  it("shows per-criterion meters, strengths, gaps and suggestions", async () => {
    mockFetch([["GET", BASE, () => DTO]]);
    renderPanel(
      <QualityPanel orgId="org_1" applicationId="app_1" currentVersionId="ver_1" canEdit />,
    );
    const overall = await screen.findByRole("meter", { name: /Overall/ });
    expect(overall).toHaveAttribute("aria-valuetext", "2.5 / 5");
    expect(screen.getByRole("meter", { name: "Documented community need" })).toHaveAttribute(
      "aria-valuenow",
      "4",
    );
    expect(screen.getByRole("meter", { name: "Training outcomes" })).toHaveAttribute(
      "aria-valuetext",
      "1 / 5",
    );
    expect(screen.getByText("Cites county poverty rate")).toBeInTheDocument();
    expect(screen.getByText("No completion data")).toBeInTheDocument();
    expect(screen.getByText(/1 suggestion was left out/)).toBeInTheDocument();
    // missing evidence is a question, not a checkbox
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Answer in an interview/ })).toBeInTheDocument();
  });

  it("applies only the selected suggestions for the section", async () => {
    const calls = mockFetch([
      ["GET", BASE, () => DTO],
      ["POST", `${BASE}/apply`, () => ({ id: "app_1", currentVersionId: "ver_2" })],
    ]);
    const user = userEvent.setup();
    renderPanel(
      <QualityPanel orgId="org_1" applicationId="app_1" currentVersionId="ver_1" canEdit />,
    );
    const applyBtn = await screen.findByRole("button", { name: /Apply selected suggestions/ });
    expect(applyBtn).toBeDisabled();
    await user.click(screen.getByLabelText(/Bring forward the 2025 cohort results/));
    expect(applyBtn).toBeEnabled();
    await user.click(applyBtn);
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      sectionKey: "need",
      suggestionIds: ["need#c2.g1"],
    });
  });

  it("opens a gap-fill interview for a missing-evidence suggestion", async () => {
    const calls = mockFetch([
      ["GET", BASE, () => DTO],
      ["POST", `${BASE}/interview`, () => json({ interviewId: "int_9", questions: 1 }, 201)],
    ]);
    const user = userEvent.setup();
    renderPanel(
      <QualityPanel orgId="org_1" applicationId="app_1" currentVersionId="ver_1" canEdit />,
    );
    const item = (await screen.findByText(/How many participants completed/)).closest("li");
    await user.click(
      within(item as HTMLElement).getByRole("button", { name: /Answer in an interview/ }),
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId: "org_1", interviewId: "int_9" },
      }),
    );
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ suggestionIds: ["need#c2.g2"] });
  });

  it("is read-only for non-editors and for a report of an older version", async () => {
    mockFetch([["GET", BASE, () => ({ ...DTO, current: false })]]);
    renderPanel(
      <QualityPanel orgId="org_1" applicationId="app_1" currentVersionId="ver_2" canEdit />,
    );
    expect(await screen.findByText("Scored an earlier version")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply selected suggestions/ })).toBeNull();
    for (const cb of screen.getAllByRole("checkbox")) expect(cb).toBeDisabled();
  });

  it("shows a pending state while no report exists (404)", async () => {
    mockFetch([]);
    renderPanel(
      <QualityPanel orgId="org_1" applicationId="app_1" currentVersionId="ver_1" canEdit />,
    );
    expect(
      await screen.findByText(/Scoring this draft against the funder's criteria/),
    ).toBeInTheDocument();
  });
});
