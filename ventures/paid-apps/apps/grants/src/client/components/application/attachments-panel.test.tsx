// @vitest-environment happy-dom
import type { AttachmentChecklistDto, SupportLetterDto } from "@shared/api/attachments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttachmentsPanel } from "./attachments-panel";
import { kindForRequirement } from "./attachments-queries";
import { mockFetch } from "./test-fixtures";

const BASE = "/api/orgs/org_1/applications/app_1";

const checklist = (over: Partial<AttachmentChecklistDto> = {}): AttachmentChecklistDto => ({
  items: [
    {
      id: "att_1",
      applicationId: "app_1",
      requirementName: "IRS determination letter",
      required: true,
      description: "",
      status: "matched",
      documentId: "doc_1",
      document: {
        id: "doc_1",
        title: "IRS letter 1999",
        kind: "other",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        status: "ready",
      },
      matchSource: "keyword",
      note: null,
      updatedAt: "2026-11-01T00:00:00Z",
    },
    {
      id: "att_2",
      applicationId: "app_1",
      requirementName: "Board list",
      required: true,
      description: "Names and affiliations",
      status: "missing",
      documentId: null,
      document: null,
      matchSource: null,
      note: null,
      updatedAt: "2026-11-01T00:00:00Z",
    },
  ],
  missingRequired: 1,
  totalBytes: 1000,
  emailLimitBytes: 10 * 1024 * 1024,
  ...over,
});

const letter = (over: Partial<SupportLetterDto> = {}): SupportLetterDto => ({
  id: "slr_1",
  applicationId: "app_1",
  partnerName: "Gallup Food Pantry",
  partnerEmail: "pantry@partner.test",
  status: "draft",
  dueAt: "2026-12-10T17:00:00Z",
  sentAt: null,
  receivedAt: null,
  tokenExpiresAt: null,
  receivedDocumentId: null,
  emailSubject: "Request for a letter of support: Rural Workforce Fund",
  emailIntro: "SWIF is applying to Example Foundation.",
  outline: ["Your commitment: [describe only what you are committing to]"],
  draftSource: "template",
  facts: [{ id: "fct_1", statement: "Gallup Food Pantry refers trainees." }],
  note: null,
  reminderCount: 0,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  ...over,
});

function renderPanel(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("AttachmentsPanel", () => {
  it("shows the checklist with statuses, the matched document and the missing-required warning", async () => {
    mockFetch([
      ["GET", `${BASE}/attachments`, () => checklist()],
      ["GET", `${BASE}/support-letters`, () => ({ items: [letter()] })],
    ]);
    renderPanel(<AttachmentsPanel orgId="org_1" applicationId="app_1" canEdit />);
    const list = await screen.findByRole("list", { name: "Attachments checklist" });
    const irs = within(list).getByRole("listitem", { name: "IRS determination letter" });
    expect(irs).toHaveTextContent("Matched");
    expect(irs).toHaveTextContent("IRS letter 1999");
    expect(irs).toHaveTextContent("Auto-matched");
    expect(within(list).getByRole("listitem", { name: "Board list" })).toHaveTextContent("Missing");
    expect(screen.getByText(/1 required attachment is missing/)).toBeInTheDocument();
    const letters = await screen.findByRole("list", { name: "Letter requests" });
    expect(within(letters).getByText("Gallup Food Pantry")).toBeInTheDocument();
    expect(within(letters).getByText("Draft")).toBeInTheDocument();
  });

  it("waives an attachment with a reason", async () => {
    const calls = mockFetch([
      ["GET", `${BASE}/attachments`, () => checklist()],
      ["GET", `${BASE}/support-letters`, () => ({ items: [] })],
      ["PATCH", `${BASE}/attachments/att_2`, () => checklist().items[1]],
    ]);
    const user = userEvent.setup();
    renderPanel(<AttachmentsPanel orgId="org_1" applicationId="app_1" canEdit />);
    await user.click(await screen.findByRole("button", { name: "Waive Board list" }));
    const submit = screen.getByRole("button", { name: "Waive attachment" });
    expect(submit).toBeDisabled();
    await user.type(
      screen.getByLabelText("Why is this attachment not needed?"),
      "Not requested for tribes",
    );
    await user.click(submit);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ action: "waive", reason: "Not requested for tribes" });
  });

  it("drafts and sends a letter request", async () => {
    const calls = mockFetch([
      ["GET", `${BASE}/attachments`, () => checklist({ items: [], missingRequired: 0 })],
      ["GET", `${BASE}/support-letters`, () => ({ items: [letter()] })],
      ["POST", `${BASE}/support-letters`, () => letter({ id: "slr_2" })],
      ["POST", `${BASE}/support-letters/slr_1/send`, () => letter({ status: "sent" })],
    ]);
    const user = userEvent.setup();
    renderPanel(<AttachmentsPanel orgId="org_1" applicationId="app_1" canEdit />);
    await user.click(await screen.findByRole("button", { name: "Request a letter" }));
    const form = screen.getByRole("form", { name: "Request a letter of support" });
    await user.type(within(form).getByLabelText(/Partner organization/), "Navajo Tech");
    await user.type(within(form).getByLabelText(/Partner email/), "nt@partner.test");
    await user.click(within(form).getByRole("button", { name: "Draft request" }));
    expect(
      calls.find((c) => c.method === "POST" && c.url === `${BASE}/support-letters`)?.body,
    ).toEqual({
      partnerName: "Navajo Tech",
      partnerEmail: "nt@partner.test",
    });
    await user.click(screen.getByText("Preview the request email"));
    expect(screen.getByText(/describe only what you are committing to/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/slr_1/send"))).toBe(true);
  });

  it("hides actions for viewers", async () => {
    mockFetch([
      ["GET", `${BASE}/attachments`, () => checklist()],
      ["GET", `${BASE}/support-letters`, () => ({ items: [letter()] })],
    ]);
    renderPanel(<AttachmentsPanel orgId="org_1" applicationId="app_1" canEdit={false} />);
    await screen.findByRole("list", { name: "Attachments checklist" });
    expect(screen.queryByRole("button", { name: /Waive/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Request a letter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send request" })).toBeNull();
  });

  it("guesses a document kind for uploads from the requirement name", () => {
    expect(kindForRequirement("Letters of support")).toBe("letter_of_support");
    expect(kindForRequirement("Most recent audit")).toBe("financial_statement");
    expect(kindForRequirement("Project budget")).toBe("budget");
    expect(kindForRequirement("Board list")).toBe("other");
  });
});
