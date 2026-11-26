// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "org_1";
const calls: { path: string; init?: { method?: string; body?: unknown } }[] = [];

vi.mock("@client/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@client/lib/api")>();
  return {
    ...actual,
    api: vi.fn(async (path: string, init?: { method?: string; body?: unknown }) => {
      calls.push({ path, init });
      if (path === `/api/orgs/${ORG_ID}`) {
        return {
          org: { id: ORG_ID, name: "Gallup Youth Center", slug: "gyc" },
          role: "owner",
          profile: {},
          settings: {
            autopilotEnabled: false,
            autoSubmitMaxCents: 1_000_000,
            fullReviewAboveCents: 10_000_000,
            reviewFirstSubmissionPerFunder: true,
            autoDraftTopN: 3,
            automationLevel: null,
          },
        };
      }
      return {};
    }),
  };
});

const { AutopilotStep } = await import("./autopilot-step");

function renderStep(onFinish = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AutopilotStep orgId={ORG_ID} onFinish={onFinish} onBack={() => {}} />
    </QueryClientProvider>,
  );
  return onFinish;
}

const lastPatch = () =>
  calls.filter((c) => c.init?.method === "PATCH").at(-1)?.init?.body as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
});

// Generous timeout: several dialog/radio interactions per test on a shared 4-CPU machine.
describe("<AutopilotStep>", { timeout: 20_000 }, () => {
  it("defaults to the recommended Prepared level in a compact selector", async () => {
    const user = userEvent.setup();
    const onFinish = renderStep();
    expect(await screen.findByRole("radio", { name: /Prepared/ })).toBeChecked();
    expect(screen.getByTestId("level-card")).not.toHaveTextContent("For example");
    expect(screen.queryByLabelText("Auto-submit only up to")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    expect(lastPatch()).toMatchObject({ automationLevel: "prepared", autopilotEnabled: false });
  });

  it("asks for consent before Supervised and then shows the dollar limits", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(await screen.findByRole("radio", { name: /Supervised/ }));
    const dialog = await screen.findByRole("dialog", {
      name: "Turn on Supervised for Gallup Youth Center?",
    });
    expect(dialog).toHaveTextContent(/money-back guarantee/);
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: /Agree and turn on/ }));
    expect(screen.getByRole("radio", { name: /Supervised/ })).toBeChecked();
    expect(screen.getByLabelText("Auto-submit only up to")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    await waitFor(() =>
      expect(lastPatch()).toMatchObject({ automationLevel: "supervised", autopilotEnabled: true }),
    );
  });
});
