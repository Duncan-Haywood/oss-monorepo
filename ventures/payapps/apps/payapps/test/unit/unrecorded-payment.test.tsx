// @vitest-environment happy-dom
// A pay application marked paid in full with no payment behind it: the payments panel offers to
// record the money as one payment and posts only the date and check number (the server works out
// the amount, so it cannot be mistyped).
import type { PayAppDetailDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PaymentsPanel } from "../../src/client/components/payments";

afterEach(() => vi.unstubAllGlobals());

const base = "/api/orgs/org_1/projects/prj_1/pay-apps/pay_1";

const app = (over: Partial<PayAppDetailDto>) =>
  ({
    id: "pay_1",
    status: "paid",
    expectedCents: 4_500_000,
    certifiedAmountCents: null,
    paidCents: 4_500_000,
    remainingCents: 0,
    unrecordedCents: 4_500_000,
    shortClose: null,
    payments: [],
    ...over,
  }) as unknown as PayAppDetailDto;

function mount(a: PayAppDetailDto, onChanged = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PaymentsPanel base={base} app={a} onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return onChanged;
}

it("records the unrecorded money with the date and check number only", async () => {
  const fetchMock = vi.fn(async () => Response.json(app({ unrecordedCents: 0 }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  const onChanged = mount(app({}));
  expect(screen.getByText(/\$45,000\.00 has no payment recorded/)).toBeTruthy();
  const form = screen.getByRole("form", { name: "Record the payment behind marked paid" });
  fireEvent.change(form.querySelector('input[type="date"]') as HTMLInputElement, {
    target: { value: "2026-03-01" },
  });
  fireEvent.change(screen.getAllByLabelText("Check # or reference")[0] as HTMLInputElement, {
    target: { value: " 2231 " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Record $45,000.00 as a payment" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`${base}/payments/unrecorded`);
  expect(JSON.parse(String(init.body))).toEqual({ receivedOn: "2026-03-01", reference: "2231" });
});

it("offers nothing when every dollar is recorded", () => {
  vi.stubGlobal("fetch", vi.fn());
  mount(app({ unrecordedCents: 0 }));
  expect(screen.queryByRole("form", { name: "Record the payment behind marked paid" })).toBeNull();
});
