// /unsubscribe?list=estimate-reminder&o=&u=&t= — the 1040-ES reminder email's signed stop link. No sign-in
// needed. Loading the page changes nothing (mail scanners open links); the button sends the POST that
// turns the email off (routes/unsubscribe.ts on the worker). Ported from apps/payapps.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";

interface Status {
  orgName: string | null;
  subscribed: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; status: Status }
  | { kind: "pending"; status: Status }
  | { kind: "done"; status: Status }
  | { kind: "error"; message: string };

const readPath = (): string | null => {
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const o = q.get("o");
  const u = q.get("u");
  const t = q.get("t");
  if (!o || !u || !t) return null;
  return `/api/unsubscribe/estimate-reminder?${new URLSearchParams({ o, u, t }).toString()}`;
};

const failed = (e: unknown) =>
  e instanceof ApiError && e.status === 404
    ? "This link is not valid. Copy the whole link from the email, or turn the reminders off on the Estimated tax page after signing in."
    : "We couldn't reach the server. Check your connection and try again.";

export function UnsubscribePage() {
  const [path] = useState(readPath);
  const [state, setState] = useState<State>(() =>
    path
      ? { kind: "loading" }
      : { kind: "error", message: "This link is missing part of its address." },
  );
  useEffect(() => {
    if (!path) return;
    api<Status>(path)
      .then((status) => setState({ kind: status.subscribed ? "ready" : "done", status }))
      .catch((e) => setState({ kind: "error", message: failed(e) }));
  }, [path]);

  const stop = async (status: Status) => {
    if (!path) return;
    setState({ kind: "pending", status });
    try {
      setState({ kind: "done", status: await api<Status>(path, { method: "POST" }) });
    } catch (e) {
      setState({ kind: "error", message: failed(e) });
    }
  };

  const shop = (s: Status) => s.orgName ?? "this shop";
  return (
    <div className="card mx-auto mt-12 max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">Estimated-tax reminders</h1>
      {state.kind === "loading" && <p className="text-sm text-stone-600">Checking the link…</p>}
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      {(state.kind === "ready" || state.kind === "pending") && (
        <>
          <p className="text-sm text-stone-700">
            Stop the estimated-tax reminders for {shop(state.status)}? Nothing else changes: your
            account, books and saved figures stay as they are.
          </p>
          <button
            type="button"
            className="btn w-full justify-center"
            disabled={state.kind === "pending"}
            onClick={() => stop(state.status)}
          >
            Stop the reminders
          </button>
        </>
      )}
      {state.kind === "done" && (
        <p role="status" className="text-sm text-emerald-800">
          You won't get estimated-tax reminders for {shop(state.status)} any more. To turn them back
          on, sign in and tick the box on the Estimated tax page.
        </p>
      )}
      <Link to="/" className="text-sm text-stone-600 underline">
        Go to Seller Books
      </Link>
    </div>
  );
}
