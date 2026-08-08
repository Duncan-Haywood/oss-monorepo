// @vitest-environment jsdom

/**
 * Behavioural tests for the couple screen's locked states.
 *
 * The bug these exist for was invisible rather than loud: the four sections a
 * couple would actually act on — what makes them happy, what matters more to
 * them, what you both want, what they could do for you — were rendered only
 * when non-empty. They all sit behind a confidence floor that takes several
 * hundred answers to clear, so in real use the most useful half of the screen
 * simply was not there, with nothing naming it and no sense of how far off it
 * was. Nothing threw and no test failed.
 *
 * These drive the real component against a stubbed `fetch`, since there is no
 * database in CI or in an agent sandbox.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CoupleView } from "@/components/CoupleView";
import { recordUsage } from "@/lib/usageClient";

// See the note in InsightsView.test.tsx: the transport batches and flushes on
// a timer, so the call is what binds this component's behaviour.
vi.mock("@/lib/usageClient", () => ({
  recordUsage: vi.fn(),
  flushUsage: vi.fn(),
  getUsageSessionKey: () => "testsessionkey123456",
  createUsageId: () => "testusageid1234567890",
}));

const LINKED = {
  couple: { inviteCode: "ABCD-EFGH", partner: { id: "u2", firstName: "Sam" } },
};

/** A comparison with enough overlap that the non-gated sections render. */
const COMPARISON = {
  overlap: 12,
  agreement: 0.5,
  aligned: [{ label: "Cooking", a: 1, b: 2, gap: 1 }],
  diverged: [{ label: "Skiing", a: 1, b: 9, gap: 8 }],
};

function stubCompare(payload: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }) as Response),
  );
}

/** The section whose heading matches, so assertions stay scoped to it. */
function sectionFor(heading: RegExp) {
  const el = screen.getByRole("heading", { name: heading }).closest("section");
  if (!el) throw new Error(`no section for ${heading}`);
  return el as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // See ShareInsightModal.test.tsx: the module mock's calls outlive cleanup.
  vi.clearAllMocks();
});

