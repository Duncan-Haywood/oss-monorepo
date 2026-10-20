// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SurveyRespondent } from "@/components/SurveyRespondent";

type Reply = { status: number; body?: unknown };

function stubFetch(replies: Record<string, Reply | Reply[]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const r = replies[url];
      const reply = Array.isArray(r) ? (r.length > 1 ? r.shift()! : r[0]) : (r ?? { status: 200, body: {} });
      return { ok: reply.status < 300, status: reply.status, json: async () => reply.body ?? {} } as Response;
    }),
  );
  return calls;
}

const trial = (n: number) => ({
  trialId: `t${n}`,
  itemA: { id: "a", label: "Tacos" },
  itemB: { id: "b", label: "Pizza" },
  answeredCount: n,
});
const survey = { survey: { title: "Lunch", description: null } };

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SurveyRespondent", () => {
  it("joins once, shows a pair, answers it and loads the next", async () => {
    const calls = stubFetch({
      "/api/surveys/lunch": { status: 200, body: survey },
      "/api/surveys/lunch/join": { status: 201, body: { participantId: "p1" } },
      "/api/trials/next": [
        { status: 200, body: trial(0) },
        { status: 200, body: trial(1) },
      ],
      "/api/trials/answer": { status: 200, body: { ok: true } },
    });
    render(<SurveyRespondent slug="lunch" />);
    fireEvent.click(await screen.findByText("Tacos"));
    await waitFor(() => expect(screen.getByText("1 answered. Stop whenever you like.")).toBeTruthy());
    expect(calls.filter((u) => u.endsWith("/join"))).toHaveLength(1);
    expect(localStorage.getItem("qps:s:lunch")).toBe("p1");
  });

  it("resumes a remembered participant without joining again", async () => {
    localStorage.setItem("qps:s:lunch", "p9");
    const calls = stubFetch({
      "/api/surveys/lunch": { status: 200, body: survey },
      "/api/trials/next": { status: 200, body: trial(3) },
    });
    render(<SurveyRespondent slug="lunch" />);
    await screen.findByText("Pizza");
    expect(calls.some((u) => u.endsWith("/join"))).toBe(false);
  });

  it("starts over when the remembered participant is gone", async () => {
    localStorage.setItem("qps:s:lunch", "gone");
    stubFetch({
      "/api/surveys/lunch": { status: 200, body: survey },
      "/api/surveys/lunch/join": { status: 201, body: { participantId: "fresh" } },
      "/api/trials/next": [
        { status: 404, body: {} },
        { status: 200, body: trial(0) },
      ],
    });
    render(<SurveyRespondent slug="lunch" />);
    await screen.findByText("Tacos");
    expect(localStorage.getItem("qps:s:lunch")).toBe("fresh");
  });

  it("says so for an unknown survey", async () => {
    stubFetch({ "/api/surveys/nope": { status: 404 } });
    render(<SurveyRespondent slug="nope" />);
    expect(await screen.findByText("Survey not found")).toBeTruthy();
  });

  it("keeps the pair and says so when saving an answer fails", async () => {
    stubFetch({
      "/api/surveys/lunch": { status: 200, body: survey },
      "/api/surveys/lunch/join": { status: 201, body: { participantId: "p1" } },
      "/api/trials/next": { status: 200, body: trial(0) },
      "/api/trials/answer": { status: 500 },
    });
    render(<SurveyRespondent slug="lunch" />);
    fireEvent.click(await screen.findByText("Tacos"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Pizza")).toBeTruthy();
  });
});
