// @vitest-environment happy-dom
// Insurance requirements on a job (part 4): the pay application's note lists the gaps on its own date,
// and the job's panel shows each requirement met or not, from the server's check.
import type {
  InsuranceCertificateDto,
  InsuranceListDto,
  JobInsuranceRequirementsDto,
} from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { JobInsuranceRequirements } from "../../src/client/components/insurance-requirements";
import { PayAppInsuranceNote } from "../../src/client/pages/insurance";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const M = 100_000_000;

const cert = (over: Partial<InsuranceCertificateDto> = {}): InsuranceCertificateDto => ({
  id: "ins_1",
  kind: "general_liability",
  label: null,
  carrier: null,
  policyNumber: null,
  effectiveOn: null,
  expiresOn: "2027-12-31",
  notes: null,
  archived: false,
  name: "General liability",
  status: "current",
  daysLeft: 300,
  updatedAt: "2026-11-01T00:00:00.000Z",
  files: [],
  holders: [],
  eachOccurrenceCents: M,
  aggregateCents: 2 * M,
  additionalInsured: false,
  waiverOfSubrogation: false,
  primaryNoncontributory: false,
  ...over,
});

const reqs: JobInsuranceRequirementsDto = {
  projectId: "prj_1",
  today: "2026-12-01",
  requirements: [
    {
      kind: "general_liability",
      eachOccurrenceCents: M,
      aggregateCents: 2 * M,
      additionalInsured: true,
      waiverOfSubrogation: false,
      primaryNoncontributory: false,
      umbrellaCounts: false,
    },
    {
      kind: "workers_comp",
      eachOccurrenceCents: null,
      aggregateCents: null,
      additionalInsured: false,
      waiverOfSubrogation: false,
      primaryNoncontributory: false,
      umbrellaCounts: false,
    },
  ],
  checks: [
    {
      kind: "general_liability",
      coverage: "General liability",
      met: false,
      certificateId: "ins_1",
      certificateName: "General liability",
      usedUmbrella: false,
      gaps: [
        {
          kind: "endorsement",
          message:
            "Additional insured is not shown on the certificate on file; the job asks for it.",
        },
      ],
    },
    {
      kind: "workers_comp",
      coverage: "Workers' compensation",
      met: true,
      certificateId: "ins_2",
      certificateName: "Workers' compensation",
      usedUmbrella: false,
      gaps: [],
    },
  ],
};

