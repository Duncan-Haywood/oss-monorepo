// @vitest-environment happy-dom
import { REVIEW_INPUTS, REVIEW_OUTPUTS } from "@shared/management-review";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgInfo } from "../lib/types";
import { type ReviewItem, type ReviewsResponse, ReviewsView } from "./Reviews";

const info = (quality: boolean, role: OrgInfo["role"] = "owner"): OrgInfo =>
  ({
    org: { id: "org_1", name: "Acme" },
    role,
    profile: { targetLevel: 2 },
    plan: { key: quality ? "quality" : "level2", name: "Plan", level2: true, quality },
  }) as unknown as OrgInfo;

const noFacts = Object.fromEntries(
  REVIEW_INPUTS.map((i) => [i.key, []]),
) as unknown as ReviewItem["facts"];

const draft: ReviewItem = {
  id: "mrv_1",
  status: "draft",
  heldOn: "2026-11-20",
  periodFrom: "2025-11-21",
  periodTo: "2026-11-20",
  attendees: "Dana (owner)",
  inputs: {},
  outputs: {},
  actions: [],
  nextReviewOn: null,
  finalisedOn: null,
  facts: {
    ...noFacts,
    customer_feedback: [
      "Logged as corrective actions in the period: 1 customer complaint, 0 returns or rejections (CA-0001).",
    ],
  },
  problems: [
    'Quality objectives (9.3.2 c 2): say what was discussed, or write "nothing to report".',
  ],
};

const response = (items: ReviewItem[]): ReviewsResponse => ({
  today: "2026-11-28",
  items,
  attention: {
    timing: "never",
    lastHeldOn: null,
    nextDueOn: null,
    actionsOpen: 0,
    actionsOverdue: 0,
    drafts: items.length,
  },
  inputs: REVIEW_INPUTS.map((i) => ({ ...i })),
  outputs: REVIEW_OUTPUTS.map((o) => ({ ...o })),
});

function setup(quality: boolean, items: ReviewItem[] = [draft]) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (init?.method && init.method !== "GET") {
        calls.push({
          url,
          method: init.method,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        return ok(draft);
      }
      if (url.endsWith("/reviews")) return ok(response(items));
      return new Response("{}", { status: 404 });
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewsView orgId="org_1" info={info(quality)} onUpgrade={() => {}} />
    </QueryClientProvider>,
  );
  return { calls };
}

afterEach(() => vi.unstubAllGlobals());

describe("ReviewsView", () => {
  it("says no review is recorded and starts one on the chosen date", async () => {
    const { calls } = setup(true, []);
    expect(await screen.findByText(/No management review recorded yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Meeting date"), { target: { value: "2026-11-27" } });
    fireEvent.click(screen.getByText("Start a review"));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      url: "/api/orgs/org_1/reviews",
      method: "POST",
      body: { heldOn: "2026-11-27" },
    });
  });

  it("shows a draft's figures beside each input and saves the notes", async () => {
    const { calls } = setup(true);
    fireEvent.click(await screen.findByText("Edit"));
    expect(screen.getByText(/1 customer complaint, 0 returns/)).toBeTruthy();
    expect(screen.getByText(/Before finalising/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Notes: Quality objectives"), {
      target: { value: "On-time delivery 94% against 95%." },
    });
    fireEvent.click(screen.getByText("Save draft"));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.body).toMatchObject({
      inputs: { objectives: "On-time delivery 94% against 95%." },
    });
  });

  it("is read only without the quality plan", async () => {
    setup(false);
    await screen.findByText("Read only on this plan");
    expect(screen.queryByText("Start a review")).toBeNull();
    fireEvent.click(await screen.findByText("Open"));
    expect(screen.getByText(/1 customer complaint/)).toBeTruthy();
    expect(screen.queryByText("Save draft")).toBeNull();
  });
});
