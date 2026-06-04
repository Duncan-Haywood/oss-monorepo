import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

export default function ContinuationNotesPage() {
  return (
    <DocsLayout
      title="Continuation notes"
      subtitle="Agent run handoff log for automation continuity — curated summary."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <p>
          <code>docs/CONTINUATION_NOTES.md</code> records branch assignments,
          reconciliation decisions, verification commands, and the next scoped
          work item for Cloud Agent runs. It is maintained for automation, not
          end-user product docs.
        </p>

        <h2>How to use this page</h2>
        <ul>
          <li>
            Read the curated TSX pages under <strong>Guides</strong> for stable
            product and architecture contracts.
          </li>
          <li>
            Use the{" "}
            <Link href="/archive/continuation-notes">full markdown archive</Link>{" "}
            when you need the complete chronological run log (build-ingested at
            deploy time).
          </li>
          <li>
            Prefer <code>origin/main</code> and assigned branch names cited in the
            latest archive section when reconciling work.
          </li>
        </ul>

        <h2>Typical contents</h2>
        <ul>
          <li>Assigned branch and canonical base commit</li>
          <li>Scoped implementation target and CLI surfaces touched</li>
          <li>Red/green verification commands from the last run</li>
          <li>Branch reconciliation notes (what merged, what was skipped)</li>
          <li>Explicit next continuation item for the following agent</li>
        </ul>

        <div className="callout">
          Continuation notes can be large. The site ingests the full file at build
          time; this TSX page stays a lightweight entry point.
        </div>
      </section>
    </DocsLayout>
  );
}
