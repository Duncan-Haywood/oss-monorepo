// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourDef } from "./tour";

vi.mock("@client/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  orgApi: (orgId: string, path = "") => `/api/orgs/${orgId}${path}`,
  api: vi.fn(async () => ({ user: { id: "usr_1", email: "a@b.c", name: "A" }, memberships: [] })),
}));
vi.mock("@client/lib/auth-client", () => ({ authClient: {} }));

const { TakeTourButton, Tour } = await import("./tour");
const { FACT_BASE_TOUR, APPLICATION_REVIEW_TOUR, AUTOMATION_TOUR } = await import("./tours");

const TOUR: TourDef = {
  id: "demo",
  title: "Demo tour",
  steps: [
    { target: "one", title: "First thing", body: "About the first thing." },
    { target: "missing", title: "Not on the page", body: "Skipped." },
    { target: "two", title: "Second thing", body: "About the second thing." },
  ],
};

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <button type="button">Outside</button>
      <div data-tour="one">One</div>
      <div data-tour="two">Two</div>
      {children}
    </div>
  );
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** Renders the tour button, then its second target only after a delay (data loading). */
function DelayedTargetHarness() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <TakeTourButton tour={TOUR} />
      {show && <div data-tour="two">Loaded later</div>}
    </>
  );
}

beforeEach(() => window.localStorage.clear());

describe("<Tour>", () => {
  it("walks next/back through steps whose targets exist", async () => {
    const onEnd = vi.fn();
    render(
      <Page>
        <Tour tour={TOUR} open onEnd={onEnd} />
      </Page>,
    );
    const dialog = screen.getByRole("dialog", { name: "First thing" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("About the first thing.");
    expect(dialog).toHaveTextContent("Step 1 of 2");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog", { name: "Second thing" })).toHaveTextContent("Step 2 of 2");
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog", { name: "First thing" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onEnd).toHaveBeenCalledWith("finished");
  });

  it("traps focus inside the popover and closes on Escape", async () => {
    const onEnd = vi.fn();
    render(
      <Page>
        <Tour tour={TOUR} open onEnd={onEnd} />
      </Page>,
    );
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toHaveFocus();
    // Last focusable is Next: Tab wraps to the first (Close), Shift+Tab wraps back.
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close tour" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(next).toHaveFocus();
    for (let i = 0; i < 5; i++) await userEvent.tab();
    expect(screen.getByRole("button", { name: "Outside" })).not.toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(onEnd).toHaveBeenCalledWith("closed");
  });
});

describe("<TakeTourButton>", () => {
  it("auto-starts once per user and persists that it was seen", async () => {
    const first = renderWithQuery(
      <Page>
        <TakeTourButton tour={TOUR} />
      </Page>,
    );
    expect(await screen.findByRole("dialog", { name: "First thing" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("ga.guide.tour.demo.usr_1")).toBe("closed");
    first.unmount();

    renderWithQuery(
      <Page>
        <TakeTourButton tour={TOUR} />
      </Page>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The header button still starts it on demand.
    await userEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(screen.getByRole("dialog", { name: "First thing" })).toBeInTheDocument();
  });

  it("'Don't show again' stops every automatic tour for this user", async () => {
    const first = renderWithQuery(
      <Page>
        <TakeTourButton tour={TOUR} />
      </Page>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Don't show again" }));
    expect(window.localStorage.getItem("ga.guide.tour.demo.usr_1")).toBe("never");
    expect(window.localStorage.getItem("ga.guide.tours-optout.usr_1")).toBe("1");
    first.unmount();

    renderWithQuery(
      <Page>
        <TakeTourButton tour={{ ...TOUR, id: "other" }} />
      </Page>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits for targets that render after data loads", async () => {
    renderWithQuery(<DelayedTargetHarness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("dialog", { name: "Second thing" }, { timeout: 2000 }),
    ).toHaveTextContent("Step 1 of 1");
  });
});

describe("tour scripts", () => {
  it("cover the fact base, application review and automation settings", () => {
    for (const t of [FACT_BASE_TOUR, APPLICATION_REVIEW_TOUR, AUTOMATION_TOUR]) {
      expect(t.steps.length).toBeGreaterThanOrEqual(3);
      for (const s of t.steps) expect(s.body.length).toBeGreaterThan(20);
    }
    expect(FACT_BASE_TOUR.steps[0]?.body).toMatch(/proposed|checked/i);
  });
});
