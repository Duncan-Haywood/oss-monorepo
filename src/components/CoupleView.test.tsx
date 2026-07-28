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
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { CoupleView } from "@/components/CoupleView";

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
