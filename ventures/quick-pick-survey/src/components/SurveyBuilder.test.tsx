// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SurveyBuilder } from "@/components/SurveyBuilder";

type Reply = { status: number; body?: unknown };

function stubFetch(replies: Record<string, Reply>) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      const r = replies[url] ?? { status: 200, body: {} };
      return { ok: r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill(title: string, items: string) {
  fireEvent.change(screen.getByLabelText("Survey title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Options"), { target: { value: items } });
}

describe("SurveyBuilder", () => {
  it("posts the form and offers the link and the ranking", async () => {
    const calls = stubFetch({
      "/api/admin/surveys": { status: 201, body: { slug: "lunch", url: "/s/lunch", items: 3 } },
      "/api/admin/surveys/lunch/ranking": {
        status: 200,
        body: {
          title: "Lunch",
          participants: 4,
          ranking: [
            { itemId: "a", label: "Tacos", category: null, respondents: 4, rating: 1612.4, se: 40, low: 1534, high: 1690, spread: 10, rank: 1, bestRank: 1, worstRank: 2, tied: true },
            { itemId: "b", label: "Soup", category: null, respondents: 4, rating: 1500, se: 40, low: 1422, high: 1578, spread: 10, rank: 2, bestRank: 1, worstRank: 3, tied: true },
          ],
        },
      },
    });
    render(<SurveyBuilder />);
    fill("Lunch", "Tacos\nSoup\nPizza");
    fireEvent.click(screen.getByRole("button", { name: "Create survey" }));

    expect(await screen.findByText("/s/lunch")).toBeTruthy();
    expect(JSON.parse(calls[0].body!)).toMatchObject({ title: "Lunch", items: "Tacos\nSoup\nPizza" });

    fireEvent.click(screen.getByRole("button", { name: "Show ranking" }));
    expect(await screen.findByText("Tacos")).toBeTruthy();
    expect(screen.getByText("1612 (1534–1690)")).toBeTruthy();
    expect(screen.getByText("1–2")).toBeTruthy();
  });

  it("shows every server message when the survey is rejected, and keeps the form", async () => {
    stubFetch({ "/api/admin/surveys": { status: 400, body: { errors: ["At least 3 items are needed to rank.", "Title too long."] } } });
    render(<SurveyBuilder />);
    fill("Lunch", "Tacos");
    fireEvent.click(screen.getByRole("button", { name: "Create survey" }));

    expect(await screen.findByText("At least 3 items are needed to rank.")).toBeTruthy();
    expect(screen.getByText("Title too long.")).toBeTruthy();
    expect((screen.getByLabelText("Survey title") as HTMLInputElement).value).toBe("Lunch");
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<SurveyBuilder />);
    fill("Lunch", "a\nb\nc");
    fireEvent.click(screen.getByRole("button", { name: "Create survey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Couldn't reach the server."));
  });

  it("says there is nothing to rank before anyone has answered", async () => {
    stubFetch({
      "/api/admin/surveys": { status: 201, body: { slug: "x", url: "/s/x", items: 3 } },
      "/api/admin/surveys/x/ranking": { status: 200, body: { title: "X", participants: 0, ranking: [{ itemId: "a", label: "A", category: null, respondents: 0, rating: 1500, se: 350, low: 800, high: 2200, spread: 0, rank: 1, bestRank: 1, worstRank: 3, tied: true }] } },
    });
    render(<SurveyBuilder />);
    fill("X", "a\nb\nc");
    fireEvent.click(screen.getByRole("button", { name: "Create survey" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show ranking" }));
    expect(await screen.findByText(/nothing to rank/)).toBeTruthy();
  });
});
