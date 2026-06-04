import { DocShell } from "@/components/DocShell";
import { Prose } from "@/components/Prose";

export const metadata = { title: "Design decisions" };

export default function DesignDecisionsPage() {
  return (
    <DocShell
      title="Design decisions"
      description="Product shape, safety invariants, and the Python core modules that model workflow contracts."
    >
      <Prose>
        <h2>Product shape</h2>
        <ul>
          <li>Desktop-first Mac workflow for large RAW/video shoots and external volumes.</li>
          <li>iPhone capture/review later as a companion for selects, grades, and export triggers.</li>
          <li>Local storage and originals remain the source of truth with obvious provenance.</li>
          <li>Instagram reels, carousels, and feed photos are first-class deliverables.</li>
        </ul>
        <h2>Safety invariants</h2>
        <ul>
          <li>Never delete source media during ingest.</li>
          <li>Never overwrite an existing destination file with different bytes.</li>
          <li>Verify copies with SHA-256 before treating an import as complete.</li>
          <li>Write ingest manifests so later jobs reference immutable originals.</li>
          <li>Reject symlink-based source or destination paths in the core importer.</li>
        </ul>
        <h2>Core architecture</h2>
        <p>
          The repo contains a testable Python core: ingest, catalog, analysis, production,
          render_status, render_worker, render_scheduler, workflow_authority, and CLI commands that
          expose observe-only handoffs. Native UI layers consume these contracts without redefining
          safety rules in presentation JSON.
        </p>
        <p>
          Full source: <code>docs/DESIGN_DECISIONS.md</code> (800+ lines of module-level notes).
        </p>
      </Prose>
    </DocShell>
  );
}
