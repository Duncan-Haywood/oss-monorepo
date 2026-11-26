// @vitest-environment happy-dom
import type { TimelineEvent, TimelineResponse } from "@shared/api/timeline";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityTimeline, matchesFilter } from "./activity-timeline";
import { mockFetch } from "./test-fixtures";

const URL = "/api/orgs/org_1/applications/app_1/timeline";

const ev = (over: Partial<TimelineEvent> & Pick<TimelineEvent, "id" | "kind" | "summary">) =>
  ({ at: "2026-11-19T10:00:00.000Z", actor: { type: "system" }, ...over }) as TimelineEvent;

const PAGE_1: TimelineResponse = {
  items: [
    ev({
      id: "aud:1",
      kind: "application.created",
      actor: { type: "human", name: "Rosa Martinez" },
      summary: "Rosa started this application",
    }),
    ev({
      id: "ver:1",
      kind: "version.drafted",
      actor: { type: "ai", name: "claude-opus-5-5" },
      summary: "AI drafted version 1 using 23 facts",
      detail: { versionNumber: 1, factsCited: 23 },
    }),
    ev({
      id: "chk:1",
      kind: "check.flagged",
      actor: { type: "ai" },
      summary: "Grounding check flagged 2 numbers in version 1",
    }),
    ev({
      id: "wir:1",
      kind: "wait.in_review",
      summary: "Waited 2 hours for human review",
      detail: { open: false, durationMs: 7_200_000 },
    }),
  ],
  nextCursor: "c1",
  whoDecided: [
    { step: "drafted", label: "Drafted by AI", actor: { type: "ai" } },
    { step: "checked", label: "Checked by AI", actor: { type: "ai" } },
    { step: "decided", label: "Approved by Rosa", actor: { type: "human", name: "Rosa Martinez" } },
    { step: "submitted", label: "Submitted by Autopilot", actor: { type: "autopilot" } },
  ],
};

const PAGE_2: TimelineResponse = {
  items: [
    ev({
      id: "rev:1",
      kind: "review.approved",
      actor: { type: "human", name: "Rosa Martinez" },
      summary: "Rosa approved version 1",
    }),
    ev({
      id: "sub:1",
      kind: "submission.sent",
      actor: { type: "autopilot", name: "Autopilot" },
      summary: "Autopilot submitted by email (sha256 3f2a…)",
      link: "/api/orgs/org_1/submissions/sub_1/package",
      detail: { channel: "email", sha256: "3f2a".padEnd(64, "0") },
    }),
  ],
  nextCursor: null,
  whoDecided: PAGE_1.whoDecided,
};

function renderTimeline() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActivityTimeline orgId="org_1" applicationId="app_1" />
    </QueryClientProvider>,
  );
}

const summaries = () =>
  within(screen.getByRole("list", { name: "Activity timeline" }))
    .getAllByRole("listitem")
    .map((li) => li.querySelector("p")?.textContent);

afterEach(() => vi.unstubAllGlobals());

describe("ActivityTimeline", () => {
  it("renders the who-decided summary and events, loads more pages, and filters by actor", async () => {
    const calls = mockFetch([
      ["GET", URL, () => PAGE_1],
      ["GET", `${URL}?cursor=c1`, () => PAGE_2],
    ]);
    const user = userEvent.setup();
    renderTimeline();

    const who = await screen.findByRole("region", { name: "Who decided?" });
    expect(who).toHaveTextContent(
      "Drafted by AI·Checked by AI·Approved by Rosa·Submitted by Autopilot",
    );
    expect(summaries()).toEqual([
      "Rosa started this application",
      "AI drafted version 1 using 23 facts",
      "Grounding check flagged 2 numbers in version 1",
      "Waited 2 hours for human review",
    ]);
    // Actor icons: sparkle for AI, person for humans, clock for waits.
    const items = within(screen.getByRole("list", { name: "Activity timeline" })).getAllByRole(
      "listitem",
    );
    expect(items[0]?.querySelector("[data-actor]")).toHaveAttribute("data-actor", "human");
    expect(items[1]?.querySelector("[data-actor]")).toHaveAttribute("data-actor", "ai");
    expect(items[1]).toHaveTextContent("AI · claude-opus-5-5");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Autopilot submitted by email (sha256 3f2a…)")).toBeVisible();
    expect(calls.map((c) => c.url)).toEqual([URL, `${URL}?cursor=c1`]);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Package" })).toHaveAttribute(
      "href",
      "/api/orgs/org_1/submissions/sub_1/package",
    );

    await user.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByRole("button", { name: "AI" })).toHaveAttribute("aria-pressed", "true");
    expect(summaries()).toEqual([
      "AI drafted version 1 using 23 facts",
      "Grounding check flagged 2 numbers in version 1",
      "Autopilot submitted by email (sha256 3f2a…)",
    ]);

    await user.click(screen.getByRole("button", { name: "Human" }));
    expect(summaries()).toEqual(["Rosa started this application", "Rosa approved version 1"]);

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(summaries()).toHaveLength(6);
  });

  it("shows an empty state when there is no activity", async () => {
    mockFetch([["GET", URL, () => ({ items: [], nextCursor: null, whoDecided: [] })]]);
    renderTimeline();
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });

  it("filters: AI includes autopilot, Human only people, system waits only under All", () => {
    const sys = ev({ id: "w", kind: "wait.needs_info", summary: "x" });
    const auto = ev({
      id: "a",
      kind: "submission.sent",
      summary: "x",
      actor: { type: "autopilot" },
    });
    expect(matchesFilter(sys, "all")).toBe(true);
    expect(matchesFilter(sys, "ai")).toBe(false);
    expect(matchesFilter(sys, "human")).toBe(false);
    expect(matchesFilter(auto, "ai")).toBe(true);
    expect(matchesFilter(auto, "human")).toBe(false);
  });
});
