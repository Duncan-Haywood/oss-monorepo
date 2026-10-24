"use client";

import { useCallback, useEffect, useState } from "react";
import { SurveyBuilder } from "@/components/SurveyBuilder";

type Velocity = { from: number; medianMs: number; n: number };
type Timing = { label: string; medianMs: number; n: number };

type Overview = {
  totals: {
    users: number;
    linkedCouples: number;
    participants: number;
    answeredItemTrials: number;
    answeredFinancialTrials: number;
    tiedAnswers: number;
  };
  engagement: {
    medianMsToAnswer: number | null;
    slowAnswerShare: number | null;
    sessionsStarted: number;
    sessionsAbandoned: number;
    abandonRate: number | null;
    returnsAfterBreak: number;
    velocity: Velocity[];
  };
  hardest: Timing[];
  easiest: Timing[];
  feedback: {
    usefulUp: number;
    usefulDown: number;
    medianEnjoyment: number | null;
    bySubject: { subject: string; up: number; down: number }[];
    notes: { subject: string; note: string | null; at: string }[];
  };
  openReports: number;
  reports: {
    id: string;
    kind: string;
    message: string;
    email: string | null;
    path: string | null;
    resolved: boolean;
    createdAt: string;
  }[];
  people: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    perspective: string;
    answered: number;
    survey: { slug: string; title: string };
    lastSeenAt: string;
  }[];
};

