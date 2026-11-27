// @vitest-environment happy-dom
// The history panel (src/client/components/history.tsx): closed panels load nothing until opened; a
// panel the user just asked for (a change order's row) starts open and loads its rows at once.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryPanel } from "../../src/client/components/history";

afterEach(() => vi.unstubAllGlobals());

const row = {
  id: "jev_1",
  at: "2026-04-10T15:00:00.000Z",
  action: "change_order_approved",
  subjectId: "cor_1",
  text: "Change order CO-1 approved by the GC on 2026-04-10 for $10,500.00",
  actor: { name: "Dana Ruiz", email: "dana@example.test" },
};

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

it("loads a change order's history at once when it starts open", async () => {
  const fetchMock = vi.fn(async () => Response.json({ items: [row] }));
  vi.stubGlobal("fetch", fetchMock);
  wrap(
    <HistoryPanel
      base="/api/orgs/o/projects/p/change-orders/cor_1"
      title="Change order CO-1 history"
      initiallyOpen
    />,
  );
  await waitFor(() => expect(screen.getByText(row.text)).toBeTruthy());
  const [url] = fetchMock.mock.calls[0] as unknown as [string];
  expect(url).toBe("/api/orgs/o/projects/p/change-orders/cor_1/history");
  expect(screen.getByText("Dana Ruiz")).toBeTruthy();
  expect(screen.queryByText("Download CSV")).toBeNull();
});

it("loads nothing while closed", async () => {
  const fetchMock = vi.fn(async () => Response.json({ items: [row] }));
  vi.stubGlobal("fetch", fetchMock);
  wrap(<HistoryPanel base="/api/orgs/o/projects/p" title="Job history" csv />);
  expect(screen.getByText("Job history")).toBeTruthy();
  await new Promise((r) => setTimeout(r, 20));
  expect(fetchMock).not.toHaveBeenCalled();
});
