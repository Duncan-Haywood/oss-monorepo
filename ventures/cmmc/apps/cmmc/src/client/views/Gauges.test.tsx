// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgInfo } from "../lib/types";
import { type GaugesResponse, GaugesView } from "./Gauges";

const info = (quality: boolean, role: OrgInfo["role"] = "owner"): OrgInfo =>
  ({
    org: { id: "org_1", name: "Acme" },
    role,
    profile: { targetLevel: 2 },
    plan: { key: quality ? "quality" : "level2", name: "Plan", level2: true, quality },
  }) as unknown as OrgInfo;

const pairs = <K extends string>(rows: readonly (readonly [K, string])[]) =>
  rows.map(([key, label]) => ({ key, label }));

const response: GaugesResponse = {
  today: "2026-11-28",
  items: [
    {
      id: "gau_1",
      tag: "CAL-014",
      description: "0-6 in digital caliper",
      kind: "caliper",
      manufacturer: "",
      serial: "",
      range: "",
      location: "Inspection bench",
      owner: "company",
      assignedTo: "",
      status: "active",
      intervalMonths: 12,
      method: "",
      notes: "",
      lastCalibratedOn: "2025-10-01",
      dueOn: "2026-10-01",
      state: "overdue",
      issues: [
        {
          kind: "gap",
          text: "Calibration was due 2026-10-01: pull it from use until it is calibrated.",
        },
      ],
      calibrations: 1,
    },
  ],
  check: {
    total: 1,
    inUse: 1,
    current: 0,
    dueSoon: 0,
    overdue: 1,
    never: 0,
    openOutOfTolerance: 0,
  },
  due: [
    {
      gaugeId: "gau_1",
      tag: "CAL-014",
      description: "0-6 in digital caliper",
      state: "overdue",
      dueOn: "2026-10-01",
    },
  ],
  kinds: pairs([
    ["caliper", "Caliper"],
    ["micrometer", "Micrometer"],
  ] as const),
  statuses: pairs([
    ["active", "In use"],
    ["reference_only", "Reference only"],
  ] as const),
  owners: pairs([["company", "Company"]] as const),
  performers: pairs([
    ["external", "Outside lab"],
    ["in_house", "In house"],
  ] as const),
  asFound: pairs([
    ["in_tolerance", "In tolerance"],
    ["out_of_tolerance", "Out of tolerance"],
  ] as const),
  asLeft: pairs([["returned", "Back in use, no adjustment"]] as const),
  intervals: [6, 12],
  dueSoonDays: 30,
};

function setup(quality: boolean, role: OrgInfo["role"] = "owner") {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return ok({});
      }
      if (url.endsWith("/gauges")) return ok(response);
      if (url.endsWith("/calibrations")) return ok({ items: [] });
      if (url.endsWith("/evidence")) return ok({ items: [] });
      return new Response("{}", { status: 404 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GaugesView orgId="org_1" info={info(quality, role)} onUpgrade={() => {}} />
    </QueryClientProvider>,
  );
  return { posts };
}

afterEach(() => vi.unstubAllGlobals());

describe("GaugesView", () => {
  it("lists gauges with their state, the gaps and the recall list", async () => {
    setup(true);
    expect(await screen.findAllByText("CAL-014")).toHaveLength(2);
    expect(screen.getByText("Overdue (due 2026-10-01)")).toBeTruthy();
    expect(screen.getAllByText(/pull it from use/).length).toBeGreaterThan(0);
    expect(screen.getByText("Recall list")).toBeTruthy();
    expect(screen.getByText("Download CSV")).toBeTruthy();
  });

  it("records a calibration from the gauge's panel", async () => {
    const { posts } = setup(true);
    await screen.findByText("Overdue (due 2026-10-01)");
    fireEvent.click(screen.getByText("Calibrations"));
    await screen.findByText("No calibrations recorded.");
    fireEvent.change(screen.getByLabelText(/^By/), { target: { value: "Acme Cal Lab" } });
    fireEvent.change(screen.getByLabelText("Certificate number"), {
      target: { value: "C-1" },
    });
    fireEvent.click(screen.getByText("Record calibration"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.url).toBe("/api/orgs/org_1/gauges/gau_1/calibrations");
    expect(posts[0]?.body).toMatchObject({
      calibratedOn: "2026-11-28",
      performer: "external",
      performedBy: "Acme Cal Lab",
      certificateNo: "C-1",
      asFound: "in_tolerance",
    });
  });

  it("is read only without the quality plan", async () => {
    setup(false);
    await screen.findByText("Read only on this plan");
    expect(screen.queryByText("Add a gauge")).toBeNull();
    expect(await screen.findByText("History")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
