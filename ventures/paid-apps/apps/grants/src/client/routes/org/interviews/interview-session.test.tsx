// @vitest-environment happy-dom
import type { InterviewTurnDto } from "@shared/api/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewSessionPage } from "./interview-session";
import type { InterviewDetail } from "./shared";
import { extractedFactCount, topicLabel } from "./shared";

const now = "2026-11-19T17:00:00.000Z";

function turn(
  ordinal: number,
  role: InterviewTurnDto["role"],
  content: string,
  extra: Partial<InterviewTurnDto> = {},
): InterviewTurnDto {
  return {
    id: `trn_${ordinal}`,
    orgId: "org_1",
    interviewId: "int_1",
    ordinal,
    role,
    content,
    inputMode: "text",
    audioR2Key: null,
    topicKey: null,
    speakerName: null,
    createdBy: null,
    createdAt: now,
    ...extra,
  } as InterviewTurnDto;
}

function interview(over: Partial<InterviewDetail> = {}): InterviewDetail {
  return {
    id: "int_1",
    orgId: "org_1",
    kind: "onboarding",
    mode: "ai_chat",
    status: "active",
    title: "Onboarding interview",
    focusProjectId: null,
    focusApplicationId: null,
    agenda: ["mission", "programs", "population_served"],
    coveredTopics: [],
    transcriptDocumentId: null,
    summary: null,
    factCount: 0,
    createdBy: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    turns: [turn(1, "interviewer", "What is your organization's mission?")],
    ...over,
  } as InterviewDetail;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

let server: { interview: InterviewDetail; answerGate: Promise<void> | null };
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  if (method === "GET" && url === "/api/orgs/org_1/interviews/int_1") return json(server.interview);
  if (method === "POST" && url === "/api/orgs/org_1/interviews/int_1/answer") {
    if (server.answerGate) await server.answerGate;
    const body = JSON.parse(String(init?.body)) as { content: string; inputMode: string };
    const answer = turn(2, "respondent", body.content);
    const next = turn(3, "interviewer", "Which programs do you run today?");
    server.interview = {
      ...server.interview,
      coveredTopics: ["mission"],
      turns: [...server.interview.turns, answer, next],
    };
    return json({ turns: [answer, next], done: false });
  }
  if (method === "POST" && url === "/api/orgs/org_1/interviews/int_1/complete") {
    server.interview = { ...server.interview, status: "completed", factCount: 4 };
    return json(server.interview);
  }
  return json({ error: { code: "not_found", message: `Unhandled ${method} ${url}` } }, 404);
});

function renderSession() {
  const rootRoute = createRootRoute({ component: Outlet });
  const sessionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/orgs/$orgId/interviews/$interviewId",
    component: InterviewSessionPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([sessionRoute]),
    history: createMemoryHistory({ initialEntries: ["/orgs/org_1/interviews/int_1"] }),
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server = { interview: interview(), answerGate: null };
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InterviewSessionPage", () => {
  it("sends an answer optimistically and renders the next question", async () => {
    let release = () => {};
    server.answerGate = new Promise<void>((r) => {
      release = r;
    });
    const user = userEvent.setup();
    renderSession();

    expect(await screen.findByText("What is your organization's mission?")).toBeInTheDocument();
    expect(screen.getByText(/specifics \(numbers, dates, names\)/)).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Topics covered" });
    expect(progress).toHaveAttribute("aria-valuenow", "0");

    const box = screen.getByLabelText("Your answer");
    await user.type(box, "We place 120 Navajo Nation residents in trades jobs each year.");
    await user.keyboard("{Control>}{Enter}{/Control}");

    // Optimistic: the answer shows before the server responds, and the composer clears.
    const transcript = screen.getByRole("list", { name: "Interview transcript" });
    expect(
      within(transcript).getByText(
        "We place 120 Navajo Nation residents in trades jobs each year.",
      ),
    ).toBeInTheDocument();
    expect(box).toHaveValue("");
    expect(screen.getByText(/Thinking about your answer/)).toBeInTheDocument();

    release();
    expect(await screen.findByText("Which programs do you run today?")).toBeInTheDocument();
    await waitFor(() => expect(progress).toHaveAttribute("aria-valuenow", "1"));

    const answerCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/answer"));
    expect(JSON.parse(String(answerCall?.[1]?.body))).toEqual({
      content: "We place 120 Navajo Nation residents in trades jobs each year.",
      inputMode: "text",
    });
    // The new question is announced to screen readers.
    await waitFor(() =>
      expect(
        screen.getByText("Next question: Which programs do you run today?"),
      ).toBeInTheDocument(),
    );
  });

  it("restores the draft when sending fails", async () => {
    fetchMock.mockImplementationOnce(async () => json(server.interview));
    fetchMock.mockImplementationOnce(async () =>
      json({ error: { code: "llm_unavailable", message: "Interviewer is unavailable" } }, 503),
    );
    const user = userEvent.setup();
    renderSession();

    const box = await screen.findByLabelText("Your answer");
    await user.type(box, "Founded in 1968.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Interviewer is unavailable")).toBeInTheDocument();
    expect(box).toHaveValue("Founded in 1968.");
  });

  it("finishing shows how many facts were extracted with a review link", async () => {
    server.interview = interview({
      turns: [
        turn(1, "interviewer", "What is your mission?"),
        turn(2, "respondent", "Helping Navajo families."),
      ],
    });
    const user = userEvent.setup();
    renderSession();

    await user.click(await screen.findByRole("button", { name: /Finish interview/ }));
    expect(await screen.findByText(/We extracted 4 facts/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review proposed facts" })).toHaveAttribute(
      "href",
      "/orgs/org_1/knowledge/facts?status=proposed",
    );
    await waitFor(() => expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument());
  });

  it("shows completed interviews as a read-only transcript", async () => {
    server.interview = interview({
      status: "completed",
      factCount: 7,
      coveredTopics: ["mission", "programs", "population_served"],
      turns: [
        turn(1, "interviewer", "What is your mission?"),
        turn(2, "respondent", "Helping Navajo families.", { inputMode: "voice" }),
      ],
    });
    renderSession();

    expect(await screen.findByText("Helping Navajo families.")).toBeInTheDocument();
    expect(screen.getByText(/We extracted 7 facts/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Finish interview/ })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Topics covered" })).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
  });
});

describe("interview helpers", () => {
  it("labels topics and reads fact counts from any completion shape", () => {
    expect(topicLabel("population_served")).toBe("Population served");
    expect(extractedFactCount({ factCount: 3 }, 0)).toBe(3);
    expect(extractedFactCount({ facts: [{}, {}] }, 0)).toBe(2);
    expect(extractedFactCount({ interview: { factCount: 5 } }, 0)).toBe(5);
    expect(extractedFactCount(undefined, 9)).toBe(9);
  });
});
