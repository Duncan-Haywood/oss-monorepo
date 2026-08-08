// @vitest-environment jsdom

/**
 * Behavioural tests for the admin screen.
 *
 * This is 430 lines of React that nothing drove, and it is the account
 * owner's only window onto the data — the alternative is psql. The failures
 * that matter here are not layout: they are the screen saying nothing, or
 * saying the wrong thing, about whether it is still signed in and whether the
 * numbers on it are current.
 *
 * Two of them were live when these were written, both of the same shape as
 * the "dead-end error states" already fixed in the survey runner:
 *
 *   - A failed overview (a 500) set an error message that no branch rendered.
 *     The screen fell through to "Loading…" and stayed there.
 *   - A `fetch` that rejects — offline, or a dropped connection — was not
 *     caught at all, so `authed` stayed null and the screen sat on
 *     "Checking…" forever, with an unhandled promise rejection behind it.
 *
 * Both leave the owner looking at a screen that is lying about what it is
 * doing, with a hard refresh as the only way out.
 *
 * The real component is driven against a stubbed `fetch`: what is under test
 * is which call each control makes and what the screen does with the answer,
 * neither of which needs a database.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminView } from "@/components/AdminView";

const OVERVIEW = {
  totals: {
    users: 2,
    linkedCouples: 1,
    participants: 12,
    answeredItemTrials: 140,
    answeredFinancialTrials: 20,
    tiedAnswers: 6,
  },
  engagement: {
    medianMsToAnswer: 3200,
    slowAnswerShare: 0.1,
    sessionsStarted: 8,
    sessionsAbandoned: 2,
    abandonRate: 0.25,
    returnsAfterBreak: 3,
    velocity: [{ from: 0, medianMs: 3000, n: 10 }],
  },
  usage: {
    uniqueSessions: 7,
    funnel: [
      { event: "route_view", sessions: 7 },
      { event: "survey_start", sessions: 5 },
      { event: "answer_save", sessions: 4 },
    ],
    operations: [
      { event: "answer_save", count: 20, failures: 1, medianMs: 180, p95Ms: 900 },
    ],
    transitions: [
      { from: "survey_start", to: "question_load", n: 5, medianMs: 900, p95Ms: 1800 },
    ],
    feedbackResponse: [
      { subject: "top-pick", prompted: 10, submitted: 4, dismissed: 5, responseRate: 0.4 },
    ],
  },
  referral: {
    invites: {
      created: 24,
      converted: 2,
      maturedCreated: 4,
      maturedConverted: 2,
      immature: 20,
      maturedRate: 0.5,
      medianHoursToConvert: 3.5,
      p90HoursToConvert: 5,
      maturityWindowHours: 168,
      maturityAdequate: true,
    },
    challenges: {
      created: 3,
      converted: 1,
      maturedCreated: 2,
      maturedConverted: 1,
      immature: 1,
      maturedRate: 0.5,
      medianHoursToConvert: null,
      p90HoursToConvert: null,
      maturityWindowHours: 168,
      maturityAdequate: null,
    },
  },
  hardest: [{ label: "Cooking together", medianMs: 7000, n: 5 }],
  easiest: [{ label: "Doing taxes", medianMs: 900, n: 4 }],
  feedback: {
    usefulUp: 3,
    usefulDown: 1,
    medianEnjoyment: 4,
    bySubject: [{ subject: "insights", up: 3, down: 1 }],
    negativeReasons: [{ reason: "too_vague", count: 1 }],
    notes: [{ subject: "insights", note: "liked it", reason: null, answerCount: 40, perspective: "SELF", path: "/insights", at: "2026-01-01T00:00:00.000Z" }],
  },
  openReports: 1,
  reports: [
    {
      id: "rep1",
      kind: "bug",
      impact: "blocked",
      perspective: "SELF",
      reference: "ABC12345",
      message: "The couple screen stayed empty",
      email: null,
      path: "/couple",
      resolved: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  people: [
    {
      id: "p1",
      firstName: "Ada",
      lastName: null,
      email: null,
      perspective: "SELF",
      answered: 40,
      survey: { slug: "behaviours", title: "Behaviours" },
      lastSeenAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

type Reply = { status: number; body?: unknown };

/**
 * Records every call and answers by URL, so a test can assert on what the
 * screen asked for as well as what it did with the answer. A route with no
 * entry is a 200 with an empty body — enough for the calls whose response
 * this screen ignores.
 */
