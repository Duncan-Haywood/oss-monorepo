// @vitest-environment jsdom

/**
 * Behavioural tests for the profile screen.
 *
 * This screen is small and does one consequential thing: it switches which of
 * the three perspectives an account is answering under. That switch is the
 * input to every couples comparison — PARTNER_GUESS against the other
 * person's PARTNER ranking is the sharpest output the app has — and it has
 * already been the site of one silent bug that emptied that comparison
 * (`session/start` coercing PARTNER_GUESS to PARTNER).
 *
 * What is pinned here is the contract between this screen and the routes
 * behind it: which perspective is sent, what name goes with it, what is
 * written to the session store, and what happens to the stored session when
 * the switch fails.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileView } from "@/components/ProfileView";
import { SESSION_KEY } from "@/lib/sessionStore";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const STORED = {
  firstName: "Ada",
  perspective: "PARTNER",
  participants: { behaviours: "p1" },
  domains: [{ slug: "behaviours", title: "Behaviours", kind: "ITEMS" }],
};

/** What `session/start` answers with for a successful switch. */
const STARTED = {
  participants: { behaviours: "p2" },
  surveys: [{ slug: "behaviours", title: "Behaviours", kind: "ITEMS" }],
};

type Reply = { status: number; body?: unknown };

function stubFetch(replies: Record<string, Reply>) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
      const reply = replies[url] ?? { status: 200, body: {} };
      if (reply.status === 0) throw new TypeError("Failed to fetch");
      return {
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        json: async () => reply.body ?? {},
      } as Response;
    }),
  );
  return calls;
}

/** The last body posted to `session/start`, which is the thing under test. */
function lastStart(calls: { url: string; body: Record<string, unknown> | null }[]) {
  return [...calls].reverse().find((c) => c.url === "/api/session/start")?.body ?? null;
}

beforeEach(() => {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(STORED));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("ProfileView", () => {
  it("marks the stored perspective as the active one on the first paint", async () => {
    stubFetch({});
    render(<ProfileView />);

    // Read from the store during render, not mirrored into state through an
    // effect: the highlight must be right immediately, not after a flash of
    // the wrong row.
    const active = screen.getByText("Active").closest("button");
    expect(active?.textContent).toContain("The partner I would choose");
  });

  it("sends the chosen perspective and stores it, then leaves for the cards", async () => {
    const calls = stubFetch({
      "/api/session/start": { status: 200, body: STARTED },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("What I think my partner wants").closest("button")!);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(lastStart(calls)).toMatchObject({ perspective: "PARTNER_GUESS", firstName: "Ada" });

    const stored = JSON.parse(window.localStorage.getItem(SESSION_KEY)!);
    expect(stored.perspective).toBe("PARTNER_GUESS");
    expect(stored.participants).toEqual(STARTED.participants);
  });

  it("uses the name already on the session", async () => {
    const calls = stubFetch({
      "/api/session/start": { status: 200, body: STARTED },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("What I want for myself").closest("button")!);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(lastStart(calls)).toMatchObject({ perspective: "SELF", firstName: "Ada" });
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY)!).firstName).toBe("Ada");
  });

  it("falls back to Anonymous only when there is no name anywhere", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...STORED, firstName: "  " }));
    const calls = stubFetch({
      "/api/session/start": { status: 200, body: STARTED },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("What I want for myself").closest("button")!);

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(lastStart(calls)).toMatchObject({ firstName: "Anonymous" });
  });

  it("keeps the current session intact when a switch fails", async () => {
    // A half-applied switch is the worst outcome: the store would say one
    // perspective while the participant ids belong to another, and every
    // answer after that is filed under the wrong question.
    stubFetch({
      "/api/session/start": { status: 500, body: { error: "nope" } },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("What I want for myself").closest("button")!);

    expect(await screen.findByText("Couldn't switch. Try again.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY)!)).toEqual(STORED);
    // And the buttons are usable again, rather than left disabled.
    expect(screen.getByText("What I want for myself").closest("button")!.hasAttribute("disabled")).toBe(false);
  });

  it("treats a 200 with no participants as a failed switch", async () => {
    // The route answers 200 with an error body in some paths; taking that as
    // a success would write a bundle with no ids in it and leave the runner
    // with nothing to fetch.
    stubFetch({
      "/api/session/start": { status: 200, body: { surveys: [], participants: null } },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("What I want for myself").closest("button")!);

    expect(await screen.findByText("Couldn't switch. Try again.")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY)!)).toEqual(STORED);
  });

  it("does not show account controls on the profile page", () => {
    stubFetch({});
    render(<ProfileView />);

    expect(screen.queryByText("Account")).toBeNull();
    expect(screen.queryByRole("link", { name: /Sign in to sync/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
