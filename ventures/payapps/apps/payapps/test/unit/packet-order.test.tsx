// @vitest-environment happy-dom
// Packet order on the pay-app attachments panel: the ticked files go in the default order (backup,
// photos, other; oldest first) until the user moves one, then in the order shown, and the download
// link's ?files= follows it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachmentsPanel, moveId, packetIds } from "../../src/client/components/attachments";

type Item = Parameters<typeof packetIds>[0][number];
const item = (
  id: string,
  category: Item["category"],
  createdAt: string,
  contentType = "application/pdf",
): Item => ({
  id,
  fileName: `${id}.pdf`,
  contentType,
  sizeBytes: 1000,
  category,
  createdAt,
});
// Newest first, as the list endpoint returns them.
const items: Item[] = [
  item("photo1", "photo", "2026-11-04T00:00:00Z", "image/jpeg"),
  item("sheet", "backup", "2026-11-03T00:00:00Z", "text/csv"),
  item("invoice2", "backup", "2026-11-02T00:00:00Z"),
  item("signed", "signed", "2026-11-01T12:00:00Z"),
  item("invoice1", "backup", "2026-11-01T00:00:00Z"),
];

describe("packetIds", () => {
  it("keeps the default order without an arrangement", () => {
    expect(packetIds(items, {})).toEqual(["invoice1", "invoice2", "photo1"]);
  });
  it("follows the arranged order, dropping unticked files and appending newly ticked ones", () => {
    const order = ["photo1", "invoice2", "invoice1"];
    expect(packetIds(items, {}, order)).toEqual(["photo1", "invoice2", "invoice1"]);
    expect(packetIds(items, { invoice2: false }, order)).toEqual(["photo1", "invoice1"]);
    expect(packetIds(items, { signed: true }, order)).toEqual([
      "photo1",
      "invoice2",
      "invoice1",
      "signed",
    ]);
  });
  it("ignores ids that are gone or cannot go in the packet, and duplicates", () => {
    expect(packetIds(items, {}, ["deleted", "sheet", "invoice2", "invoice2"])).toEqual([
      "invoice2",
      "invoice1",
      "photo1",
    ]);
  });
});

describe("moveId", () => {
  it("moves an entry and clamps the target", () => {
    expect(moveId(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], 5, 0)).toEqual(["a", "b", "c"]);
  });
});

afterEach(() => vi.unstubAllGlobals());

const base = "/api/orgs/org_1/projects/prj_1/pay-apps/pa_1";
const filesParam = () => {
  const link = screen.getByText("Download application + backup (one PDF)") as HTMLAnchorElement;
  return new URL(link.getAttribute("href") ?? "", "http://x").searchParams.get("files");
};

it("reorders the packet with the arrows and by dragging, and resets", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ items, storage: { usedBytes: 0, limitBytes: 1 << 30 }, enabled: true }),
          { status: 200 },
        ),
    ),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AttachmentsPanel base={base} />
    </QueryClientProvider>,
  );
  await screen.findByText("Packet order");
  expect(filesParam()).toBe("invoice1,invoice2,photo1");
  expect(screen.getByLabelText("Move invoice1.pdf up")).toBeDisabled();

  fireEvent.click(screen.getByLabelText("Move photo1.pdf up"));
  expect(filesParam()).toBe("invoice1,photo1,invoice2");

  // Drag the last file (invoice2) onto the first row.
  const rows = screen.getAllByRole("listitem");
  const dataTransfer = { setData: () => {}, effectAllowed: "" };
  fireEvent.dragStart(rows[2] as HTMLElement, { dataTransfer });
  fireEvent.dragOver(rows[0] as HTMLElement, { dataTransfer });
  fireEvent.drop(rows[0] as HTMLElement, { dataTransfer });
  expect(filesParam()).toBe("invoice2,invoice1,photo1");

  // Unticking a file drops it from the order; ticking it again puts it at the end.
  fireEvent.click(screen.getByLabelText("Include invoice1.pdf in the packet"));
  expect(filesParam()).toBe("invoice2,photo1");

  fireEvent.click(screen.getByText("Back to the usual order"));
  expect(filesParam()).toBe("invoice2,photo1");
  expect(screen.queryByText("Back to the usual order")).toBeNull();
  fireEvent.click(screen.getByLabelText("Include invoice1.pdf in the packet"));
  expect(filesParam()).toBe("invoice1,invoice2,photo1");
});
