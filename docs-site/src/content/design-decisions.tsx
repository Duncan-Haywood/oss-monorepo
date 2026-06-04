import { Callout } from "@/components/Prose";

export function DesignDecisionsContent() {
  return (
    <>
      <Callout title="Product shape">
        Desktop-first Mac workflow for large RAW/video shoots and removable media.
        iPhone capture/review is a later companion. Local storage and originals stay
        the source of truth; Instagram reels, carousels, and feed photos are
        first-class deliverables.
      </Callout>

      <section>
        <h2>Safety invariants</h2>
        <ul>
          <li>Never delete source media during ingest.</li>
          <li>Never overwrite an existing destination file with different bytes.</li>
          <li>Verify copies with SHA-256 before treating import complete.</li>
          <li>Write ingest manifests so later jobs reference immutable originals.</li>
          <li>Reject symlink-based source or destination paths in the core importer.</li>
          <li>
            Rank drives conservatively: camera-card-like volumes are review-only sources;
            large writable SSDs can be destination candidates. Discovery is advisory.
          </li>
        </ul>
      </section>

      <section>
        <h2>Core architecture (Python core today)</h2>
        <ul>
          <li>
            <code>shootflow.ingest</code> — discovery, planning, checksum copy, manifests.
          </li>
          <li>
            <code>shootflow.catalog</code> — manifest loading, typing, production boundary.
          </li>
          <li>
            <code>shootflow.storage</code> / <code>storage_discovery</code> — reviewed routes.
          </li>
          <li>
            <code>shootflow.production</code> — proxy, analysis, scene, look, grade, package waves.
          </li>
          <li>
            <code>shootflow.render_status</code> — resumable render manifests with leases.
          </li>
          <li>
            <code>shootflow.workflow_authority</code> — observe-only control binding for shells.
          </li>
        </ul>
      </section>

      <section>
        <h2>Production adapter contract</h2>
        <p>
          Local stand-in adapters (dry-run, metadata, proxy, analysis, scene, look, grade,
          story, package) may write only declared outputs with deterministic bytes. They
          must not delete, clean up, overwrite different bytes, or invent media paths.
          Scheduler dispatch is capability-aware so incompatible downstream work stays
          pending until a compatible worker exists.
        </p>
      </section>

      <section>
        <h2>Observe-only handoffs</h2>
        <p>
          CLI and JSON surfaces may describe next steps, but persisted reports and
          dashboards include <code>workflow_authority</code> marking payloads presentation-only.
          Native controls must bind to disabled control maps from{" "}
          <code>observe_only_handoff_controls_to_dict</code>, not prose fields.
        </p>
      </section>
    </>
  );
}