export function AdminView() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      if (res.status === 401) {
        // Drop what is on screen with it. Numbers left up after the session
        // has expired read as current, and the next action on them is
        // refused.
        setData(null);
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        setError("Couldn't load the overview.");
        setAuthed(true);
        return;
      }
      setData(await res.json());
      setError(null);
      setAuthed(true);
    } catch {
      // A rejected fetch — offline, or a connection dropped mid-request —
      // used to fall out of this function entirely, leaving `authed` null and
      // the screen on "Checking…" for as long as it was open.
      setError("Couldn't reach the server.");
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    // `load` only sets state after awaiting the fetch, so nothing is set
    // synchronously here; the rule can't see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error ?? "Couldn't sign in.");
        setBusy(false);
        return;
      }
      setKey("");
      await load();
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy(false);
  }

  if (authed === null) {
    return <Shell><p className="text-neutral-500 dark:text-neutral-400">Checking…</p></Shell>;
  }

  if (!authed) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-6 py-10">
        <h1 className="text-center text-2xl font-bold">Admin</h1>
        <form onSubmit={signIn} className="flex flex-col gap-3">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin key"
            autoComplete="off"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-3 font-mono text-sm outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="submit"
            disabled={busy || !key}
            className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-neutral-950 disabled:opacity-50"
          >
            {busy ? "…" : "Sign in"}
          </button>
          {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        </form>
      </main>
    );
  }

  if (!data) {
    // An error with no way to act on it is a dead end: this screen has no
    // navigation, so a refresh was the only escape. `error` was being set
    // here and rendered nowhere.
    if (error) {
      return (
        <Shell>
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
          <button
            onClick={() => {
              setError(null);
              load();
            }}
            className="rounded-xl border-2 border-neutral-300 px-4 py-2 text-sm font-semibold dark:border-neutral-700"
          >
            Try again
          </button>
        </Shell>
      );
    }
    return <Shell><p className="text-neutral-500 dark:text-neutral-400">Loading…</p></Shell>;
  }

  const { totals, engagement, feedback } = data;
  const anyData = totals.answeredItemTrials > 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <button
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST" });
            setAuthed(false);
          }}
          className="text-xs text-neutral-500 dark:text-neutral-400 underline underline-offset-2"
        >
          Sign out
        </button>
      </div>

      {!anyData && (
        <p className="rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
          No answers recorded yet. Everything below stays empty until someone actually uses it.
        </p>
      )}

      <Section title="Make a survey">
        <SurveyBuilder />
      </Section>

      <Section title="Totals">
        <Grid>
          <Stat label="Accounts" value={totals.users} />
          <Stat label="Linked couples" value={totals.linkedCouples} />
          <Stat label="Sessions" value={totals.participants} />
          <Stat label="Item answers" value={totals.answeredItemTrials} />
          <Stat label="Financial answers" value={totals.answeredFinancialTrials} />
          <Stat label="“Too close to call”" value={totals.tiedAnswers} />
        </Grid>
      </Section>

      <Section title="Engagement">
        <Grid>
          <Stat
            label="Median time per answer"
            value={engagement.medianMsToAnswer === null ? "—" : `${(engagement.medianMsToAnswer / 1000).toFixed(1)}s`}
          />
          <Stat
            label="Answers taking >6s"
            value={engagement.slowAnswerShare === null ? "—" : `${Math.round(engagement.slowAnswerShare * 100)}%`}
          />
          <Stat
            label="Sessions abandoned"
            value={
              engagement.abandonRate === null
                ? "—"
                : `${Math.round(engagement.abandonRate * 100)}% (${engagement.sessionsAbandoned}/${engagement.sessionsStarted})`
            }
          />
          <Stat label="Returns after a break" value={engagement.returnsAfterBreak} />
        </Grid>
        <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
          Abandonment counts sessions whose last shown card was never answered — not every
          unanswered row, since those are mostly page reloads.
        </p>

        {engagement.velocity.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Speed as a session goes on
            </h3>
            <ul className="mt-2 flex flex-col gap-1">
              {engagement.velocity.map((v) => {
                const max = Math.max(...engagement.velocity.map((x) => x.medianMs), 1);
                return (
                  <li key={v.from} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-neutral-500 dark:text-neutral-400">#{v.from + 1}–{v.from + 10}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                      <span
                        className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${(v.medianMs / max) * 100}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                      {(v.medianMs / 1000).toFixed(1)}s · n={v.n}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Bars getting longer = slowing down (fatigue). Shorter = speeding up.
            </p>
          </div>
        )}
      </Section>

      {(data.hardest.length > 0 || data.easiest.length > 0) && (
        <Section title="What slows people down">
          <div className="grid gap-4 sm:grid-cols-2">
            <TimingList title="Hardest calls" rows={data.hardest} />
            <TimingList title="Instant calls" rows={data.easiest} />
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            Median time on pairs containing each item, minimum 3 appearances. Slow = genuinely
            torn; fast = obvious either way.
          </p>
        </Section>
      )}

      <Section title="Is it landing?">
        <Grid>
          <Stat label="Insights marked useful" value={feedback.usefulUp} />
          <Stat label="Marked not useful" value={feedback.usefulDown} />
          <Stat
            label="Median enjoyment"
            value={feedback.medianEnjoyment === null ? "—" : `${feedback.medianEnjoyment}/5`}
          />
        </Grid>
        {feedback.bySubject.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-xs">
            {feedback.bySubject.map((s) => (
              <li key={s.subject} className="flex items-center justify-between gap-2">
                <span className="font-mono text-neutral-600 dark:text-neutral-400">{s.subject}</span>
                <span className="tabular-nums">
                  <span className="text-emerald-700 dark:text-emerald-400">{s.up}👍</span>{" "}
                  <span className="text-rose-600 dark:text-rose-400">{s.down}👎</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {feedback.notes.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">What people said</h3>
            <ul className="mt-1 flex flex-col gap-1.5 text-xs">
              {feedback.notes.map((n, i) => (
                <li key={i} className="rounded-lg bg-neutral-100 px-2 py-1.5 dark:bg-neutral-900">
                  <span className="font-mono text-neutral-500 dark:text-neutral-400">{n.subject}</span> — {n.note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {data.people.length > 0 && (
        <Section title="People">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-neutral-500 dark:text-neutral-400">
                <tr>
                  <Th>Name</Th>
                  <Th>Mode</Th>
                  <Th>Topic</Th>
                  <Th>Answers</Th>
                  <Th>Last seen</Th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <Td>
                      {p.firstName} {p.lastName ?? ""}
                      {p.email && <span className="block text-neutral-500 dark:text-neutral-400">{p.email}</span>}
                    </Td>
                    <Td>{p.perspective}</Td>
                    <Td>{p.survey.title}</Td>
                    <Td className="tabular-nums">{p.answered}</Td>
                    <Td className="text-neutral-500 dark:text-neutral-400">{new Date(p.lastSeenAt).toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {data.reports && data.reports.length > 0 && (
        <Section title={`Reports${data.openReports ? ` — ${data.openReports} open` : ""}`}>
          <ul className="flex flex-col gap-2">
            {data.reports.map((r) => (
              <li
                key={r.id}
                className={`rounded-xl border p-3 text-xs ${
                  r.resolved
                    ? "border-neutral-200 opacity-50 dark:border-neutral-800"
                    : "border-amber-300 bg-amber-50/50 dark:border-amber-400/30 dark:bg-amber-950/20"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {r.kind === "bug" ? "🐞 Bug" : r.kind === "idea" ? "💡 Idea" : "💬 Other"}
                    {r.path && <span className="ml-2 font-mono text-neutral-500 dark:text-neutral-400">{r.path}</span>}
                  </span>
                  <button
                    onClick={async () => {
                      await fetch("/api/admin/report", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: r.id, resolved: !r.resolved }),
                      });
                      await load();
                    }}
                    className="shrink-0 text-[11px] underline underline-offset-2"
                  >
                    {r.resolved ? "Reopen" : "Mark done"}
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{r.message}</p>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {new Date(r.createdAt).toLocaleString()}
                  {r.email && ` · ${r.email}`}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Download">
        <div className="flex flex-wrap gap-2">
          {[
            ["trials", "Every answer"],
            ["ratings", "Final ratings + CIs"],
            ["financial", "Financial trade-offs"],
            ["feedback", "Feedback"],
            ["reports", "Bug reports"],
          ].map(([what, label]) => (
            <a
              key={what}
              href={`/api/admin/export?what=${what}`}
              className="rounded-xl border-2 border-neutral-300 px-3 py-2 text-xs font-semibold dark:border-neutral-700"
            >
              ↓ {label}
            </a>
          ))}
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</div>
    </div>
  );
}

function TimingList({ title, rows }: { title: string; rows: Timing[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{title}</h3>
      <ul className="mt-1 flex flex-col gap-0.5 text-xs">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline justify-between gap-2">
            <span className="truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">
              {(r.medianMs / 1000).toFixed(1)}s
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-1 pr-3 font-semibold">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-1.5 pr-3 align-top ${className ?? ""}`}>{children}</td>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
      {children}
    </main>
  );
}
