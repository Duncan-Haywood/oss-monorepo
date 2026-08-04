// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InsightFeedback, SessionPulse } from "@/components/FeedbackWidget";
import { SESSION_KEY } from "@/lib/sessionStore";
import { recordUsage } from "@/lib/usageClient";

vi.mock("next/navigation", () => ({ usePathname: () => "/insights" }));
vi.mock("@/lib/usageClient", () => ({
  createUsageId: () => "feedbackkey123456",
  getUsageSessionKey: () => "sessionkey1234567",
  recordUsage: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(recordUsage).mockReset();
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
    expect(screen.queryByText(/Thanks — we read every one/)).toBeNull();
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

    await screen.findByText(/Thanks — we read every one/);
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
    expect(recordUsage).toHaveBeenCalledWith("feedback_submit", expect.objectContaining({
      domain: "top-pick",
      success: true,
    }));
  });

  it("records exposure and dismissal with the insight subject", () => {
    const { unmount } = render(<InsightFeedback subject="top-pick" />);
    expect(recordUsage).toHaveBeenCalledWith("feedback_prompt", expect.objectContaining({ domain: "top-pick" }));

    unmount();
    expect(recordUsage).toHaveBeenCalledWith("feedback_dismiss", expect.objectContaining({ domain: "top-pick" }));
  });
});

// A contract rather than a word blocklist: the claim is allowed exactly when
// the capability behind it exists. Build the personalization loop — have
// anything outside the feedback write path and the admin read path consume
// `insightFeedback` — and this test stops objecting by itself.
describe("insight feedback copy is backed by code", () => {
  const SRC = join(process.cwd(), "src");

  // Where feedback is legitimately handled without personalizing anything: the
  // widget writes it, the route persists it, the admin surfaces read it back.
  const NON_PERSONALIZING = [
    "components/FeedbackWidget",
    "app/api/feedback/",
    "app/api/admin/",
  ];

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it("does not promise personalization while nothing generates it", () => {
    const consumers = walk(SRC).filter((file) => {
      const relative = file.slice(SRC.length).replace(/\\/g, "/");
      if (NON_PERSONALIZING.some((prefix) => relative.startsWith(prefix))) return false;
      if (/\.test\.tsx?$/.test(relative)) return false;
      return readFileSync(file, "utf8").includes("insightFeedback");
    });

    const widget = readFileSync(join(SRC, "components/FeedbackWidget.tsx"), "utf8");
    const confirmations = [...widget.matchAll(/state === "sent"[\s\S]{0,400}?<\/p>/g)]
      .map((match) => match[0]);
    expect(confirmations.length).toBeGreaterThan(0);

    const promisesPersonalization = /tune the next|personali[sz]|tailor|adapt(s|ed)? to you|for you\./i;

    if (consumers.length === 0) {
      for (const confirmation of confirmations) {
        expect(
          confirmation,
          "Feedback confirmation promises personalization, but no module outside the " +
            "write and admin-read paths consumes insightFeedback. Either build that " +
            "loop or say what actually happens.",
        ).not.toMatch(promisesPersonalization);
      }
    }
  });

  it("only claims what the write path actually does", () => {
    const route = readFileSync(join(SRC, "app/api/feedback/route.ts"), "utf8");
    // The confirmation says a person reads these. That is true only while the
    // record is persisted rather than counted and dropped.
    expect(route).toMatch(/prisma\.insightFeedback\.create/);
  });
});

describe("SessionPulse", () => {
  it("records prompt exposure and an explicit skip", () => {
    const onDone = vi.fn();
    render(<SessionPulse totalAnswers={50} onDone={onDone} />);

    expect(recordUsage).toHaveBeenCalledWith("feedback_prompt", expect.objectContaining({ domain: "session" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(recordUsage).toHaveBeenCalledWith("feedback_dismiss", expect.objectContaining({ domain: "session" }));
  });

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
