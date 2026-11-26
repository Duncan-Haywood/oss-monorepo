// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlImport } from "./ControlImport";

const preview = {
  level: 2,
  columns: { id: "Control", status: "Status", owner: null, notes: "Comments", statement: null },
  changes: [
    {
      line: 2,
      controlId: "AC.L2-3.1.1",
      status: { from: "not_assessed", to: "implemented" },
      notes: true,
    },
  ],
  unchanged: 3,
  issues: [{ line: 4, message: '"mostly" is not a status this import reads' }],
  applied: false,
};

function setup(canApply: boolean) {
  const calls: { apply: boolean }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { apply: boolean };
      calls.push(body);
      return new Response(JSON.stringify({ ...preview, applied: body.apply }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ControlImport orgId="org_1" level={2} canApply={canApply} onClose={() => {}} />
    </QueryClientProvider>,
  );
  const file = new File(["Control,Status\n3.1.1,Met\n"], "sheet.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("ControlImport", () => {
  it("previews, lists what is left out, then applies", async () => {
    const calls = setup(true);
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/1 requirement would change, 3 already match/)).toBeVisible();
    expect(screen.getByText(/Line 4:/)).toBeVisible();
    expect(screen.getByText("Not assessed → Implemented")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 requirement" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Imported 1 requirement");
    expect(calls.map((c) => c.apply)).toEqual([false, true]);
  });

  it("shows the preview but no import button without the Level 2 plan", async () => {
    setup(false);
    const button = screen.getByRole("button", { name: "Preview" });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(await screen.findByText(/needs the Level 2 plan/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Import \d/ })).toBeNull();
  });
});
