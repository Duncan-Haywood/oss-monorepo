// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ProfileView } from "@/components/ProfileView";
import { SESSION_KEY } from "@/lib/sessionStore";

const STORED = {
  firstName: "Ada",
  perspective: "PARTNER",
  participants: { behaviors: "p1", values: "p2", careers: "p3" },
  domains: [
    { slug: "behaviors", title: "Behaviors", kind: "ITEMS" },
    { slug: "values", title: "Values", kind: "ITEMS" },
    { slug: "careers", title: "Careers", kind: "ITEMS" },
  ],
};

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }),
  );
  return calls;
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
  it("replaces the perspective chooser with personal usage stats", async () => {
    const calls = stubFetch(200, {
      status: {
        behaviors: { answeredCount: 14, confidence: 0.72 },
        values: { answeredCount: 9, confidence: 0.48 },
        careers: { answeredCount: 0, confidence: 0 },
      },
    });

    render(<ProfileView />);

    expect(screen.queryByText("What you're rating")).toBeNull();
    expect(screen.queryByText("The partner I would choose")).toBeNull();
    expect(await screen.findByText("23")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "/api/session/status",
      body: { participants: STORED.participants },
    });
  });

  it("shows zero activity when there is no stored ranking", async () => {
    window.localStorage.clear();
    stubFetch(200, {});

    render(<ProfileView />);

    await waitFor(() => expect(screen.getByText("0%")).toBeTruthy());
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("shows a useful error when progress cannot be loaded", async () => {
    stubFetch(500, { error: "nope" });

    render(<ProfileView />);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't load your activity. Try again later.",
    );
  });

  it("rejects malformed progress instead of displaying plausible stats", async () => {
    stubFetch(200, {
      status: { behaviors: { answeredCount: "14", confidence: 0.72 } },
    });

    render(<ProfileView />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("14")).toBeNull();
  });
});