function stubFetch(replies: Record<string, Reply | Reply[]>) {
  const calls: { url: string; method: string }[] = [];
  const queues = new Map<string, Reply[]>(
    Object.entries(replies).map(([url, r]) => [url, Array.isArray(r) ? [...r] : [r]]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      const queue = queues.get(url) ?? [];
      // The last entry repeats, so a test only lists the replies it cares
      // about ordering: [401, 200] means "once, then from then on".
      const reply = queue.length > 1 ? queue.shift()! : (queue[0] ?? { status: 200, body: {} });
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminView", () => {
  it("shows the sign-in form when the overview says the session is gone", async () => {
    stubFetch({ "/api/admin/overview": { status: 401 } });
    render(<AdminView />);

    expect(await screen.findByPlaceholderText("Admin key")).toBeTruthy();
    // Nothing from the overview should be on screen behind the form.
    expect(screen.queryByText("Accounts")).toBeNull();
  });

  it("renders the overview once signed in", async () => {
    stubFetch({ "/api/admin/overview": { status: 200, body: OVERVIEW } });
    render(<AdminView />);

    expect(await screen.findByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByText("Accounts")).toBeTruthy();
    expect(screen.getByText("140")).toBeTruthy();
    expect(screen.getByText("The couple screen stayed empty")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
  });

  it("says so when nothing has been answered, rather than showing a wall of zeroes", async () => {
    stubFetch({
      "/api/admin/overview": {
        status: 200,
        body: { ...OVERVIEW, totals: { ...OVERVIEW.totals, answeredItemTrials: 0 } },
      },
    });
    render(<AdminView />);

    expect(await screen.findByText(/No answers recorded yet/)).toBeTruthy();
  });

  it("passes the key to the login route and reloads on success", async () => {
    const calls = stubFetch({
      "/api/admin/overview": [{ status: 401 }, { status: 200, body: OVERVIEW }],
      "/api/admin/login": { status: 200, body: {} },
    });
    render(<AdminView />);

    fireEvent.change(await screen.findByPlaceholderText("Admin key"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Accounts")).toBeTruthy();
    expect(calls.filter((c) => c.url === "/api/admin/login")).toHaveLength(1);
    // The overview is re-read after signing in rather than assumed.
    expect(calls.filter((c) => c.url === "/api/admin/overview")).toHaveLength(2);
  });

  it("shows the server's reason for refusing a key, including a lockout", async () => {
    // The throttle locks an IP out for a window after eight failures. If its
    // message is swallowed the owner sees a key that "just stopped working"
    // and keeps trying, which is what extends the lockout.
    stubFetch({
      "/api/admin/overview": { status: 401 },
      "/api/admin/login": {
        status: 429,
        body: { error: "Too many attempts. Try again in a few minutes." },
      },
    });
    render(<AdminView />);

    fireEvent.change(await screen.findByPlaceholderText("Admin key"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
    expect(screen.getByPlaceholderText("Admin key")).toBeTruthy();
  });

  it("returns to the sign-in form when the session expires mid-session", async () => {
    // Marking a report done reloads the overview. An admin session that has
    // expired by then answers 401, and the screen has to notice: continuing
    // to show the numbers implies they are current when the next action will
    // be refused.
    stubFetch({
      "/api/admin/overview": [{ status: 200, body: OVERVIEW }, { status: 401 }],
      "/api/admin/report": { status: 401 },
    });
    render(<AdminView />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));

    expect(await screen.findByPlaceholderText("Admin key")).toBeTruthy();
    expect(screen.queryByText("The couple screen stayed empty")).toBeNull();
  });

  it("offers a way out when the overview fails, instead of a permanent “Loading…”", async () => {
    // Was: the error was set and no branch rendered it, so a 500 left the
    // screen on "Loading…" with nothing to click.
    const calls = stubFetch({
      "/api/admin/overview": [{ status: 500 }, { status: 200, body: OVERVIEW }],
    });
    render(<AdminView />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load/);
    expect(screen.queryByText("Loading…")).toBeNull();

    fireEvent.click(retry);
    expect(await screen.findByText("Accounts")).toBeTruthy();
    expect(calls.filter((c) => c.url === "/api/admin/overview")).toHaveLength(2);
  });

  it("offers the same way out when the request never lands", async () => {
    // Was: `load` had no catch, so a rejected fetch left `authed` null and the
    // screen on "Checking…" indefinitely, plus an unhandled rejection.
    stubFetch({ "/api/admin/overview": [{ status: 0 }, { status: 200, body: OVERVIEW }] });
    render(<AdminView />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't reach the server/);

    fireEvent.click(retry);
    expect(await screen.findByText("Accounts")).toBeTruthy();
  });

  it("signs out to the form and stops showing the data", async () => {
    stubFetch({
      "/api/admin/overview": { status: 200, body: OVERVIEW },
      "/api/admin/logout": { status: 200, body: {} },
    });
    render(<AdminView />);

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.getByPlaceholderText("Admin key")).toBeTruthy());
    expect(screen.queryByText("The couple screen stayed empty")).toBeNull();
  });

  it("links every export the portal claims to offer", async () => {
    // These five links are the only way data leaves the app. A typo in one is
    // silent — the download just comes back empty.
    stubFetch({ "/api/admin/overview": { status: 200, body: OVERVIEW } });
    render(<AdminView />);

    await screen.findByText("Accounts");
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h): h is string => !!h);
    for (const what of ["trials", "ratings", "financial", "feedback", "reports"]) {
      expect(hrefs, `export link for ${what}`).toContain(`/api/admin/export?what=${what}`);
    }
  });

  /**
   * The referral rate is the only number on this screen the owner would price
   * a plan against, so the failures that matter are the ones where it reads
   * as more certain than it is. Each of these is a way that happens.
   */
  describe("referral conversion", () => {
    async function renderWith(referral: unknown) {
      stubFetch({ "/api/admin/overview": { status: 200, body: { ...OVERVIEW, referral } } });
      render(<AdminView />);
      await screen.findByText("Accounts");
    }

    it("never shows the rate without the cohort it was computed over", async () => {
      await renderWith(OVERVIEW.referral);

      const card = screen.getByText("Partner invites").parentElement!;
      expect(card.textContent).toMatch(/50%/);
      // A bare "50%" over four invites would read as a finding. The counts are
      // part of the claim, not a footnote.
      expect(card.textContent).toMatch(/2 of 4 invites sent more than 7 days ago/);
    });

    it("says how many invites were excluded for being too recent", async () => {
      // Without this line the operator sees 2 conversions from 24 invites
      // reported as 50% and cannot tell where the other 20 went.
      await renderWith(OVERVIEW.referral);

      const card = screen.getByText("Partner invites").parentElement!;
      expect(card.textContent).toMatch(/20 too recent to count/);
      expect(card.textContent).toMatch(/24 sent in total/);
    });

    it("renders an unmeasurable rate as an explanation, never as 0%", async () => {
      // The distinction the whole feature protects: nobody has had the chance
      // to join yet is not the same as nobody joined.
      await renderWith({
        ...OVERVIEW.referral,
        invites: {
          created: 6, converted: 0, maturedCreated: 0, maturedConverted: 0, immature: 6,
          maturedRate: null, medianHoursToConvert: null, p90HoursToConvert: null,
          maturityWindowHours: 168, maturityAdequate: null,
        },
      });

      const card = screen.getByText("Partner invites").parentElement!;
      expect(card.textContent).toMatch(/No invite is older than 7 days yet/);
      expect(card.textContent).not.toMatch(/0%/);
    });

    it("warns on the surface when conversions are still arriving after the window", async () => {
      // The rate is real but censored. If this only lived in the JSON the
      // screen would publish an understated number with no hint of it.
      await renderWith({
        ...OVERVIEW.referral,
        invites: { ...OVERVIEW.referral.invites, p90HoursToConvert: 400, maturityAdequate: false },
      });

      expect(screen.getByText(/still arriving after 7 days, so this rate understates/)).toBeTruthy();
    });

    it("omits the latency line for a conversion that records no timestamp", async () => {
      // Challenges have no accepted-at column. Showing "median —" would imply
      // a measurement that was attempted and came back empty.
      await renderWith(OVERVIEW.referral);

      const card = screen.getByText("Couple challenges").parentElement!;
      expect(card.textContent).toMatch(/1 of 2 challenges sent more than 7 days ago/);
      expect(card.textContent).not.toMatch(/median/);
    });

    it("still renders the rest of the screen when an older API omits referral", async () => {
      const { referral: _omitted, ...withoutReferral } = OVERVIEW;
      stubFetch({ "/api/admin/overview": { status: 200, body: withoutReferral } });
      render(<AdminView />);

      await screen.findByText("Accounts");
      expect(screen.queryByText("Referral conversion")).toBeNull();
    });
  });
});
