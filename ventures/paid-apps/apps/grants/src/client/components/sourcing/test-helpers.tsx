// Test helpers for the sourcing UI tests (not a test file itself): a routed `fetch` mock that
// records calls, and a render wrapper with a fresh QueryClient + Toaster.
import { Toaster } from "@client/components/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type * as React from "react";
import { vi } from "vitest";
import type { ProspectItem, WatchSourceDto } from "./types";

export const ORG_ID = "org_1";

export interface FetchCall {
  method: string;
  /** Path relative to /api/orgs/org_1, without the query string ("/" for the org itself). */
  path: string;
  body: unknown;
}
export interface MockResponse {
  status?: number;
  body?: unknown;
}
export type MockRoutes = Record<string, (call: FetchCall) => MockResponse>;

/** Stub global fetch. Keys are "METHOD /path", e.g. "GET /watchlist". Unknown routes → 404. */
export function mockFetch(routes: MockRoutes) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path =
      url
        .replace(/^https?:\/\/[^/]+/, "")
        .replace(`/api/orgs/${ORG_ID}`, "")
        .split("?")[0] || "/";
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const call = { method, path, body };
    calls.push(call);
    const handler = routes[`${method} ${path}`];
    const res: MockResponse = handler
      ? handler(call)
      : {
          status: 404,
          body: { error: { code: "not_found", message: `No mock for ${method} ${path}` } },
        };
    const status = res.status ?? 200;
    return new Response(
      status === 204 || res.body === undefined ? null : JSON.stringify(res.body),
      {
        status,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    fetchMock,
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key),
  };
}

export function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}

export function makeSource(over: Partial<WatchSourceDto> = {}): WatchSourceDto {
  return {
    id: "src_1",
    orgId: ORG_ID,
    url: "https://www.mckune.org/grants",
    label: "McKune grants page",
    funderName: "McKune Foundation",
    kind: "rfp_page",
    status: "active",
    checkIntervalHours: 24,
    lastCheckedAt: "2026-11-19T08:00:00.000Z",
    lastChangedAt: "2026-11-12T08:00:00.000Z",
    lastError: null,
    ...over,
  };
}

export function makeProspect(over: Partial<ProspectItem> = {}): ProspectItem {
  return {
    id: "pr_1",
    ein: "85-0123456",
    fitScore: 72,
    reasons: [
      {
        text: "Funds workforce training in McKinley County",
        polarity: "positive",
        factIds: ["fct_1"],
      },
      { text: "Mostly funds organizations in Albuquerque", polarity: "negative", factIds: [] },
    ],
    status: "new",
    notes: null,
    nextStepAt: null,
    funder: {
      name: "High Desert Community Trust",
      city: "Santa Fe",
      state: "NM",
      nteeCode: "T20",
      totalAssetsCents: 4_250_000_000,
      totalGivingCents: 180_000_000,
      latestFilingYear: 2024,
      website: "https://highdeserttrust.org",
      propublicaUrl: "https://projects.propublica.org/nonprofits/organizations/850123456",
    },
    ...over,
  };
}
