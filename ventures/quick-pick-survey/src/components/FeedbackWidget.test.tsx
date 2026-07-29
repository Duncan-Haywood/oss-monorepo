// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InsightFeedback, SessionPulse } from "@/components/FeedbackWidget";
import { SESSION_KEY } from "@/lib/sessionStore";

vi.mock("next/navigation", () => ({ usePathname: () => "/insights" }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function storeSelfMode() {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({
    firstName: "Ada",
    perspective: "SELF",
    participants: { values: "p1" },
    domains: [{ slug: "values", title: "Values", kind: "ITEMS" }],
  }));
}

describe("InsightFeedback", () => {
  it("does not claim success when the server rejected the feedback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    render(<InsightFeedback subject="top-pick" />);

    fireEvent.click(screen.getByRole("button", { name: "This insight was useful" }));

    expect((await screen.findByRole("alert")).textContent).toContain("didn't save");
    expect(screen.queryByText(/Thanks — that helps/)).toBeNull();
  });

  it("sends one structured negative record with its mode and page", async () => {
    storeSelfMode();
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<{ ok: boolean }>>();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<InsightFeedback subject="top-pick" />);

    fireEvent.click(screen.getByRole("button", { name: "This insight was not useful" }));
    fireEvent.click(screen.getByRole("button", { name: "Too vague" }));
    fireEvent.change(screen.getByPlaceholderText("Optional detail"), { target: { value: "Show the trade-off." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText(/Thanks — that helps/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      subject: "top-pick",
      usefulness: 1,
      reason: "too_vague",
      note: "Show the trade-off.",
      perspective: "SELF",
      path: "/insights",
    });
  });
});

describe("SessionPulse", () => {
  it("keeps the prompt open when saving fails and closes only after a saved retry", async () => {
    const onDone = vi.fn();
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: ++attempt > 1 })));
    render(<SessionPulse totalAnswers={50} onDone={onDone} />);

    fireEvent.click(screen.getByRole("button", { name: "Rate 4 out of 5" }));
    await screen.findByRole("alert");
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Rate 4 out of 5" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });
});
