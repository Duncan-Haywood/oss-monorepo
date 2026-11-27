// @vitest-environment happy-dom
// An RFI's files on the job page (src/client/components/rfis.tsx): the row shows how many files the
// RFI keeps and offers "PDF + files" once it has any; "Files" opens the shared attachments panel
// worded for an RFI, reading that RFI's own files.
import type { RfiDto, RfiLogDto } from "@shared/api/types";
import { summarizeRfis } from "@shared/rfi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RfiLog } from "../../src/client/components/rfis";

afterEach(() => vi.unstubAllGlobals());

const base = "/api/orgs/o/projects/p";
const rfi: RfiDto = {
  id: "rfi_1",
  number: 1,
  subject: "Duct clash at grid C/4",
  question: "Can we drop the duct 6 inches?",
  suggestion: null,
  reference: "M-201 detail 4",
  sentOn: "2026-11-20",
  responseDueOn: "2026-11-27",
  answeredOn: null,
  answer: null,
  answeredBy: null,
  costImpact: null,
  timeImpact: null,
  changeOrderId: null,
  changeOrderNumber: null,
  status: "open",
  daysOutstanding: 6,
  daysOverdue: 0,
  needsChangeOrder: false,
  fileCount: 2,
};
const log = (items: RfiDto[]): RfiLogDto => ({
  items,
  summary: summarizeRfis(items, "2026-11-26"),
  nextNumber: items.length + 1,
  today: "2026-11-26",
});
const files = {
  items: [
    {
      id: "att_1",
      fileName: "M-201 marked up.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      category: "backup",
      createdAt: "2026-11-20T10:00:00.000Z",
    },
  ],
  storage: { usedBytes: 2048, limitBytes: 1_000_000_000 },
  enabled: true,
};

function mount(items: RfiDto[]) {
  const fetchMock = vi.fn(async (url: string) =>
    Response.json(url.endsWith("/attachments") ? files : log(items)),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RfiLog
        base={base}
        job={{ name: "Riverside Clinic", number: null, gcName: "Harbor Builders" }}
        changeOrders={[]}
        from={{ name: "Sam Lee", company: "Lee Mechanical" }}
      />
    </QueryClientProvider>,
  );
  return fetchMock;
}

it("shows the file count, the packet link and the RFI's own files panel", async () => {
  const fetchMock = mount([rfi]);
  const button = await screen.findByRole("button", { name: "Files (2)" });
  const packet = screen.getByRole("link", { name: "PDF + files" });
  expect(packet.getAttribute("href")).toBe(`${base}/rfis/rfi_1/packet.pdf`);
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByText("M-201 marked up.pdf")).toBeTruthy());
  expect(screen.getByText(/marked-up sheet or detail and photos of the condition/)).toBeTruthy();
  expect(screen.getAllByText("Marked-up sheet or detail").length).toBeGreaterThan(0);
  const urls = fetchMock.mock.calls.map((c) => c[0]);
  expect(urls).toContain(`${base}/rfis/rfi_1/attachments`);
});

it("offers no packet link before the RFI has files", async () => {
  mount([{ ...rfi, fileCount: 0 }]);
  expect(await screen.findByRole("button", { name: "Files" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "PDF + files" })).toBeNull();
});
