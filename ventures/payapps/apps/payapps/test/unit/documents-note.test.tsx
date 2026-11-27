// @vitest-environment happy-dom
// The pay application's documents note, its backup offer, the Projects page alert and a document's
// files (with the W-9 consent), from the company documents list.
import type { CompanyDocumentDto, CompanyDocumentListDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  DocumentFiles,
  DocumentsAlert,
  DocumentsBackupOffer,
  documentStatusText,
  PayAppDocumentsNote,
} from "../../src/client/pages/documents";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const doc = (over: Partial<CompanyDocumentDto> = {}): CompanyDocumentDto => ({
  id: "cdoc_1",
  kind: "contractor_license",
  label: null,
  issuer: null,
  jurisdiction: "CA",
  classification: null,
  number: null,
  effectiveOn: null,
  expiresOn: "2027-01-31",
  notes: null,
  archived: false,
  name: "Contractor's license (CA)",
  status: "current",
  daysLeft: 60,
  files: [],
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

async function mount(list: CompanyDocumentListDto, ui: ReactNode) {
  const fetchMock = vi.fn(async (_url: string) => Response.json(list));
  vi.stubGlobal("fetch", fetchMock);
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={new QueryClient()}>
        {ui}
        <p>loaded</p>
      </QueryClientProvider>
    ),
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
  await screen.findByText("loaded");
  return fetchMock;
}

it("warns a draft dated after a license's expiry, and not about undated or archived ones", async () => {
  const fetchMock = await mount(
    {
      today: "2026-12-01",
      items: [
        doc({ id: "lic" }),
        doc({ id: "w9", kind: "w9", name: "W-9", expiresOn: null, status: "no_expiry" }),
        doc({ id: "old", name: "Bonding letter", expiresOn: "2026-12-01", archived: true }),
      ],
    },
    <PayAppDocumentsNote orgId="org_1" applicationDate="2027-02-01" />,
  );
  expect(await screen.findByText(/Contractor's license \(CA\) expired 2027-01-31/)).toBeTruthy();
  expect(screen.queryByText(/W-9/)).toBeNull();
  expect(screen.queryByText(/Bonding letter/)).toBeNull();
  expect(screen.getByRole("link", { name: "Update documents" })).toBeTruthy();
  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/orgs/org_1/documents");
});

it("says nothing on the Projects page while every document is current or undated", async () => {
  await mount(
    {
      today: "2026-12-01",
      items: [doc(), doc({ id: "w9", kind: "w9", expiresOn: null, status: "no_expiry" })],
    },
    <DocumentsAlert orgId="org_1" />,
  );
  expect(screen.queryByRole("status")).toBeNull();
});

it("names an expiring document on the Projects page", async () => {
  await mount(
    {
      today: "2026-12-01",
      items: [doc({ status: "expiring", daysLeft: 9, expiresOn: "2026-12-10" })],
    },
    <DocumentsAlert orgId="org_1" />,
  );
  expect(
    (await screen.findByRole("status")).textContent?.startsWith(
      "Contractor's license (CA): expires in 9 days (2026-12-10).",
    ),
  ).toBe(true);
});

it("words each status", () => {
  expect(documentStatusText({ status: "no_expiry", daysLeft: null })).toBe("No expiry date");
  expect(documentStatusText({ status: "expired", daysLeft: 0 })).toBe("Expires today");
  expect(documentStatusText({ status: "expired", daysLeft: -4 })).toBe("Expired 4 days ago");
  expect(documentStatusText({ status: "expiring", daysLeft: 1 })).toBe("Expires in 1 day");
});

const pdf = (id: string, fileName: string) => ({
  id,
  fileName,
  contentType: "application/pdf",
  sizeBytes: 10,
  category: "backup" as const,
  createdAt: "2026-11-01T00:00:00.000Z",
});

function routed(list: CompanyDocumentListDto, role: string, onApp: { fileName: string }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/me") {
        return Response.json({ user: { id: "u" }, memberships: [{ orgId: "org_1", role }] });
      }
      if (url.endsWith("/from-documents")) return Response.json(pdf("att_9", "x"), { status: 201 });
      if (url.endsWith("/attachments")) {
        return Response.json({
          items: onApp,
          storage: { usedBytes: 0, limitBytes: 1_000_000 },
          enabled: true,
        });
      }
      return Response.json(list);
    }),
  );
  return calls;
}