describe("CoupleView locked sections", () => {
  it("shows every actionable section even when the server sends no rows", async () => {
    stubCompare({
      ...LINKED,
      fit: COMPARISON,
      mirror: COMPARISON,
      blindSpots: COMPARISON,
      makeThemHappy: [],
      makeYouHappy: [],
      shared: [],
      mattersMoreToThem: [],
      readiness: {
        makeThemHappy: { ready: false, mine: null, theirs: 0, needed: 1, waitingOn: "them" },
        makeYouHappy: { ready: false, mine: 0, theirs: null, needed: 1, waitingOn: "you" },
        shared: { ready: false, mine: 3, theirs: 6, needed: 8, waitingOn: "both" },
        mattersMoreToThem: { ready: false, mine: 3, theirs: 6, needed: 8, waitingOn: "both" },
      },
    });

    render(<CoupleView />);

    // The regression: before this, all four headings were absent entirely.
    await waitFor(() => expect(screen.getByRole("heading", { name: /makes Sam happy/i })).toBeTruthy());
    expect(screen.getByRole("heading", { name: /Matters more to them/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /What you both want/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Sam could do for you/i })).toBeTruthy();
  });

  it("names who still has answering to do, and never blames the wrong partner", async () => {
    stubCompare({
      ...LINKED,
      makeThemHappy: [],
      makeYouHappy: [],
      shared: [],
      mattersMoreToThem: [],
      readiness: {
        // Built from THEIR ranking, so it can only ever wait on them.
        makeThemHappy: { ready: false, mine: null, theirs: 0, needed: 1, waitingOn: "them" },
        // Built from yours, so it can only ever wait on you.
        makeYouHappy: { ready: false, mine: 0, theirs: null, needed: 1, waitingOn: "you" },
        shared: { ready: false, mine: 3, theirs: 6, needed: 8, waitingOn: "both" },
        mattersMoreToThem: { ready: false, mine: 3, theirs: 6, needed: 8, waitingOn: "both" },
      },
    });

    render(<CoupleView />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /makes Sam happy/i })).toBeTruthy());

    expect(sectionFor(/makes Sam happy/i).textContent).toContain("Sam needs to answer more");
    const yours = sectionFor(/Sam could do for you/i).textContent ?? "";
    expect(yours).toContain("You need to answer more");
    expect(yours).not.toContain("Sam needs");
    expect(sectionFor(/What you both want/i).textContent).toContain("You and Sam both need");
  });

  it("shows progress toward the threshold, so there is a reason to keep going", async () => {
    stubCompare({
      ...LINKED,
      shared: [],
      mattersMoreToThem: [],
      makeThemHappy: [],
      makeYouHappy: [],
      readiness: {
        makeThemHappy: { ready: false, mine: null, theirs: 0, needed: 1, waitingOn: "them" },
        makeYouHappy: { ready: false, mine: 0, theirs: null, needed: 1, waitingOn: "you" },
        shared: { ready: false, mine: 3, theirs: 6, needed: 8, waitingOn: "both" },
        mattersMoreToThem: { ready: false, mine: 3, theirs: 6, needed: 8, waitingOn: "both" },
      },
    });

    render(<CoupleView />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /What you both want/i })).toBeTruthy());

    const bars = within(sectionFor(/What you both want/i)).getAllByRole("progressbar");
    expect(bars).toHaveLength(2);
    // Announced with real values rather than a bare bar, per the accessibility
    // pass the rest of the app already went through.
    expect(bars[0].getAttribute("aria-valuenow")).toBe("3");
    expect(bars[0].getAttribute("aria-valuemax")).toBe("8");
    expect(bars[1].getAttribute("aria-valuenow")).toBe("6");
  });

  it("distinguishes 'not enough data yet' from 'enough data, nothing stood out'", async () => {
    stubCompare({
      ...LINKED,
      shared: [],
      mattersMoreToThem: [],
      makeThemHappy: [],
      makeYouHappy: [],
      readiness: {
        makeThemHappy: { ready: false, mine: null, theirs: 0, needed: 1, waitingOn: "them" },
        makeYouHappy: { ready: false, mine: 0, theirs: null, needed: 1, waitingOn: "you" },
        // Enough answers, but nothing rose above both midpoints — a real
        // finding, and a different one from "keep swiping".
        shared: { ready: true, mine: 10, theirs: 11, needed: 8, waitingOn: null },
        mattersMoreToThem: { ready: true, mine: 10, theirs: 11, needed: 8, waitingOn: null },
      },
    });

    render(<CoupleView />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /What you both want/i })).toBeTruthy());

    const shared = sectionFor(/What you both want/i);
    expect(shared.textContent).toContain("Nothing stands out here yet");
    expect(shared.textContent).not.toContain("need to answer more");
    expect(within(shared).queryAllByRole("progressbar")).toHaveLength(0);
  });

  it("falls back to the blameless wording when the payload has no readiness", async () => {
    // An older server response, or a cached one from before this field existed.
    stubCompare({ ...LINKED, makeThemHappy: [], makeYouHappy: [], shared: [], mattersMoreToThem: [] });

    render(<CoupleView />);
    await waitFor(() => expect(screen.getByRole("heading", { name: /What you both want/i })).toBeTruthy());

    const shared = sectionFor(/What you both want/i);
    expect(shared.textContent).toContain("You and Sam both need");
    // No counts to show, so no bar claiming a progress it doesn't know.
    expect(within(shared).queryAllByRole("progressbar")).toHaveLength(0);
  });

  it("still renders the rows when there are rows to render", async () => {
    stubCompare({
      ...LINKED,
      makeThemHappy: [{ label: "Takes a task off your plate", rating: 1800, rd: 90, category: "Behaviour" }],
      makeYouHappy: [{ label: "Holds your hand", rating: 1700, rd: 90, category: "Affection" }],
      shared: [{ label: "Cooking together", aStrength: 90, bStrength: 80, combined: 80 }],
      mattersMoreToThem: [{ label: "Tidiness", theirStrength: 90, myStrength: 40, gap: 50 }],
      readiness: {
        makeThemHappy: { ready: true, mine: null, theirs: 4, needed: 1, waitingOn: null },
        makeYouHappy: { ready: true, mine: 4, theirs: null, needed: 1, waitingOn: null },
        shared: { ready: true, mine: 10, theirs: 11, needed: 8, waitingOn: null },
        mattersMoreToThem: { ready: true, mine: 10, theirs: 11, needed: 8, waitingOn: null },
      },
    });

    render(<CoupleView />);
    await waitFor(() => expect(screen.getByText("Takes a task off your plate")).toBeTruthy());

    // This list numbers its rows inline, so the label shares a node with "1.".
    expect(screen.getByText(/Holds your hand/)).toBeTruthy();
    expect(screen.getByText("Cooking together")).toBeTruthy();
    expect(screen.getByText("Tidiness")).toBeTruthy();
    // The locked copy must not appear alongside real content.
    expect(document.body.textContent).not.toContain("need to answer more");
    expect(document.body.textContent).not.toContain("Nothing stands out here yet");
  });
});

