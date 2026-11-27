// @vitest-environment happy-dom
// "Import from the register or the spec" on the submittal log (src/shared/submittal-import.ts): the
// file is read in the browser, rows already on the log are unticked, and only kept rows are sent.
import type { SubmittalDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SubmittalImport } from "../../src/client/components/submittal-import";

afterEach(() => vi.unstubAllGlobals());

const CSV = [
  "Spec Section,Number,Title,Type,Required On-Site Date,Lead Time",
  "08 11 13,08 11 13-1,Hollow metal frames,Shop Drawings,02/01/2027,6 weeks",
  "08 71 00,08 71 00-1,Door hardware schedule,Product Data,,",
].join("\n");

it("previews the register, unticks a row already on the log and sends only the kept rows", async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ added: 1, firstNumber: 4, lastNumber: 4 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onDone = vi.fn(async () => undefined);
  const log = [{ specSection: "08 71 00", title: "Door hardware schedule" }] as SubmittalDto[];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SubmittalImport base="/api/x/submittals" log={log} nextNumber={4} onDone={onDone} />
    </QueryClientProvider>,
  );
  const file = new File([CSV], "register.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Register or spec file"), { target: { files: [file] } });
  expect(await screen.findByText(/2 submittals read from the register/)).toBeTruthy();
  expect(screen.getByText("Already on the log")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  const frames = screen.getByLabelText("Add Hollow metal frames") as HTMLInputElement;
  const hardware = screen.getByLabelText("Add Door hardware schedule") as HTMLInputElement;
  expect(frames.checked).toBe(true);
  expect(hardware.checked).toBe(false);
  fireEvent.click(screen.getByText("Add 1 to the log"));
  expect(await screen.findByText("Added 1 submittals, #4 to #4.")).toBeTruthy();
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/x/submittals/import");
  expect(JSON.parse(String(init.body))).toEqual({
    items: [
      {
        specSection: "08 11 13",
        title: "Hollow metal frames",
        type: "shop_drawings",
        gcReference: "08 11 13-1",
        requiredBy: null,
        neededOnSite: "2027-02-01",
        leadTimeDays: 42,
        reviewDays: null,
        notes: null,
      },
    ],
  });
  expect(onDone).toHaveBeenCalled();
});
