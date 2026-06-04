/* AUTO-GENERATED from docs/WORKFLOW_AUTHORITY.md — do not edit by hand */
import type { Metadata } from "next";
import { MarkdownDocument } from "@/components/MarkdownDocument";

export const metadata: Metadata = {
  title: "Workflow Authority Contract",
  robots: { index: false, follow: false },
};

const markdownSource = `# Workflow Authority Contract

ShootFlow JSON handoffs often describe useful next steps for a Mac shell,
automation runner, or future agent. Those descriptions are presentation aids;
they are not permission to copy, retry, materialize, clean up, overwrite, or
delete files.

## Observe-only authority

Current UI/agent handoff JSON uses a root \`workflow_authority\` object:

\`\`\`json
{
  "mode": "observe_only",
  "handoff_kind": "presentation_only",
  "permits_file_mutation": false,
  "permits_copy": false,
  "permits_retry": false,
  "permits_cleanup": false,
  "permits_overwrite": false,
  "permits_materialization": false,
  "permits_deletion": false
}
\`\`\`

This object means the payload can be displayed or summarized, but it cannot be
used as the authority source for file-changing controls.

Persisted render and production scheduler reports also emit this root object.
Those reports may list materialized outputs, retryable work, blocked work, or
review-required IDs, but the report remains post-operation evidence only. It
does not authorize a shell or agent to retry, clean up, overwrite, materialize,
delete, or mutate files.

## Native-shell reader

Python consumers can call:

\`\`\`python
from shootflow.workflow_authority import observe_only_handoff_controls_to_dict

controls = observe_only_handoff_controls_to_dict(payload, field_label="payload")
\`\`\`

The function validates the root \`workflow_authority\` object and returns:

\`\`\`json
{
  "file_mutation_enabled": false,
  "copy_enabled": false,
  "retry_enabled": false,
  "cleanup_enabled": false,
  "overwrite_enabled": false,
  "materialization_enabled": false,
  "deletion_enabled": false
}
\`\`\`

Consumers should bind native controls to those booleans, not to \`next_actions\`,
\`next_steps\`, \`writes_files\`, \`agent_handoff\`, or prose. If a payload is missing
the observe-only object or attempts to set one of the authority booleans to
\`true\`, the reader raises \`WorkflowAuthorityError\` and the UI should fail
closed.

## CLI validation bridge

Shell/native integrations can validate a saved handoff without reimplementing
the Python reader:

\`\`\`bash
PYTHONPATH=src python3 -m shootflow.cli handoff-controls \\
  --handoff-json <saved-handoff.json>
\`\`\`

The command is read-only. It loads the saved JSON, rejects missing or
authorizing root authority, and prints schema v2 observe-only JSON containing
the disabled \`handoff_controls\` map. Its output is still a presentation
surface; it does not authorize copy, retry, cleanup, overwrite,
materialization, deletion, or any other file mutation.

## Package handoff bridge

Native shells that need a package-specific readout can call:

\`\`\`bash
PYTHONPATH=src python3 -m shootflow.cli package-handoff-brief \\
  --ingest-manifest <shoot>/ingest_manifest.json
\`\`\`

The command is read-only. It rebuilds the trusted production plan from the
ingest manifest, validates \`production_status.json\`, loads the matching
\`production_scheduler_report.json\`, summarizes package job readiness and
materialized package outputs, and derives disabled copy/retry/materialization
controls from the scheduler report's observe-only authority. It is a UI bridge,
not a retry, render, export, cleanup, overwrite, publication, or deletion
contract.

## Persisted scheduler reports

Production and render scheduler reports are trusted run records because they are
validated against the final status manifests they summarize. They still do not
grant workflow authority. Newly written scheduler reports use schema v3 and
include the same root observe-only \`workflow_authority\` object as UI summaries.
Loaders synthesize observe-only authority for legacy schema v1/v2 scheduler
reports so saved demo and pilot workspaces remain readable without becoming
file-operation authority.

Native shells may display scheduler report state after validation, but copy,
retry, cleanup, overwrite, materialization, deletion, and other file-changing
controls still require a separate explicit invocation or future reviewed action
contract.

## Future action contracts

Write-capable actions require a separate explicit invocation or a future
reviewed action contract. Until such a contract exists, observe-only summaries
may say what a human could review next, but they must not unlock copy, retry,
cleanup, overwrite, materialization, deletion, or arbitrary file mutation.
`;

export default function Page() {
  return (
    <MarkdownDocument
      title={"Workflow Authority Contract"}
      source={markdownSource}
      sourceFile={"docs/WORKFLOW_AUTHORITY.md"}
    />
  );
}
