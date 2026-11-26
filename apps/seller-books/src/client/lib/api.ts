// Typed fetch wrapper for the Worker API. Cookies carry the session; JSON in/out.
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

export async function api<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
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

export const orgPath = (orgId: string, path = "") =>
  `/api/orgs/${encodeURIComponent(orgId)}${path}`;

export const usd = (cents: number | null | undefined) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** "12.34" -> 1234; throws on anything that is not a dollar amount. */
export function dollarsToCents(s: string): number {
  const t = s.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`"${s}" is not a dollar amount`);
  return Math.round(Number(t) * 100);
}

export const today = () => new Date().toISOString().slice(0, 10);
