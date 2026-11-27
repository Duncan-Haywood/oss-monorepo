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

/**
 * POSTs JSON and saves the file the route answers with (a PDF printed from typed values, where a
 * GET link cannot carry the body). Errors are thrown as ApiError, like api().
 */
export async function downloadPost(path: string, body: unknown, fallbackName: string) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => undefined)) as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | undefined;
    throw new ApiError(
      res.status,
      data?.error?.code ?? "http_error",
      data?.error?.message ?? res.statusText,
      data?.error?.details,
    );
  }
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const orgPath = (orgId: string, path = "") =>
  `/api/orgs/${encodeURIComponent(orgId)}${path}`;
export const projectPath = (orgId: string, projectId: string, path = "") =>
  orgPath(orgId, `/projects/${encodeURIComponent(projectId)}${path}`);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const details = Array.isArray(e.details)
      ? e.details
          .map((d) => (d && typeof d === "object" && "message" in d ? String(d.message) : ""))
          .filter(Boolean)
      : [];
    return [e.message, ...details].join(" ");
  }
  return e instanceof Error ? e.message : String(e);
}
