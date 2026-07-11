import { DocLink, DocPage } from "@/components/docs/doc-page";
import { BUSINESS_DECISIONS, ITERATIONS, NEXT_STEPS } from "@/lib/process/prompt_process";

const statusLabel: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export default function ProcessDocPage() {
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

      <h2>Backlog</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Phase</th>
            <th>Status</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {NEXT_STEPS.map((step) => (
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
      <ul>
        {BUSINESS_DECISIONS.map((decision) => (
          <li key={decision.decision}>
            <strong>{decision.date}</strong> — {decision.decision}
            <br />
            <span className="text-sm">{decision.rationale}</span>
          </li>
        ))}
      </ul>

      <h2>Iteration history</h2>
      {ITERATIONS.map((iteration) => (
        <div key={iteration.date + iteration.branch}>
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
