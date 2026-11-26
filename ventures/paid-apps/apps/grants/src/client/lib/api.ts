// Typed fetch wrapper for the Worker API. Cookies carry the session; JSON in/out.
import { apiUrl } from "./base-path";

export { apiUrl };

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
  const res = await fetch(apiUrl(path), {
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
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return data as T;
}

/**
 * Build an org-scoped API URL: orgApi("org_1", "/documents") -> "/api/orgs/org_1/documents" (with the
 * base path in front in production, so it also works as a download href).
 */
export const orgApi = (orgId: string, path = "") =>
  apiUrl(`/api/orgs/${encodeURIComponent(orgId)}${path}`);

export const formatCents = (cents: number | null | undefined) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(cents / 100);

export const formatDate = (d: string | number | Date | null | undefined) =>
  d == null ? "—" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(d));
