// @vitest-environment happy-dom
import type { QuickBooksItemsDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InvoiceItemPicker } from "../../src/client/pages/quickbooks";

afterEach(() => vi.unstubAllGlobals());

const list = (current: QuickBooksItemsDto["current"]): QuickBooksItemsDto => ({
  items: [
    {
      id: "12",
      name: "Electrical Labor",
      type: "Service",
      incomeAccountName: "Construction Income",
    },
  ],
  current,
  defaultItemName: "Contract Billing",
  defaultAccountName: "Contract Income",
  jobs: [],
});

function mount(first: QuickBooksItemsDto, afterSave: QuickBooksItemsDto) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    Response.json(init?.method === "PUT" ? afterSave : first),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InvoiceItemPicker orgId="org_1" statusKey={["quickbooks", "org_1"]} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

it("lists the company's items with their income accounts and saves the one picked", async () => {
  const fetchMock = mount(list(null), list({ id: "12", name: "Electrical Labor" }));
  const select = await screen.findByLabelText("Bill the work with this QuickBooks item");
  expect(select).toHaveValue("");
  expect(
    screen.getByRole("option", { name: /Contract Billing \(created by PayApps/ }),
  ).toBeTruthy();
  expect(
    screen.getByRole("option", { name: "Electrical Labor (income account Construction Income)" }),
  ).toBeTruthy();
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();
  fireEvent.change(select, { target: { value: "12" } });
  fireEvent.click(save);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/org_1/quickbooks/invoice-item");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(String(init.body))).toEqual({ itemId: "12" });
});

it("warns when the chosen item is no longer active in QuickBooks", async () => {
  mount({ ...list({ id: "40", name: "Old Labor" }) }, list(null));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /"Old Labor" is no longer active in QuickBooks/,
  );
});
