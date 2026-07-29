// @vitest-environment jsdom

/**
 * Behavioural tests for the swipe loop.
 *
 * There is no database in CI (or in an agent sandbox), so the runner can
 * never be exercised against the real API. These tests stand in for that:
 * they drive the component with a stubbed `fetch` and assert the states a
 * person actually lands in — cold start, resume, a failed fetch, and an
 * answer advancing to the next card.
 *
 * They are deliberately written against observable UI, not internals, so
 * they survive refactors of the component's state shape. That is the whole
 * point: they are what makes it safe to change the runner without being
 * able to run the app.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnifiedRunner } from "@/components/UnifiedRunner";

const LS_KEY = "survey:unified:session";

const BUNDLE = {
  firstName: "Ada",
  perspective: "PARTNER" as const,
  participants: { activities: "p-act" },
  domains: [{ slug: "activities", title: "Activities", kind: "ITEMS" as const }],
};

type Handler = (body: unknown) => { status?: number; json?: unknown };

/** Routes stubbed per test; anything unrouted fails loudly rather than hanging. */
function stubFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = routes[url];
    if (!handler) throw new Error(`unrouted fetch: ${url}`);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const { status = 200, json = {} } = handler(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const noAccount = () => ({ json: { user: null } });
const emptyStatus = () => ({ json: { status: {} } });

function itemsTrial(id: string, a: string, b: string, answeredCount = 0) {
  return {
    json: {
      trialId: id,
      itemA: { id: `${id}-a`, label: a },
      itemB: { id: `${id}-b`, label: b },
      answeredCount,
      confidence: 0.1,
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("UnifiedRunner", () => {
  it("shows the welcome screen when there is no stored session", async () => {
    stubFetch({ "/api/auth/me": noAccount });
    render(<UnifiedRunner />);
    expect(await screen.findByRole("button", { name: /Start our couples check-in/i })).toBeTruthy();
  });

  it("says what starting costs a signed-out person, before they start", async () => {
    stubFetch({ "/api/auth/me": noAccount });
    render(<UnifiedRunner />);

    // Goal 5 is "safe to hand to someone you love". The welcome screen is the
    // last point before data is written, and it is the only screen someone
    // who never signs in is guaranteed to see, so the claim and the policy
    // link belong here rather than only in /privacy.
    expect(await screen.findByText(/no name, no email/i)).toBeTruthy();
    const policy = screen.getByRole("link", { name: "Privacy" });
    expect(policy.getAttribute("href")).toBe("/privacy");
  });

  it("resumes straight into a question from a stored session", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => itemsTrial("t1", "Hiking", "Museums"),
    });

    render(<UnifiedRunner />);

    expect(await screen.findByText("Hiking")).toBeTruthy();
    expect(screen.getByText("Museums")).toBeTruthy();
    // The welcome screen must not flash in front of a resumable session.
    expect(screen.queryByText("Start our couples check-in")).toBeNull();
  });

  it("asks for exactly one question when resuming", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));
    const fetchMock = stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => itemsTrial("t1", "Hiking", "Museums"),
    });

    render(<UnifiedRunner />);
    await screen.findByText("Hiking");

    // Picking the opening domain used to happen inside the fetch effect, so
    // setting it re-ran the effect and a second question was requested
    // before the first arrived. `trials/next` creates a row every call, so
    // that was a wasted question and a skewed abandonment metric on every
    // single resume.
    const nextCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/trials/next");
    expect(nextCalls).toHaveLength(1);
  });

  it("ignores a stored bundle with no participant for its domains", async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ ...BUNDLE, participants: {} })
    );
    stubFetch({ "/api/auth/me": noAccount });

    render(<UnifiedRunner />);

    // A half-written bundle used to leave the runner spinning on "Loading next…"
    // with nothing to fetch. It must fall back to the welcome screen.
    expect(await screen.findByRole("button", { name: /Start our couples check-in/i })).toBeTruthy();
  });

  it("offers a retry when the next question cannot be fetched", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => ({ status: 500 }),
    });

    render(<UnifiedRunner />);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("offers a retry when the next-question fetch throws outright", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));
    const fn = vi.fn(async (url: string) => {
      if (url === "/api/auth/me") return { ok: true, status: 200, json: async () => ({ user: null }) } as Response;
      if (url === "/api/session/status")
        return { ok: true, status: 200, json: async () => ({ status: {} }) } as Response;
      // A phone that drops signal mid-request rejects rather than returning !ok.
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fn);

    render(<UnifiedRunner />);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("loads the next card after an answer is recorded", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));
    let served = 0;
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () =>
        served++ === 0 ? itemsTrial("t1", "Hiking", "Museums") : itemsTrial("t2", "Cooking", "Cycling", 1),
      "/api/trials/answer": () => ({ json: { ok: true } }),
    });

    render(<UnifiedRunner />);
    const first = await screen.findByText("Hiking");

    // Tapping a card is the accessible equivalent of swiping toward it.
    first.click();

    await waitFor(() => expect(screen.getByText("Cooking")).toBeTruthy());
  });

  it("automatically offers a clearly labelled switch from partner preferences to self values", async () => {
    let served = 0;
    const fetchMock = stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/start": (body) => {
        const perspective = (body as { perspective: string }).perspective;
        return {
          json: {
            participants: { activities: perspective === "PARTNER" ? "p-partner" : "p-self" },
            surveys: [{ slug: "activities", title: "Activities", kind: "ITEMS" }],
          },
        };
      },
      "/api/trials/next": () => {
        served += 1;
        return itemsTrial(`t${served}`, `Choice ${served}A`, `Choice ${served}B`, served - 1);
      },
      "/api/trials/answer": () => ({ json: { ok: true } }),
      "/api/insights": () => ({ json: {} }),
      "/api/couple/compare": () => ({ json: {} }),
    });

    render(<UnifiedRunner />);
    fireEvent.click(await screen.findByRole("button", { name: /The partner I would choose|Start our couples check-in/i }));
    expect(await screen.findByText("Choice 1A")).toBeTruthy();
    expect(screen.getAllByText(/The partner I would choose|Partner preferences/i).length).toBeGreaterThan(0);

    for (let answer = 1; answer <= 10; answer += 1) {
      fireEvent.click(await screen.findByText(`Choice ${answer}A`));
      if (answer < 10) await screen.findByText(`Choice ${answer + 1}A`);
    }

    expect(await screen.findByRole("dialog", { name: /Switching to Self Values/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Continue with Self Values|Start Self Values Mode/i }));
    expect(await screen.findByText(/Focus:/i)).toBeTruthy();
    expect(screen.getAllByText(/Self Values/i).length).toBeGreaterThan(0);

    const perspectives = fetchMock.mock.calls
      .filter(([url]) => url === "/api/session/start")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).perspective);
    expect(perspectives).toEqual(["PARTNER", "SELF"]);
  });
});
