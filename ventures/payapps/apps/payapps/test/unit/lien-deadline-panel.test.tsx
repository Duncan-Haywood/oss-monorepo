// @vitest-environment happy-dom

import type { ProjectDetailDto } from "@shared/api/types";
import { addDays, lienDeadline } from "@shared/lien-deadline";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LienDeadlinePanel } from "../../src/client/components/lien-deadline";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const today = new Date().toISOString().slice(0, 10);

function project(fields: Partial<ProjectDetailDto>): ProjectDetailDto {
  const base = {
    id: "prj_1",
    lienState: null,
    lienResidential: false,
    lastFurnishedOn: null,
    workCompletedOn: null,
    noticeOfCompletionOn: null,
    publicOwner: null,
    millerTier: null,
    retainagePctBps: 1000,
    storedRetainagePctBps: 1000,
    sovLines: [],
    payApps: [],
    ...fields,
  };
  return {
    ...base,
    lienDeadline: lienDeadline({
      state: base.lienState,
      residential: base.lienResidential,
      lastFurnishedOn: base.lastFurnishedOn,
      completedOn: base.workCompletedOn,
      noticeOfCompletionOn: base.noticeOfCompletionOn,
      publicOwner: base.publicOwner,
      millerTier: base.millerTier,
    }),
  } as unknown as ProjectDetailDto;
}

const show = (p: ProjectDetailDto) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LienDeadlinePanel path="/api/orgs/o/projects/prj_1" project={p} onSaved={() => {}} />
    </QueryClientProvider>,
  );

it("shows the date, the statute and the disclaimer for a dated job", () => {
  const last = addDays(today, -60);
  show(project({ lienState: "FL", lastFurnishedOn: last }));
  expect(screen.getAllByText(/record a claim of lien by/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Fla\. Stat\. § 713\.08\(5\)/)).toBeTruthy();
  expect(screen.getByText(/not legal advice/)).toBeTruthy();
  // California's completion fields only appear for California and Arizona.
  expect(screen.queryByLabelText("Day the owner recorded a notice of completion")).toBeNull();
});

it("offers the residential rule only where the state has one, and the completion dates for CA", () => {
  show(project({ lienState: "OH", lastFurnishedOn: "2026-09-01" }));
  expect(screen.getByText(/^Residential: a one- or two-family dwelling/)).toBeTruthy();
  cleanup();
  show(project({ lienState: "CA", lastFurnishedOn: "2026-09-01" }));
  expect(screen.getByLabelText("Day the owner recorded a notice of completion")).toBeTruthy();
  cleanup();
  // Virginia counts from completion but has no notice of completion.
  show(project({ lienState: "VA", lastFurnishedOn: "2026-09-01" }));
  expect(screen.getByLabelText("Completion of the whole project")).toBeTruthy();
  expect(screen.queryByLabelText("Day the owner recorded a notice of completion")).toBeNull();
});

it("saves the state and last day through the job's PATCH", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));
  show(project({}));
  fireEvent.change(screen.getByLabelText("State the property is in (two letters)"), {
    target: { value: "tx" },
  });
  fireEvent.change(screen.getByLabelText("Last day you furnished labor or materials"), {
    target: { value: "2026-10-31" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toContain("/api/orgs/o/projects/prj_1");
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(String(init.body))).toEqual({
    lienState: "TX",
    lienResidential: false,
    lastFurnishedOn: "2026-10-31",
    workCompletedOn: null,
    noticeOfCompletionOn: null,
    publicOwner: null,
    millerTier: null,
  });
});

it("shows the Miller Act notice on a federal job, not a lien", () => {
  show(project({ publicOwner: "federal", millerTier: "second", lastFurnishedOn: "2026-03-02" }));
  expect(screen.getByText("Payment bond claim (Miller Act)")).toBeTruthy();
  expect(
    screen.getAllByText(
      /give the prime contractor written notice of your payment bond claim by 2026-05-29/,
    ).length,
  ).toBeGreaterThan(0);
  expect(screen.queryByText(/record a claim of lien/)).toBeNull();
  expect(screen.getByLabelText("Who you contracted with")).toBeTruthy();
});

it("checks a state public job's retainage against the cap and saves the owner", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));
  show(project({ publicOwner: "state_local", lienState: "CA" }));
  expect(screen.getByText(/This job holds 10%, above the 5% California allows/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /Read Cal\. Pub\. Cont\. Code § 7201/ })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Who owns the job"), { target: { value: "federal" } });
  fireEvent.change(screen.getByLabelText("Who you contracted with"), {
    target: { value: "first" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toMatchObject({
    publicOwner: "federal",
    millerTier: "first",
  });
});

it("lists a state public job's bond claim steps, dated from the last day", () => {
  const last = addDays(today, -30);
  show(
    project({
      publicOwner: "state_local",
      lienState: "VA",
      lastFurnishedOn: last,
      millerTier: "second",
    }),
  );
  expect(screen.getByText(/Payment bond claim: Va\. Code § 2\.2-4341/)).toBeTruthy();
  expect(screen.getByText(/Give the contractor written notice of your claim by/)).toBeTruthy();
  expect(screen.getByText(/Bring suit on the payment bond by/)).toBeTruthy();
  // No lien date on a public job.
  expect(screen.queryByText(/record a claim of lien/)).toBeNull();
});

it("leaves an acceptance-based step undated until the acceptance day is entered, and saves it", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
  show(project({ publicOwner: "state_local", lienState: "WA" }));
  expect(
    screen.getByText(/Not dated: PayApps needs the day the public body accepted the work/),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Day the public body accepted the work"), {
    target: { value: "2026-12-14" },
  });
  fireEvent.change(screen.getByLabelText("Who you contracted with"), {
    target: { value: "first" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toMatchObject({
    publicOwner: "state_local",
    workCompletedOn: "2026-12-14",
    millerTier: "first",
  });
});

it("names the states it covers for a state it does not", () => {
  show(project({ publicOwner: "state_local", lienState: "PA" }));
  expect(screen.getByText(/does not list PA's bond claim steps yet/)).toBeTruthy();
});
