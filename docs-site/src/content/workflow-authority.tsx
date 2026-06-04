import { Callout } from "@/components/Prose";

export function WorkflowAuthorityContent() {
  return (
    <>
      <p>
        ShootFlow JSON handoffs describe useful next steps for Mac shells, automation
        runners, and agents. Those descriptions are presentation aids; they are not
        permission to copy, retry, materialize, clean up, overwrite, or delete files.
      </p>

      <section>
        <h2>Observe-only authority object</h2>
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-sky-100">
{`{
  "mode": "observe_only",
  "handoff_kind": "presentation_only",
  "permits_file_mutation": false,
  "permits_copy": false,
  "permits_retry": false,
  "permits_cleanup": false,
  "permits_overwrite": false,
  "permits_materialization": false,
  "permits_deletion": false
}`}
        </pre>
        <p>
          Scheduler reports may list materialized outputs or retryable work, but the report
          remains post-operation evidence only.
        </p>
      </section>

      <section>
        <h2>Native-shell reader</h2>
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-sky-100">
{`from shootflow.workflow_authority import observe_only_handoff_controls_to_dict

controls = observe_only_handoff_controls_to_dict(payload, field_label="payload")`}
        </pre>
        <p>
          Bind UI controls to the returned booleans. If authority is missing or attempts
          to permit mutation, the reader raises <code>WorkflowAuthorityError</code> and the
          UI should fail closed.
        </p>
      </section>

      <section>
        <h2>CLI validation bridge</h2>
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-sky-100">
{`PYTHONPATH=src python3 -m shootflow.cli handoff-controls \\
  --handoff-json <saved-handoff.json>`}
        </pre>
      </section>

      <Callout title="Package handoff brief" tone="warn">
        <code>package-handoff-brief</code> summarizes package readiness from trusted{" "}
        <code>production_status.json</code> and{" "}
        <code>production_scheduler_report.json</code>. It derives readiness from final
        status checksums when a later no-op scheduler report clears{" "}
        <code>outputs_materialized</code> but package jobs remain succeeded in status.
      </Callout>
    </>
  );
}
