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
 *
 * The bug these were written against: the name sent with a switch was
 * `user?.firstName ?? "Anonymous"`, and `user` arrives from `/api/auth/me`
 * some time after the first paint. Tapping a mode before it landed sent
 * "Anonymous" for a signed-in person — which sticks on the Participant row
 * created for a mode they had not used before, and is read back to them at
 * the end of the round.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileView } from "@/components/ProfileView";
import { SESSION_KEY } from "@/lib/sessionStore";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
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
    stubFetch({ "/api/auth/me": { status: 200, body: { user: null } } });
    render(<ProfileView />);

    // Read from the store during render, not mirrored into state through an
    // effect: the highlight must be right immediately, not after a flash of
    // the wrong row.
    const active = screen.getByText("Active").closest("button");
    expect(active?.textContent).toContain("In a partner");
  });

  it("sends the chosen perspective and stores it, then leaves for the cards", async () => {
    const calls = stubFetch({
      "/api/auth/me": { status: 200, body: { user: { firstName: "Ada", email: "a@b.c" } } },
      "/api/session/start": { status: 200, body: STARTED },
    });
    render(<ProfileView />);
    await screen.findByText(/Signed in as/);

    fireEvent.click(screen.getByText("Your guess at your partner's answers.").closest("button")!);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(lastStart(calls)).toMatchObject({ perspective: "PARTNER_GUESS", firstName: "Ada" });

    const stored = JSON.parse(window.localStorage.getItem(SESSION_KEY)!);
    expect(stored.perspective).toBe("PARTNER_GUESS");
    expect(stored.participants).toEqual(STARTED.participants);
  });

  it("uses the name already on the session when the account has not loaded yet", async () => {
    // `/api/auth/me` never answers here, which is the race in its most
    // visible form. Was: "Anonymous" went to the server and into the store.
    const calls = stubFetch({
      "/api/auth/me": { status: 0 },
      "/api/session/start": { status: 200, body: STARTED },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("What you want to build in your own life.").closest("button")!);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(lastStart(calls)).toMatchObject({ perspective: "SELF", firstName: "Ada" });
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY)!).firstName).toBe("Ada");
  });

  it("falls back to Anonymous only when there is no name anywhere", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...STORED, firstName: "  " }));
    const calls = stubFetch({
      "/api/auth/me": { status: 200, body: { user: null } },
      "/api/session/start": { status: 200, body: STARTED },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("For myself").closest("button")!);

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(lastStart(calls)).toMatchObject({ firstName: "Anonymous" });
  });

  it("keeps the current session intact when a switch fails", async () => {
    // A half-applied switch is the worst outcome: the store would say one
    // perspective while the participant ids belong to another, and every
    // answer after that is filed under the wrong question.
    stubFetch({
      "/api/auth/me": { status: 200, body: { user: { firstName: "Ada", email: "a@b.c" } } },
      "/api/session/start": { status: 500, body: { error: "nope" } },
    });
    render(<ProfileView />);
    await screen.findByText(/Signed in as/);

    fireEvent.click(screen.getByText("For myself").closest("button")!);

    expect(await screen.findByText("Couldn't switch. Try again.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY)!)).toEqual(STORED);
    // And the buttons are usable again, rather than left disabled.
    expect(screen.getByText("For myself").closest("button")!.hasAttribute("disabled")).toBe(false);
  });

  it("treats a 200 with no participants as a failed switch", async () => {
    // The route answers 200 with an error body in some paths; taking that as
    // a success would write a bundle with no ids in it and leave the runner
    // with nothing to fetch.
    stubFetch({
      "/api/auth/me": { status: 200, body: { user: null } },
      "/api/session/start": { status: 200, body: { surveys: [], participants: null } },
    });
    render(<ProfileView />);

    fireEvent.click(screen.getByText("For myself").closest("button")!);

    expect(await screen.findByText("Couldn't switch. Try again.")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(SESSION_KEY)!)).toEqual(STORED);
  });

  it("clears the local session when signing out", async () => {
    // The bundle holds participant ids. Leaving them behind on a shared
    // device would let the next person answer into this account's ranking —
    // and a couple is the most likely pair of people to share one.
    stubFetch({
      "/api/auth/me": { status: 200, body: { user: { firstName: "Ada", email: "a@b.c" } } },
      "/api/auth/logout": { status: 200, body: {} },
    });
    render(<ProfileView />);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(window.localStorage.getItem(SESSION_KEY)).toBeNull());
    expect(push).toHaveBeenCalledWith("/");
  });

  it("offers a sign-in link, not a sign-out button, when signed out", async () => {
    stubFetch({ "/api/auth/me": { status: 200, body: { user: null } } });
    render(<ProfileView />);

    expect(await screen.findByRole("link", { name: /Sign in to sync/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
