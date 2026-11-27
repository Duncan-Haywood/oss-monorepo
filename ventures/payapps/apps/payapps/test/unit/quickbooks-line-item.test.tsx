// @vitest-environment happy-dom
// The QuickBooks page's per-line item picker (docs/QUICKBOOKS.md, "An item per line").
import type { QuickBooksLineItemsDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LineItemPicker } from "../../src/client/pages/quickbooks";

afterEach(() => vi.unstubAllGlobals());

const list = (
  item: QuickBooksLineItemsDto["lines"][number]["item"],
  lines = 1,
): QuickBooksLineItemsDto => ({
  projectId: "prj_1",
  name: "Desert View Library",
  number: "25-031",
  fallbackItemName: "Electrical Labor",
  items: [
    { id: "12", name: "Electrical Labor", type: "Service", incomeAccountName: "Construction" },
    { id: "15", name: "Equipment", type: "NonInventory", incomeAccountName: "Equipment Sales" },
  ],
  lines: lines
    ? [{ sovLineId: "sov_1", itemNumber: "1", description: "Switchgear (equipment)", item }]
    : [],
});

function mount(first: QuickBooksLineItemsDto, afterSave: QuickBooksLineItemsDto) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(init?.method === "PUT" ? afterSave : first),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LineItemPicker orgId="org_1" projectId="prj_1" />
    </QueryClientProvider>,
  );
  return fetchMock;
}

it("offers the job's item first and saves a line's own item", async () => {
  const fetchMock = mount(list(null), list({ id: "15", name: "Equipment" }));
  const select = await screen.findByLabelText("1 Switchgear (equipment)");
  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/orgs/org_1/quickbooks/job-items/prj_1/lines");
  expect(select).toHaveValue("");
  expect(screen.getByRole("option", { name: "The job's item (Electrical Labor)" })).toBeTruthy();
  const save = screen.getByRole("button", {
    name: "Save the item for line 1 Switchgear (equipment)",
  });
  expect(save).toBeDisabled();
  fireEvent.change(select, { target: { value: "15" } });
  fireEvent.click(save);
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "PUT"),
    ).toBe(true),
  );
  const put = fetchMock.mock.calls.find(
    ([, i]) => (i as RequestInit | undefined)?.method === "PUT",
  );
  const [url, init] = put as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/org_1/quickbooks/job-items/prj_1/lines/sov_1");
  expect(JSON.parse(String(init.body))).toEqual({ itemId: "15" });
  await waitFor(() => expect(save).toBeDisabled());
  expect(select).toHaveValue("15");
});

it("warns when a line's item is no longer active, and says so when the job has no lines", async () => {
  mount(list({ id: "40", name: "Old Equipment" }), list(null));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /"Old Equipment" is no longer active in QuickBooks: invoices that bill this line will not send/,
  );
});

it("a job with no lines yet", async () => {
  mount(list(null, 0), list(null, 0));
  expect(await screen.findByText("This job has no schedule-of-values lines yet.")).toBeTruthy();
});
