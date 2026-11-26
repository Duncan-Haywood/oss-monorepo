// @vitest-environment happy-dom
import { type BudgetDto, type BudgetLine, computeLine, computeTotals } from "@shared/budget";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetEditor, dollarsToCents } from "./budget-editor";
import { json, mockFetch } from "./test-fixtures";

const URL_BUDGET = "/api/orgs/org_1/applications/app_1/budget";

const L = (over: Partial<BudgetLine>): BudgetLine =>
  computeLine({
    id: "bln_coord00001",
    category: "personnel",
    description: "Program coordinator",
    quantity: 1,
    unitCostCents: 2_000_000,
    source: "fact",
    factIds: ["fct_1"],
    fundingSource: "request",
    note: "",
    ...over,
  });

function dto(lines: BudgetLine[], over: Partial<BudgetDto["rules"]> = {}): BudgetDto {
  const rules = {
    awardCeilingCents: 2_500_000,
    costSharingRequired: true,
    requestedAmountCents: null,
    projectNeedCents: null,
    ...over,
  };
  return {
    applicationId: "app_1",
    exists: lines.length > 0,
    lines,
    notes: "",
    requiredMatchCents: null,
    totals: computeTotals(lines, rules),
    warnings: [],
    rules,
    updatedBy: null,
    updatedAt: null,
  };
}

function renderEditor(canEdit = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BudgetEditor orgId="org_1" applicationId="app_1" canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("<BudgetEditor />", () => {
  it("parses dollar input to cents", () => {
    expect(dollarsToCents("$1,250.50")).toBe(125_050);
    expect(dollarsToCents("abc")).toBe(0);
    expect(dollarsToCents("-5")).toBe(0);
  });

  it("recomputes totals live and shows the ceiling and cost-share warnings", async () => {
    const placeholder = L({
      id: "bln_eval000001",
      category: "contractual",
      description: "Evaluation",
      unitCostCents: 0,
      source: "user",
      factIds: [],
    });
    mockFetch([["GET", URL_BUDGET, () => json(dto([L({}), placeholder]))]]);
    const user = userEvent.setup();
    renderEditor();

    const lines = await screen.findByRole("table", { name: "Budget lines" });
    expect(within(lines).getByText("From facts")).toBeInTheDocument();
    expect(within(lines).getByText("Needs your input")).toBeInTheDocument();
    // Cost sharing is required and no line is match.
    expect(
      screen.getByText(/requires cost sharing, but no budget line is funded by match/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/over this funder's award ceiling/)).not.toBeInTheDocument();

    // Fill the placeholder: $8,000 request -> $28,000, over the $25,000 ceiling.
    const unit = screen.getByRole("textbox", { name: "Unit cost for Evaluation" });
    await user.type(unit, "8000");
    expect(screen.getByLabelText("Total for Evaluation")).toHaveTextContent("$8,000");
    expect(screen.getByTestId("total-Request")).toHaveTextContent("$28,000");
    expect(screen.getByText(/over this funder's award ceiling of \$25,000/)).toBeInTheDocument();
    expect(within(lines).queryByText("Needs your input")).not.toBeInTheDocument();

    // Move it to match: request back under the ceiling, cost-share "missing" warning gone.
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Funding for Evaluation" }),
      "match",
    );
    expect(screen.getByTestId("total-Request")).toHaveTextContent("$20,000");
    expect(screen.getByTestId("total-Match")).toHaveTextContent("$8,000");
    expect(screen.queryByText(/over this funder's award ceiling/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no budget line is funded by match/)).not.toBeInTheDocument();
  });

  it("saves the lines without totals and marks edited fact amounts as entered", async () => {
    const calls = mockFetch([
      ["GET", URL_BUDGET, () => json(dto([L({})]))],
      [
        "PUT",
        URL_BUDGET,
        (c) => json(dto((c.body as { lines: BudgetLine[] }).lines.map((l) => computeLine(l)))),
      ],
    ]);
    const user = userEvent.setup();
    renderEditor();
    const qty = await screen.findByRole("spinbutton", { name: "Quantity for Program coordinator" });
    await user.clear(qty);
    await user.type(qty, "2");
    expect(screen.getByText("Entered")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save budget" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const body = calls.find((c) => c.method === "PUT")?.body as {
      lines: Record<string, unknown>[];
    };
    expect(body.lines[0]).toMatchObject({ quantity: 2, unitCostCents: 2_000_000, source: "user" });
    expect(body.lines[0]).not.toHaveProperty("totalCents");
  });

  it("proposes from facts, asking before it replaces existing lines", async () => {
    const proposed = dto([
      L({ id: "bln_prop000001", description: "Vans", unitCostCents: 1_000_000 }),
    ]);
    const calls = mockFetch([
      ["GET", URL_BUDGET, () => json(dto([L({})]))],
      ["POST", `${URL_BUDGET}/propose`, () => json(proposed)],
    ]);
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: /propose from my facts/i }));
    expect(screen.getByText("Replace the 1 current lines?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(await screen.findByDisplayValue("Vans")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ replace: true });
  });

  it("is read-only for viewers", async () => {
    mockFetch([["GET", URL_BUDGET, () => json(dto([L({})]))]]);
    renderEditor(false);
    expect(await screen.findByRole("textbox", { name: "Description for line 1" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /propose/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save budget" })).not.toBeInTheDocument();
  });
});
