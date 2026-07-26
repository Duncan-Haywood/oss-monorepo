import type { Metadata } from "next";
import { DocLink, DocPage } from "@/components/docs/doc-page";
import {
  AGENT_PROTOCOL,
  BUSINESS_DECISIONS,
  ITERATIONS,
  NEXT_STEPS,
} from "@/lib/process/prompt_process";
import { docPageMetadata } from "@/lib/seo";

export const metadata: Metadata = docPageMetadata("/docs/process");

const statusLabel: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

/**
 * ITERATIONS and BUSINESS_DECISIONS are append-only and grow with every
 * agent iteration (hundreds of entries as of 2026-07-17, each often a
 * multi-sentence summary + a bulleted shipped list). Rendering all of them
 * server-side made this page's HTML grow without bound on every PR — cap
 * the display to the most recent entries and point to the source file /
 * git history for the rest.
 */
const MAX_ITERATIONS_DISPLAYED = 25;
const MAX_BUSINESS_DECISIONS_DISPLAYED = 50;
/** Same growth problem for done NEXT_STEPS (336+ entries, mostly done) — todo/in_progress items stay unbounded since that set is always small and is the actionable part of the backlog. */
const MAX_DONE_NEXT_STEPS_DISPLAYED = 20;

export default function ProcessDocPage() {
  const recentIterations = ITERATIONS.slice(-MAX_ITERATIONS_DISPLAYED).reverse();
  const recentDecisions = BUSINESS_DECISIONS.slice(-MAX_BUSINESS_DECISIONS_DISPLAYED).reverse();
  const activeSteps = NEXT_STEPS.filter((step) => step.status !== "done");
  const doneSteps = NEXT_STEPS.filter((step) => step.status === "done");
  const recentDoneSteps = doneSteps.slice(-MAX_DONE_NEXT_STEPS_DISPLAYED).reverse();
  const displayedSteps = [...activeSteps, ...recentDoneSteps];

  return (
    <DocPage
      title="Process log"
      subtitle="How agents coordinate on this codebase — backlog, decisions, iteration history"
      related={[
        { href: "/docs/roadmap", label: "Roadmap" },
        { href: "/docs/business-model", label: "Business model" },
        { href: "/docs/architecture", label: "Architecture" },
      ]}
    >
      <p>
        Source of truth: <code>src/lib/process/prompt_process.tsx</code>. Multiple agents work
        this repo on separate branches — read that file before starting work, and append to it
        (claim a backlog item by setting <code>status</code> and <code>owner</code>) in the same
        commit that does the work, so concurrent agents don&apos;t duplicate effort.
      </p>

      <h2>Agent protocol</h2>
      <ol>
        {AGENT_PROTOCOL.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>

      <h2>Backlog</h2>
      <p className="text-sm text-zinc-500">
        All {activeSteps.length} to-do / in-progress items, plus the {recentDoneSteps.length} most
        recently completed of {doneSteps.length} done items. Full history:{" "}
        <code>src/lib/process/prompt_process.tsx</code> or <code>git log</code>.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Phase</th>
            <th scope="col">Status</th>
            <th scope="col">Owner</th>
          </tr>
        </thead>
        <tbody>
          {displayedSteps.map((step) => (
            <tr key={step.id}>
              <td>{step.summary}</td>
              <td>{step.phase ?? "—"}</td>
              <td>{statusLabel[step.status]}</td>
              <td>{step.owner ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Business decisions</h2>
      <p className="text-sm text-zinc-500">
        Showing the {recentDecisions.length} most recent of {BUSINESS_DECISIONS.length} decisions
        (newest first). Full history: <code>src/lib/process/prompt_process.tsx</code> or{" "}
        <code>git log</code>.
      </p>
      <ul>
        {recentDecisions.map((decision) => (
          <li key={decision.decision}>
            <strong>{decision.date}</strong> — {decision.decision}
            <br />
            <span className="text-sm">{decision.rationale}</span>
          </li>
        ))}
      </ul>

      <h2>Iteration history</h2>
      <p className="text-sm text-zinc-500">
        Showing the {recentIterations.length} most recent of {ITERATIONS.length} iterations
        (newest first). Full history: <code>src/lib/process/prompt_process.tsx</code> or{" "}
        <code>git log</code>.
      </p>
      {recentIterations.map((iteration) => (
        <div key={iteration.date + iteration.branch + iteration.summary.slice(0, 24)}>
          <h3>
            {iteration.date} — <code>{iteration.branch}</code>
          </h3>
          <p>{iteration.summary}</p>
          <ul>
            {iteration.shipped.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}

      <p>
        Read <DocLink href="/docs/roadmap">Roadmap</DocLink> for the phased plan this backlog is
        derived from.
      </p>
    </DocPage>
  );
}
