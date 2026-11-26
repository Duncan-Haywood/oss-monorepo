// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "org_1";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: Record<string, unknown>) => (
    <a
      href={String(to).replace("$orgId", String((params as { orgId?: string })?.orgId))}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {children as React.ReactNode}
    </a>
  ),
  useParams: () => ({ orgId: ORG_ID }),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: `/orgs/${ORG_ID}/settings/autopilot` } }),
  useNavigate: () => vi.fn(),
}));

const baseSettings = {
  orgId: ORG_ID,
  autopilotEnabled: false,
  autoSubmitMaxCents: 1_000_000,
  fullReviewAboveCents: 10_000_000,
  minFitScoreForAuto: 80,
  highLikelihoodThreshold: 0.6,
  reviewFirstSubmissionPerFunder: true,
  maxAutoSubmissionsPerMonth: 5,
  allowUnconfirmedFactsInDrafts: true,
  autoDraftTopN: 3,
  notifyEmails: [],
  automationLevel: "prepared",
  requireMatchApproval: null,
  requireFactConfirmation: null,
  requireDraftReview: null,
  requireSubmissionApproval: null,
  requireFollowupApproval: null,
  twoPersonRuleAboveCents: null,
};

let role = "admin";
let previewResponse: unknown = null;
const calls: { path: string; init?: { method?: string; body?: unknown } }[] = [];

vi.mock("@client/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@client/lib/api")>();
  return {
    ...actual,
    api: vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
      calls.push({ path, init });
      // Signed out as far as /api/me goes, so the automation tour never auto-starts here.
      if (path === "/api/me") throw new actual.ApiError(401, "unauthorized", "Signed out");
      if (path === `/api/orgs/${ORG_ID}`) {
        return {
          org: { id: ORG_ID, name: "Southwest Indian Foundation", slug: "swif" },
          role,
          profile: {},
          settings: baseSettings,
        };
      }
      if (path.endsWith("/settings/automation-preview")) {
        if (previewResponse) return previewResponse;
        throw new actual.ApiError(404, "not_found", "Not found");
      }
      if (path.endsWith("/settings")) return baseSettings;
      return { items: [] };
    }),
  };
});

const { AutopilotSettingsPage } = await import("./autopilot");

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AutopilotSettingsPage />
    </QueryClientProvider>,
  );
}

const timelineMode = (stage: string) =>
  screen
    .getByRole("list", { name: "What the AI will do for you" })
    .querySelector(`[data-stage="${stage}"]`)
    ?.getAttribute("data-mode");

beforeEach(() => {
  role = "admin";
  previewResponse = null;
  calls.length = 0;
});