async function mount(list: InsuranceListDto, ui: ReactNode) {
  const fetchMock = vi.fn(async (url: string) =>
    Response.json(
      url.includes("/insurance/requirements/")
        ? reqs
        : url.endsWith("/me")
          ? { memberships: [{ orgId: "org_1", role: "viewer" }] }
          : list,
    ),
  );
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

it("lists the job's requirement gaps on the pay application's date", async () => {
  const fetchMock = await mount(
    { today: "2026-12-01", items: [cert()] },
    <PayAppInsuranceNote orgId="org_1" applicationDate="2026-12-15" projectId="prj_1" />,
  );
  expect(
    await screen.findByText(/Short of this job's insurance requirements on 2026-12-15/),
  ).toBeTruthy();
  expect(
    screen.getByText(
      "General liability: Additional insured is not shown on the certificate on file; the job asks for it.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText("Workers' compensation: no certificate on file, and the job asks for it."),
  ).toBeTruthy();
  expect(fetchMock.mock.calls.map((c) => c[0])).toContain(
    "/api/orgs/org_1/insurance/requirements/prj_1",
  );
});

it("does not repeat a lapsed certificate as a requirement gap", async () => {
  await mount(
    {
      today: "2026-12-01",
      items: [
        cert({ additionalInsured: true, expiresOn: "2026-12-10" }),
        cert({ id: "wc", kind: "workers_comp", name: "Workers' compensation" }),
      ],
    },
    <PayAppInsuranceNote orgId="org_1" applicationDate="2026-12-15" projectId="prj_1" />,
  );
  expect(await screen.findByText(/General liability certificate expired 2026-12-10/)).toBeTruthy();
  expect(screen.queryByText(/Short of this job's insurance requirements/)).toBeNull();
});

it("shows each requirement met or not on the job, read-only for a viewer", async () => {
  await mount(
    { today: "2026-12-01", items: [] },
    <JobInsuranceRequirements orgId="org_1" projectId="prj_1" />,
  );
  expect(await screen.findByText("Insurance the subcontract requires")).toBeTruthy();
  expect(
    screen.getByText(
      "General liability: each occurrence $1,000,000, general aggregate $2,000,000, additional insured",
    ),
  ).toBeTruthy();
  expect(screen.getByText("Gap")).toBeTruthy();
  expect(screen.getByText("Met")).toBeTruthy();
  expect(screen.getByText(/1 of 2 not met on 2026-12-01/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Change requirements" })).toBeNull();
});

it("fills the form from a pasted insurance exhibit, with the sentence each value came from", async () => {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    Response.json(
      url.includes("/insurance/requirements/")
        ? reqs
        : url.endsWith("/me")
          ? { memberships: [{ orgId: "org_1", role: "editor" }] }
          : { today: "2026-12-01", items: [] },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        <JobInsuranceRequirements orgId="org_1" projectId="prj_1" />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  fireEvent.click(await screen.findByRole("button", { name: "Change requirements" }));
  fireEvent.change(screen.getByLabelText("Or paste the exhibit's text"), {
    target: {
      value:
        "Commercial General Liability with limits of $2,000,000 per occurrence and $4,000,000 general aggregate. Automobile Liability: $1,000,000 combined single limit. All policies shall be primary and non-contributory.",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Read pasted text" }));
  expect(await screen.findByText(/Read 2 coverages from the pasted text/)).toBeTruthy();
  const values = screen
    .getAllByRole("textbox")
    .map((el) => (el as HTMLInputElement).value)
    .filter((v) => /^\d/.test(v));
  // General liability's limits replaced, workers' comp kept blank, auto added.
  expect(values).toEqual(["2000000.00", "4000000.00", "1000000.00"]);
  expect(screen.getAllByText(/each occurrence \$2,000,000/).length).toBeGreaterThan(0);
  const primary = screen.getAllByRole("checkbox", { name: "Primary and non-contributory" });
  expect(primary.map((c) => (c as HTMLInputElement).checked)).toEqual([true, false, true]);
  // Nothing is saved until the editor presses Save.
  expect(
    fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PUT"),
  ).toBe(false);
});

it("fills the tier the job's contract sum falls in when the exhibit sets limits by contract size", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("/insurance/requirements/")
          ? { ...reqs, requirements: [], checks: [] }
          : url.endsWith("/me")
            ? { memberships: [{ orgId: "org_1", role: "editor" }] }
            : { today: "2026-12-01", items: [] },
      ),
    ),
  );
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        <JobInsuranceRequirements orgId="org_1" projectId="prj_1" contractSumCents={300_000_000} />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add requirements" }));
  fireEvent.change(screen.getByLabelText("Or paste the exhibit's text"), {
    target: {
      value:
        "Umbrella Liability: $2,000,000 for subcontracts under $1,000,000; $5,000,000 for subcontracts of $1,000,000 or more.",
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Read pasted text" }));
  expect(
    await screen.findByText(
      /This job's contract sum of \$3,000,000 falls in subcontracts of \$1,000,000 or more/,
    ),
  ).toBeTruthy();
  const values = screen
    .getAllByRole("textbox")
    .map((el) => (el as HTMLInputElement).value)
    .filter((v) => /^\d/.test(v));
  expect(values).toEqual(["5000000.00"]);
  expect(screen.getByText(/set aside \$2,000,000/)).toBeTruthy();
});