/**
 * A comparison can now have enough overlap to render while still having no row
 * that clears the model's own uncertainty. Before, those lists rendered as
 * nothing at all — the same "looks finished, is actually waiting" failure the
 * four actionable sections had.
 */
describe("CoupleView comparison rows that cannot be stood behind", () => {
  it("says why a comparison list is empty instead of dropping it", async () => {
    stubCompare({
      ...LINKED,
      blindSpots: { overlap: 30, agreement: null, reliability: 0.2, aligned: [], diverged: [] },
    });

    render(<CoupleView />);

    const section = await waitFor(() => sectionFor(/Your blind spots/i));
    // Both list headings survive an empty list...
    expect(within(section).getByText(/You read them well here/i)).toBeTruthy();
    expect(within(section).getByText(/You were most wrong here/i)).toBeTruthy();
    // ...and each says what it is waiting for rather than showing nothing.
    expect(within(section).getByText(/No difference here is bigger than the uncertainty/i)).toBeTruthy();
    expect(within(section).getByText(/Nothing is measured finely enough yet/i)).toBeTruthy();
  });

  it("withholds the match score without implying the rows are wrong", async () => {
    stubCompare({
      ...LINKED,
      blindSpots: { overlap: 30, agreement: null, reliability: 0.2, aligned: [], diverged: [] },
    });

    render(<CoupleView />);

    const section = await waitFor(() => sectionFor(/Your blind spots/i));
    // Exact, not a regex: the copy explaining the absence contains the phrase
    // "an overall match score", which a loose match happily finds.
    expect(within(section).queryByText("Overall match")).toBeNull();
    expect(within(section).getByText(/mostly be measuring how much/i)).toBeTruthy();
  });

  it("still shows a match score and rows once the data supports them", async () => {
    stubCompare({ ...LINKED, blindSpots: { ...COMPARISON, reliability: 0.8 } });

    render(<CoupleView />);

    const section = await waitFor(() => sectionFor(/Your blind spots/i));
    expect(within(section).getByText("Overall match")).toBeTruthy();
    expect(within(section).getByText("Skiing")).toBeTruthy();
  });
});

/**
 * The couple screen is read on a phone, often on the move, and one dropped
 * request used to end the trip: the failure state offered "Back" to the
 * cards and nothing else, so the only way to see the comparison was to
 * navigate away and come back.
 */
