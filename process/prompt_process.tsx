/**
 * prompt_process.tsx — the Listing Lens agent operating process.
 *
 * This is the file every agent session (this one, or any other) should
 * read first. It says how to pick up work, how to log it, and renders a
 * live dashboard of the same data on the private docs site.
 *
 * Read order for a new session:
 *   1. This file's AGENT_PROCESS_INSTRUCTIONS.
 *   2. roadmap.ts — what's done, in progress, blocked, or next.
 *   3. decisions-log.ts — why things are the way they are.
 *   4. progress-log.ts — what the last few sessions actually did.
 *
 * Write order when a session finishes real work:
 *   1. Update the relevant task(s)/phase(s) in roadmap.ts.
 *   2. Append to decisions-log.ts if a real business/product decision was made.
 *   3. Append one entry to progress-log.ts summarizing the session.
 *   4. Keep this file's process itself improving: if the process was hard
 *      to follow, unclear, or missing a check, edit AGENT_PROCESS_INSTRUCTIONS
 *      and note the change as its own progress-log entry.
 */

import { roadmap, nextActionableTasks } from "./roadmap";
import { decisionsLog } from "./decisions-log";
import { progressLog } from "./progress-log";
import type { PhaseStatus } from "./types";

export const AGENT_PROCESS_INSTRUCTIONS = `
Listing Lens is at the "concept / market validation" stage (see STRATEGY.md).
The goal is a profitable, growing business — not a finished app. Every
agent session should move that forward by a bounded, honest increment.

Each session:
1. Read roadmap.ts, decisions-log.ts, progress-log.ts (or the rendered
   /process page on the docs site).
2. Call nextActionableTasks() mentally: pick ONE not-started task owned by
   "agent" or "both" that you can actually complete this session — prefer
   the earliest incomplete phase over later ones.
3. Do NOT attempt tasks owned by "human" (real interviews, taking payment,
   shooting real listings, dashboard clicks that need Duncan's account).
   Instead, prepare everything an agent can: scripts, checklists, copy,
   pricing pages, outreach templates, scoring rubrics, code.
4. If you truly cannot make product/business progress this session (e.g.
   everything actionable is human-blocked), it is fine to spend the
   session improving the process itself: tightening the roadmap, fixing
   stale statuses, improving docs, or paying down tech debt in research/
   or docs-site/ — but say so explicitly in the progress log entry rather
   than padding it with busywork.
5. Log what you did: update roadmap.ts task status, append a
   decisions-log.ts entry for any real decision, and always append one
   progress-log.ts entry.
6. Check other branches (git ls-remote origin) before starting, since
   other agents may be working the same repo concurrently — prefer
   additive changes over ones likely to conflict with in-flight PRs.
7. Build docs-site and research before committing (npm run build in each
   that you touched). Push to your assigned branch, open a PR, and merge
   it once it's green — this repo's convention is short-lived branches,
   not long-running ones.

Guardrails (do not violate without explicit human sign-off in this
session's actual conversation):
- No real payments, no real customer outreach sent on Duncan's behalf,
  no changes to production Cloudflare Access / DNS without confirmation.
- No iOS app build-out yet (see the phase-3 scope decision).
- No spend of real money (ad spend, contractor payment, paid tools).
`.trim();

export type ProcessSnapshot = {
  phaseCount: number;
  doneTaskCount: number;
  totalTaskCount: number;
  blockedOnHumanCount: number;
  nextForAgent: ReturnType<typeof nextActionableTasks>;
};

export function getProcessSnapshot(): ProcessSnapshot {
  const allTasks = roadmap.flatMap((p) => p.tasks);
  return {
    phaseCount: roadmap.length,
    doneTaskCount: allTasks.filter((t) => t.status === "done").length,
    totalTaskCount: allTasks.length,
    blockedOnHumanCount: allTasks.filter((t) => t.status === "blocked" && t.owner === "human").length,
    nextForAgent: nextActionableTasks(),
  };
}

const STATUS_STYLES: Record<PhaseStatus, string> = {
  not_started: "text-slate-400 border-slate-700 bg-slate-900/40",
  in_progress: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  blocked: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  done: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
};

const STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

function StatusPill({ status }: { status: PhaseStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Renders the full live process state: roadmap, decisions, and progress.
 * Consumed by docs-site's /process page. Pure presentational component —
 * no data fetching, so it works fine inside a statically-exported Next.js
 * build.
 */
export function ProcessDashboard() {
  const snapshot = getProcessSnapshot();

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Agent process</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          {snapshot.doneTaskCount}/{snapshot.totalTaskCount} tasks done across {snapshot.phaseCount}{" "}
          phases. {snapshot.blockedOnHumanCount} task(s) are blocked on a human action.
        </p>
        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-300">
          {AGENT_PROCESS_INSTRUCTIONS}
        </pre>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Roadmap</h2>
        <div className="mt-4 space-y-4">
          {roadmap.map((phase) => (
            <div key={phase.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{phase.title}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{phase.window}</span>
                  <StatusPill status={phase.status} />
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-400">{phase.summary}</p>
              {phase.tasks.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {phase.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3"
                    >
                      <div>
                        <p className="text-sm text-slate-200">
                          {task.title}{" "}
                          <span className="text-xs text-slate-500">({task.owner})</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{task.doneWhen}</p>
                        {task.blockedReason && (
                          <p className="mt-1 text-xs text-rose-300/80">Blocked: {task.blockedReason}</p>
                        )}
                      </div>
                      <StatusPill status={task.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Decisions log</h2>
        <div className="mt-4 space-y-3">
          {[...decisionsLog].reverse().map((d) => (
            <div key={`${d.date}-${d.title}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{d.title}</h3>
                <span className="text-xs text-slate-500">
                  {d.date} · {d.madeBy}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{d.decision}</p>
              <p className="mt-2 text-xs text-slate-500">{d.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Progress log</h2>
        <div className="mt-4 space-y-3">
          {[...progressLog].reverse().map((entry) => (
            <div key={`${entry.date}-${entry.agent}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{entry.summary}</h3>
                <span className="text-xs text-slate-500">
                  {entry.date} · {entry.agent}
                </span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
                {entry.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {entry.nextUp.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next up</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-400">
                    {entry.nextUp.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export { roadmap, decisionsLog, progressLog };
