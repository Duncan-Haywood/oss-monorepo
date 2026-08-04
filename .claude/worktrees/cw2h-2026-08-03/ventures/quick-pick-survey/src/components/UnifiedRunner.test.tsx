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
  partnerName: "Grace",
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
    expect(screen.getByLabelText(/partner's name/i)).toBeTruthy();
  });

  it("uses the partner's name instead of generic partner language", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => itemsTrial("t1", "Listens without checking a phone", "Plans a date"),
    });

    render(<UnifiedRunner />);

    expect(await screen.findByText(/For your relationship with Grace: Which would matter more?/i)).toBeTruthy();
    expect(screen.getByText(/Focus: Your relationship with Grace/i)).toBeTruthy();
  });

  it("says what starting costs a signed-out person, before they start", async () => {
    stubFetch({ "/api/auth/me": noAccount });
    render(<UnifiedRunner />);

    // Goal 5 is "safe to hand to someone you love". The welcome screen is the
    // last point before data is written, and it is the only screen someone
    // who never signs in is guaranteed to see, so the claim and the policy
    // link belong here rather than only in /privacy.
    expect(await screen.findByText(/name you enter stay on this device/i)).toBeTruthy();
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

  /**
   * The runner reads as though it prefetches the next card and advances
   * optimistically, but that path never runs: `prefetchNext` is only called
   * from inside the optimistic branch, and that branch only executes when a
   * prefetched card already exists. Nothing bootstraps the first one, so every
   * card costs a full round trip and `nextTrial` is always null.
   *
   * This is a tripwire, not an endorsement. It goes red the moment someone
   * wires up the first prefetch — at which point they have to answer the
   * question that made this worth leaving alone: `/api/trials/next` writes a
   * Trial row per call, so a prefetched card that is discarded (on a domain
   * switch, or when the session ends) becomes a shown-but-unanswered row and
   * inflates the abandonment metric. See IMPROVEMENT-PLAN.md.
   */
  it("costs exactly one trials/next call per card shown", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));
    let served = 0;
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => {
        served++;
        return itemsTrial(`t${served}`, `Hiking ${served}`, `Museums ${served}`);
      },
      "/api/trials/answer": () => ({ json: { ok: true } }),
    });

    render(<UnifiedRunner />);
    await screen.findByText("Hiking 1");
    expect(served).toBe(1);

    for (let i = 1; i <= 3; i++) {
      await waitFor(() => expect(screen.queryByText(`Hiking ${i}`)).toBeTruthy());
      fireEvent.click(screen.getByText(`Hiking ${i}`));
    }

    await waitFor(() => expect(screen.queryByText("Hiking 4")).toBeTruthy());
    expect(served).toBe(4);
  });

  it("honors topic requested in URL search param ?domain=...", async () => {
    // jsdom's `location` is a non-writable accessor, so it has to be redefined
    // rather than assigned. Restored at the end of the test: `recordUsage`
    // stamps `location.pathname` onto every event, so leaking a replacement
    // into the rest of the file would quietly re-path later tests.
    const realLocation = Object.getOwnPropertyDescriptor(window, "location");
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: new URL("http://localhost/app?domain=professions"),
    });

    const BUNDLE_WITH_PROFESSIONS = {
      firstName: "Ada",
      partnerName: "Grace",
      perspective: "PARTNER" as const,
      participants: { activities: "p-act", professions: "p-prof" },
      domains: [
        { slug: "activities", title: "Activities", kind: "ITEMS" as const, confidence: 0, answeredCount: 0 },
        { slug: "professions", title: "Professions", kind: "ITEMS" as const, confidence: 0, answeredCount: 0 },
      ],
    };
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE_WITH_PROFESSIONS));

    const servedDomains: string[] = [];
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": (body: unknown) => {
        const participantId = (body as { participantId?: string })?.participantId;
        if (participantId === "p-prof") {
          servedDomains.push("professions");
          return itemsTrial("t-prof", "Private helicopter pilot", "Volunteer firefighter");
        } else {
          servedDomains.push("activities");
          return itemsTrial("t-act", "Hiking", "Museums");
        }
      },
    });

    render(<UnifiedRunner />);
    expect(await screen.findByText("Private helicopter pilot")).toBeTruthy();
    expect(servedDomains[0]).toBe("professions");

    if (realLocation) Object.defineProperty(window, "location", realLocation);
  });

  it("switches domain when the streak completes", async () => {
    const MULTI_DOMAIN_BUNDLE = {
      firstName: "Ada",
      partnerName: "Grace",
      perspective: "PARTNER" as const,
      participants: { values: "p-val", traits: "p-tr" },
      domains: [
        { slug: "values", title: "Values", kind: "ITEMS" as const, confidence: 0, answeredCount: 0 },
        { slug: "traits", title: "Traits", kind: "ITEMS" as const, confidence: 0, answeredCount: 0 },
      ],
    };
    localStorage.setItem(LS_KEY, JSON.stringify(MULTI_DOMAIN_BUNDLE));

    let valCount = 0;
    let trCount = 0;
    const servedDomains: string[] = [];
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": (body: unknown) => {
        const participantId = (body as { participantId?: string })?.participantId;
        if (participantId === "p-val") {
          valCount++;
          servedDomains.push("values");
          return itemsTrial(`t-val-${valCount}`, `Honesty ${valCount}`, `Kindness ${valCount}`);
        } else {
          trCount++;
          servedDomains.push("traits");
          return itemsTrial(`t-tr-${trCount}`, `Patience ${trCount}`, `Humor ${trCount}`);
        }
      },
      "/api/trials/answer": () => ({ json: { ok: true } }),
    });

    // Pin the scheduler. `randomStreakTarget()` is `4 + floor(rand() * 5)`, so
    // rand()=0 fixes the values streak at exactly four answers, and
    // `pickNextDomain` is then left with only "traits" in the pool. Pinning it
    // is what lets this assert the exact card the switch lands on instead of
    // "a traits card turns up eventually", which holds either way.
    vi.spyOn(Math, "random").mockReturnValue(0);

    render(<UnifiedRunner />);
    await screen.findByText("Honesty 1");

    for (let i = 1; i <= 4; i++) {
      await waitFor(() => expect(screen.queryByText(`Honesty ${i}`)).toBeTruthy());
      fireEvent.click(screen.getByText(`Honesty ${i}`));
    }

    // The fourth answer ends the streak, so the next card must come from the
    // traits participant — and must be its first, not a fifth values card.
    await waitFor(() => expect(screen.getByText("Patience 1")).toBeTruthy());
    expect(screen.queryByText("Honesty 5")).toBeNull();
    expect(servedDomains).toEqual(["values", "values", "values", "values", "traits"]);
  });

  it("sends the participant and kind that the undo route requires", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));

    let undoBody: unknown = null;
    let served = 0;
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => {
        served++;
        return itemsTrial(`t${served}`, `Hiking ${served}`, `Museums ${served}`);
      },
      "/api/trials/answer": () => ({ json: { ok: true } }),
      "/api/trials/undo": (body: unknown) => {
        undoBody = body;
        return { json: { ok: true } };
      },
    });

    render(<UnifiedRunner />);
    fireEvent.click(await screen.findByText("Hiking 1"));

    const undo = await screen.findByLabelText("Undo last answer");
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(undo);

    await waitFor(() => expect(undoBody).not.toBeNull());
    // `/api/trials/undo` rejects with 400 unless `participantId` is present, and
    // routes ITEMS against FINANCIAL_LIKE off `kind`. Neither is derivable from
    // a domain slug server-side, because the participant ids only exist in this
    // device's session bundle. Renaming this body silently turns every rewind
    // into "Couldn't undo that answer" in production, which no other test sees.
    expect(undoBody).toEqual({ participantId: "p-act", kind: "ITEMS" });
  });

  /**
   * Undo rolls the answer back on the server, which makes that pair unanswered
   * again — so `/api/trials/next` is entitled to hand back the very same trial.
   * `submittingTrialIdRef` is the double-submit guard, keyed on trial id, and it
   * was set on every answer and never cleared. So the re-served card matched the
   * guard and `handleAnswer` returned on its first line: the card rendered, the
   * tap registered, and nothing happened. No error, no spinner, no next card.
   *
   * It reads as the app freezing right after a rewind, which is the moment
   * someone is already unsure they did the right thing. Nothing else catches it
   * — every other test answers a fresh trial id each time, which always clears
   * the guard by accident.
   */
  it("lets a card be answered again when undo re-serves the same trial", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));

    const servedIds: string[] = [];
    let served = 0;
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => {
        served++;
        // Call 3 lands after the undo, so it re-serves the rolled-back pair
        // under its original id — exactly what the real route does.
        const id = served === 3 ? "t1" : `t${served}`;
        servedIds.push(id);
        return itemsTrial(id, `Hiking ${id}`, `Museums ${id}`);
      },
      "/api/trials/answer": () => ({ json: { ok: true } }),
      "/api/trials/undo": () => ({ json: { ok: true } }),
    });

    render(<UnifiedRunner />);
    fireEvent.click(await screen.findByText("Hiking t1"));
    await screen.findByText("Hiking t2");

    const undo = await screen.findByLabelText("Undo last answer");
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(undo);

    // Back on the original pair, same trial id as the answer that was undone.
    await waitFor(() => expect(servedIds).toEqual(["t1", "t2", "t1"]));
    const reserved = await screen.findByText("Hiking t1");

    fireEvent.click(reserved);

    // The tap must actually advance. Before the guard was cleared on undo this
    // stayed on "Hiking t1" forever and `served` never reached 4.
    await waitFor(() => expect(screen.getByText("Hiking t4")).toBeTruthy());
    expect(served).toBe(4);
  });

  /**
   * The failure branch of undo. The person must be told, and — because undo is
   * the one action that leaves the current card on screen — the card must stay
   * answerable rather than being swallowed by the submit guard.
   */
  it("reports a failed undo and leaves the current card answerable", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify(BUNDLE));

    let served = 0;
    stubFetch({
      "/api/auth/me": noAccount,
      "/api/session/status": emptyStatus,
      "/api/trials/next": () => {
        served++;
        return itemsTrial(`t${served}`, `Hiking ${served}`, `Museums ${served}`);
      },
      "/api/trials/answer": () => ({ json: { ok: true } }),
      "/api/trials/undo": () => ({ status: 500 }),
    });

    render(<UnifiedRunner />);
    fireEvent.click(await screen.findByText("Hiking 1"));
    await screen.findByText("Hiking 2");

    const undo = await screen.findByLabelText("Undo last answer");
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(undo);

    expect(await screen.findByText(/Couldn't undo that answer/i)).toBeTruthy();

    // The rewind failed, so the answer stands and the card in front of them is
    // still the live one. Tapping it has to keep the session moving.
    fireEvent.click(screen.getByText("Hiking 2"));
    await waitFor(() => expect(screen.getByText("Hiking 3")).toBeTruthy());
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
    fireEvent.change(await screen.findByLabelText(/partner's name/i), { target: { value: "Grace" } });
    fireEvent.click(await screen.findByRole("button", { name: /The partner I would choose|Start our couples check-in/i }));
    expect(await screen.findByText("Choice 1A")).toBeTruthy();
    expect(screen.getAllByText(/Your relationship with Grace/i).length).toBeGreaterThan(0);

    for (let answer = 1; answer <= 10; answer += 1) {
      fireEvent.click(await screen.findByText(`Choice ${answer}A`, {}, { timeout: 3000 }));
      if (answer < 10) await screen.findByText(`Choice ${answer + 1}A`, {}, { timeout: 3000 });
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
