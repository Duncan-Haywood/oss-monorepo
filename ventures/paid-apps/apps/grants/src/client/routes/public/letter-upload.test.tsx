// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "../../components/application/test-fixtures";
import { LetterUploadPage, letterFileProblem } from "./letter-upload";

const TOKEN = "a".repeat(43);

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ token: TOKEN }),
}));

const INFO = {
  orgName: "Southwest Indian Foundation",
  grantTitle: "Rural Workforce Fund",
  partnerName: "Gallup Food Pantry",
  dueAt: "2026-12-10T17:00:00Z",
  maxBytes: 10 * 1024 * 1024,
  acceptedTypes: ["application/pdf"],
};

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("LetterUploadPage", () => {
  it("explains what to upload and uploads the signed letter with consent", async () => {
    let uploaded: FormData | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url === `/api/letters/${TOKEN}`) return json(INFO);
      if (url === `/api/letters/${TOKEN}/upload` && init.method === "POST") {
        uploaded = init.body as FormData;
        return json({ received: true }, 201);
      }
      return json({ error: { code: "not_found", message: "nope" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage(<LetterUploadPage />);
    expect(
      await screen.findByRole("heading", { name: "Upload a letter of support" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Rural Workforce Fund")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What to upload" })).toBeInTheDocument();
    expect(screen.getByText(/any commitment you are actually able to make/)).toBeInTheDocument();

    // Submitting without a file or consent explains what is missing.
    await user.click(screen.getByRole("button", { name: /Upload letter/ }));
    expect(screen.getByText("Choose the signed letter to upload.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm you can share this letter.")).toBeInTheDocument();

    const file = new File(["%PDF-1.4"], "letter.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Signed letter (PDF or Word)"), file);
    await user.click(screen.getByLabelText(/I am allowed to share this letter/));
    await user.click(screen.getByRole("button", { name: /Upload letter/ }));
    expect(await screen.findByText("Thank you!")).toBeInTheDocument();
    const form = uploaded as FormData | null;
    expect(form?.get("consent")).toBe("true");
    expect((form?.get("file") as File | null)?.name).toBe("letter.pdf");
  });

  it("shows a clear message for an expired link", async () => {
    mockFetch([
      [
        "GET",
        `/api/letters/${TOKEN}`,
        () =>
          json(
            {
              error: {
                code: "link_expired",
                message: "This link has expired. Ask the organization to send a new one.",
              },
            },
            410,
          ),
      ],
    ]);
    renderPage(<LetterUploadPage />);
    expect(await screen.findByText("This link can't be used")).toBeInTheDocument();
    expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Signed letter (PDF or Word)")).toBeNull();
  });

  it("checks type and size before uploading", () => {
    expect(letterFileProblem(new File(["x"], "a.txt"))).toMatch(/PDF or Word/);
    expect(letterFileProblem(new File([], "a.pdf"))).toMatch(/empty/);
    expect(letterFileProblem(new File(["x"], "a.docx"))).toBeNull();
  });
});
