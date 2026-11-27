// @vitest-environment happy-dom
// The attachments panel sends the converted JPEG, not the HEIC, and says what it converted.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../src/client/lib/packet-photo", () => ({
  packetReadyPhoto: async (file: File) =>
    file.name.endsWith(".HEIC")
      ? {
          file: new File([new Uint8Array(1000)], "IMG_0412.jpg", { type: "image/jpeg" }),
          note: "IMG_0412.HEIC was converted to JPEG (IMG_0412.jpg) so it goes in the PDF packet.",
        }
      : { file, note: null },
}));

const { AttachmentsPanel } = await import("../../src/client/components/attachments");

afterEach(() => vi.unstubAllGlobals());

it("uploads a HEIC photo as the JPEG the browser made and lists the conversion", async () => {
  const uploads: { name: string; type: string; size: number }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const f = (init.body as FormData).get("file") as File;
        uploads.push({ name: f.name, type: f.type, size: f.size });
        return new Response(JSON.stringify({ id: "att_1" }), { status: 201 });
      }
      return new Response(
        JSON.stringify({
          items: [],
          storage: { usedBytes: 0, limitBytes: 1024 * 1024 * 1024 },
          enabled: true,
        }),
        { status: 200 },
      );
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AttachmentsPanel base="/api/orgs/org_1/projects/prj_1/pay-apps/pa_1" />
    </QueryClientProvider>,
  );
  const input = (await screen.findByLabelText("Add files")) as HTMLInputElement;
  const heic = new File([new Uint8Array(5000)], "IMG_0412.HEIC", { type: "image/heic" });
  const pdf = new File([new Uint8Array(300)], "invoice.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [heic, pdf] } });
  await waitFor(() => expect(uploads).toHaveLength(2));
  expect(uploads[0]).toEqual({ name: "IMG_0412.jpg", type: "image/jpeg", size: 1000 });
  expect(uploads[1]?.name).toBe("invoice.pdf");
  const list = await screen.findByLabelText("Converted photos");
  expect(list.textContent).toContain("IMG_0412.HEIC was converted to JPEG");
});
