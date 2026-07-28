import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

const MODULES = [
  { name: "shootflow.ingest", role: "Safe media discovery, import planning, checksum copy, manifest writing." },
  { name: "shootflow.catalog", role: "Manifest loading, path validation, media typing, production boundary." },
  { name: "shootflow.storage", role: "Drive ranking and reviewed import-route recommendation." },
  { name: "shootflow.production", role: "Shoot-level proxy, analysis, grading, storyline, and packaging waves." },
  { name: "shootflow.production_status", role: "Durable pre-render progress bound to production-plan fingerprint." },
  { name: "shootflow.production_worker", role: "Safe worker actions, claims, output verification, lease expiry." },
  { name: "shootflow.production_adapter", role: "Local adapters from dry-run through package handoff proofs." },
  { name: "shootflow.production_scheduler", role: "Iterative local orchestration and persisted scheduler reports." },
  { name: "shootflow.assembly", role: "Render task planning from verified graded assets and storylines." },
  { name: "shootflow.render_status", role: "Render progress manifest with compare/write lease semantics." },
  { name: "shootflow.render_worker", role: "Renderer-neutral worker actions and stale lease handling." },
  { name: "shootflow.render_scheduler", role: "Bounded dry-run render orchestration and UI handoff reports." },
  { name: "shootflow.workspace_health", role: "Read-only handoff validation and next safe action." },
  { name: "shootflow.pilot_dashboard", role: "Activation, throughput, intervention, and pilot acceptance metrics." },
];

export default function ArchitecturePage() {
  return (
    <DocsLayout
      title="Architecture"
      subtitle="Python core modules, safety invariants, and handoff boundaries between ingest, production, and render."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <h2>Product shape</h2>
        <ul>
          <li>Desktop-first Mac workflow for cards, RAW/video shoots, and external SSDs.</li>
          <li>Local storage and originals remain the source of truth.</li>
          <li>Instagram Reels, carousels, and feed photos are first-class deliverables.</li>
          <li>Python core models workflow contracts before native UI work starts.</li>
        </ul>

        <h2>Safety invariants</h2>
        <ul>
          <li>Never delete source media during ingest.</li>
          <li>Never overwrite an existing destination file with different bytes.</li>
          <li>Verify copies with SHA-256 before treating an import as complete.</li>
          <li>Reject symlink-based source or destination paths.</li>
          <li>Rank detected drives conservatively; route recommendations are review-only.</li>
        </ul>

        <h2>Core modules</h2>
        <div className="card-grid">
          {MODULES.map((mod) => (
            <div key={mod.name} className="card">
              <h2>{mod.name}</h2>
              <p>{mod.role}</p>
            </div>
          ))}
        </div>

        <h2>Handoff layers</h2>
        <p>
          Ingest produces <code>ingest_manifest.json</code> as the boundary between file management and
          AI/editing work. Production status and scheduler reports track pre-render progress. Render tasks,
          status, and scheduler reports track deliverable assembly. Workspace health, index, and pilot
          surfaces summarize state read-only with explicit observe-only authority.
        </p>
      </section>
    </DocsLayout>
  );
}
