// @vitest-environment happy-dom
// The pay app's lower-tier waivers panel (src/client/components/lower-tier-waivers.tsx): the summary
// names who still owes a waiver; the job's PO and subcontract vendors are offered, ticked when they
// have invoiced something; "Add" posts the ticked ones through the period end; "Received today"
// records the date; "Attach signed" files the waiver on its row as a pay-application attachment.
import type { LowerTierWaiverDto, LowerTierWaiversDto } from "@shared/api/types";
import { summarizeLowerTier } from "@shared/lower-tier-waivers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  LowerTierWaiversPanel,
  waiverFileProblem,
} from "../../src/client/components/lower-tier-waivers";

afterEach(() => vi.unstubAllGlobals());

const owed: LowerTierWaiverDto = {
  id: "ltw_1",
  payAppId: "pa_1",
  party: "Valley Insulation",
  partyKind: "subcontractor",
  partyEmail: null,
  kind: "conditional-progress",
  throughDate: "2026-10-31",
  amountCents: 250_000,
  requestedOn: null,
  receivedOn: null,
  note: null,
  status: "owed",
  daysWaiting: null,
  files: [],
};
const list: LowerTierWaiversDto = {
  items: [owed],
  summaries: { pa_1: summarizeLowerTier([owed]) },
  previous: [],
  partyEmails: {},
  canEdit: true,
  today: "2026-11-26",
};
const jobCost = {
  commitments: [
    { vendor: "ABC Supply", kind: "purchase_order", invoicedCents: 40_000, afterAsOf: false },
    { vendor: "Rio Rentals", kind: "purchase_order", invoicedCents: 0, afterAsOf: false },
    { vendor: "Valley Insulation", kind: "subcontract", invoicedCents: 9_000, afterAsOf: false },
  ],
};

it("offers the job's vendors, adds the ticked ones and records a received waiver", async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes("/job-cost")) return Response.json(jobCost);
      if (method === "GET") return Response.json(list);
      return Response.json(method === "POST" ? [] : owed);
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LowerTierWaiversPanel
        orgId="o"
        projectId="p"
        payAppId="pa_1"
        periodTo="2026-10-31"
        job={{ name: "Mesa Clinic TI", number: "24-117", gcName: "Copper State Builders" }}
        contractorName="Test Mechanical"
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(/0 of 1 in; still out: Valley Insulation/)).toBeTruthy();
  // Valley is already listed, so only the other two are offered; ABC (invoiced) is pre-ticked.
  const abc = await screen.findByLabelText(/ABC Supply/);
  const rio = screen.getByLabelText(/Rio Rentals/);
  expect((abc as HTMLInputElement).checked).toBe(true);
  expect((rio as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/nothing invoiced yet/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Add 1 through 2026-10-31" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  const post = calls.find((c) => c.method === "POST");
  expect(post?.url).toBe("/api/orgs/o/projects/p/lower-tier-waivers/bulk");
  expect(post?.body).toEqual({
    payAppId: "pa_1",
    items: [
      {
        party: "ABC Supply",
        partyKind: "supplier",
        kind: "conditional-progress",
        throughDate: "2026-10-31",
      },
    ],
  });

  fireEvent.click(screen.getByRole("button", { name: "Received today" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  const patch = calls.find((c) => c.method === "PATCH");
  expect(patch?.url).toBe("/api/orgs/o/projects/p/lower-tier-waivers/ltw_1");
  expect(patch?.body).toEqual({ receivedOn: "2026-11-26" });

  // The email draft carries the job, the GC, the amount and the period end.
  const email = screen.getByRole("link", { name: "Email" }) as HTMLAnchorElement;
  const body = decodeURIComponent(email.href.split("body=")[1] ?? "");
  expect(body).toContain("Copper State Builders on Mesa Clinic TI (job 24-117)");
  expect(body).toContain("through 2026-10-31 for $2,500.00");
});

function panel() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <LowerTierWaiversPanel
        orgId="o"
        projectId="p"
        payAppId="pa_1"
        periodTo="2026-10-31"
        job={{ name: "Mesa Clinic TI", number: "24-117", gcName: "Copper State Builders" }}
        contractorName="Test Mechanical"
      />
    </QueryClientProvider>
  );
}

it("files the signed waiver on its row as a pay-app attachment and links the filed file", async () => {
  const filed: LowerTierWaiverDto = {
    ...owed,
    id: "ltw_2",
    party: "ABC Supply",
    receivedOn: "2026-11-20",
    status: "received",
    files: [
      { id: "att_9", fileName: "ABC waiver.pdf", contentType: "application/pdf", sizeBytes: 9 },
    ],
  };
  const uploads: { url: string; form: FormData }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/job-cost")) return Response.json({ commitments: [] });
      if (init?.method === "POST" && init.body instanceof FormData) {
        uploads.push({ url, form: init.body });
        return Response.json({ id: "att_10" }, { status: 201 });
      }
      return Response.json({ ...list, items: [owed, filed] });
    }),
  );
  render(panel());
  const link = (await screen.findByRole("link", { name: "ABC waiver.pdf" })) as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/api/orgs/o/projects/p/pay-apps/pa_1/attachments/att_9");
  expect(screen.getByText("Attach another")).toBeTruthy();

  const input = screen.getByLabelText("Attach Valley Insulation's signed waiver");
  const file = new File(["%PDF-1.4"], "Valley waiver.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(uploads).toHaveLength(1));
  expect(uploads[0]?.url).toBe("/api/orgs/o/projects/p/pay-apps/pa_1/attachments");
  expect(uploads[0]?.form.get("lowerTierWaiverId")).toBe("ltw_1");
  expect(uploads[0]?.form.get("category")).toBe("backup");
  expect((uploads[0]?.form.get("file") as File | undefined)?.name).toBe("Valley waiver.pdf");
});

