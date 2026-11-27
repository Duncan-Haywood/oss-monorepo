// @vitest-environment happy-dom
// The QuickBooks page's class and location per job (docs/QUICKBOOKS.md, "Class and location per job").
import type { QuickBooksTrackingDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JobTrackingPicker } from "../../src/client/pages/quickbooks";

afterEach(() => vi.unstubAllGlobals());

type JobTracking = QuickBooksTrackingDto["jobs"][number];

const job = (over: Partial<JobTracking> = {}): JobTracking => ({
  projectId: "prj_1",
  name: "Desert View Library",
  number: "25-031",
  status: "active",
  class: null,
  location: null,
  ...over,
});

const list = (
  jobs: JobTracking[],
  over: Partial<QuickBooksTrackingDto> = {},
): QuickBooksTrackingDto => ({
  classTracking: "per-line",
  locationTracking: true,
  locationLabel: "Division",
  classes: [
    { id: "4", name: "New work", fullName: "New work" },
    { id: "5", name: "Tenant improvements", fullName: "New work:Tenant improvements" },
  ],
  locations: [{ id: "2", name: "Denver", fullName: "Denver" }],
  jobs,
  ...over,
});

function mount(first: QuickBooksTrackingDto, afterSave: QuickBooksTrackingDto = first) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(init?.method === "PUT" ? afterSave : first),
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <JobTrackingPicker orgId="org_1" />
    </QueryClientProvider>,
  );
  return { fetchMock, view };
}

it("saves only what changed, under the company's word for locations", async () => {
  const { fetchMock } = mount(
    list([job()]),
    list([job({ class: { id: "5", name: "New work:Tenant improvements" } })]),
  );
  expect(await screen.findByText("Class and division per job")).toBeTruthy();
  const cls = screen.getByLabelText("Class for 25-031 Desert View Library");
  expect(screen.getByLabelText("Division for 25-031 Desert View Library")).toHaveValue("");
  expect(screen.getByRole("option", { name: "New work:Tenant improvements" })).toBeTruthy();
  const save = screen.getByRole("button", {
    name: "Save the class and division for 25-031 Desert View Library",
  });
  expect(save).toBeDisabled();
  fireEvent.change(cls, { target: { value: "5" } });
  fireEvent.click(save);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/org_1/quickbooks/tracking/prj_1");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(String(init.body))).toEqual({ classId: "5" });
  await waitFor(() => expect(cls).toHaveValue("5"));
  expect(save).toBeDisabled();
});

it("clears a choice with None", async () => {
  const { fetchMock } = mount(list([job({ location: { id: "2", name: "Denver" } })]));
  const loc = await screen.findByLabelText("Division for 25-031 Desert View Library");
  expect(loc).toHaveValue("2");
  fireEvent.change(loc, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save the class and division/ }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({ locationId: null });
});

it("warns when a job's class is no longer active", async () => {
  mount(list([job({ class: { id: "9", name: "Old work" } })]));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /class "Old work" is no longer active in QuickBooks: this job's invoices will not send/,
  );
});

it("shows only locations when the company does not track classes", async () => {
  mount(list([job()], { classTracking: "off", classes: [], locationLabel: "Location" }));
  expect(await screen.findByText("Location per job")).toBeTruthy();
  expect(screen.queryByLabelText(/^Class for/)).toBeNull();
});

it("renders nothing while the company tracks neither", async () => {
  const { fetchMock, view } = mount(
    list([job()], { classTracking: "off", locationTracking: false, classes: [], locations: [] }),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(view.container.textContent).toBe("");
});
