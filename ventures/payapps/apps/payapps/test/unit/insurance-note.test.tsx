// @vitest-environment happy-dom
// The pay application's insurance note and the Projects page alert, from the certificate list.
import type { InsuranceCertificateDto, InsuranceListDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  HoldersPanel,
  InsuranceAlert,
  InsuranceBackupOffer,
  PayAppInsuranceNote,
  statusText,
} from "../../src/client/pages/insurance";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cert = (over: Partial<InsuranceCertificateDto> = {}): InsuranceCertificateDto => ({
  id: "ins_1",
  kind: "general_liability",
  label: null,
  carrier: null,
  policyNumber: null,
  effectiveOn: null,
  expiresOn: "2027-01-31",
  notes: null,
  archived: false,
  name: "General liability",
  status: "current",
  daysLeft: 60,
  updatedAt: "2026-11-01T00:00:00.000Z",
  files: [],
  holders: [],
  eachOccurrenceCents: null,
  aggregateCents: null,
  additionalInsured: false,
  waiverOfSubrogation: false,
  primaryNoncontributory: false,
  ...over,
});

async function mount(list: InsuranceListDto, ui: ReactNode) {
  const fetchMock = vi.fn(async (_url: string) => Response.json(list));
  vi.stubGlobal("fetch", fetchMock);
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        {ui}
        <p>loaded</p>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  await screen.findByText("loaded");
  return fetchMock;
}

it("warns a draft dated after a certificate's expiry, and not about archived ones", async () => {
  const fetchMock = await mount(
    {
      today: "2026-12-01",
      items: [
        cert({ id: "gl", expiresOn: "2027-01-31" }),
        cert({
          id: "old",
          kind: "auto",
          name: "Commercial auto",
          expiresOn: "2026-12-01",
          archived: true,
        }),
      ],
    },
    <PayAppInsuranceNote orgId="org_1" applicationDate="2027-02-01" />,
  );
  expect(await screen.findByText(/General liability certificate expired 2027-01-31/)).toBeTruthy();
  expect(screen.queryByText(/Commercial auto/)).toBeNull();
  expect(screen.getByRole("link", { name: "Update certificates" })).toBeTruthy();
  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/orgs/org_1/insurance");
});

it("says nothing on a pay application when every certificate runs well past its date", async () => {
  await mount(
    { today: "2026-12-01", items: [cert({ expiresOn: "2027-06-30" })] },
    <PayAppInsuranceNote orgId="org_1" applicationDate="2026-12-01" />,
  );
  expect(screen.queryByRole("heading", { name: "Insurance certificates" })).toBeNull();
});

it("lists expired and expiring certificates on the Projects page", async () => {
  await mount(
    {
      today: "2026-12-01",
      items: [
        cert({
          id: "a",
          name: "Commercial auto",
          status: "expired",
          daysLeft: -3,
          expiresOn: "2026-11-28",
        }),
        cert({ id: "b", status: "expiring", daysLeft: 12, expiresOn: "2026-12-13" }),
        cert({ id: "c", name: "Umbrella / excess", status: "current" }),
      ],
    },
    <InsuranceAlert orgId="org_1" />,
  );
  const note = await screen.findByRole("status");
  expect(note.textContent).toContain("Commercial auto: expired 3 days ago (2026-11-28)");
  expect(note.textContent).toContain("General liability: expires in 12 days (2026-12-13)");
  expect(note.textContent).not.toContain("Umbrella");
});

it("words the status", () => {
  expect(statusText({ status: "expired", daysLeft: 0 })).toBe("Expires today");
  expect(statusText({ status: "expiring", daysLeft: 1 })).toBe("Expires in 1 day");
  expect(statusText({ status: "current", daysLeft: 90 })).toBe("Current");
});

const pdf = (id: string, fileName: string) => ({
  id,
  fileName,
  contentType: "application/pdf",
  sizeBytes: 10,
  category: "backup" as const,
  createdAt: "2026-11-01T00:00:00.000Z",
});

function routed(list: InsuranceListDto, role: string, onApp: { fileName: string }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/me") {
        return Response.json({ user: { id: "u" }, memberships: [{ orgId: "org_1", role }] });
      }
      if (url.endsWith("/from-insurance")) return Response.json(pdf("att_9", "x"), { status: 201 });
      if (url.endsWith("/attachments")) return Response.json({ items: onApp });
      return Response.json(list);
    }),
  );
  return calls;
}

function mountOffer(projectId?: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        <InsuranceBackupOffer
          orgId="org_1"
          base="/api/orgs/org_1/projects/p/pay-apps/a"
          projectId={projectId}
        />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
}

it("offers active certificates' files for the pay app's backup, and copies one", async () => {
  const calls = routed(
    {
      today: "2026-12-01",
      items: [
        cert({ id: "gl", files: [pdf("f1", "ACORD 25.pdf")] }),
        cert({ id: "wc", name: "Workers' compensation", files: [pdf("f2", "WC cert.pdf")] }),
        cert({ id: "old", archived: true, files: [pdf("f3", "Old cert.pdf")] }),
      ],
    },
    "editor",
    [{ fileName: "WC cert.pdf" }],
  );
  mountOffer();
  expect(await screen.findByText("Insurance certificates on file")).toBeTruthy();
  expect(screen.queryByText(/Old cert.pdf/)).toBeNull();
  // Already on the pay app (same file name): not offered again.
  expect(await screen.findByText("In the backup")).toBeTruthy();
  const buttons = screen.getAllByRole("button", { name: "Add to backup" });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0] as HTMLElement);
  await waitFor(() => expect(screen.getAllByText("In the backup")).toHaveLength(2));
  const post = calls.find((c) => c.url.endsWith("/from-insurance"));
  expect(post?.url).toBe("/api/orgs/org_1/projects/p/pay-apps/a/attachments/from-insurance");
  expect(JSON.parse(String(post?.init?.body))).toEqual({ certificateId: "gl", fileId: "f1" });
});

