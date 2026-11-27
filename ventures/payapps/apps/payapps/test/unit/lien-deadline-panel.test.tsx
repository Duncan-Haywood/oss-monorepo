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
  });
});
