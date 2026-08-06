// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InsightsView } from "@/components/InsightsView";
import { INSIGHTS } from "@/lib/insights";
import { SESSION_KEY } from "@/lib/sessionStore";
import { recordUsage } from "@/lib/usageClient";

// Stubbed rather than driven end to end: `recordUsage` batches into
// sessionStorage and flushes on a timer, so asserting on the call is what
// binds the component's behaviour. The transport itself is covered by
// `src/lib/usage.test.ts` and the `/api/usage` integration test.
vi.mock("@/lib/usageClient", () => ({
  recordUsage: vi.fn(),
  flushUsage: vi.fn(),
  getUsageSessionKey: () => "testsessionkey123456",
  createUsageId: () => "testusageid1234567890",
}));

/**
 * The insights page is driven entirely by the catalogue plus a content map,
 * so these guard the contract between them. A mismatch here is exactly the
 * class of bug that shows as a card that never fills in.
 */
describe("insight catalogue", () => {
  it("has no duplicate keys", () => {
    const keys = INSIGHTS.map((i) => i.key);
    // A duplicate key means two cards render the same content and React
    // gets duplicate list keys — this previously happened with top-three
    // appearing twice at different levels.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every insight a title, teaser and needs line", () => {
    for (const i of INSIGHTS) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.teaser.length).toBeGreaterThan(0);
      expect(i.needs.length).toBeGreaterThan(0);
    }
  });

  it("declares a known source for every insight", () => {
    const valid = new Set(["ITEMS", "FINANCIAL", "CONJOINED", "ANY"]);
    for (const i of INSIGHTS) expect(valid.has(i.source)).toBe(true);
  });

  it("exposes no level field — gating is by data readiness", () => {
    for (const i of INSIGHTS) {
      expect(i).not.toHaveProperty("level");
    }
  });
});

/**
 * The screen itself, as opposed to the catalogue it renders.
 *
 * Insights is the payoff for having answered anything at all, and it is read
 * on a phone. A single dropped request used to end there: an error line and
 * a link back to the cards, with no way to ask again.
 */
describe("InsightsView when the request fails", () => {
  const BUNDLE = {
    firstName: "Ada",
    perspective: "PARTNER",
    participants: { behaviours: "p1" },
    domains: [{ slug: "behaviours", title: "Behaviours", kind: "ITEMS" }],
  };

  const READY = {
    level: 1,
    answersUntilNextLevel: 5,
    ready: [],
    content: {},
    itemsRated: 12,
  };

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    // See ShareInsightModal.test.tsx: the module mock's calls outlive cleanup.
    vi.clearAllMocks();
  });

  it("retries in place after a dropped request", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BUNDLE));
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("Failed to fetch");
      return { ok: true, status: 200, json: async () => READY } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InsightsView />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load your insights/);

    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // The error is gone, which is the recovery. What replaces it is the
    // catalogue-driven body the tests above cover.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("does not offer a retry when there is nothing answered to load", async () => {
    // No session bundle is not a failure — there is nothing to ask for, and
    // a retry button there would just fail again.
    vi.stubGlobal("fetch", vi.fn());

    render(<InsightsView />);

    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("records reaching the insights, and reaching the error instead", async () => {
    // `insight_view` is the last step of the operator dashboard's funnel and
    // the far end of its `answer_save -> insight_view` transition. Emitting it
    // on mount would have counted an error screen as an insight seen, which is
    // the reading that makes the funnel flatter than the product is.
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BUNDLE));
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError("Failed to fetch");
        return { ok: true, status: 200, json: async () => READY } as Response;
      }),
    );

    render(<InsightsView />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    await waitFor(() => expect(recordUsage).toHaveBeenCalledWith("insight_view", expect.objectContaining({ success: false })));

    fireEvent.click(retry);

    await waitFor(() => expect(recordUsage).toHaveBeenCalledWith("insight_view", expect.objectContaining({ success: true })));
  });

  it("records a copied insight, including one the clipboard refused", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BUNDLE));
    // The share control exists only on an unlocked insight, so one has to be
    // ready for there to be anything to share.
    const unlocked = {
      ...READY,
      ready: ["top-pick"],
      content: { "top-pick": { label: "Kindness", category: null, rating: 1520, rd: 60, lo: 1400, hi: 1640 } },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => unlocked }) as Response),
    );
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    render(<InsightsView />);

    const copy = await screen.findByRole("button", { name: /share/i });
    fireEvent.click(copy);

    // A share that silently fails is the one the share rate most needs to
    // exclude; the person is still told nothing, deliberately.
    await waitFor(() =>
      expect(recordUsage).toHaveBeenCalledWith("insight_shared", expect.objectContaining({ success: false })),
    );
  });

  it("filters insights by category tabs", async () => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(BUNDLE));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => READY }) as Response)
    );

    render(<InsightsView />);

    await waitFor(() => expect(screen.getByText(`All (${INSIGHTS.length})`)).toBeTruthy());

    // Switch to Categories tab
    const categoriesTab = screen.getByRole("button", { name: "Categories" });
    fireEvent.click(categoriesTab);

    expect(screen.getByText("The kind of person you lean toward")).toBeTruthy();
    expect(screen.queryByText("The price of time")).toBeNull();
  });
});

