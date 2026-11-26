// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewsPage } from "./interviews";
import { isTranscriptFile, titleFromFileName } from "./transcript-upload-dialog";

const now = "2026-11-19T17:00:00.000Z";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const baseInterview = {
  orgId: "org_1",
  mode: "ai_chat",
  focusProjectId: null,
  focusApplicationId: null,
  agenda: [],
  coveredTopics: [],
  transcriptDocumentId: null,
  summary: null,
  createdBy: null,
  updatedAt: now,
  createdAt: now,
};

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  if (method === "GET" && url === "/api/orgs/org_1/interviews")
    return json({
      items: [
        {
          ...baseInterview,
          id: "int_old",
          kind: "onboarding",
          status: "completed",
          title: "Onboarding with Director",
          factCount: 12,
          completedAt: now,
        },
      ],
    });
  if (method === "GET" && url === "/api/orgs/org_1/facts/summary")
    return json({
      byStatus: {},
      byCategory: {},
      coverage: [
        { topic: "financial", factCount: 0, status: "missing" },
        { topic: "outcome", factCount: 1, status: "thin" },
        { topic: "mission", factCount: 6, status: "good" },
      ],
    });
  if (method === "GET" && url === "/api/orgs/org_1/projects")
    return json({ items: [{ id: "prj_1", title: "Trades Academy", status: "active" }] });
  if (method === "POST" && url === "/api/orgs/org_1/interviews")
    return json({
      ...baseInterview,
      ...JSON.parse(String(init?.body)),
      id: "int_new",
      status: "active",
      title: "Onboarding",
      factCount: 0,
      completedAt: null,
      turns: [],
    });
  if (method === "POST" && url === "/api/orgs/org_1/interviews/transcript")
    return json({
      ...baseInterview,
      id: "int_tr",
      kind: "transcript_upload",
      mode: "human_transcript",
      status: "completed",
      title: JSON.parse(String(init?.body)).title,
      factCount: 3,
      completedAt: now,
    });
  return json({ error: { code: "not_found", message: `Unhandled ${method} ${url}` } }, 404);
});

function renderPage() {
  const rootRoute = createRootRoute({ component: Outlet });
  const list = createRoute({
    getParentRoute: () => rootRoute,
    path: "/orgs/$orgId/interviews",
    component: InterviewsPage,
  });
  const session = createRoute({
    getParentRoute: () => rootRoute,
    path: "/orgs/$orgId/interviews/$interviewId",
    component: () => <p>Session page</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([list, session]),
    history: createMemoryHistory({ initialEntries: ["/orgs/org_1/interviews"] }),
  });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InterviewsPage", () => {
  it("shows fact-base gaps, past interviews and starts an onboarding interview", async () => {
    const user = userEvent.setup();
    const router = renderPage();

    const gaps = await screen.findByRole("list", { name: "Topics to fill" });
    expect(within(gaps).getByText("Financial")).toBeInTheDocument();
    expect(within(gaps).getByText("Outcome")).toBeInTheDocument();
    expect(within(gaps).queryByText("Mission")).not.toBeInTheDocument();

    const row = (await screen.findByRole("cell", { name: "Onboarding with Director" })).closest(
      "tr",
    );
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("12")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Completed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start onboarding interview" }));
    expect(await screen.findByText("Session page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/orgs/org_1/interviews/int_new");
    const post = fetchMock.mock.calls.find(
      ([u, i]) => String(u) === "/api/orgs/org_1/interviews" && i?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ kind: "onboarding", mode: "ai_chat" });
  });

  it("starts a project interview for the chosen project", async () => {
    const user = userEvent.setup();
    renderPage();
    const start = await screen.findByRole("button", { name: "Start project interview" });
    expect(start).toBeDisabled();
    await user.selectOptions(await screen.findByLabelText("Project"), "prj_1");
    await user.click(start);
    await screen.findByText("Session page");
    const post = fetchMock.mock.calls.find(
      ([u, i]) => String(u) === "/api/orgs/org_1/interviews" && i?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      kind: "project",
      focusProjectId: "prj_1",
      mode: "ai_chat",
    });
  });

  it("uploads a pasted transcript and reports extracted facts", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Upload a transcript/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title"), "Staff call");
    await user.type(
      within(dialog).getByLabelText("Transcript text"),
      "Interviewer: How many graduates? Maria: 38 in 2025.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Upload and extract facts" }));
    expect(await within(dialog).findByText(/We extracted 3 facts/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Review proposed facts" })).toHaveAttribute(
      "href",
      "/orgs/org_1/knowledge/facts?status=proposed",
    );
    const post = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/interviews/transcript"));
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      title: "Staff call",
      text: "Interviewer: How many graduates? Maria: 38 in 2025.",
    });
  });
});

describe("transcript helpers", () => {
  it("accepts transcript extensions and derives a title", () => {
    expect(isTranscriptFile("call.VTT")).toBe(true);
    expect(isTranscriptFile("notes.md")).toBe(true);
    expect(isTranscriptFile("slides.pdf")).toBe(false);
    expect(titleFromFileName("board_call_2026-03.srt")).toBe("board call 2026-03");
  });
});
