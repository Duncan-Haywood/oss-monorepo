/**
 * Browser-side fetch for the operator API routes.
 *
 * Those routes are guarded by `requireOperator` (see `src/lib/api-auth.ts`),
 * and a page in a browser has no bearer token to send. So every operator panel
 * now gets a refusal, and the thing that matters is that a refusal does not
 * look like data: the panels used to write `await response.json()` straight
 * into their state, so a 401 body landed where a summary was expected and every
 * count rendered through `?? 0` as a confident zero. "Nought orders" and "not
 * allowed to see the orders" are different answers, and the second one is the
 * true one here.
 *
 * This returns a discriminated result so a panel has to handle the refusal to
 * compile.
 */

export type OperatorFetchResult<T> =
  | { state: "ok"; data: T }
  | { state: "unauthorized"; hint: string }
  | { state: "unconfigured"; hint: string }
  | { state: "error"; hint: string };

type DenialBody = { error?: unknown; hint?: unknown };

function hintFrom(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const { hint, error } = body as DenialBody;
    if (typeof hint === "string" && hint.length > 0) return hint;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return fallback;
}

export async function fetchOperatorJson<T>(
  input: string,
  init?: RequestInit,
): Promise<OperatorFetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    return { state: "error", hint: "Could not reach the server." };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) {
    return { state: "ok", data: body as T };
  }
  if (response.status === 401) {
    return {
      state: "unauthorized",
      hint: hintFrom(body, "This view is operator-only."),
    };
  }
  // 503 is the fail-closed answer when PRINT_ATELIER_OPS_TOKEN is unset, which
  // is a different fix from "you are not the operator" and worth saying so.
  if (response.status === 503) {
    return {
      state: "unconfigured",
      hint: hintFrom(body, "The operator API is not configured on this deployment."),
    };
  }
  return { state: "error", hint: hintFrom(body, `Request failed (${response.status}).`) };
}
