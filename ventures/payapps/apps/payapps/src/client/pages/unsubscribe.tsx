// /unsubscribe?o=&u=&t= — the weekly "money to chase" email's signed link, and
// /unsubscribe?list=onboarding&o=&u=&t= — the getting-started reminders' stop link. No sign-in needed.
// Loading the page changes nothing (mail scanners open links); the button sends the POST that turns
// the email off (routes/unsubscribe.ts on the worker). An unknown list falls back to the weekly email,
// whose links predate the list parameter.
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

type List = "digest" | "onboarding";

const COPY: Record<
  List,
  {
    heading: string;
    button: string;
    ask: (company: string) => string;
    done: (company: string) => string;
    invalid: string;
  }
> = {
  digest: {
    heading: 'Weekly "money to chase" email',
    button: "Stop the weekly email",
    ask: (c) =>
      `Stop the weekly email for ${c}? Nothing else changes: your account, jobs and other emails stay as they are.`,
    done: (c) =>
      `You won't get the weekly email for ${c} any more. To turn it back on, sign in and tick the box on the Cash and retainage page.`,
    invalid:
      "This link is not valid. Copy the whole link from the email, or turn the email off on the Cash and retainage page after signing in.",
  },
  onboarding: {
    heading: "Getting-started reminders",
    button: "Stop the reminders",
    ask: (c) =>
      `Stop the getting-started reminders for ${c}? Nothing else changes: your account, jobs and the checklist on the Projects page stay as they are.`,
    done: (c) =>
      `You won't get any more getting-started reminders for ${c}. Account emails (password resets, invitations) still come.`,
    invalid: "This link is not valid. Copy the whole link from the email.",
  },
};

const readLink = (): { list: List; path: string | null } => {
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const list: List = q.get("list") === "onboarding" ? "onboarding" : "digest";
  const o = q.get("o");
  const u = q.get("u");
  const t = q.get("t");
  if (!o || !u || !t) return { list, path: null };
  return { list, path: `/api/unsubscribe/${list}?${new URLSearchParams({ o, u, t }).toString()}` };
};

const failed = (e: unknown, list: List) =>
  e instanceof ApiError && e.status === 404
    ? COPY[list].invalid
    : "We couldn't reach the server. Check your connection and try again.";

export function UnsubscribePage() {
  const [{ list, path }] = useState(readLink);
  const copy = COPY[list];
  const [state, setState] = useState<State>(() =>
    path
      ? { kind: "loading" }
      : { kind: "error", message: "This link is missing part of its address." },
  );
  useEffect(() => {
    if (!path) return;
    api<Status>(path)
      .then((status) => setState({ kind: status.subscribed ? "ready" : "done", status }))
      .catch((e) => setState({ kind: "error", message: failed(e, list) }));
  }, [path, list]);

  const stop = async (status: Status) => {
    if (!path) return;
    setState({ kind: "pending", status });
    try {
      setState({ kind: "done", status: await api<Status>(path, { method: "POST" }) });
    } catch (e) {
      setState({ kind: "error", message: failed(e, list) });
    }
  };

  const company = (s: Status) => s.orgName ?? "this company";
  return (
    <div className="card mx-auto max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">{copy.heading}</h1>
      {state.kind === "loading" && <p className="text-sm text-slate-600">Checking the link…</p>}
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      {(state.kind === "ready" || state.kind === "pending") && (
        <>
          <p className="text-sm text-slate-700">{copy.ask(company(state.status))}</p>
          <button
            type="button"
            className="btn w-full justify-center"
            disabled={state.kind === "pending"}
            onClick={() => stop(state.status)}
          >
            {copy.button}
          </button>
        </>
      )}
      {state.kind === "done" && (
        <p role="status" className="text-sm text-emerald-800">
          {copy.done(company(state.status))}
        </p>
      )}
      <Link to="/" className="text-sm text-slate-600 underline">
        Go to PayApps
      </Link>
    </div>
  );
}
