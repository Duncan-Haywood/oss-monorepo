// /unsubscribe?o=&u=&t= — the affirmation reminder email's signed stop link. No sign-in needed.
// Loading the page changes nothing (mail scanners open links); the button sends the POST that turns
// the email off (src/worker/routes/unsubscribe.ts).
import type { ReminderUnsubscribeStatus } from "@shared/affirmation-reminders";
import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { btnCls, Card } from "../ui";
import { Alert, Centered } from "./Account";

export const isUnsubscribePath = (pathname: string) => /^\/unsubscribe\/?$/.test(pathname);

type State =
  | { kind: "loading" }
  | { kind: "ready" | "pending" | "done"; status: ReminderUnsubscribeStatus }
  | { kind: "error"; message: string };

const INVALID =
  "This link is not valid. Copy the whole link from the email, or sign in and turn the reminders off on the Affirmations page.";

function linkPath(): string | null {
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const o = q.get("o");
  const u = q.get("u");
  const t = q.get("t");
  if (!o || !u || !t) return null;
  return `/api/unsubscribe/affirmation-reminders?${new URLSearchParams({ o, u, t })}`;
}

export function UnsubscribePage() {
  const [path] = useState(linkPath);
  const [state, setState] = useState<State>(
    path ? { kind: "loading" } : { kind: "error", message: INVALID },
  );
  useEffect(() => {
    if (!path) return;
    api<ReminderUnsubscribeStatus>(path).then(
      (status) => setState({ kind: status.on ? "ready" : "done", status }),
      (e) =>
        setState({
          kind: "error",
          message: e instanceof ApiError && e.status === 404 ? INVALID : String(e.message ?? e),
        }),
    );
  }, [path]);
  const org = (s: ReminderUnsubscribeStatus) => s.orgName ?? "this organization";
  const stop = async () => {
    if (!path || state.kind !== "ready") return;
    setState({ kind: "pending", status: state.status });
    try {
      const status = await api<ReminderUnsubscribeStatus>(path, { method: "POST" });
      setState({ kind: "done", status });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <Centered>
      <Card title="Affirmation reminder email">
        <div className="space-y-3 text-sm text-stone-700">
          {state.kind === "loading" && <p>Loading…</p>}
          {state.kind === "error" && <Alert tone="error">{state.message}</Alert>}
          {(state.kind === "ready" || state.kind === "pending") && (
            <>
              <p>
                Stop the reminder emails for {org(state.status)}? Nothing else changes: your
                records, the dates on the Affirmations page and the calendar file stay as they are.
              </p>
              <button
                type="button"
                className={btnCls}
                disabled={state.kind === "pending"}
                onClick={stop}
              >
                Stop the reminders
              </button>
            </>
          )}
          {state.kind === "done" && (
            <Alert tone="ok">
              You won't get affirmation reminders for {org(state.status)} any more. To turn them
              back on, sign in and tick the box on the Affirmations page.
            </Alert>
          )}
          <a href="/" className="text-sm text-brand-600 underline">
            Go to CMMC Workspace
          </a>
        </div>
      </Card>
    </Centered>
  );
}
