import { readFileSync } from "node:fs";
import type { FetchLike } from "../src/oauth.ts";

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface ScriptedResponse {
  status?: number;
  fixture?: string;
  json?: unknown;
  headers?: Record<string, string>;
}

/**
 * A fetch stand-in that answers with a fixed script of responses, in order, and records every
 * request. Fails the test if more requests are made than responses scripted.
 */
export function scriptedFetch(script: ScriptedResponse[]): {
  fetch: FetchLike;
  requests: RecordedRequest[];
  remaining: () => number;
} {
  const queue = [...script];
  const requests: RecordedRequest[] = [];
  const fetchFn: FetchLike = async (input, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    requests.push({
      method: init?.method ?? "GET",
      url: new URL(input),
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request: ${init?.method ?? "GET"} ${input}`);
    const payload = next.fixture ? fixture(next.fixture) : next.json;
    return new Response(payload === undefined ? null : JSON.stringify(payload), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json", intuit_tid: "fixture-tid", ...next.headers },
    });
  };
  return { fetch: fetchFn, requests, remaining: () => queue.length };
}

export function jsonBody(r: RecordedRequest | undefined): Record<string, unknown> {
  if (!r?.body) throw new Error("request had no body");
  return JSON.parse(r.body) as Record<string, unknown>;
}