// Generous timeout: several dialog/radio interactions per test on a shared 4-CPU machine.
describe("<AutopilotSettingsPage>", { timeout: 20_000 }, () => {
  it("starts at the saved level and updates the timeline live when the level changes", async () => {
    const user = userEvent.setup();
    renderPage();
    const prepared = await screen.findByRole("radio", { name: /Prepared/ });
    expect(prepared).toBeChecked();
    expect(timelineMode("draft")).toBe("automatic");
    expect(timelineMode("submit")).toBe("approve");

    await user.click(screen.getByRole("radio", { name: /Manual/ }));
    expect(screen.getByRole("radio", { name: /Manual/ })).toBeChecked();
    expect(timelineMode("find")).toBe("automatic");
    expect(timelineMode("draft")).toBe("you");
    expect(timelineMode("followup")).toBe("you");
    expect(screen.getByTestId("level-card")).toHaveTextContent(/Start every draft yourself/);

    await user.click(screen.getByRole("radio", { name: /Assisted/ }));
    expect(timelineMode("draft")).toBe("approve");
  });

  it("asks for consent naming the org and the money-back guarantee before raising to Full", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("radio", { name: /Full autopilot/ }));

    const dialog = await screen.findByRole("dialog", {
      name: "Turn on Full autopilot for Southwest Indian Foundation?",
    });
    expect(dialog).toHaveTextContent(/On behalf of Southwest Indian Foundation/);
    expect(dialog).toHaveTextContent(/30-day money-back guarantee/);
    // Not applied until agreed.
    expect(screen.getByRole("radio", { name: /Prepared/ })).toBeChecked();
    const agree = within(dialog).getByRole("button", { name: "Agree and turn on Full autopilot" });
    expect(agree).toBeDisabled();

    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(agree);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("radio", { name: /Full autopilot/ })).toBeChecked();
    expect(timelineMode("submit")).toBe("automatic");

    await user.click(screen.getByRole("button", { name: "Save automation settings" }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.init?.method === "PATCH")?.init?.body as Record<
      string,
      unknown
    >;
    expect(patch.automationLevel).toBe("full");
    // autopilotEnabled=true is what records the autopilot_submission consent server-side.
    expect(patch.autopilotEnabled).toBe(true);
    expect(patch.requireFollowupApproval).toBeNull();
  });

  it("keeps the current level when the consent dialog is dismissed", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("radio", { name: /Supervised/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Keep current level" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("radio", { name: /Prepared/ })).toBeChecked();
  });

  it("does not ask for consent when lowering the level", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("radio", { name: /Assisted/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("radio", { name: /Assisted/ })).toBeChecked();
  });

  it("always shows the locked safety rails with no controls", async () => {
    renderPage();
    const rails = await screen.findByRole("list", { name: "Safety rails (always on)" });
    expect(screen.getByText("Always on, at every level")).toBeInTheDocument();
    expect(within(rails).getAllByRole("listitem")).toHaveLength(9);
    for (const label of [
      "Grounding check passed",
      "No open blockers",
      "Only confirmed facts",
      "Verified recipient email",
      "Autopilot consent on file",
      "Deadline not passed",
      "Human edits need approval",
      "Billing active",
      "No injection warnings on sources",
    ]) {
      expect(within(rails).getByText(label)).toBeInTheDocument();
    }
    expect(within(rails).queryAllByRole("switch")).toHaveLength(0);
    expect(within(rails).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(rails).queryAllByRole("button")).toHaveLength(0);
  });

  it("locks fact confirmation on at Supervised", async () => {
    const user = userEvent.setup();
    renderPage();
    const factSwitch = await screen.findByRole("switch", {
      name: "Confirm facts before drafts rely on them",
    });
    expect(factSwitch).not.toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /Supervised/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: /Agree and turn on/ }));
    expect(factSwitch).toBeDisabled();
    expect(factSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("is read-only for non-admins", async () => {
    role = "editor";
    renderPage();
    expect(await screen.findByText("View only")).toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    for (const sw of screen.getAllByRole("switch")) expect(sw).toBeDisabled();
    expect(screen.getByLabelText("Auto-submit only up to")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save automation settings" })).toBeNull();
    // The rails are still explained to everyone.
    expect(screen.getByRole("list", { name: "Safety rails (always on)" })).toBeInTheDocument();
  });

  it("renders the server preview for saved settings", async () => {
    previewResponse = {
      examples: [
        {
          label: "Server example grant",
          amountCents: 250_000,
          fitScore: 91,
          likelihood: 0.3,
          firstToFunder: false,
          tier: "one_click",
          reasons: ["Prepared: a person approves every submission"],
        },
      ],
    };
    renderPage();
    const table = await screen.findByRole("table", { name: /How example grants would be routed/ });
    expect(await within(table).findByText("Server example grant")).toBeInTheDocument();
    expect(within(table).getByText("$2,500")).toBeInTheDocument();
    expect(within(table).getByText("One-click approval")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/settings/automation-preview"))).toBe(true);
  });

  it("falls back to the client preview when the endpoint is missing, and follows unsaved changes", async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole("table", { name: /How example grants would be routed/ });
    expect(within(table).getByText("Tool & equipment mini-grant")).toBeInTheDocument();
    expect(within(table).queryByText("Automatic")).toBeNull();
    expect(within(table).getAllByText("Full review")).toHaveLength(1);

    await user.click(screen.getByRole("radio", { name: /Manual/ }));
    expect(within(table).getAllByText("Full review")).toHaveLength(3);
    expect(screen.getByText(/aren't saved yet/)).toBeInTheDocument();
  });
});
