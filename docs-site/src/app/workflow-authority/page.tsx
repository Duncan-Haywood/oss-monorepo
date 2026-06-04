import { DocShell } from "@/components/DocShell";
import { Prose } from "@/components/Prose";

export const metadata = { title: "Workflow authority" };

export default function WorkflowAuthorityPage() {
  return (
    <DocShell
      title="Workflow authority"
      description="Observe-only JSON handoffs must not be mistaken for file-mutation permission."
    >
      <Prose>
        <h2>Observe-only authority</h2>
        <p>
          ShootFlow JSON handoffs describe useful next steps for a Mac shell, automation runner, or
          agent. Those descriptions are presentation aids; they are not permission to copy, retry,
          materialize, clean up, overwrite, or delete files.
        </p>
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
        <h2>Native-shell reader</h2>
        <p>
          Python consumers should bind UI controls to{" "}
          <code>observe_only_handoff_controls_to_dict</code>, not to <code>next_actions</code> or
          prose fields. The <code>handoff-controls</code> CLI command is a read-only wrapper for
          shell integrations.
        </p>
        <h2>Scheduler reports</h2>
        <p>
          Persisted production and render scheduler reports (schema v3) include root{" "}
          <code>workflow_authority</code> plus validated product metrics. Reports may list
          materialized outputs or retryable work, but remain post-operation evidence only.
        </p>
        <p>
          Full source: <code>docs/WORKFLOW_AUTHORITY.md</code> and{" "}
          <code>shootflow.workflow_authority</code> in the Python package.
        </p>
      </Prose>
    </DocShell>
  );
}
