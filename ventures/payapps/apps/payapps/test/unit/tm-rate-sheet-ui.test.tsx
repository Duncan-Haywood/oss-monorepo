// @vitest-environment happy-dom
// The rate sheet panel on the T&M tickets page (src/client/pages/tm-rate-sheet.tsx): an editor
// starts a sheet from the rates on the job's tickets and saves it with one PUT; a saved sheet is
// listed with its markups; a viewer sees it without the edit buttons.
import type { TmRateSheetDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RateSheetPanel } from "../../src/client/pages/tm-rate-sheet";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const base = "/api/orgs/o/projects/p/tm-tickets";
const saved: TmRateSheetDto = {
  labor: [{ name: "Journeyman electrician", rateCents: 9500, unit: null }],
  material: [{ name: "3/4 in EMT", rateCents: 87, unit: "ft" }],
  equipment: [],
  laborMarkupBps: 1500,
  materialMarkupBps: null,
  equipmentMarkupBps: null,
  source: "Subcontract Exhibit D",
  updatedByName: "Sam Lee",
  updatedAt: "2026-11-26T15:00:00.000Z",
};

function mount(props: Partial<Parameters<typeof RateSheetPanel>[0]>) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(saved));
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RateSheetPanel base={base} sheet={null} draft={null} canEdit onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  );
  return { fetchMock, onSaved };
}

it("starts from the tickets' rates and saves the sheet with one PUT", async () => {
  const { fetchMock, onSaved } = mount({
    draft: { ...saved, labor: [{ name: "Foreman", rateCents: 11_000, unit: null }], source: null },
  });
  fireEvent.click(screen.getByText("Start from the rates on this job's tickets"));
  expect((screen.getAllByLabelText("Trade")[0] as HTMLInputElement).value).toBe("Foreman");
  fireEvent.click(screen.getByText("Save rate sheet"));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe(`${base}/rate-sheet`);
  expect(init?.method).toBe("PUT");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    labor: [{ name: "Foreman", rateCents: 11_000, unit: null }],
    material: [{ name: "3/4 in EMT", rateCents: 87, unit: "ft" }],
    laborMarkupBps: 1500,
  });
});

it("lists a saved sheet, and a viewer gets no edit buttons", () => {
  mount({ sheet: saved, canEdit: false });
  expect(screen.getByText("From: Subcontract Exhibit D")).toBeTruthy();
  expect(screen.getByText("$95.00")).toBeTruthy();
  expect(screen.getByText("$0.87 / ft")).toBeTruthy();
  expect(screen.queryByText("Edit the rate sheet")).toBeNull();
});