function mountUi(ui: ReactNode) {
  const rootRoute = createRootRoute({
    component: () => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  render(<RouterProvider router={router as never} />);
}

it("offers active documents' files for the pay app's backup, marks a lapsed one, and copies", async () => {
  const calls = routed(
    {
      today: "2026-12-01",
      items: [
        doc({ id: "lic", files: [pdf("f1", "CSLB card.pdf")] }),
        doc({
          id: "bond",
          kind: "bonding_letter",
          name: "Bonding letter",
          status: "expired",
          daysLeft: -3,
          files: [pdf("f2", "Bond letter.pdf")],
        }),
        doc({ id: "w9", kind: "w9", name: "W-9", files: [pdf("f3", "W-9.pdf")] }),
        doc({ id: "old", archived: true, files: [pdf("f4", "Old card.pdf")] }),
      ],
    },
    "editor",
    [{ fileName: "W-9.pdf" }],
  );
  mountUi(<DocumentsBackupOffer orgId="org_1" base="/api/orgs/org_1/projects/p/pay-apps/a" />);
  expect(await screen.findByText("Licenses and documents on file")).toBeTruthy();
  expect(screen.queryByText(/Old card.pdf/)).toBeNull();
  expect(screen.getByText("Expired 3 days ago")).toBeTruthy();
  // Already on the pay app (same file name): not offered again.
  expect(await screen.findByText("In the backup")).toBeTruthy();
  const buttons = screen.getAllByRole("button", { name: "Add to backup" });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0] as HTMLElement);
  await waitFor(() => expect(screen.getAllByText("In the backup")).toHaveLength(2));
  const post = calls.find((c) => c.url.endsWith("/from-documents"));
  expect(post?.url).toBe("/api/orgs/org_1/projects/p/pay-apps/a/attachments/from-documents");
  expect(JSON.parse(String(post?.init?.body))).toEqual({ documentId: "lic", fileId: "f1" });
});

it("shows viewers no backup offer", async () => {
  routed({ today: "2026-12-01", items: [doc({ files: [pdf("f1", "card.pdf")] })] }, "viewer", []);
  mountUi(
    <>
      <DocumentsBackupOffer orgId="org_1" base="/api/orgs/org_1/projects/p/pay-apps/a" />
      <p>done</p>
    </>,
  );
  await screen.findByText("done");
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("Licenses and documents on file")).toBeNull();
});

it("asks before keeping a signed W-9, then sends the consent with the upload", async () => {
  const calls = routed({ today: "2026-12-01", items: [] }, "editor", []);
  mountUi(<DocumentFiles orgId="org_1" doc={{ id: "w9", kind: "w9", files: [] }} canEdit />);
  expect(await screen.findByText(/shows your taxpayer identification number/)).toBeTruthy();
  expect(calls.some((c) => c.url.endsWith("/attachments"))).toBe(false);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(await screen.findByText(/Keep the document itself with its record/)).toBeTruthy();
  await waitFor(() =>
    expect(calls.some((c) => c.url === "/api/orgs/org_1/documents/w9/attachments")).toBe(true),
  );
});

it("goes straight to the files for any other kind", async () => {
  routed({ today: "2026-12-01", items: [] }, "editor", []);
  mountUi(
    <DocumentFiles
      orgId="org_1"
      doc={{ id: "lic", kind: "contractor_license", files: [] }}
      canEdit
    />,
  );
  expect(await screen.findByText(/Keep the document itself with its record/)).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: /Keep the signed W-9/ })).toBeNull();
});
