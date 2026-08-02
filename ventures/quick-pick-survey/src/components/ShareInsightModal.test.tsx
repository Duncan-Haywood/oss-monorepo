// @vitest-environment jsdom

/**
 * The share card is the referral. It leaves the product and is read by people
 * who are not using it yet, so the two things printed on it that are not the
 * insight itself — the couple's alignment score and the link home — are the
 * two things worth holding to a contract.
 *
 * Both were wrong. `alignmentPct` defaulted to `85`, so a couple whose overlap
 * had never been computed shared "85% Aligned" as their own result, on a card
 * whose whole claim is that it reports theirs. And every card carried the
 * literal `https://quickpick.app`, a domain this app has never served from —
 * the venture runs at `pairwise.marisstella.dev`, so the referral loop pointed
 * off-product entirely while `CoupleView` derived its invite and challenge
 * links from `window.location.origin` two files away.
 *
 * These drive the real component. The point of the first group is that there is
 * no number to assert: with no score, nothing offers one.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShareInsightModal } from "@/components/ShareInsightModal";

/** Copies the card the way a user does, and returns what left the product. */
async function copiedText(ui: React.ReactElement): Promise<string> {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  render(ui);
  fireEvent.click(screen.getByText("Copy Text & Link"));
  await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
  vi.unstubAllGlobals();
  return writeText.mock.calls[0][0] as string;
}

const INSIGHT = {
  isOpen: true,
  onClose: () => {},
  title: "Rest",
  headline: "You recharge in opposite directions",
  discovery: "Sam refuels around people; you refuel away from them.",
  coupleNames: { mine: "You", theirs: "Sam" },
};

afterEach(cleanup);

describe("an alignment score that was never computed", () => {
  it("is not shown on the card", () => {
    render(<ShareInsightModal {...INSIGHT} />);
    expect(screen.queryByText(/% Aligned/)).toBeNull();
  });

  it("is not offered as something to include", () => {
    render(<ShareInsightModal {...INSIGHT} />);
    expect(screen.queryByText(/Include Alignment Score/)).toBeNull();
  });

  it("puts no percentage anywhere on the card", () => {
    // The specific regression: any plausible-looking number here is presented
    // as this couple's own result, so the assertion is on the shape, not on 85.
    const { container } = render(<ShareInsightModal {...INSIGHT} />);
    expect(container.textContent).not.toMatch(/\d+\s*%/);
  });
});

describe("an alignment score that was computed", () => {
  it("is shown as given, not rounded to a house number", () => {
    render(<ShareInsightModal {...INSIGHT} alignmentPct={31} />);
    expect(screen.getByText("31% Aligned")).toBeTruthy();
    expect(screen.getByText(/Include Alignment Score \(31%\)/)).toBeTruthy();
  });

  it("shows a low score rather than substituting a flattering one", () => {
    render(<ShareInsightModal {...INSIGHT} alignmentPct={4} />);
    expect(screen.getByText("4% Aligned")).toBeTruthy();
  });

  it("shows a computed zero", () => {
    // `alignmentPct && ...` would drop this one, and zero overlap is a real
    // result rather than a missing one.
    render(<ShareInsightModal {...INSIGHT} alignmentPct={0} />);
    expect(screen.getByText("0% Aligned")).toBeTruthy();
  });
});

describe("the link the card carries", () => {
  it("is the host the couple is actually on", () => {
    const { container } = render(<ShareInsightModal {...INSIGHT} />);
    expect(container.textContent).toContain(window.location.host);
  });

  it("names no host this app does not serve from", () => {
    const { container } = render(<ShareInsightModal {...INSIGHT} />);
    expect(container.textContent).not.toMatch(/quickpick\.app/);
  });
});

describe("the text that actually leaves the product", () => {
  // The card on screen and the string put on the clipboard are built
  // separately, and the wrong domain lived in the second one. Asserting only
  // on what is rendered leaves the payload itself uncovered.
  it("links back to the host the couple is on", async () => {
    const text = await copiedText(<ShareInsightModal {...INSIGHT} />);
    expect(text).toContain(window.location.origin);
    expect(text).not.toMatch(/quickpick\.app/);
  });

  it("carries no alignment score when none was computed", async () => {
    const text = await copiedText(<ShareInsightModal {...INSIGHT} />);
    expect(text).not.toMatch(/Alignment Score/);
    expect(text).not.toMatch(/\d+\s*%/);
  });

  it("carries the computed score when there is one", async () => {
    const text = await copiedText(<ShareInsightModal {...INSIGHT} alignmentPct={31} />);
    expect(text).toContain("Alignment Score: 31%");
  });

  it("hands the phone's own share sheet the same host", async () => {
    // A third copy of the link, and the one a phone actually opens. It had the
    // literal domain too.
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    render(<ShareInsightModal {...INSIGHT} />);
    fireEvent.click(screen.getByText("Share via Phone"));
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    vi.unstubAllGlobals();

    const payload = share.mock.calls[0][0] as { url: string; text: string };
    expect(payload.url).toBe(window.location.origin);
    expect(payload.text).not.toMatch(/quickpick\.app/);
  });
});
