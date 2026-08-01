// @vitest-environment jsdom

/**
 * The share card is the one artefact of this product that reaches people who
 * have never used it, so two things about it have to be true: the link must
 * lead back to this deployment, and every number on the card must be a result
 * the couple actually produced.
 *
 * Both were false before this suite existed. The share link was the literal
 * string `https://quickpick.app` while the product is served from
 * `pairwise.marisstella.dev`, so every recipient of every share landed off
 * product; and `alignmentPct` defaulted to `85`, so a couple with no computed
 * overlap shared a card reading "85% Aligned" — a fabricated statistic
 * presented as their own result.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShareInsightModal } from "@/components/ShareInsightModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const INSIGHT = {
  title: "How you spend a free weekend",
  headline: "The Planner and the Drifter",
  discovery: "You want the itinerary settled by Thursday; they want to decide at breakfast.",
};

/** Captures whatever the copy button puts on the clipboard. */
function stubClipboard(): { text: () => string } {
  let written = "";
  vi.stubGlobal("navigator", {
    clipboard: { writeText: async (t: string) => { written = t; } },
  });
  return { text: () => written };
}

function open(props: Partial<React.ComponentProps<typeof ShareInsightModal>> = {}) {
  return render(
    <ShareInsightModal isOpen onClose={() => {}} {...INSIGHT} {...props} />,
  );
}

describe("ShareInsightModal share link", () => {
  it("points recipients at the origin this build is served from", async () => {
    const clipboard = stubClipboard();
    open();

    fireEvent.click(screen.getByText(/Copy Text & Link/));
    await vi.waitFor(() => expect(clipboard.text()).not.toBe(""));

    // jsdom serves the suite from http://localhost:3000 by default; the point
    // is that the link tracks `window.location`, whatever it is.
    expect(clipboard.text()).toContain(window.location.origin);
  });

  it("never emits the hardcoded quickpick.app host", async () => {
    const clipboard = stubClipboard();
    open({ alignmentPct: 91 });

    fireEvent.click(screen.getByText(/Copy Text & Link/));
    await vi.waitFor(() => expect(clipboard.text()).not.toBe(""));

    expect(clipboard.text()).not.toMatch(/quickpick\.app/);
    // The card footer renders the host too, and it drifted independently.
    expect(screen.queryByText(/quickpick\.app/)).toBeNull();
    expect(screen.getByText(window.location.host)).toBeTruthy();
  });

  it("hands the native share sheet the same origin", async () => {
    const shared: Array<Record<string, unknown>> = [];
    vi.stubGlobal("navigator", {
      share: async (data: Record<string, unknown>) => { shared.push(data); },
    });
    open();

    fireEvent.click(screen.getByText(/Share via Phone/));
    await vi.waitFor(() => expect(shared).toHaveLength(1));

    expect(shared[0].url).toBe(window.location.origin);
  });

  it("builds the WhatsApp payload from the same text, not a second hardcoded link", () => {
    open();
    const link = screen.getByText(/Share to WhatsApp/).closest("a");
    const href = link?.getAttribute("href") ?? "";

    expect(href).toContain(encodeURIComponent(window.location.origin));
    expect(decodeURIComponent(href)).not.toMatch(/quickpick\.app/);
  });
});

describe("ShareInsightModal alignment score", () => {
  it("shares a score the couple actually produced", async () => {
    const clipboard = stubClipboard();
    open({ alignmentPct: 62 });

    expect(screen.getByText("62% Aligned")).toBeTruthy();

    fireEvent.click(screen.getByText(/Copy Text & Link/));
    await vi.waitFor(() => expect(clipboard.text()).not.toBe(""));
    expect(clipboard.text()).toContain("Alignment Score: 62%");
  });

  it("shows no score at all when none was computed", async () => {
    const clipboard = stubClipboard();
    open({ alignmentPct: undefined });

    // The old default rendered "85% Aligned" here for a couple with no fit.
    expect(screen.queryByText(/% Aligned/)).toBeNull();
    expect(screen.queryByText(/Include Alignment Score/)).toBeNull();

    fireEvent.click(screen.getByText(/Copy Text & Link/));
    await vi.waitFor(() => expect(clipboard.text()).not.toBe(""));
    expect(clipboard.text()).not.toMatch(/Alignment Score/);
    expect(clipboard.text()).not.toMatch(/\d+%/);
  });

  it("still lets a real score be withheld", async () => {
    const clipboard = stubClipboard();
    open({ alignmentPct: 62 });

    fireEvent.click(screen.getByRole("checkbox", { name: /Include Alignment Score/ }));
    expect(screen.queryByText(/% Aligned/)).toBeNull();

    fireEvent.click(screen.getByText(/Copy Text & Link/));
    await vi.waitFor(() => expect(clipboard.text()).not.toBe(""));
    expect(clipboard.text()).not.toMatch(/Alignment Score/);
  });
});
