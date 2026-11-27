// @vitest-environment happy-dom
// "Take a photo" on the attachments panel: the camera input saves one file as a photo, renamed from
// the phone's "image.jpg" to its capture time, whatever the Kind list is set to.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AttachmentsPanel } from "../../src/client/components/attachments";

afterEach(() => vi.unstubAllGlobals());

it("uploads a camera shot as a job photo named by when it was taken", async () => {
  const uploads: { name: string; category: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const form = init.body as FormData;
        uploads.push({
          name: (form.get("file") as File).name,
          category: String(form.get("category")),
        });
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
  const camera = (await screen.findByLabelText("Take a photo")) as HTMLInputElement;
  expect(camera.getAttribute("capture")).toBe("environment");
  expect(camera.getAttribute("accept")).toBe("image/jpeg,image/png");
  // The Kind list stays on its default (backup); the camera still files it as a photo.
  const taken = new Date(2026, 10, 25, 7, 30, 2).getTime();
  const shot = new File([new Uint8Array(2048)], "image.jpg", {
    type: "image/jpeg",
    lastModified: taken,
  });
  fireEvent.change(camera, { target: { files: [shot] } });
  await waitFor(() => expect(uploads).toHaveLength(1));
  expect(uploads[0]).toEqual({ name: "Photo 2026-11-25 07.30.02.jpg", category: "photo" });
});
