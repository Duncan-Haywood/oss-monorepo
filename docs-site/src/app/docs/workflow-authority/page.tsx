import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

export default function WorkflowAuthorityPage() {
  return (
    <DocsLayout
      title="Workflow authority"
      subtitle="Observe-only handoffs — presentation never implies file mutation permission."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <p>
          ShootFlow JSON handoffs describe useful next steps for Mac shells,
          automation runners, and agents. Those fields are presentation aids;
          they are not permission to copy, retry, materialize, clean up,
          overwrite, or delete files.
        </p>

        <h2>Observe-only authority object</h2>
        <pre>{`{
  "mode": "observe_only",
  "handoff_kind": "presentation_only",
  "permits_file_mutation": false,
  "permits_copy": false,
  "permits_retry": false,
  "permits_cleanup": false,
  "permits_overwrite": false,
  "permits_materialization": false,
  "permits_deletion": false
}`}</pre>
        <p>
          Native controls must bind to{" "}
          <code>observe_only_handoff_controls_to_dict</code> output — all
          booleans false — not to <code>next_actions</code> prose.
        </p>

        <h2>CLI validation bridges</h2>
        <ul>
          <li>
            <code>handoff-controls --handoff-json &lt;path&gt;</code> — validates
            saved handoff JSON and returns disabled control map.
          </li>
          <li>
            <code>package-handoff-brief --ingest-manifest &lt;path&gt;</code> —
            read-only package readiness summary bound to scheduler report
            authority.
          </li>
        </ul>

        <h2>Scheduler reports</h2>
        <p>
          Production and render scheduler reports (schema v3) include the same
          root observe-only object. They record materialized outputs and
          retryable work as post-operation evidence only.
        </p>

        <div className="callout">
          Write-capable actions require a separate explicit CLI invocation with
          confirmation/runtime arguments. Until a reviewed action contract
          exists, summaries must not unlock mutation controls.
        </div>
      </section>
    </DocsLayout>
  );
}
