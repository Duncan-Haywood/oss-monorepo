// @vitest-environment happy-dom
// Pay-when-paid, several applications at once on the job page: the panel ticks the sent applications
// still waiting for the owner's payment (not drafts, not paid, not already dated), lets the
// contractor change the selection, and sends one date with exactly the ticked ids.
import type { PayAppDto, ProjectDetailDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OwnerPaymentsBulk } from "../../src/client/components/owner-payment";

afterEach(() => vi.unstubAllGlobals());

const base = "/api/orgs/org_1/projects/prj_1/pay-apps";
const app = (id: string, number: number, over: Partial<PayAppDto> = {}) =>
  ({
    id,
    number,
    periodFrom: `2026-0${number}-01`,
    periodTo: `2026-0${number}-28`,
    status: "submitted",
    ownerPaidOn: null,
    ...over,
  }) as unknown as PayAppDto;

const apps = [
  app("pa_1", 1, { ownerPaidOn: "2026-02-10" }),
  app("pa_2", 2),
  app("pa_3", 3, { status: "certified" }),
  app("pa_4", 4, { status: "paid" }),
  app("pa_5", 5, { status: "draft" }),
];

function mount(list: PayAppDto[], onChanged = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerPaymentsBulk base={base} apps={list} gcName="Harbor Builders" onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return onChanged;
}

const box = (n: number) => screen.getByRole("checkbox", { name: `Application #${n}` });

it("ticks the waiting applications and sends one date with the ticked ids", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json({ payApps: [] } as unknown as ProjectDetailDto),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onChanged = mount(apps);
  expect(screen.queryByRole("checkbox", { name: "Application #5" })).toBeNull();
  expect([1, 2, 3, 4].map((n) => (box(n) as HTMLInputElement).checked)).toEqual([
    false,
    true,
    true,
    false,
  ]);
  fireEvent.click(box(1));
  fireEvent.click(box(3));
  fireEvent.change(screen.getByLabelText("Owner paid the GC on"), {
    target: { value: "2026-03-05" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Record for 2 applications" }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`${base}/owner-paid`);
  expect(init.method).toBe("PUT");
  expect(JSON.parse(String(init.body))).toEqual({
    payAppIds: ["pa_1", "pa_2"],
    ownerPaidOn: "2026-03-05",
  });
});

it("is hidden with fewer than two sent applications", () => {
  vi.stubGlobal("fetch", vi.fn());
  mount([app("pa_1", 1), app("pa_2", 2, { status: "draft" })]);
  expect(screen.queryByText("Owner's payment for several applications")).toBeNull();
});
