// @vitest-environment happy-dom
// The job page's pay terms (src/client/components/pay-terms.tsx): shows what the days count from and
// saves the days with the basis picked.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PayTerms, payTermsLabel } from "../../src/client/components/pay-terms";

afterEach(() => vi.unstubAllGlobals());

it("labels the terms by what they count from", () => {
  expect(payTermsLabel(30, "application_date")).toBe("30 days after the application date");
  expect(payTermsLabel(1, "period_end")).toBe("1 day after the period end");
});

it("saves the days and the basis in one PATCH", async () => {
  const fetchMock = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PayTerms
        path="/api/orgs/o/projects/p"
        days={30}
        basis="application_date"
        outerDays={null}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/30 days after the application date/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "change" }));
  fireEvent.change(screen.getByLabelText("Days the GC has to pay"), { target: { value: "45" } });
  fireEvent.change(screen.getByLabelText("Counted from"), { target: { value: "period_end" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/o/projects/p");
  expect(init.method).toBe("PATCH");
  expect(JSON.parse(String(init.body))).toEqual({
    payTermsDays: 45,
    payTermsBasis: "period_end",
    payTermsOuterDays: null,
  });
});

it("labels and saves a pay-when-paid outer limit", async () => {
  expect(payTermsLabel(7, "owner_paid", 90)).toBe(
    "7 days after the owner pays the GC (pay-when-paid), in any event within 90 days of the application date",
  );
  const fetchMock = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PayTerms
        path="/api/orgs/o/projects/p"
        days={7}
        basis="owner_paid"
        outerDays={null}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "change" }));
  fireEvent.change(screen.getByLabelText("and in any event within"), { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toEqual({
    payTermsDays: 7,
    payTermsBasis: "owner_paid",
    payTermsOuterDays: 90,
  });
});

it("drops the outer limit when the terms no longer count from the owner's payment", async () => {
  const fetchMock = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PayTerms path="/p" days={7} basis="owner_paid" outerDays={90} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "change" }));
  fireEvent.change(screen.getByLabelText("Counted from"), {
    target: { value: "application_date" },
  });
  expect(screen.queryByLabelText("and in any event within")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toMatchObject({ payTermsOuterDays: null });
});
