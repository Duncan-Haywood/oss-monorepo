// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QuickUpdate,
  type QuickUpdateDto,
  ShareUpdateCard,
  type UpdateFactDto,
} from "./quick-update";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to)}
      className={className}
    >
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));

// Dictation: a stand-in button that "transcribes" a fixed sentence (the real one records audio).
vi.mock("@client/components/voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@client/components/voice")>();
  return {
    ...actual,
    DictationButton: ({ onTranscript }: { onTranscript: (t: string, m: object) => void }) => (
      <button type="button" onClick={() => onTranscript("In 2026 we served 412 students.", {})}>
        Dictate
      </button>
    ),
  };
});

const fact = (over: Partial<UpdateFactDto>): UpdateFactDto =>
  ({
    id: "fct_1",
    orgId: "org_1",
    category: "population_served",
    statement: "Test Org served 412 students in 2026.",
    value: null,
    status: "proposed",
    sensitivity: "internal",
    confidence: 0.8,
    sourceType: "document",
    sourceDocumentId: "doc_1",
    sourceChunkId: "chk_1",
    sourceInterviewId: null,
    sourceTurnId: null,
    sourceQuote: "In 2026 we served 412 students.",
    asOf: "2026",
    projectId: null,
    supersededById: null,
    supersedesFactId: null,
    lastConfirmedAt: null,
    createdAt: "2026-11-19T00:00:00.000Z",
    updatedAt: "2026-11-19T00:00:00.000Z",
    supersedes: null,
    supersedeProposal: null,
    ...over,
  }) as UpdateFactDto;

const result = (over: Partial<QuickUpdateDto> = {}): QuickUpdateDto => ({
  documentId: "doc_1",
  title: "Update — 2026-11-19",
  status: "ready",
  error: null,
  pending: false,
  duplicate: false,
  facts: [
    fact({
      supersedesFactId: "fct_old",
      supersedes: {
        id: "fct_old",
        statement: "Test Org served 320 students in 2025.",
        asOf: "2025",
        status: "confirmed",
      },
    }),
    fact({
      id: "fct_2",
      category: "staff",
      statement: "Test Org hired a new program director.",
      sourceQuote: "We hired a new program director.",
      asOf: null,
    }),
  ],
  ...over,
});

type Route = (url: string, init?: RequestInit) => unknown;
let routes: Route;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const body = routes(String(input), init);
  return body === undefined
    ? new Response(JSON.stringify({ error: { code: "not_found", message: "Not found" } }), {
        status: 404,
      })
    : new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
});

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body ?? "{}")) as unknown;

beforeEach(() => {
  fetchMock.mockClear();
  navigate.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuickUpdate", () => {
  it("sends dictated + typed text and confirms / rejects the proposed facts inline", async () => {
    routes = (url, init) => {
      if (url === "/api/orgs/org_1/updates" && init?.method === "POST") return result();
      if (url === "/api/orgs/org_1/facts/fct_1/confirm")
        return fact({ status: "confirmed", confirmedAt: "2026-11-19T00:00:00.000Z" });
      if (url === "/api/orgs/org_1/facts/fct_2/reject")
        return fact({ id: "fct_2", status: "rejected" });
      return undefined;
    };
    const user = userEvent.setup();
    renderWithQuery(<QuickUpdate orgId="org_1" />);

    expect(screen.getByRole("link", { name: /Upload a new document/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/knowledge/documents",
    );
    const share = screen.getByRole("button", { name: "Share update" });
    expect(share).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Dictate" }));
    const textarea = screen.getByLabelText("What's new?");
    expect(textarea).toHaveValue("In 2026 we served 412 students.");
    await user.type(textarea, " We hired a new program director.");
    await user.click(share);

    const list = await screen.findByRole("list", { name: "Facts from your update" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("/api/orgs/org_1/updates");
    expect(bodyOf(init)).toEqual({
      text: "In 2026 we served 412 students. We hired a new program director.",
      inputMode: "voice",
    });
    expect(within(list).getByText("“In 2026 we served 412 students.”")).toBeInTheDocument();
    expect(
      within(list).getByText(/Updates “Test Org served 320 students in 2025.” \(as of 2025\)/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Confirm: Test Org served 412 students in 2026." }),
    );
    expect(await within(list).findByText("Confirmed")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Reject: Test Org hired a new program director." }),
    );
    expect(await within(list).findByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(/All done/)).toBeInTheDocument();
    const paths = fetchMock.mock.calls.map(([u, i]) => `${i?.method ?? "GET"} ${String(u)}`);
    expect(paths).toContain("POST /api/orgs/org_1/facts/fct_1/confirm");
    expect(paths).toContain("POST /api/orgs/org_1/facts/fct_2/reject");

    await user.click(screen.getByRole("button", { name: "Share another update" }));
    expect(screen.getByLabelText("What's new?")).toHaveValue("");
  });

  it("polls while the update is still being processed", async () => {
    let polls = 0;
    routes = (url, init) => {
      if (url === "/api/orgs/org_1/updates" && init?.method === "POST")
        return result({ pending: true, status: "processing", facts: [] });
      if (url === "/api/orgs/org_1/updates/doc_1") {
        polls++;
        return polls < 2 ? result({ pending: true, status: "ready", facts: [] }) : result();
      }
      return undefined;
    };
    const user = userEvent.setup();
    renderWithQuery(<QuickUpdate orgId="org_1" />);
    await user.type(screen.getByLabelText("What's new?"), "We hired a new program director.");
    await user.click(screen.getByRole("button", { name: "Share update" }));
    expect(await screen.findByText(/Reading your update/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/We found 2 facts/)).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(polls).toBe(2);
  });

  it("shows the API error and keeps the text", async () => {
    routes = () => undefined;
    const user = userEvent.setup();
    renderWithQuery(<QuickUpdate orgId="org_1" />);
    await user.type(screen.getByLabelText("What's new?"), "We moved offices.");
    await user.click(screen.getByRole("button", { name: "Share update" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("What's new?")).toHaveValue("We moved offices.");
  });
});

describe("ShareUpdateCard", () => {
  it("nudges a check-in when the last update is over 30 days old and starts one", async () => {
    routes = (url, init) => {
      if (url === "/api/orgs/org_1/updates/status")
        return {
          lastUpdateAt: "2026-09-01T00:00:00.000Z",
          daysSinceLastUpdate: 79,
          checkInDue: true,
          staleFactCount: 3,
          staleTopics: [],
        };
      if (url === "/api/orgs/org_1/interviews" && init?.method === "POST")
        return { id: "int_9", kind: "update", turns: [] };
      return undefined;
    };
    const user = userEvent.setup();
    renderWithQuery(<ShareUpdateCard orgId="org_1" />);
    expect(await screen.findByText(/Your last update was 79 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/3 facts look outdated/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Start check-in/ }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId: "org_1", interviewId: "int_9" },
      }),
    );
    const post = fetchMock.mock.calls.find(([u]) => String(u) === "/api/orgs/org_1/interviews");
    expect(bodyOf(post?.[1])).toEqual({ kind: "update" });
  });

  it("shows no nudge after a recent update", async () => {
    routes = (url) =>
      url === "/api/orgs/org_1/updates/status"
        ? {
            lastUpdateAt: "2026-11-10T00:00:00.000Z",
            daysSinceLastUpdate: 9,
            checkInDue: false,
            staleFactCount: 0,
            staleTopics: [],
          }
        : undefined;
    renderWithQuery(<ShareUpdateCard orgId="org_1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("What's new?", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start check-in/ })).not.toBeInTheDocument();
  });
});