it("refuses a waiver file the backup packet could not include", () => {
  expect(waiverFileProblem({ name: "waiver.pdf", sizeBytes: 100 })).toBeNull();
  expect(waiverFileProblem({ name: "waiver.JPG", sizeBytes: 100 })).toBeNull();
  expect(waiverFileProblem({ name: "waiver.docx", sizeBytes: 100 })).toMatch(/PDF or a JPEG/);
  expect(waiverFileProblem({ name: "waiver.pdf", sizeBytes: 0 })).toMatch(/empty/);
});

it("addresses the request to the party's saved email and saves a typed one with the row", async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes("/job-cost")) return Response.json(jobCost);
      if (method === "GET") {
        // Valley's address was saved on another job's row: this row has none of its own.
        return Response.json({
          ...list,
          partyEmails: { "valley insulation": "ap@valley.example", "abc supply": "ar@abc.example" },
        });
      }
      return Response.json(method === "POST" ? [] : owed);
    }),
  );
  render(panel());
  const email = (await screen.findByRole("link", { name: "Email" })) as HTMLAnchorElement;
  expect(email.href.startsWith("mailto:ap@valley.example?subject=")).toBe(true);
  expect(screen.getByText("ap@valley.example")).toBeTruthy();
  // The suggestion shows the address it will be added with.
  expect(screen.getByLabelText(/ABC Supply/).parentElement?.textContent).toContain(
    "ar@abc.example",
  );

  // Changing the address saves it on the row (blank would clear it).
  vi.stubGlobal(
    "prompt",
    vi.fn(() => " new@valley.example "),
  );
  fireEvent.click(screen.getByRole("button", { name: "Change address" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
    partyEmail: "new@valley.example",
  });

  // A party typed in with an address sends it; the ticked suggestions leave it to the Worker.
  fireEvent.change(screen.getByLabelText("Supplier or sub-subcontractor"), {
    target: { value: "Desert Steel" },
  });
  fireEvent.change(screen.getByLabelText("Email (optional)"), {
    target: { value: "office@desertsteel.example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({
    payAppId: "pa_1",
    items: [
      {
        party: "Desert Steel",
        partyKind: null,
        partyEmail: "office@desertsteel.example",
        kind: "conditional-progress",
        throughDate: "2026-10-31",
      },
    ],
  });
});
