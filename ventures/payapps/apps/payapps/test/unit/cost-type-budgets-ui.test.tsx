// @vitest-environment happy-dom
// "Budget by cost type" on the job-cost page (src/client/components/cost-type-budgets.tsx).
import type { JobCostDto } from "@shared/api/types";
import { computeCostTypes } from "@shared/cost-type-budget";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CostTypeBudgets, parseSplit } from "../../src/client/components/cost-type-budgets";

afterEach(() => vi.unstubAllGlobals());

const splits = { sov_1: { labor: 822_000, material: 759_891 } };
const costTypes = computeCostTypes({
  asOf: null,
  lines: [
    {
      sovLineId: "sov_1",
      itemNumber: "1",
      description: "Ductwork",
      budgetCents: 1_581_891,
      split: splits.sov_1,
    },
    {
      sovLineId: "sov_2",
      itemNumber: "2",
      description: "Equipment setting",
      budgetCents: 320_000,
      split: null,
    },
  ],
  entries: [
    { sovLineId: "sov_1", incurredOn: "2026-11-10", amountCents: 900_000, category: "labor" },
  ],
});
const d = { costTypes, costTypeSplits: splits } as unknown as JobCostDto;

const mount = (canChange: boolean, onSaved = vi.fn(async () => {})) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CostTypeBudgets
        d={d}
        base="/api/orgs/org_1/projects/prj_1/job-cost"
        canChange={canChange}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );

it("shows each type's budget against its cost and flags the one over", () => {
  mount(false);
  expect(screen.getByText(/1 of 2 lines split/)).toBeTruthy();
  const labor = screen.getAllByText("Labor")[0]?.closest("tr");
  expect(labor?.className).toContain("text-red-700");
  expect(labor?.textContent).toContain("-$780.00");
  expect(screen.queryByText("Edit split")).toBeNull();
});

it("saves a line's split from the form", async () => {
  const fetchMock = vi.fn(async () => Response.json(d));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn(async () => {});
  mount(true, onSaved);
  fireEvent.change(screen.getByLabelText("Line to split by cost type"), {
    target: { value: "sov_2" },
  });
  fireEvent.change(screen.getByLabelText("Subcontract budget for 2"), {
    target: { value: "3,000" },
  });
  fireEvent.change(screen.getByLabelText("Other budget for 2"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/orgs/org_1/projects/prj_1/job-cost/cost-type-budgets");
  expect(JSON.parse(String(init.body))).toEqual({
    lines: [{ sovLineId: "sov_2", split: { subcontract: 300_000, other: 20_000 } }],
  });
});

it("refuses an amount that is not one", () => {
  expect(() => parseSplit({ labor: "abc" }, "1")).toThrow('1: labor "abc" is not an amount');
  expect(parseSplit({ labor: "", material: "12.5" }, "1")).toEqual({ material: 1_250 });
});
