// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmissionsPanel } from "./submissions-panel";
import { json, makeSubmission, mockFetch } from "./test-fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/mock">{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ orgId: "org_1" }),
}));

const PKG = "/api/orgs/org_1/submissions/sub_1/package";

function renderPanel(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("SubmissionsPanel", () => {
  it("renders the manual guide steps in order with copy buttons, an Open link and integrity", async () => {
    mockFetch([["GET", PKG, () => json({ ok: true }, 200, { "X-Package-Integrity": "verified" })]]);
    const user = userEvent.setup(); // installs a clipboard stub on navigator
    renderPanel(
      <SubmissionsPanel submissions={[makeSubmission()]} orgId="org_1" canConfirm={true} />,
    );

    expect(
      screen.getByRole("heading", { name: "Submit via Grants.gov Workspace DOL-ETA-27-001" }),
    ).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Submission steps" })).getAllByRole(
      "listitem",
    );
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Step 1: Sign in to Grants.gov");
    expect(steps[2]).toHaveTextContent("Step 3: Run Check for Errors");
    await user.click(screen.getByRole("button", { name: "Copy step 2" }));
    expect(await navigator.clipboard.readText()).toBe(
      "Find opportunity DOL-ETA-27-001 and create a Workspace.",
    );
    expect(screen.getByRole("button", { name: "Copy step 2 (copied)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Open/ })).toHaveAttribute(
      "href",
      "https://www.grants.gov/search-results-detail/DOL-ETA-27-001",
    );
    expect(screen.getByText("9f86d081884c")).toBeInTheDocument();
    expect(await screen.findByText("Integrity verified")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Package \(JSON\)/ })).toHaveAttribute(
      "href",
      `${PKG}?download=1`,
    );
    expect(screen.getByRole("link", { name: /Package \(Markdown\)/ })).toHaveAttribute(
      "href",
      `${PKG}?format=md&download=1`,
    );
  });

  it("posts the optional reference number when marked as submitted", async () => {
    const calls = mockFetch([
      ["GET", PKG, () => json({}, 200, { "X-Package-Integrity": "verified" })],
      [
        "POST",
        "/api/orgs/org_1/submissions/sub_1/confirm",
        () => makeSubmission({ status: "confirmed", externalRef: "GRANT12345678" }),
      ],
    ]);
    const user = userEvent.setup();
    renderPanel(
      <SubmissionsPanel submissions={[makeSubmission()]} orgId="org_1" canConfirm={true} />,
    );
    await user.type(
      screen.getByLabelText("Confirmation / tracking number (optional)"),
      "GRANT12345678",
    );
    await user.click(screen.getByRole("button", { name: /mark as submitted/i }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")).toEqual({
        method: "POST",
        url: "/api/orgs/org_1/submissions/sub_1/confirm",
        body: { externalRef: "GRANT12345678" },
      }),
    );
  });

  it("does not link a non-http guide URL and flags a fingerprint mismatch", async () => {
    mockFetch([["GET", PKG, () => json({}, 200, { "X-Package-Integrity": "mismatch" })]]);
    const sub = makeSubmission();
    const guide = (sub.metadata as { guide: Record<string, unknown> }).guide;
    renderPanel(
      <SubmissionsPanel
        submissions={[{ ...sub, metadata: { guide: { ...guide, url: "javascript:alert(1)" } } }]}
        orgId="org_1"
        canConfirm={true}
      />,
    );
    expect(screen.queryByRole("link", { name: /^Open/ })).not.toBeInTheDocument();
    expect(await screen.findByText("Fingerprint mismatch")).toBeInTheDocument();
  });

  it("shows Submitted (and no guide) once the submission is confirmed", async () => {
    mockFetch([["GET", PKG, () => json({}, 200, { "X-Package-Integrity": "verified" })]]);
    renderPanel(
      <SubmissionsPanel
        submissions={[
          makeSubmission({
            status: "confirmed",
            externalRef: "GRANT00000042",
            confirmedAt: "2026-11-19T12:00:00.000Z",
          }),
        ]}
        orgId="org_1"
        canConfirm={true}
      />,
    );
    expect(screen.getByText(/^Submitted Nov 19, 2026/)).toBeInTheDocument();
    expect(screen.getByText("GRANT00000042")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as submitted/i })).not.toBeInTheDocument();
  });
});
