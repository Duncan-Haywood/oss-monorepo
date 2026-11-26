// @vitest-environment happy-dom
import type { GuideDto } from "@shared/guide";
import { GUIDE_STEPS } from "@shared/guide";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "org_1";
const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ orgId: ORG_ID }),
}));

let guide: GuideDto;
vi.mock("@client/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  orgApi: (orgId: string, path = "") => `/api/orgs/${orgId}${path}`,
  api: vi.fn(async (path: string) => {
    if (path === "/api/me")
      return { user: { id: "usr_1", email: "a@b.c", name: "A" }, memberships: [] };
    if (path === `/api/orgs/${ORG_ID}/guide`) return guide;
    throw new Error(`unexpected ${path}`);
  }),
}));
vi.mock("@client/lib/auth-client", () => ({ authClient: {} }));

const { GettingStartedChecklist, GuideProgressPill, GuideNextStep } = await import(
  "./getting-started"
);

function makeGuide(doneKeys: string[]): GuideDto {
  const steps = GUIDE_STEPS.map((m) => ({ ...m, done: doneKeys.includes(m.key) }));
  const first = steps.find((s) => !s.done);
  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    total: steps.length,
    complete: !first,
    nextStep: first?.key ?? null,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  navigate.mockClear();
});

describe("<GettingStartedChecklist>", () => {
  it("renders every step with its status, why, time and a deep link", async () => {
    guide = makeGuide(["profile"]);
    guide.steps[1] = {
      ...(guide.steps[1] as (typeof guide.steps)[number]),
      detail: "2 of 3 uploaded",
      progress: { current: 2, target: 3 },
    };
    renderWithQuery(<GettingStartedChecklist orgId={ORG_ID} />);

    const list = await screen.findByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(9);
    expect(items[0]).toHaveTextContent("Step 1, done: Complete your profile");
    expect(items[1]).toHaveTextContent("Step 2, not done yet");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[1]).toHaveTextContent("About 10 min");
    expect(items[1]).toHaveTextContent("2 of 3 uploaded");
    expect(items[1]).toHaveTextContent(/every fact in a draft comes from/);

    const facts = within(items[2] as HTMLElement).getByRole("link", {
      name: /Review facts: Confirm 10 facts/,
    });
    expect(facts).toHaveAttribute("href", `/orgs/${ORG_ID}/knowledge/facts?status=proposed`);
    expect(within(items[0] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      `/orgs/${ORG_ID}/settings/general`,
    );
    expect(screen.getByRole("progressbar", { name: /1 of 9 done/ })).toBeInTheDocument();
  });

  it("navigates client-side on click", async () => {
    guide = makeGuide([]);
    renderWithQuery(<GettingStartedChecklist orgId={ORG_ID} />);
    await userEvent.click(await screen.findByRole("link", { name: /Invite someone/ }));
    expect(navigate).toHaveBeenCalledWith({ href: `/orgs/${ORG_ID}/settings/members` });
  });

  it("hides on request (per user, in localStorage) and collapses into the pill", async () => {
    guide = makeGuide(["profile", "documents"]);
    renderWithQuery(
      <>
        <GuideProgressPill orgId={ORG_ID} />
        <GettingStartedChecklist orgId={ORG_ID} />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Hide checklist" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`ga.guide.checklist.usr_1.${ORG_ID}`)).toBe("1");
    const pill = screen.getByRole("link", { name: /Getting started: 2 of 9 steps done/ });
    expect(pill).toHaveTextContent("2/9");

    await userEvent.click(pill);
    expect(window.localStorage.getItem(`ga.guide.checklist.usr_1.${ORG_ID}`)).toBeNull();
    expect(await screen.findByRole("list")).toBeInTheDocument();
  });

  it("renders nothing when complete; the pill says all set", async () => {
    guide = makeGuide(GUIDE_STEPS.map((s) => s.key));
    renderWithQuery(
      <>
        <GuideProgressPill orgId={ORG_ID} />
        <GettingStartedChecklist orgId={ORG_ID} />
      </>,
    );
    expect(await screen.findByRole("link", { name: /Setup complete/ })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("still works when localStorage throws", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    guide = makeGuide([]);
    renderWithQuery(<GettingStartedChecklist orgId={ORG_ID} />);
    expect(await screen.findByRole("list")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("<GuideNextStep>", () => {
  it("points an empty state at the next undone step, skipping the current page's step", async () => {
    guide = makeGuide(["profile"]);
    renderWithQuery(<GuideNextStep orgId={ORG_ID} except="documents" />);
    const link = await screen.findByRole("link", { name: /Confirm 10 facts/ });
    expect(link).toHaveAttribute("href", `/orgs/${ORG_ID}/knowledge/facts?status=proposed`);
  });
});