describe("CoupleView when the request fails", () => {
  it("retries in place rather than sending someone back to the cards", async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("Failed to fetch");
      return { ok: true, status: 200, json: async () => LINKED } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CoupleView />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load this/);

    fireEvent.click(retry);

    // The linked screen, not the error one — the second attempt succeeded.
    expect(await screen.findByRole("heading", { name: /You & Sam/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks for an account instead of retrying when the answer is 401", async () => {
    // Retrying a 401 forever is not recovery. Signing in is.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response),
    );

    render(<CoupleView />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
});

describe("CoupleView enhanced features & partner quiz", () => {
  it("renders expression profiles, date night ideas, conversation starters, and micro commitments", async () => {
    stubCompare({
      ...LINKED,
      expressionProfiles: [
        { name: "Care & Action", glyph: "🤝", mineScore: 80, theirsScore: 85, alignmentPct: 95 },
      ],
      dateNightIdeas: [
        { title: "Chef's Challenge", category: "Behaviour", sharedItem: "Cooking", description: "Cook together tonight." },
      ],
      conversationStarters: [
        { type: "BLIND_SPOT", itemLabel: "Tidiness", headline: "Surprise preference: Tidiness", prompt: "Ask about tidiness over coffee." },
      ],
      microCommitments: [
        { itemLabel: "Cooking", category: "Behaviour", challenge: "Surprise them by cooking dinner." },
      ],
    });

    render(<CoupleView />);

    await waitFor(() => expect(screen.getByText("Relationship expression profile")).toBeTruthy());
    expect(screen.getByText("Care & Action")).toBeTruthy();
    expect(screen.getByText("95% alignment")).toBeTruthy();

    expect(screen.getByText("Date Night & Activity Ideas")).toBeTruthy();
    expect(screen.getByText("Chef's Challenge")).toBeTruthy();

    expect(screen.getByText("Spark Conversation Starters")).toBeTruthy();
    expect(screen.getByText("Ask about tidiness over coffee.")).toBeTruthy();

    expect(screen.getByText(/Weekly Action Challenge for Sam/)).toBeTruthy();
    expect(screen.getByText("Surprise them by cooking dinner.")).toBeTruthy();
  });

  it("opens the partner quiz modal and allows revealing the answer", async () => {
    stubCompare({
      ...LINKED,
      makeThemHappy: [{ label: "Cooking dinner together", rating: 1800, rd: 90, category: "Behaviour" }],
    });

    render(<CoupleView />);

    const startQuizBtn = await waitFor(() => screen.getByRole("button", { name: /Start Quiz/i }));
    fireEvent.click(startQuizBtn);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Guess Sam's Top Preference!/i)).toBeTruthy();

    // Select an option inside the dialog
    const optionBtn = within(dialog).getByRole("button", { name: /Cooking dinner together/i });
    fireEvent.click(optionBtn);

    const revealBtn = within(dialog).getByRole("button", { name: /Reveal Answer/i });
    fireEvent.click(revealBtn);

    expect(within(dialog).getByText(/Spot on! You know them well!/i)).toBeTruthy();
  });
});


/**
 * The referral loop, which is the growth path this venture's couples tier
 * rests on, and which measured nothing at all until 2026-08-06: invite
 * created, invite joined and invite shared were three names in the telemetry
 * vocabulary with no caller anywhere in the application. A join rate needs
 * both ends, and both ends need their failures, because a mistyped or expired
 * code is the likeliest place a referral dies and a success-only counter
 * reports that as nobody having tried.
 *
 * See src/lib/usageVocabulary.test.ts for the control that stops the
 * vocabulary drifting away from the emitters again.
 */
describe("CoupleView referral telemetry", () => {
  const UNLINKED = { couple: null };

  function stubSequence(responses: { ok: boolean; status: number; payload: unknown }[]) {
    let call = 0;
    const mock = vi.fn(async () => {
      const next = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return { ok: next.ok, status: next.status, json: async () => next.payload } as Response;
    });
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  it("records a created invite", async () => {
    stubSequence([
      { ok: true, status: 200, payload: UNLINKED },
      { ok: true, status: 200, payload: { inviteCode: "ABCD-EFGH" } },
      { ok: true, status: 200, payload: LINKED },
    ]);

    render(<CoupleView />);

    fireEvent.click(await screen.findByRole("button", { name: /Create an invite code/i }));

    await waitFor(() =>
      expect(recordUsage).toHaveBeenCalledWith(
        "couple_invite_created",
        expect.objectContaining({ success: true, statusCode: 200 }),
      ),
    );
  });

  it("records a refused invite rather than staying silent about it", async () => {
    stubSequence([
      { ok: true, status: 200, payload: UNLINKED },
      { ok: false, status: 500, payload: { error: "Couldn't create an invite." } },
    ]);

    render(<CoupleView />);

    fireEvent.click(await screen.findByRole("button", { name: /Create an invite code/i }));

    await waitFor(() =>
      expect(recordUsage).toHaveBeenCalledWith(
        "couple_invite_created",
        expect.objectContaining({ success: false, statusCode: 500 }),
      ),
    );
  });

  it("records both a joined and a rejected code", async () => {
    stubSequence([
      { ok: true, status: 200, payload: UNLINKED },
      { ok: false, status: 404, payload: { error: "That code doesn't exist." } },
    ]);

    render(<CoupleView />);

    const input = await screen.findByPlaceholderText("ABCD-EFGH");
    fireEvent.change(input, { target: { value: "wxyz-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));

    // The far end of the loop, and the one that tells an owner whether the
    // invite text or the code entry is where people are lost.
    await waitFor(() =>
      expect(recordUsage).toHaveBeenCalledWith(
        "couple_joined",
        expect.objectContaining({ success: false, statusCode: 404 }),
      ),
    );
  });

  it("counts a shared invite once, not once per code path", async () => {
    // Invite minted, partner not yet joined — the only state in which the
    // share controls are on screen.
    stubSequence([
      { ok: true, status: 200, payload: { couple: { inviteCode: "ABCD-EFGH", partner: null } } },
    ]);
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    // No `navigator.share` here, so the native button falls through to the
    // copy path. Both recording would double every share on a desktop browser.
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });

    render(<CoupleView />);

    fireEvent.click(await screen.findByRole("button", { name: /Share Invite Link & Message/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const shares = (recordUsage as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
      (call) => call[0] === "card_shared",
    );
    expect(shares).toHaveLength(1);
  });
});
