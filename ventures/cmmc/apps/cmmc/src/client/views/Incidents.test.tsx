// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgInfo } from "../lib/types";
import {
  clockLine,
  fromLocalInput,
  type IncidentItem,
  type IncidentsResponse,
  IncidentsView,
  toLocalInput,
} from "./Incidents";

const info = (role: OrgInfo["role"] = "owner"): OrgInfo =>
  ({
    org: { id: "org_1", name: "Acme" },
    role,
    profile: { targetLevel: 1 },
    plan: { key: "free", name: "Level 1", level2: false, quality: false },
  }) as unknown as OrgInfo;

const item: IncidentItem = {
  id: "inc_1",
  title: "Phished mailbox",
  clause: "yes",
  affects: "cdi",
  role: "sub",
  higherTier: "Prime Aero",
  contractRef: "",
  discoveredAt: "2026-11-02T15:30:00.000Z",
  reportedAt: null,
  reportNumber: "",
  higherTierNotifiedAt: null,
  malware: "unknown",
  cloud: "unknown",
  systems: "",
  summary: "",
  steps: {},
  timeline: [{ at: "2026-11-02T16:00:00.000Z", text: "Laptop pulled off the network" }],
  closedOn: null,
  lessons: "",
  stage: "report",
  clocks: {
    reportDue: "2026-11-05T15:30:00.000Z",
    msLeft: 5 * 3_600_000,
    overdue: false,
    reportedLate: null,
    reportedAfterMs: null,
    preserveUntil: null,
    preserveMsLeft: null,
  },
  applicability: { required: true, reason: "The clause is in your contract." },
  checklist: [
    { id: "review", cite: "(c)(1)(i)", title: "Review for evidence", detail: "", done: false },
    { id: "report", cite: "(a), (c)(1)(ii)", title: "Report to DoD", detail: "", done: false },
  ],
  issues: [],
};

const response: IncidentsResponse = {
  now: "2026-11-05T10:30:00.000Z",
  items: [item],
  clauseOptions: [
    { key: "unsure", label: "Not sure yet" },
    { key: "yes", label: "Yes" },
  ],
  affectsOptions: [{ key: "unsure", label: "Not sure yet" }],
  roleOptions: [
    { key: "prime", label: "Prime contractor" },
    { key: "sub", label: "Subcontractor" },
  ],
  triOptions: [{ key: "unknown", label: "Not known yet" }],
  stageLabels: {
    report: "Report due",
    not_owed: "No 7012 report owed",
    preserve: "Keep images",
    open: "Open",
    closed: "Closed",
  },
  quotes: {
    rapidly: "“Rapidly report” means within 72 hours",
    report: "",
    preserve: "",
    malware: "",
  },
  verification: { source: "", url: "https://example.invalid", readOn: "2026-11-28", note: "Note." },
};

function setup(role: OrgInfo["role"] = "owner") {
  const sent: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (init?.method && init.method !== "GET") {
        sent.push({ method: init.method, url, body: JSON.parse(String(init.body ?? "null")) });
        return ok({ id: "inc_2" });
      }
      if (url.endsWith("/incidents")) return ok(response);
      return new Response("{}", { status: 404 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <IncidentsView orgId="org_1" info={info(role)} />
    </QueryClientProvider>,
  );
  return { sent };
}

afterEach(() => vi.unstubAllGlobals());

describe("local time round trip", () => {
  it("a datetime-local value goes to UTC and back unchanged", () => {
    const iso = fromLocalInput("2026-11-02T09:15");
    expect(iso).toMatch(/Z$/);
    expect(toLocalInput(iso)).toBe("2026-11-02T09:15");
    expect(fromLocalInput("")).toBeNull();
  });
});

describe("clockLine", () => {
  it("counts down, then says overdue, then the report and the hold", () => {
    expect(clockLine(item)).toMatch(/Report to DIBNet by .*: 5 h 0 min left\./);
    expect(
      clockLine({ ...item, clocks: { ...item.clocks, overdue: true, msLeft: -90 * 60_000 } }),
    ).toMatch(/ran out .*\(1 h 30 min ago\)\. Report now\./);
    expect(
      clockLine({
        ...item,
        stage: "preserve",
        reportedAt: "2026-11-03T10:00:00.000Z",
        clocks: {
          ...item.clocks,
          reportedAfterMs: 18.5 * 3_600_000,
          reportedLate: false,
          preserveUntil: "2027-02-01T11:00:00.000Z",
        },
      }),
    ).toMatch(/18 h 30 min after discovery, inside the 72 hours\. Keep images until at least/);
  });
});

describe("IncidentsView", () => {
  it("lists an incident with its clock, checklist and timeline; ticking a step patches it", async () => {
    const { sent } = setup();
    expect(await screen.findByText("Phished mailbox")).toBeTruthy();
    expect(screen.getByText("Report due")).toBeTruthy();
    expect(screen.getByText(/5 h 0 min left/)).toBeTruthy();
    expect(screen.getByText("Laptop pulled off the network")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Review for evidence/ }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      method: "PATCH",
      url: "/api/orgs/org_1/incidents/inc_1",
      body: { steps: { review: true } },
    });
  });

  it("records a new incident with the discovery time sent as UTC", async () => {
    const { sent } = setup();
    await screen.findByText("Phished mailbox");
    fireEvent.click(screen.getByText("Record an incident"));
    fireEvent.change(screen.getByLabelText(/What happened, in a few words/), {
      target: { value: "Ransomware on the CAM PC" },
    });
    fireEvent.change(screen.getByLabelText(/Discovered at/), {
      target: { value: "2026-11-04T08:00" },
    });
    fireEvent.click(screen.getByText("Record incident"));
    await waitFor(() => expect(sent).toHaveLength(1));
    const body = sent[0]?.body as { title: string; discoveredAt: string; reportedAt: null };
    expect(body.title).toBe("Ransomware on the CAM PC");
    expect(body.discoveredAt).toBe(new Date("2026-11-04T08:00").toISOString());
    expect(body.reportedAt).toBeNull();
  });

  it("viewers read but get no edit controls; only admins see Delete", async () => {
    setup("viewer");
    await screen.findByText("Phished mailbox");
    expect(screen.queryByText("Record an incident")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
    expect(
      (screen.getByRole("checkbox", { name: /Review for evidence/ }) as HTMLInputElement).disabled,
    ).toBe(true);
  });
});
