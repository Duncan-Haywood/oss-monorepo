// @vitest-environment happy-dom
// The QuickBooks page's per-job item picker (docs/QUICKBOOKS.md, "An item per job").
import type { QuickBooksItemsDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JobItemPicker } from "../../src/client/pages/quickbooks";

afterEach(() => vi.unstubAllGlobals());

const list = (
  jobs: QuickBooksItemsDto["jobs"],
  current: QuickBooksItemsDto["current"] = null,
): QuickBooksItemsDto => ({
  items: [
    {
      id: "12",
      name: "Electrical Labor",
      type: "Service",
      incomeAccountName: "Construction Income",
    },
    { id: "14", name: "Service Calls", type: "Service", incomeAccountName: "Service Income" },
  ],
  current,
  defaultItemName: "Contract Billing",
  defaultAccountName: "Contract Income",
  jobs,
});

const job = (item: QuickBooksItemsDto["jobs"][number]["item"]) => ({
  projectId: "prj_1",
  name: "Desert View Library",
  number: "25-031",
  status: "active" as const,
  item,
  linesWithOwnItem: 0,
});

function mount(first: QuickBooksItemsDto, afterSave: QuickBooksItemsDto) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(init?.method === "PUT" ? afterSave : first),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <JobItemPicker orgId="org_1" />
    </QueryClientProvider>,
  );
  return fetchMock;
}

it("offers the company's item first and saves a job's own item", async () => {
  const fetchMock = mount(
    list([job(null)], { id: "12", name: "Electrical Labor" }),
    list([job({ id: "14", name: "Service Calls" })], { id: "12", name: "Electrical Labor" }),
  );
  const select = await screen.findByLabelText("25-031 Desert View Library");
  expect(select).toHaveValue("");
  expect(
    screen.getByRole("option", { name: "The company's item (Electrical Labor)" }),
  ).toBeTruthy();
  const save = screen.getByRole("button", { name: "Save the item for 25-031 Desert View Library" });
  expect(save).toBeDisabled();
  fireEvent.change(select, { target: { value: "14" } });
  fireEvent.click(save);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/org_1/quickbooks/job-items/prj_1");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(String(init.body))).toEqual({ itemId: "14" });
  await waitFor(() => expect(save).toBeDisabled());
  expect(select).toHaveValue("14");
});

it("warns when a job's item is no longer active, and renders nothing with no jobs", async () => {
  mount(list([job({ id: "40", name: "Old Labor" })]), list([]));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /"Old Labor" is no longer active in QuickBooks: this job's invoices will not send/,
  );
});