it("shows viewers no offer", async () => {
  const calls = routed(
    { today: "2026-12-01", items: [cert({ files: [pdf("f1", "ACORD 25.pdf")] })] },
    "viewer",
    [],
  );
  mountOffer();
  await waitFor(() => expect(calls.some((c) => c.url === "/api/me")).toBe(true));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("Insurance certificates on file")).toBeNull();
});

const holder = (projectId: string, projectName: string, gcName: string, sentOn: string | null) => ({
  projectId,
  projectName,
  gcName,
  sentOn,
});

it("says on a pay app which certificates its GC holds, once holders are recorded", async () => {
  routed(
    {
      today: "2026-12-01",
      items: [
        cert({
          id: "gl",
          files: [pdf("f1", "ACORD 25.pdf")],
          holders: [holder("p", "Clinic TI", "Sierra Builders", "2026-06-01")],
        }),
        cert({ id: "wc", name: "Workers' compensation", kind: "workers_comp" }),
      ],
    },
    "editor",
    [],
  );
  mountOffer("p");
  expect(await screen.findByText(/GC has it \(sent 2026-06-01\)/)).toBeTruthy();
  expect(
    screen.getByText(/Not recorded as sent to this job's GC: Workers' compensation\./),
  ).toBeTruthy();
});

it("says nothing about holders when none are recorded anywhere", async () => {
  routed(
    { today: "2026-12-01", items: [cert({ files: [pdf("f1", "ACORD 25.pdf")] })] },
    "editor",
    [],
  );
  mountOffer("p");
  expect(await screen.findByText("Insurance certificates on file")).toBeTruthy();
  expect(screen.queryByText(/Not recorded as sent/)).toBeNull();
  expect(screen.queryByText(/GC has it/)).toBeNull();
});

const project = (id: string, name: string, gcName: string, status = "active") =>
  ({ id, name, gcName, status }) as unknown as import("@shared/api/types").ProjectDto;

function mountHolders(c: InsuranceCertificateDto, all: InsuranceCertificateDto[], canEdit = true) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/holders")) return Response.json({ holders: [] });
      return Response.json({
        items: [
          project("p1", "School", "Peak GC"),
          project("p2", "Clinic TI", "Sierra Builders"),
          project("p3", "Old job", "Sierra Builders", "closed"),
        ],
      });
    }),
  );
  const saved = vi.fn();
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        <HoldersPanel orgId="org_1" cert={c} all={all} canEdit={canEdit} onSaved={saved} />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  return { calls, saved };
}

it("saves the ticked jobs with their sent dates, open jobs first", async () => {
  const c = cert({ id: "gl" });
  const { calls, saved } = mountHolders(c, [c]);
  const boxes = await screen.findAllByRole("checkbox");
  expect(boxes.map((b) => b.parentElement?.textContent)).toEqual([
    "Sierra Builders (Clinic TI)",
    "Peak GC (School)",
    "Sierra Builders (Old job, closed)",
  ]);
  fireEvent.click(boxes[0] as HTMLElement);
  fireEvent.change(screen.getByLabelText("Date sent to Sierra Builders for Clinic TI"), {
    target: { value: "2026-06-01" },
  });
  fireEvent.click(boxes[1] as HTMLElement);
  fireEvent.click(screen.getByRole("button", { name: "Save jobs" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  const put = calls.find((x) => x.url.endsWith("/holders"));
  expect(put?.url).toBe("/api/orgs/org_1/insurance/gl/holders");
  expect(put?.init?.method).toBe("PUT");
  expect(JSON.parse(String(put?.init?.body))).toEqual({
    holders: [
      { projectId: "p2", sentOn: "2026-06-01" },
      { projectId: "p1", sentOn: null },
    ],
  });
});

it("offers a renewal the jobs of the archived certificate it replaces", async () => {
  const old = cert({
    id: "old",
    archived: true,
    expiresOn: "2026-06-30",
    holders: [holder("p1", "School", "Peak GC", "2025-07-01")],
  });
  const renewal = cert({ id: "new", expiresOn: "2027-06-30" });
  mountHolders(renewal, [renewal, old]);
  const same = await screen.findByRole("button", {
    name: "Same jobs as the archived General liability (expired 2026-06-30)",
  });
  await screen.findAllByRole("checkbox");
  fireEvent.click(same);
  const school = screen.getByRole("checkbox", { name: "Peak GC (School)" }) as HTMLInputElement;
  expect(school.checked).toBe(true);
});

it("shows viewers the list, not the form", async () => {
  const c = cert({ holders: [holder("p1", "School", "Peak GC", "2026-06-01")] });
  mountHolders(c, [c], false);
  expect(await screen.findByText("Peak GC (School), sent 2026-06-01")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save jobs" })).toBeNull();
});
