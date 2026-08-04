// @vitest-environment jsdom

/**
 * Behavioural tests for the share card, which is the venture's only growth loop.
 *
 * Two defects sat in it, both of the "claim with no behaviour behind it" shape
 * and neither loud enough to fail anything:
 *
 * 1. Every share surface — the copied text, the `navigator.share` payload and
 *    the card's own footer — carried the literal `https://quickpick.app`, while
 *    `VENTURE.yaml` declares the product at `https://pairwise.marisstella.dev`.
 *    Every recipient was sent off-product, so the loop returned nobody, and the
 *    card stated the product lives at a host it is not served from.
 * 2. `alignmentPct` defaulted to `85`, and `CoupleView` passed
 *    `data.fit?.overlap ?? 0.85`. A couple whose overlap had not been computed
 *    was shown, and shared, "85% Aligned" as their own measured result.
 *
 * Both assertions below fail against the pre-fix component.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareInsightModal } from "@/components/ShareInsightModal";

const INSIGHT = {
  isOpen: true,
  onClose: () => {},
  title: "Spontaneity",
  headline: "The Adventurous Anchors",
  discovery: "You both rank stability high, but only one of you ranks surprise high.",
  coupleNames: { mine: "You", theirs: "Sam" },
};

/** Read back what the copy button put on the clipboard. */
function stubClipboard(): { text: () => string } {
  let written = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (t: string) => void (written = t) },
  });
  return { text: () => written };
}

async function copiedText(props: Record<string, unknown> = {}): Promise<string> {
  const clipboard = stubClipboard();
  render(<ShareInsightModal {...INSIGHT} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Copy Text & Link/ }));
  await waitFor(() => expect(clipboard.text()).not.toBe(""));
  return clipboard.text();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("share target", () => {
  it("shares the origin the app is actually served from", async () => {
    // jsdom serves this suite from http://localhost:3000; in production the
    // same expression yields the real deployment host. The point is that the
    // link tracks wherever the app runs rather than naming a host in source.
    const text = await copiedText();
    expect(text).toContain(window.location.origin);
  });

  it("shares no link to a host this product is not served from", async () => {
    const text = await copiedText();
    expect(text).not.toMatch(/quickpick\.app/i);
    // Generalised: the only absolute URL in shared text must be this origin.
    for (const url of text.match(/https?:\/\/[^\s]+/g) ?? []) {
      expect(new URL(url).origin).toBe(window.location.origin);
    }
  });

  it("shows the recipient the host they will land on, not a brand string", async () => {
    render(<ShareInsightModal {...INSIGHT} />);
    await screen.findByText(window.location.host);
    expect(screen.queryByText(/quickpick\.app/i)).toBeNull();
  });

  it("passes the same origin to the native share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<ShareInsightModal {...INSIGHT} />);
    fireEvent.click(screen.getByRole("button", { name: /Share via Phone/ }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].url).toBe(window.location.origin);
  });

  it("names no host where there is no location to read one from", async () => {
    // The server render is the real environment with no origin. It must emit no
    // host at all: a literal placed here to fill the gap is exactly the defect
    // this replaced, and one that differed from the client render would also
    // mismatch on hydration.
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(<ShareInsightModal {...INSIGHT} />);
    expect(html).toContain("Share Relationship Insight");
    expect(html).not.toMatch(/quickpick\.app/i);

    // The WhatsApp deep link is the one absolute URL that belongs here; it is
    // where the share is handed off, not where the recipient is sent.
    const urls = [...html.matchAll(/https?:\/\/[^\s"'&]+/g)].map((m) => new URL(m[0]));
    expect(urls.map((u) => u.host)).toEqual(["api.whatsapp.com"]);

    // And the message inside it must not carry a link either.
    const whatsapp = html.match(/href="(https:\/\/api\.whatsapp\.com[^"]+)"/)?.[1] ?? "";
    const cleanWhatsapp = whatsapp.replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
    const message = new URL(cleanWhatsapp).searchParams.get("text") ?? "";
    expect(message).toContain("Discover how well you and your partner align");
    expect(message).not.toMatch(/https?:\/\//);
  });
});

describe("alignment score", () => {
  it("shows and shares a score the couple actually has", async () => {
    render(<ShareInsightModal {...INSIGHT} alignmentPct={62} />);
    await screen.findByText("62% Aligned");
    cleanup();
    expect(await copiedText({ alignmentPct: 62 })).toContain("Alignment Score: 62%");
  });

  it("states no score at all when none has been computed", async () => {
    render(<ShareInsightModal {...INSIGHT} />);
    expect(screen.queryByText(/% Aligned/)).toBeNull();
    expect(screen.queryByText(/Include Alignment Score/)).toBeNull();
    cleanup();
    const text = await copiedText();
    expect(text).not.toMatch(/Alignment Score/);
    // The specific number the old default produced, named so a reintroduced
    // fallback fails here rather than passing the looser check above.
    expect(text).not.toMatch(/\b85\s?%/);
  });

  it("still lets a couple with a score withhold it", async () => {
    const clipboard = stubClipboard();
    render(<ShareInsightModal {...INSIGHT} alignmentPct={62} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Include Alignment Score/ }));
    fireEvent.click(screen.getByRole("button", { name: /Copy Text & Link/ }));
    await waitFor(() => expect(clipboard.text()).not.toBe(""));
    expect(clipboard.text()).not.toMatch(/Alignment Score/);
  });
});
