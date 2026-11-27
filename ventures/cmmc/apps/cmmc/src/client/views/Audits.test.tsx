// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgInfo } from "../lib/types";
import { type AuditsResponse, AuditsView } from "./Audits";

const info = (quality: boolean, role: OrgInfo["role"] = "owner"): OrgInfo =>
  ({
    org: { id: "org_1", name: "Acme" },
    role,
    profile: { targetLevel: 2 },
    plan: { key: quality ? "quality" : "level2", name: "Plan", level2: true, quality },
  }) as unknown as OrgInfo;

const response: AuditsResponse = {
  today: "2026-11-26",
  audits: [
    {
      id: "iau_1",
      title: "Q4 production audit",
      clauseIds: ["iso9001-8.5.1", "iso9001-7.1.5"],
      process: "",
      plannedOn: "2026-11-20",
      auditorUserId: null,
      auditorName: "Jordan Lee",
      status: "done",
      completedOn: "2026-11-21",
      summary: "Two cells sampled.",
      timing: "none",
      findings: [
        {
          id: "afn_1",
          auditId: "iau_1",
          kind: "minor",
          clauseId: "iso9001-7.1.5",
          description: "Micrometer M-14 past its calibration date.",
          evidence: "Job 4471",
          correctiveActionId: null,
          correctiveActionRef: null,
        },
      ],
    },
  ],
  correctiveActions: [
    {
      id: "cap_1",
      ref: "CA-0001",
      source: "customer_complaint",
      findingId: null,
      auditId: null,
      clauseId: null,
      nonconformity: "Burrs on 40 brackets, PO 1182.",
      containment: "",
      rootCause: "Deburr step skipped on second shift.",
      action: "Deburr added to the traveller with a sign-off.",
      ownerUserId: null,
      raisedOn: "2026-10-01",
      dueOn: "2026-10-15",
      completedOn: "2026-10-10",
      verifyDueOn: "2026-11-20",
      verifiedOn: null,
      verifiedByName: "",
      effective: null,
      verificationNotes: "",
      closedOn: null,
      stage: "verify",
      issues: [
        {
          targetId: "cap_1",
          kind: "gap",
          message: "CA-0001: check that the action worked was due 2026-11-20.",
        },
      ],
    },
  ],
  coverage: [],
  check: {
    audits: { planned: 0, done: 1, overdue: 0 },
    clauses: { applicable: 47, covered: 2, uncovered: [] },
    correctiveActions: { open: 1, closed: 0, overdue: 0, notEffective: 0 },
    issues: [
      {
        targetId: "afn_1",
        kind: "gap",
        message:
          "Q4 production audit: a minor nonconformity against 7.1.5 has no corrective action.",
      },
    ],
  },
  findingKinds: [
    { key: "major", label: "Major nonconformity" },
    { key: "minor", label: "Minor nonconformity" },
    { key: "observation", label: "Observation" },
    { key: "improvement", label: "Opportunity for improvement" },
  ],
  sources: [
    { key: "internal_audit", label: "Internal audit" },
    { key: "customer_complaint", label: "Customer complaint" },
    { key: "process", label: "Found in the shop (inspection, process)" },
  ],
  stages: [
    { key: "cause", label: "Find the cause" },
    { key: "action", label: "Take the action" },
    { key: "verify", label: "Check it worked" },
    { key: "not_effective", label: "Did not work: new action" },
    { key: "closed", label: "Closed" },
  ],
  coverageMonths: 12,
};

function setup(quality: boolean, role: OrgInfo["role"] = "owner") {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
        return ok({ id: "x" });
      }
      if (url.endsWith("/audits")) return ok(response);
      if (url.endsWith("/members")) return ok({ items: [] });
      return new Response("{}", { status: 404 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuditsView orgId="org_1" info={info(quality, role)} onUpgrade={() => {}} />
    </QueryClientProvider>,
  );
  return { posts };
}

afterEach(() => vi.unstubAllGlobals());

describe("AuditsView", () => {
  it("shows the programme, its gaps and the log", async () => {
    setup(true);
    expect(await screen.findByText("Q4 production audit")).toBeTruthy();
    expect(screen.getByText(/2 of 47 applicable clauses covered/)).toBeTruthy();
    expect(screen.getByText(/has no corrective action/)).toBeTruthy();
    expect(screen.getByText("CA-0001")).toBeTruthy();
    expect(screen.getByText(/check that the action worked was due/)).toBeTruthy();
    expect(screen.getByText("Download log (CSV)")).toBeTruthy();
  });

  it("opens a corrective action from a finding and records a check", async () => {
    const { posts } = setup(true);
    fireEvent.click(await screen.findByText("Open"));
    fireEvent.click(await screen.findByText("Open a corrective action"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.url).toContain("/audits/iau_1/findings/afn_1/corrective-action");

    fireEvent.click(screen.getAllByText("Check it worked").at(-1) as HTMLElement);
    fireEvent.change(screen.getByLabelText(/What was checked/), {
      target: { value: "20 lots, no burrs." },
    });
    fireEvent.click(screen.getByText("Record the check"));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]?.body).toMatchObject({ effective: true, notes: "20 lots, no burrs." });
  });

  it("is read only without the quality plan", async () => {
    setup(false);
    expect(await screen.findByText("Read only on this plan")).toBeTruthy();
    expect(screen.queryByText("Plan an audit")).toBeNull();
    expect(screen.queryByText("Log a corrective action")).toBeNull();
  });
});
