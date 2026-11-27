// Typed fetch wrapper for the Worker API. Cookies carry the session; JSON in/out.
import { QueryClient } from "@tanstack/react-query";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Json = Record<string, unknown> | unknown[];

export async function api<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: Json | FormData } = {},
): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body:
      init.body === undefined
        ? undefined
        : isForm
          ? (init.body as FormData)
          : JSON.stringify(init.body),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    // Our routes answer { error: { code, message } }; Better Auth (/api/auth/*) answers { code, message }.
    const body = data as
      | {
          error?: { code?: string; message?: string; details?: unknown };
          code?: string;
          message?: string;
        }
      | undefined;
    const err =
      body?.error ?? (body?.code ? { code: body.code, message: body.message } : undefined);
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

export const orgApi = (orgId: string, path = "") => `/api/orgs/${encodeURIComponent(orgId)}${path}`;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

export const money = (cents: number | null | undefined) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** "12.50" -> 1250; empty -> null. */
export const toCents = (s: string): number | null => {
  const t = s.replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
export const fromCents = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

/** "10, 50 100" -> [10, 50, 100] (positive integers, deduped, sorted). */
export const parseQuantities = (s: string) =>
  [
    ...new Set(
      s
        .split(/[\s,;]+/)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].sort((a, b) => a - b);

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong";
