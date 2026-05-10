# Continuation Notes

These notes are for the next automation run continuing the same product prompt.

## Implementation continuation note - 2026-05-10 04:00 UTC

This run resolved the open scheduler-authority question for persisted scheduler
reports:

- Production and render scheduler reports now write schema version 3 with a root
  observe-only `workflow_authority` object alongside the existing validated
  `product_metrics`.
- `DryRunProductionSchedulerReport` and `DryRunRenderSchedulerReport` now carry
  the validated authority payload in memory. Loaders synthesize observe-only
  authority for legacy schema v1/v2 reports so existing saved demo/pilot
  workspaces remain readable without granting file-operation authority.
- CLI `--print-report` output for both dry-run schedulers now emits the same
  schema v3 authority-bearing report JSON as the persisted report. Higher-level
  UI handoff summaries remain schema v2 unless their own contract changes.
- Added scheduler-loader regressions proving authorizing
  `workflow_authority` in persisted production/render scheduler reports is
  rejected with the same fail-closed authority validation used by UI handoffs.
- Updated `docs/WORKFLOW_AUTHORITY.md`, README, strategy, design notes, and
  AGENTS guidance to make the decision durable for future native-shell work.

Verification in this session:

- Red run proved scheduler report writers still emitted schema v2 and loaded
  report objects lacked `workflow_authority`.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_render_scheduler tests.test_production_scheduler tests.test_cli.ShootFlowCliTests.test_persisted_cli_demo_workspace_runs_init_to_scheduler_report tests.test_cli.ShootFlowCliTests.test_dry_run_scheduler_command_writes_and_prints_report tests.test_cli.ShootFlowRenderTaskCliTests.test_write_render_tasks_command_persists_trusted_assembly_handoff tests.test_production_status_cli.ShootFlowProductionStatusCliTests.test_dry_run_production_scheduler_command_can_print_persisted_report`
  -> 38 tests OK.
- Independent code review found no blocking issues and suggested the
  scheduler-specific malformed-authority regression tests added in
  `5e25427 test(scheduler): reject authorizing report authority`.
- Full verification after final test commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 348 tests OK; compileall and diff-check passed.

## Branch reconciliation note - 2026-05-10 04:00 UTC

Final reconciliation for this session:

- `git fetch --prune origin main cursor/repository-branch-consolidation-f53c`
  succeeded after the assigned branch was first pushed.
- Remote comparison against `origin/main` found exactly one branch with unique
  commits: `origin/cursor/repository-branch-consolidation-f53c`, ahead by this
  session's scheduler authority commits.
- No other remote branch had unique work versus `origin/main`; historical
  branches are either contained in main or behind it.
- Local `main` was fast-forwarded in place to `origin/main` without checking it
  out, and the stale local `cursor/setup-dev-env-3ad0` branch was deleted after
  confirming it was contained.
- Useful completed work remains on the assigned branch and was not pushed
  directly to `main` because the Cloud branch instructions for this automation
  require final pushes only to `cursor/repository-branch-consolidation-f53c`.

Good next test-first targets:

- Bind the authority-bearing scheduler reports into a minimal native-shell or
  CLI fixture that runs `workspace-health`, opens the saved scheduler report,
  then validates controls through `handoff-controls`.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Branch reconciliation note - 2026-05-10 03:30 UTC

Final reconciliation for this session:

- The assigned branch `cursor/branch-reconciliation-and-merge-21b0` started at
  `8bd511f`, matching `origin/main`.
- `git fetch --prune origin` removed the historical automation branches and
  surfaced two remaining branches with unique work:
  `origin/cursor/branch-consolidation-e6be` and
  `origin/cursor/repository-branch-consolidation-11b5`.
- `origin/cursor/repository-branch-consolidation-11b5` was the superset branch,
  containing the authority-reader work from `e6be` plus the read-only
  `handoff-controls` CLI bridge. The assigned branch fast-forwarded to
  `51bb05b docs: record handoff controls reconciliation` and was pushed.
- After fresh verification, local `main` was reset to `origin/main`,
  fast-forwarded to the same `51bb05b` tree, and pushed to `origin/main`.
  Useful completed work is no longer stranded outside main.
- Final remote reconciliation after the main push showed no remote branch with
  unique work versus `origin/main`: `origin/cursor/branch-reconciliation-and-merge-21b0`
  and `origin/cursor/repository-branch-consolidation-11b5` match main, while
  `origin/cursor/branch-consolidation-e6be` is contained and behind by the CLI
  bridge commits.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` after its upstream had
  been pruned.

## Implementation continuation note - 2026-05-10 03:30 UTC

This run reconciled and shipped the completed authority-control integration:

- Imported the fail-closed native-shell handoff reader
  `observe_only_handoff_controls_to_dict(...)`, which validates root
  observe-only `workflow_authority` before returning disabled file-operation
  controls for mutation, copy, retry, cleanup, overwrite, materialization, and
  deletion.
- Imported the read-only
  `python -m shootflow.cli handoff-controls --handoff-json <path>` bridge so
  shell/native integrations can validate saved handoff JSON without parsing
  `next_actions`, `next_steps`, `writes_files`, `agent_handoff`, or prose as
  permission.
- Fixed a review-found fail-closed gap in the CLI bridge: invalid UTF-8 or
  unreadable handoff JSON now returns the normal CLI error path instead of
  escaping as `UnicodeDecodeError`, `PermissionError`, or another `OSError`.
- Preserved the new `docs/WORKFLOW_AUTHORITY.md` contract and README/AGENTS/
  design-decision references as the canonical guidance for future SwiftUI,
  menu-bar, or automation consumers.

Verification in this session:

- Red review follow-up:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_invalid_utf8_json tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_unreadable_json`
  reproduced uncaught `UnicodeDecodeError` and `PermissionError`.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_invalid_utf8_json tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_unreadable_json tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_derives_disabled_controls tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_authorizing_payload`
  -> 4 tests OK.
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests`
  -> 346 tests OK.
- `PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests`
  -> passed.
- `git diff --check` -> passed.

Good next test-first targets:

- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- When native SwiftUI/menu-bar code appears, make its file-operation controls
  consume either `observe_only_handoff_controls_to_dict(...)` directly or the
  `handoff-controls` CLI output before exposing retry/copy/materialization UI.

## Branch reconciliation note - 2026-05-10 03:00 UTC

Final reconciliation for this session:

- Current assigned branch `cursor/repository-branch-consolidation-11b5` first
  merged the only remote branch with useful unmerged work,
  `origin/cursor/branch-reconciliation-and-merge-9840`, via merge commit
  `ceeae16 merge: reconcile authority reader branch`.
- This session then added `0b277f1 feat(cli): add handoff control validator`,
  bringing the assigned branch to four commits ahead of `origin/main`: the two
  authority-reader commits from `9840`, the merge commit, and the new CLI bridge.
- After `git fetch --prune origin`, remaining remote branch comparison was:
  `origin/cursor/branch-consolidation-08bd` is behind `origin/main` with no
  unique work, `origin/cursor/branch-reconciliation-and-merge-e71e` matches
  `origin/main`, `origin/cursor/branch-reconciliation-and-merge-9840` has the two
  authority-reader commits now merged into this assigned branch, and
  `origin/cursor/repository-branch-consolidation-11b5` is the only branch with
  this session's new unique work.
- Local `main` was reset in place to `origin/main`, and stale local
  `cursor/setup-dev-env-3ad0` was deleted. Remote branch deletion/main pushing
  was not performed because the Cloud branch instructions for this automation
  require final pushes only to `cursor/repository-branch-consolidation-11b5`.

## Implementation continuation note - 2026-05-10 03:00 UTC

This run converted the new authority reader into a shell/native integration
bridge:

- Added `python -m shootflow.cli handoff-controls --handoff-json <path>`.
  The command is read-only: it refuses symlinked handoff JSON, loads a saved
  object payload, validates the root observe-only `workflow_authority` through
  `observe_only_handoff_controls_to_dict(...)`, and prints schema v2 JSON with
  the shared observe-only authority plus all-disabled `handoff_controls`.
- Added CLI tests proving saved handoff JSON with write-capable presentation
  fields still yields disabled controls, and authorizing root authority fails
  closed with the shared `WorkflowAuthorityError` message.
- Updated README, AGENTS, `docs/WORKFLOW_AUTHORITY.md`, and design decisions so
  future SwiftUI/menu-bar shells can use the CLI bridge when they have a saved
  handoff file instead of importing Python directly.

Verification and review:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_derives_disabled_controls tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_authorizing_payload`
  failed because `handoff-controls` was not an argparse choice.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workflow_authority tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_derives_disabled_controls tests.test_cli.ShootFlowCliTests.test_handoff_controls_command_rejects_authorizing_payload`
  -> 5 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 344 tests OK; compileall and diff-check passed.
- Code-review subagent found no blocking or non-blocking issues. Residual test
  gap accepted: missing-root/prose ignoring behavior is covered at the shared
  helper level rather than duplicated through the CLI wrapper.

Good next test-first targets:

- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- When native SwiftUI/menu-bar code appears, make its file-operation controls
  consume either `observe_only_handoff_controls_to_dict(...)` directly or the
  `handoff-controls` CLI output before exposing retry/copy/materialization UI.

## Branch reconciliation note - 2026-05-10 02:30 UTC

Final reconciliation for this session:

- Current assigned branch `cursor/branch-reconciliation-and-merge-9840` contains
  the new authority-reader work and is one commit ahead of `origin/main` after
  commit `916d40c feat(authority): add observe-only handoff control reader`.
- Remote branch comparison after `git fetch origin main
  cursor/branch-reconciliation-and-merge-9840` showed every remote branch except
  `origin/cursor/branch-reconciliation-and-merge-9840` has `ahead=0` relative to
  `origin/main`; those branches contain no unique unmerged work to reconcile in
  this session. `origin/cursor/branch-consolidation-08bd` remains behind main
  with no unique commits.
- Local `main` was reset in place to `origin/main` without checking it out, and
  the merged local `cursor/setup-dev-env-3ad0` branch was deleted.
- The useful completed work is pushed to the assigned branch. It was not pushed
  directly to `main` because the Cloud branch instructions for this run require
  all final pushes to target `cursor/branch-reconciliation-and-merge-9840` and
  prohibit pushing a different branch without explicit override.

## Implementation continuation note - 2026-05-10 02:30 UTC

This run implemented the first consumer-side authority reader for native shells
and agents:

- Added `observe_only_handoff_controls_to_dict(...)` in
  `shootflow.workflow_authority`. The helper validates a handoff's root
  observe-only `workflow_authority` object and returns all-disabled native
  file-operation controls for file mutation, copy, retry, cleanup, overwrite,
  materialization, and deletion.
- Added focused tests in `tests/test_workflow_authority.py` proving that
  `next_actions`, `next_steps`, `writes_files`, `agent_handoff`, and prose do
  not enable native controls, and that missing or authorizing root authority
  fails closed with `WorkflowAuthorityError`.
- Added `docs/WORKFLOW_AUTHORITY.md` plus README, AGENTS, and design-decision
  references so future SwiftUI/menu-bar shells bind controls to the helper's
  disabled output rather than parsing presentation fields.

Verification and review:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workflow_authority`
  failed on the missing `observe_only_handoff_controls_to_dict` API.
- Focused green run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workflow_authority tests.test_pilot_dashboard tests.test_pilot_cohort_report tests.test_pilot_cohort_brief tests.test_workspace_health tests.test_workspace_index`
  -> 54 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests && PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests && git diff --check`
  -> 342 tests OK; compileall and diff-check passed.
- Review pass found no blocking issues. Residual risk: the reader is intentionally
  exact-shape observe-only; a future non-observe action contract will need a new
  explicit schema/helper rather than adding permissions to this one.

Good next test-first targets:

- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Bind the new authority reader into any future native SwiftUI/menu-bar readout
  before exposing retry/copy/materialization controls.

## Branch reconciliation note - 2026-05-10 02:00 UTC

Final reconciliation for this session:

- Current assigned branch `cursor/branch-reconciliation-and-merge-e71e`
  fast-forwarded in the useful completed work from
  `origin/cursor/repository-branch-consolidation-ec92`:
  - `bf14814 feat(cli): add authority to handoff summaries`
  - `daedff5 test(cli): cover authority on ingest planning summaries`
  - `5851407 docs: record cli authority reconciliation`
- This session then added a review follow-up on the assigned branch:
  versioned observe-only authority on `execute-ingest` receipts, schema v2 for
  `plan-import-route` and `preview-ingest`, and command-free write-capable
  `next_actions` for `write-render-tasks` and `card-dump-workflow`.
- A final `git fetch --prune origin` removed the older remote branches
  `origin/cursor/branch-reconciliation-and-merge-030b`,
  `origin/cursor/branch-consolidation-0f1f`, and
  `origin/cursor/repository-branch-consolidation-ec92`. A replacement
  `origin/cursor/branch-consolidation-08bd` remains and points at `5851407`,
  which is fully contained in this branch and now in `origin/main`.
- Local `cursor/setup-dev-env-3ad0` was deleted after pruning its gone remote.
- Local `main` was reset to `origin/main`, fast-forwarded to
  `cursor/branch-reconciliation-and-merge-e71e`, verified, and pushed. Useful
  completed work is no longer stranded outside main.

## Implementation continuation note - 2026-05-10 02:00 UTC

This run extended the machine-readable no-authority contract across the
remaining high-risk CLI handoff summaries and ingest receipts that can otherwise
be misread from `next_actions`, `next_steps`, or `agent_handoff`:

- `plan-production` and `next-production-wave` JSON now use schema v2 and include
  root `workflow_authority`, so native shells can show candidate pre-render
  work without granting claim, retry, materialization, cleanup, overwrite,
  deletion, copy, or general file-mutation authority.
- `write-render-tasks`, `card-dump-workflow`, `inspect-render-workspace`,
  `create-demo-workspace`, `create-card-dump-demo-workspace`, and
  `create-pilot-cohort-demo` summaries now use the shared schema-v2 CLI handoff
  constant and emit root observe-only authority before naming advisory workflow
  steps.
- `plan-import-route` and `preview-ingest` now use schema v2 plus root
  observe-only authority. They remain read-only planning/preview surfaces; the
  actual copy path still requires a separate explicit `execute-ingest --confirm`
  or `card-dump-workflow --confirm-ingest` invocation.
- `execute-ingest` success receipts now also use schema v2 and root
  observe-only authority. The authority describes the receipt payload as a
  non-authorizing post-copy handoff; it does not erase the fact that the command
  already copied bytes after explicit `--confirm`.
- `write-render-tasks` and confirmed `card-dump-workflow` no longer emit
  executable `command` arrays inside write-capable `next_actions`. They carry
  descriptive fields such as workspace, completed dependency IDs, and ingest
  manifest path so native shells can render reviewed next steps without treating
  the JSON as an executable workflow plan.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future native shells and continuation agents treat root `workflow_authority`
  as the permission gate for these summaries.

Verification and review:

- Imported branch verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli`
  -> 61 tests OK.
- Review pass found two contract gaps: `execute-ingest` lacked schema/authority,
  and observe-only payloads still emitted executable command arrays for
  write-capable next actions.
- Red focused run before the review follow-up failed on the intended missing
  fields/command-free expectations.
- Green focused run after the review follow-up:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_cli.ShootFlowCliTests.test_plan_import_route_command_discovers_capacity_gated_route_from_estimated_source tests.test_cli.ShootFlowIngestCliTests.test_preview_ingest_command_outputs_planned_items_without_copying tests.test_cli.ShootFlowIngestCliTests.test_execute_ingest_command_with_confirm_writes_checksum_manifest tests.test_cli.ShootFlowRenderTaskCliTests.test_write_render_tasks_command_persists_trusted_assembly_handoff tests.test_cli.ShootFlowCardDumpWorkflowCliTests.test_card_dump_workflow_confirm_ingests_and_reports_production`
  -> OK.

Good next test-first targets:

- Add a tiny native-shell/agent contract reader that refuses to enable copy,
  retry, materialization, cleanup, overwrite, or deletion controls from
  `next_actions`, `next_steps`, `writes_files`, or prose unless a separate
  explicit reviewed action contract is present.
- Decide whether scheduler run summaries and persisted scheduler reports need a
  distinct post-operation authority block rather than the presentation-only
  observe-only contract already used by CLI receipts and summaries.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Branch reconciliation note - 2026-05-10 00:00 UTC

Final reconciliation for this session:

- `origin/cursor/branch-reconciliation-and-merge-cb17` contains the useful
  workspace-authority implementation plus the review follow-up that normalizes
  legacy schema v1 workspace indexes into schema v2 with both root and nested
  observe-only authority fields.
- `origin/cursor/branch-consolidation-b632` was reviewed against this branch.
  Its unique tree diff was only an additional continuation-note section. That
  note was not merged because it documented the pre-fix authority commit
  (`c4e73a2`) as final, omitted the legacy-index fix (`c59e7f6`), and claimed
  remote branch deletions that were not true in the current reconciliation pass.
  No implementation or test work was stranded there.
- After `git fetch --prune origin`, all historical remote automation branches
  except `origin/cursor/branch-consolidation-b632` and the assigned branch were
  already gone. Local `cursor/setup-dev-env-3ad0` remains a stale gone-upstream
  branch and can be deleted after the final main fast-forward if still present.

## Implementation continuation note - 2026-05-10 00:00 UTC

This run broadened the structured observe-only authority contract beyond the
pilot analytics layer into the read-only workspace state surfaces:

- Added `shootflow.workflow_authority`, the shared no-authority helper for
  UI/agent contracts. `shootflow.pilot_authority` remains as a compatibility
  wrapper over the shared module, so existing pilot consumers keep the same API.
- `workspace-health` JSON now uses schema v4 and includes
  `workflow_authority` at the top level. The payload still may name suggested
  next actions, including write-capable commands for human review, but the
  serialized contract explicitly grants no copy, retry, cleanup, overwrite,
  materialization, deletion, or file-mutation authority.
- `index-workspace` JSON now uses schema v2, includes the same
  `workflow_authority` at the root, and embeds the derived workspace-health
  authority inside the `workspace_health` artifact summary. Persisted schema v1
  indexes still load as observe-only for backward compatibility.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future native shells treat `workflow_authority` as the first safety gate
  across workspace health, workspace index, pilot dashboard, cohort report, and
  cohort brief payloads.

Verification during implementation:

- Red run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workspace_health tests.test_workspace_index`
  failed on missing workspace-health/index authority fields and old schema
  versions.
- Green focused run:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_workspace_health tests.test_workspace_index`
  -> 25 tests OK.
- Pilot authority regression:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_dashboard tests.test_pilot_cohort_report tests.test_pilot_cohort_brief`
  -> 25 tests OK.

Good next test-first targets:

- Bind `workflow_authority` into any future native SwiftUI/menu-bar readout or
  shell wrapper before exposing retry/copy/materialization controls.
- Add agent/UI contract coverage around `card-dump-workflow` `agent_handoff` so
  copy-capable next steps are never inferred from prose or command strings.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 23:30 UTC

This run hardened the observe-only pilot analytics/UI contract for future native
shells and continuation agents:

- Added `shootflow.pilot_authority`, a shared structured
  `workflow_authority` payload for pilot presentation surfaces. The contract is
  `mode=observe_only`, `handoff_kind=presentation_only`, and false for file
  mutation, copy, retry, cleanup, overwrite, materialization, and deletion.
- `pilot-dashboard`, `pilot-cohort-report`, and `pilot-cohort-brief` JSON now
  emit that same authority object. This makes the trust boundary machine-readable
  for agent-native UIs instead of leaving consumers to parse safety-note prose.
- Saved dashboard JSON and saved cohort reports remain backward-compatible when
  the field is absent, but if a saved payload includes `workflow_authority`, the
  loaders validate it and reject malformed or authorizing values instead of
  silently masking them.
- Cohort reports and briefs still emit no executable workflow commands. The
  text-mode cohort brief remains command-free and continues omitting saved paths,
  timestamps, workspace titles, and free-form report notes.
- Updated README, AGENTS, product strategy/architecture/business docs to treat
  `workflow_authority` as the first safety gate for future Mac UI controls.

Review, verification, and branch reconciliation for this run:

- Test-first red run failed on missing `workflow_authority` in dashboard, cohort
  report, and cohort brief JSON. Implementation added the shared authority
  helper and serializers.
- Focused review found two issues: numeric zero could pass as `False`, and saved
  payloads with a malformed present authority block were silently masked. A
  follow-up red run reproduced both gaps; the validator now requires exact bool
  values and report loaders reject malformed present authority fields.
- Verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 337 tests OK; compileall and diff-check exited 0.
- Commit pushed to the assigned branch:
  `09ec3bc feat(pilot): expose observe-only authority contract`.
- `git fetch --prune origin` removed historical remote automation branches.
  After pruning, only `origin/cursor/branch-reconciliation-and-merge-c0a6` had
  unique work versus `origin/main`; `origin/cursor/branch-consolidation-strategy-adee`
  and `origin/cursor/repository-branch-consolidation-471c` were already merged.
- Fast-forwarded local `main` to `origin/main`, fast-forwarded `main` to the
  assigned branch tip, and pushed `origin/main`. After that compare, every
  surviving remote branch had `ahead=0` versus `origin/main`.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` whose upstream was gone.
  Kept the assigned automation branch because it tracks the just-pushed feature
  branch and is now merged into `main`.

Good next test-first targets:

- Broaden UI/agent contract coverage so `workspace-health`, `workspace-index`,
  and future native wrappers also expose or respect explicit no-authority fields
  before presenting write-capable controls.
- Bind the command-free text cohort brief plus structured JSON authority into a
  tiny native SwiftUI/menu-bar readout or shell wrapper that shows readiness
  cards while invoking only explicit, reviewed next-action contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 23:00 UTC

This run closed the prior text-mode/native-shell cohort brief target:

- Added `pilot_cohort_brief_to_text(...)`, a deterministic text renderer over the
  validated saved cohort brief. It reports status, headline, trusted summary
  counts, and per-workspace readiness cards for terminal demos and native-shell
  readouts.
- Added `pilot-cohort-brief --format text` while preserving JSON as the default
  output for existing agents and integrations.
- Hardened the text surface so it omits free-form cohort and threshold notes from
  saved reports; JSON still carries the structured note fields, but the text demo
  cannot echo injected `python -m ...` or `--confirm` style workflow handoffs.
- A final review pass found the same risk in saved report paths, workspace
  titles, and dashboard paths. The text view now omits those free-form fields too
  and uses ordinal workspace labels instead.
- A re-review found the same risk in saved `generated_at` strings. The text view
  now omits that timestamp field too; JSON remains the complete machine-readable
  contract.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  to treat the text-mode brief as the command-free presentation layer over saved
  cohort reports.

Review and branch reconciliation for this run:

- Test-first red run failed on the missing renderer and missing `--format text`
  CLI option; a follow-up hardening red run failed because free-form notes were
  echoed into text output.
- Review-follow-up red run failed because free-form saved paths and workspace
  titles were echoed into text output.
- Re-review-follow-up red run failed because a free-form saved `generated_at`
  string was echoed into text output.
- Verification before the first commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 333 tests OK; compileall and diff-check exited 0.
- Commit pushed to the assigned branch:
  `51cab65 feat(pilot): add text cohort brief output`.
- `git fetch --prune origin` removed historical remote automation branches. The
  only newly visible branch, `origin/cursor/branch-consolidation-strategy-adee`,
  had no unique work beyond the previous `origin/main` tip.
- Deleted merged stale local branch `cursor/setup-dev-env-3ad0`.
- Fast-forwarded local `main` to `origin/main`, then fast-forwarded `main` to the
  assigned branch tip and pushed `origin/main`. After reconciliation,
  `origin/main...HEAD` compared `0 0` and no remote branches remained unmerged
  into `origin/main`.

Good next test-first targets:

- Bind the command-free text cohort brief into a tiny native SwiftUI/menu-bar
  screen or shell wrapper that displays readiness cards while invoking only
  explicit, reviewed next-action contracts.
- Add UI/agent contract tests proving text brief, JSON brief, cohort reports, and
  dashboards never become permission to retry, materialize, overwrite, clean up,
  or delete files.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 22:30 UTC

This run advanced the native-shell/UI proof target above the saved cohort
fixture:

- Added `shootflow.pilot_cohort_brief`, a read-only presentation contract over
  one saved schema v1 `pilot_cohort_report.json`.
- Added `pilot-cohort-brief --cohort-report <path>` to emit status, headline,
  summary labels, and per-workspace readiness cards for Mac shells, GTM demos,
  and continuation agents.
- The brief preserves the analytics trust boundary: it reads only the saved
  cohort report, writes nothing, emits no executable workflow commands, and does
  not grant copy, retry, cleanup, overwrite, materialization, or deletion
  authority.
- Added regression coverage for partially ready cohorts, unavailable trusted
  metrics, and CLI no-write/no-command behavior.
- Review follow-up tightened saved-report validation: the brief now rejects
  forged or internally inconsistent cohort reports whose aggregate counts,
  readiness booleans, rates, medians, or output counts disagree with workspace
  evidence. A second review pass tightened this further by recomputing
  workspace readiness from the default completion/intervention/output thresholds
  and revalidating nested summary dataclasses, status, and headline consistency
  before serialization.

Good next test-first targets:

- Bind the cohort brief into a small native SwiftUI/menu-bar screen or text-mode
  demo harness that displays readiness cards while invoking only explicit,
  reviewed next-action contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Add UI/agent contract tests proving cohort dashboards, cohort reports, and
  cohort briefs never become permission to retry, materialize, overwrite, clean
  up, or delete files.

## Implementation continuation note - 2026-05-09 22:00 UTC

This run advanced the saved-dashboard cohort fixture target from the previous
handoff:

- Added `create-pilot-cohort-demo --workspace <dir> --workspace-count <n>
  --dashboard-generated-at <timestamp> --generated-at <timestamp>`.
- The command creates trusted persisted render demo workspaces under
  `workspaces/`, runs the normal render init and dry-run scheduler path for each
  workspace, saves one schema v2 pilot-dashboard JSON payload per workspace under
  `pilot_dashboards/`, and writes a saved `pilot_cohort_report.json`.
- The fixture preflights saved dashboard/report paths before creating shoot
  workspaces, refuses existing different report files, and keeps saved dashboards
  plus cohort reports observational rather than workflow authority.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future agents can treat the saved cohort fixture as the no-real-media GTM
  demo path above `pilot-dashboard` and `pilot-cohort-report`.

Review and branch reconciliation for this run:

- Independent code review found that a reused
  `workspaces/pilot-demo-001/deliverables/render_scheduler_report.json` could be
  overwritten by the scheduler report writer. Fixed by preflighting and refusing
  any existing per-shoot pilot demo workspace before scheduling, with regression
  coverage proving no saved dashboard/cohort files are written and the existing
  report is preserved.
- Fetched and pruned remotes. The historical automation branches were deleted
  upstream; the newly visible `origin/cursor/branch-consolidation-strategy-253b`
  compared `0 0` with `origin/main` and contained no unique work.
- The only branch ahead of `origin/main` was the assigned branch
  `cursor/branch-reconciliation-and-merge-4b9f` with this run's two commits.
  Local `main` was fast-forwarded to the verified branch tip and pushed to
  `origin/main`.
- Deleted merged stale local branch `cursor/setup-dev-env-3ad0`.
- Final compare after push: `origin/main...HEAD` and
  `origin/cursor/branch-reconciliation-and-merge-4b9f...HEAD` both returned
  `0 0`; no remote branches remain unmerged into HEAD or `origin/main`.
- Final verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch` -> 321 tests OK;
  compileall/diff-check exited 0 and the working tree was clean before this
  documentation note.

Good next test-first targets:

- Bind the saved cohort fixture into a minimal native-shell/UI proof that
  displays readiness, intervention, and throughput as observational state while
  still branching only on explicit reviewed next-action contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Add UI/agent contract tests proving cohort dashboards never become permission
  to retry, materialize, overwrite, clean up, or delete files.

## Implementation continuation note - 2026-05-09 21:30 UTC

This run advanced the pilot cohort measurement target from the previous handoff:

- Added `shootflow.pilot_cohort_report`, a read-only aggregation layer over saved
  schema v2 `pilot-dashboard` JSON payloads. It validates each dashboard payload
  and derives cohort-level pilot-ready workspace rate, median intervention rate,
  first-draft output count, metrics-available/unavailable counts, and
  per-workspace readiness evidence.
- Added `pilot-cohort-report --dashboard-json <path> ... --generated-at
  <timestamp>` to the CLI. It writes nothing, consumes dashboard JSON files
  instead of shoot workspaces or worker internals, and emits no workflow
  commands.
- Missing dashboard metrics stay unavailable and are excluded from rate/median
  calculations rather than becoming false pilot successes or failures.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future agents treat cohort analytics as the next pilot measurement layer
  above per-workspace dashboards.

Good next test-first targets:

- Bind schema v2 `pilot_acceptance` and cohort-report output into a minimal
  native-shell/UI fixture that displays readiness as observational state while
  still branching only on explicit next-action/review contracts.
- Add a saved-dashboard fixture flow that writes one dashboard JSON per demo
  workspace and then runs `pilot-cohort-report`, giving GTM demos a stable
  multi-workspace cohort artifact without requiring real media.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 21:00 UTC

This run advanced the pilot-dashboard measurement target from the previous
handoff:

- `shootflow.pilot_dashboard` now emits schema version 2 with a
  `pilot_acceptance` object derived only from trusted workspace-health scheduler
  metrics. It computes completion and manual-intervention rates as integer basis
  points, carries the default thresholds in the payload, and marks
  `ready_for_pilot_review` only when completion is at least 90%, manual
  intervention is at most 20%, and at least one declared output has materialized.
- Missing or invalid scheduler metrics keep pilot acceptance unavailable rather
  than silently treating unknown values as success or failure.
- Acceptance state is explicitly observational. It does not schedule, retry,
  materialize, repair, overwrite, clean up, delete files, or re-emit executable
  write-capable next actions.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future agents and GTM work treat schema v2 pilot readiness as the canonical
  measurement layer instead of raw worker logs or spreadsheets.
- Added dashboard coverage for passing render-workspace readiness, retryable
  production intervention/completion failure, missing-metric unavailability,
  blocked no-output reports, and completed-workspace no-op scheduler reruns.

Branch reconciliation for this run:

- Fetched and pruned remote branches. Most historical automation branches were
  already deleted upstream.
- The assigned branch started equal to `origin/main` and
  `origin/cursor/branch-reconciliation-and-merge-9ad3`.
- `origin/cursor/repository-branch-consolidation-6ce3` and
  `origin/cursor/branch-consolidation-fedb` are behind this lineage with no
  unique commits (`HEAD...branch` compared `2 0` and `4 0` respectively), so no
  remote merge was needed.
- Deleted merged stale local branch `cursor/setup-dev-env-3ad0`.
- Verification before commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_dashboard`
  -> 5 tests OK.
- Full verification:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 312 tests OK; compileall/diff-check exited 0.

Good next test-first targets:

- Bind schema v2 `pilot_acceptance` into a minimal native-shell/UI fixture that
  displays readiness as observational state while still branching only on
  explicit next-action/review contracts.
- Define a pilot cohort report fixture that aggregates multiple dashboard JSON
  payloads into pilot-ready workspace rate, median intervention rate, and
  first-draft output count without reading raw worker internals.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

## Implementation continuation note - 2026-05-09 20:30 UTC

This run closed the pilot-dashboard contract target from the previous handoff:

- Added `shootflow.pilot_dashboard`, a read-only product analytics layer over
  `workspace-health`. It reports metric-source availability, activation signals,
  aggregate throughput, manual-intervention counts, and the current next action
  without reading raw worker internals.
- Added `pilot-dashboard --workspace <dir> --generated-at <timestamp>` to the
  CLI. Its JSON output is deterministic and observe-only. For write-capable
  next actions, it names the action and `writes_files` flag but omits executable
  `command` and runtime-arg fields so analytics surfaces cannot become
  schedulers, retry runners, or materializers.
- Missing or invalid scheduler reports leave throughput/intervention counts
  unavailable (`null`) rather than treating unknown metrics as zero.
- Added coverage for complete render dashboards, production retry/review
  dashboards, and missing-metrics dashboard state. A code-review pass caught the
  initial executable-command leak in the dashboard payload; the follow-up fix
  added an observe-only next-action view.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  to treat `pilot-dashboard` as implemented pilot analytics infrastructure.

Branch reconciliation for this run:

- Fetched and pruned remote branches. The assigned branch started equal to
  `origin/main` and `origin/cursor/repository-branch-consolidation-6ce3`.
- `origin/cursor/branch-consolidation-fedb` remains behind this lineage with no
  unique commits and was not merged.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` after confirming it was
  merged into the assigned branch.
- Pushed the assigned branch, fast-forwarded local `main` to the same tree, and
  pushed `origin/main`; both `origin/main...HEAD` and
  `origin/cursor/branch-reconciliation-and-merge-9ad3...HEAD` compare `0 0`.
- Final verification before commit:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest tests.test_pilot_dashboard &&
  PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 3 targeted tests OK, 312 tests OK; compileall/diff-check
  exited 0.

Good next test-first targets:

- Bind `pilot-dashboard` into a minimal native-shell/UI fixture that proves Mac
  surfaces display intervention and throughput metrics as observational state,
  while still branching only on explicit next-action/review contracts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Define pilot acceptance thresholds for activation, intervention rate, and
  first-draft throughput using the dashboard payload rather than raw worker
  internals.

## Implementation continuation note - 2026-05-09 20:00 UTC

This run advanced the metrics-consumption target from the previous handoff:

- `workspace-health` now exposes validated production and render scheduler
  `product_metrics` as read-only JSON fields when matching trusted scheduler
  reports are present. Missing or invalid reports leave those metric fields
  unavailable instead of deriving analytics from untrusted files.
- `index-workspace` now carries the same metrics in its derived
  `workspace_health` artifact and includes each trusted production/render
  scheduler report's `product_metrics` in that report artifact summary.
- Metrics remain observational only: next-action routing still depends on the
  validated status/report state, not on metric counts, and no copy, retry,
  cleanup, overwrite, materialization, or deletion authority was added.
- Added regression coverage for render and production health payloads plus
  workspace-index scheduler summaries/CLI output.

Branch reconciliation for this run:

- Fetched and pruned remote branches. The many historical cursor branches from
  earlier runs had already been removed upstream after prior consolidation.
- The newly visible `origin/cursor/branch-consolidation-fedb` had no unique
  commits beyond the verified baseline; comparing it to this branch returned
  `1 0`, so it is simply behind this run's metrics-consumption commit and was
  not merged separately.
- Before the final main fast-forward, `origin/main...HEAD` compared `0 1`: the
  only new useful work was this run's focused workspace health/index metrics
  exposure commit.
- Final verification before merge/push:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 309 tests OK; compileall/diff-check exited 0.

Good next test-first targets:

- Add UI/agent contract tests proving Mac shells render metric counts as
  reliability/throughput indicators while continuing to branch on explicit
  review states for retryable jobs, lease conflicts, and invalid artifacts.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Define the first pilot dashboard contract that consumes health/index metrics
  for activation, intervention rate, and throughput without reading raw worker
  internals.

## Implementation continuation note - 2026-05-09 19:30 UTC

This run advanced the product-metrics target that had been carried in the
handoff notes:

- Production and render scheduler reports now write schema version 2 with a
  `product_metrics` object derived from the trusted report/status fields.
  Metrics cover total, completed, retryable, failed, blocked, review-required,
  attempted, skipped retryable, stale lease, materialized output, failure
  message, and iteration counts.
- Report loading remains backwards-compatible with schema version 1 scheduler
  reports that do not contain `product_metrics`; loaders derive the same metric
  object from the v1 fields after validation.
- Metrics are immutable on loaded report dataclasses and are validated against
  the report state. Forged metric counts, duplicate task/job ID lists, duplicate
  materialized outputs, and multiple failure messages for the same task/job are
  rejected so analytics cannot become a new trust bypass.
- CLI `--print-report` output for production and render scheduler reports now
  includes schema v2 metrics. The default production scheduler summary also
  carries the same product metrics for simple Mac-shell/agent consumption.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so product metrics are treated as implemented infrastructure rather than a
  future target.

Good next test-first targets:

- Consume scheduler report product metrics in workspace-health/workspace-index
  summaries or a future Mac UI state contract without granting metrics any file
  authority.
- Add UI/agent contract tests proving expired production leases, lease conflicts,
  retryable jobs, and metric counts are rendered as review states, not cleanup,
  overwrite, or automatic retry authority.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.

Branch reconciliation for this run:

- Fetched and pruned remote branches. The assigned branch
  `cursor/branch-reconciliation-and-merge-9549` started at the previous
  `origin/main` and now contains this run's metrics work.
- The only remote branch still not merged into the final tree is
  `origin/cursor/branch-consolidation-strategy-71a5`. It is rejected as
  superseded: `git diff HEAD..origin/cursor/branch-consolidation-strategy-71a5`
  would remove the scheduler metrics implementation, tests, and docs while only
  adding older consolidation merge commits.
- Deleted stale local branch `cursor/setup-dev-env-3ad0` after confirming it was
  already merged.
- Fast-forwarded local `main` to the verified assigned branch and pushed
  `origin/main`; `origin/main` and the assigned branch now compare `0 0` with
  `git rev-list --left-right --count origin/main...HEAD`.
- Final verification before the main push:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check` -> 309 tests OK, compileall/diff-check exited 0.

## Implementation continuation note - 2026-05-09 19:00 UTC

This run first reconciled the assigned branch with the latest verified remote
lineage:

- Fetched and pruned remote branches. Most historical cursor branches were
  already removed upstream; the useful active line was
  `origin/cursor/repository-branch-consolidation-4b72`.
- Fast-forwarded `cursor/branch-reconciliation-and-merge-8418` from the
  production-scheduler-report baseline (`0f169fd`) to `0e1c4a9`, bringing in
  production-status/workspace-health/index visibility, stale production lease
  recovery, retryable handoff review gates, and the 18:30 reconciliation notes.
- Pushed the reconciled assigned branch to
  `origin/cursor/branch-reconciliation-and-merge-8418`.

This run then closed the negative-trust coverage gap called out by the previous
handoff:

- Added `workspace_index` regressions proving a corrupt `production_status.json`
  is indexed as an untrusted invalid production artifact, leaves
  `production_scheduler_report` missing/untrusted, routes the derived
  workspace-health next action to `review_invalid_production_status`, and does
  not rewrite the corrupt status file.
- Added `workspace_index` regressions proving a corrupt
  `production_scheduler_report.json` is indexed as an untrusted invalid report,
  routes the derived workspace-health next action to
  `review_invalid_production_scheduler_report`, and does not rewrite the corrupt
  report file.

Good next test-first targets:

- Add product metric emission at production/render scheduler report boundaries
  now that both pre-render and render progress surfaces have durable report
  artifacts and review-required states.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and stale lease
  recovery semantics.
- Add UI/agent contract tests proving Mac shells treat expired production leases
  and production lease conflicts as review states, not cleanup, overwrite, or
  automatic retry authority.

Branch reconciliation for this run:

- `origin/cursor/repository-branch-consolidation-4b72` is fully represented by
  the assigned branch after the fast-forward and this run's follow-up commit.
- `origin/cursor/repository-branch-consolidation-4c04` is an ancestor of the
  assigned branch.
- `origin/cursor/branch-consolidation-strategy-d2e7` remains unmerged because it
  is a superseded consolidation tip. Comparing it against the assigned branch
  shows it would remove the newer production lease recovery, retryable handoff
  review gates, production scheduler report conflict messages, workspace index
  production-state coverage, and this run's negative trust tests.
- `origin/main` was fast-forwarded from `0f169fd` to the verified assigned
  branch lineage so the consolidated production lease, health/index, retryable
  handoff, and negative trust coverage work is represented on main.
- Final verification on the assigned branch:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch &&
  git branch -r --no-merged HEAD --sort=-committerdate` -> 299 tests OK,
  compileall/diff-check exited 0, the working tree was clean, and the only
  remote branch still not merged into the assigned branch was the superseded
  `origin/cursor/branch-consolidation-strategy-d2e7`.

## Implementation continuation note - 2026-05-09 18:30 UTC

This run first reconciled the previous completed branch work:

- Fast-forwarded the assigned branch `cursor/repository-branch-consolidation-4b72`
  to `origin/cursor/repository-branch-consolidation-4c04`, bringing in
  production scheduler health/index visibility and stale-running production
  lease recovery.
- Pushed the fast-forwarded assigned branch before continuing with new changes.

Then it tightened the UI/agent production handoff contract:

- `plan_next_production_wave_from_status(...)` now treats status-backed
  retryable production jobs as review-required instead of returning them as
  ready work.
- Pending jobs in the same dependency-ready wave can still proceed, but retryable
  jobs must be retried through the scheduler path after explicit operator review
  via `--retryable-job`.
- Added a regression test proving expired-lease style retryable jobs appear in
  `review_required_job_ids` and are not handed back as automatic work.

After reviewer pass, this run also closed adjacent contract gaps:

- `workspace-health` now recommends `run_dry_run_production_scheduler` when a
  trusted production status has pending jobs plus retryable jobs, as long as no
  job is currently running. The scheduler can skip the retryable job while
  advancing pending siblings.
- Added CLI-level coverage proving `next-production-wave --use-production-status`
  omits retryable jobs from `jobs` and surfaces them in
  `review_required_job_ids`.
- Production scheduler reports now preserve stale-lease conflict reasons in
  `failure_messages`, not just `conflicted_lease_job_ids`.

Good next test-first targets:

- Add product metric emission at production/render scheduler report boundaries
  now that both progress surfaces include status counts, retry/review states,
  and lease events.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and using the stale
  lease expiry path for interrupted jobs.
- Negative trust coverage for invalid production status/report artifacts in
  `index-workspace` was added in the 19:00 UTC run above.

Branch reconciliation for this run:

- `git fetch --prune origin` removed the historical remote cursor branches that
  had already been merged, superseded, or deleted remotely.
- `origin/main` remains at `0f169fd`; the assigned branch contains the prior
  production-health/lease-recovery work plus this handoff contract fix and
  reviewer follow-ups.
- `origin/cursor/repository-branch-consolidation-4c04` is fully represented by
  the assigned branch.
- The only remote branch still not merged into the assigned branch is
  `origin/cursor/branch-consolidation-strategy-d2e7`. Its tree was already
  superseded by the production lease recovery lineage; it is behind the assigned
  branch by six commits and ahead only by its old consolidation merge commit, so
  it was not merged.
- Deleted the stale local branch `cursor/setup-dev-env-3ad0` after confirming it
  was merged into the assigned branch. Local `main` is stale but was left in
  place because cloud branch policy requires development and pushes on the
  assigned branch.
- Final verification on the assigned branch:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch` -> 297 tests OK,
  compileall/diff-check exited 0, and the working tree was clean.

## Implementation continuation note - 2026-05-09 18:00 UTC

This run first reconciled the only active remote branch not reachable from
`origin/main`:

- Fast-forwarded the assigned branch `cursor/repository-branch-consolidation-4c04`
  to include `origin/cursor/branch-reconciliation-and-merge-2e3f`, bringing in
  production-status and production-scheduler visibility inside
  `workspace-health` and `workspace-index`.

Then it advanced the next documented reliability target for local production
workers:

- Added stale-running production lease planning in `shootflow.production_worker`.
  `plan_stale_production_leases(...)` validates trusted production status,
  selects only running jobs older than an explicit ISO cutoff, and returns
  retryable status transitions with no-delete/no-cleanup error messages.
- Added guarded stale production lease persistence. `persist_stale_production_leases(...)`
  writes each retryable transition through
  `compare_and_write_production_job_status(...)` using the original running
  `updated_at` as the lease token, so a same-attempt heartbeat refresh becomes a
  conflict instead of being overwritten.
- Integrated the same lease path into `run_dry_run_production_scheduler(...)` and
  the `dry-run-production-scheduler` CLI via `--stale-before` plus
  `--lease-updated-at`.
- Extended `production_scheduler_report.json` and CLI summaries with
  `expired_lease_job_ids` and `conflicted_lease_job_ids`, while preserving the
  rule that expired jobs become retryable review states and are not automatically
  retried unless explicitly allow-listed with `--retryable-job`.

Good next test-first targets:

- Add product metric emission at production/render scheduler report boundaries
  now that both progress surfaces include status counts, retry/review states, and
  lease events.
- Start a real local proxy or metadata adapter behind the production-worker
  action contract, preserving declared-output-only authority and using the new
  lease expiry path for interrupted jobs.
- Add UI/agent contract tests proving Mac shells treat expired production leases
  and lease conflicts as review states, not as cleanup, overwrite, or automatic
  retry authority.

Branch reconciliation for this run:

- `git fetch --prune origin` pruned the prior
  `origin/cursor/branch-reconciliation-and-merge-2e3f` branch after its work had
  already been fast-forwarded into the assigned branch.
- A new remote branch, `origin/cursor/branch-consolidation-strategy-d2e7`,
  appeared during final reconciliation. Its tree matches the already-merged
  production-health commit `74a5b4e` and contains no content beyond that
  consolidation merge; it was not merged because doing so would move the current
  branch away from the newer production lease recovery commits.
- Deleted the local gone branch `cursor/setup-dev-env-3ad0` after confirming it
  was merged into the current branch.
- `origin/main` still points at `0f169fd`. Cloud branch policy for this run
  requires pushing only `cursor/repository-branch-consolidation-4c04`, so this
  run did not push `main`; the assigned branch now contains the consolidated
  production-health work plus the production lease recovery work.
- Final verification after review fixes:
  `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests &&
  git diff --check && git status --short --branch` -> 294 tests OK,
  compileall/diff-check exited 0, and the tree was clean.
- Follow-up correctness and testing reviewers reported no remaining findings
  after the review fixes.

## Implementation continuation note - 2026-05-09 17:30 UTC

This run advanced the production-health visibility gap identified by the 17:00
handoff:

- `workspace-health` now derives the trusted production plan from
  `ingest_manifest.json`, validates `production_status.json` and the optional
  `production_scheduler_report.json`, exposes production plan/job counts and
  pending/running/succeeded/failed/retryable counts, and recommends
  `init-production-status`, `dry-run-production-scheduler`, or explicit
  production review states before falling through to render handoffs.
- `workspace-health` remains read-only: it does not create production status,
  run schedulers, repair stale reports, reset progress, overwrite outputs, or
  delete media. Invalid production status/report artifacts fail closed into
  review actions.
- `index-workspace` now carries `production_status` and
  `production_scheduler_report` artifacts, plus the health-derived production
  counts and next action, so native shells and continuation agents can render
  pre-render progress without parsing raw manifests directly.
- The workspace-health schema version is now `3` because its JSON includes
  production fields and production artifacts.

Good next test-first targets:

- Add stale-running production lease planning/persistence, mirroring render stale
  lease contracts before allowing concurrent local production workers.
- Begin a real local proxy/VLM/metadata worker adapter behind the existing
  production-worker action contract, preserving declared-output-only authority.
- Add product metric emission at scheduler/report boundaries now that both
  production and render progress are surfaced through health/index.

Branch reconciliation for this run:

- The assigned branch started equal to `origin/main` at `0f169fd`, and the
  current work is the only new branch delta:
  `67e903b feat(workspace): surface production scheduler health`,
  `4a59a5e docs: record production health reconciliation`, and
  `3d7590f test(workspace): cover invalid production status health`.
- Historical remote branches remain visible, but previous reconciliation passes
  already merged the useful storage, demo, production, render, health, and index
  work into `origin/main`. This run did not identify a newer remote branch tip
  that should supersede the current main lineage.
- Final reconciliation after push: `git rev-list --left-right --count
  origin/main...HEAD` returned `0 1`; `git branch --no-merged origin/main` and
  `git branch -r --no-merged origin/main` returned only the assigned branch
  `cursor/branch-reconciliation-and-merge-2e3f`.
- Final verification before push: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src
  python3 -B -m unittest discover -s tests &&
  PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests
  && git diff --check && git status --short --branch` -> 285 tests OK,
  compileall/diff-check exited 0, and the tree was clean.
- Independent review found one stale design-doc paragraph and suggested adding an
  explicit corrupt production-status regression. Both were addressed in
  `3d7590f`.

## Implementation continuation note - 2026-05-09 17:00 UTC

This run advanced the production-scheduler observability gap identified by the
16:30 handoff:

- Added `production_scheduler_report.json`, a strict durable report for dry-run
  production scheduler runs. The report is bound to the trusted production-plan
  fingerprint and the final `production_status.json`, and records completed,
  retryable, failed, blocked, attempted, skipped retryable, review-required,
  materialized-output, and failure-message details.
- Updated `dry-run-production-scheduler` so it requires `--generated-at`, writes
  the persisted report after loading final status, returns `report_path` in the
  summary payload, and can print the full report with `--print-report`.
- Preserved the explicit retry safety invariant: prior retryable jobs still need
  `--retryable-job`, and report persistence does not grant cleanup, deletion,
  overwrite, or arbitrary output authority.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future sessions treat production scheduler reporting as implemented
  infrastructure.

Good next test-first targets:

- Surface `production_status.json` and `production_scheduler_report.json` through
  workspace-health/workspace-index so Mac shells can show pre-render progress,
  retryable conflicts, blocked jobs, and safe next actions without parsing raw
  manifests directly.
- Add stale-running production lease planning/persistence before allowing
  multiple long-running local production workers.
- Begin a real local proxy/VLM/metadata worker adapter behind the existing
  production-worker action contract, preserving declared-output-only authority.

Branch reconciliation for this run:

- The assigned branch started equal to `origin/main` (`9256751`), and the remote
  tracking branch did not exist when fetched.
- `git rev-list --left-right --count origin/main...HEAD` returned `0 0`;
  `git branch -r --no-merged origin/main` and
  `git branch --no-merged origin/main` returned no unmerged branches.
- No older branch work was merged or rejected in this pass because all visible
  useful remote branch work was already reachable from `origin/main`.

## Implementation continuation note - 2026-05-09 16:30 UTC

This run advanced the production-side scheduler target identified by the 16:00
handoff:

- Added bounded dry-run production batch execution to `shootflow.production_adapter`.
  The batch runner accepts only trusted `ProductionWorkerActionPlan` objects,
  preserves serial jobs, runs parallel-safe jobs under a caller-supplied
  concurrency cap, records stale-action failures without broadening file
  authority, and keeps blocked jobs visible.
- Added `shootflow.production_scheduler`, an iterative pre-render scheduler that
  reloads trusted `production_status.json`, plans dependency-ready
  pending/retryable jobs, runs the dry-run production batch adapter, avoids
  hammering jobs that were already retryable or became retryable earlier in the
  same run, and stops with explicit
  complete/blocked/retryable/failed/waiting/max-iterations state. A prior
  retryable job must be explicitly passed as a reviewed retry candidate before a
  later scheduler invocation will attempt it again.
- Added CLI command `dry-run-production-scheduler --ingest-manifest ... --worker
  dry-run-production-local ...`, giving Mac shells and launch agents a persisted
  status-driven way to advance proxy, analysis, look, grading, storyline, and
  package jobs without reconstructing worker loops in UI code.
- Updated README, AGENTS, product strategy, business plan, and design decisions
  so future sessions treat production scheduler orchestration as implemented
  infrastructure.

Good next test-first targets:

- Persist a production scheduler report analogous to
  `deliverables/render_scheduler_report.json`, bound to the production-plan
  fingerprint and final `production_status.json`, so UI/index/continuation layers
  can validate pre-render progress without rerunning the scheduler.
- Add workspace-health/workspace-index visibility for production-status and
  production-scheduler state, including retryable/blocked job IDs and safe next
  action recommendations.
- Add stale-running production lease planning/persistence before allowing
  multiple long-running local production workers.

Branch reconciliation for this run:

- The assigned branch started at `origin/main` (`1ae7a63`); its remote tracking
  branch did not exist yet when fetched.
- Older remote branches remain visible, but previous reconciliation notes already
  identify them as stale/older-lineage or already incorporated into current
  `origin/main`. This run's useful work is the new production scheduler line and
  should be merged once tests and branch policy checks pass.

## Implementation continuation note - 2026-05-09 16:00 UTC

This run advanced the pre-render production execution proof point that the
previous run identified:

- Added `shootflow.production_adapter` with a deterministic
  `dry-run-production-local` adapter.
- `run_dry_run_production_action(...)` now consumes only a trusted
  `ProductionWorkerAction`, rebinds it to the trusted `ProductionPlan`, reloads
  `production_status.json`, persists a running claim with
  `compare_and_write_production_job_status(...)`, materializes deterministic
  placeholder bytes only to the action's declared file output paths, and persists
  either success checksums or a retryable no-delete error through the same
  guarded compare/write boundary.
- The adapter refuses stale claims before output materialization and preserves
  directory-style package outputs or existing different output files by reporting
  retryable status rather than overwriting or cleaning up media.
- Updated README, product strategy, business plan, and design decisions so future
  sessions treat the dry-run production adapter as implemented infrastructure.

Good next test-first targets:

- Add a bounded production batch/scheduler wrapper that reloads trusted
  `production_status.json`, plans dependency-ready actions with
  `plan_production_worker_actions(...)`, executes `dry-run-production-local`, and
  stops with explicit complete/blocked/retryable/failed/waiting state.
- Add stale-running production lease planning/persistence, mirroring the render
  lease contract before allowing concurrent local production workers.
- Add a CLI command or workspace-health/index extension that surfaces durable
  production-status progress and dry-run production scheduler outcomes to a Mac
  shell without mutating render handoffs.

Branch reconciliation for this run:

- Refreshed `origin/main` before and after implementation. Before merging this
  run's work, the only branch not reachable from `origin/main` was the assigned
  branch `origin/cursor/branch-reconciliation-and-merge-98f9`.
- Reviewed the only new branch diff, addressed independent review findings about
  public materialization bypass and directory-style package outputs, and
  fast-forwarded `main` to include the completed adapter commit.
- Pushed both `origin/cursor/branch-reconciliation-and-merge-98f9` and
  `origin/main` at the same adapter lineage. No older remote branch had new work
  to merge in this pass.

## Implementation continuation note - 2026-05-09 15:30 UTC

This run advanced the pre-render production execution boundary that the previous
run identified as the next test-first target:

- Added `compare_and_write_production_job_status(...)` plus
  `ProductionStatusPreconditionError`, giving `production_status.json` the same
  single-job guarded update shape as render status: local advisory lock,
  validated reload, expected state/attempt check, optional `updated_at` lease
  token, replacement of exactly one status, and no reset of unrelated progress.
- Added `shootflow.production_worker`, a renderer-neutral production worker
  contract for proxy/VLM/color/story/package jobs. It plans dependency-ready
  pending/retryable jobs from a trusted `ProductionPlan` and matching
  `ProductionStatusManifest`, reports blocked jobs with missing dependencies,
  claims one matching action as running, verifies declared output files before
  success, and reports retry/failure states without cleanup or deletion
  authority.
- Updated README, product strategy, business plan, and design decisions so future
  runs treat production-worker transitions as implemented infrastructure rather
  than an unresolved handoff gap.

Branch reconciliation for this run:

- Refreshed `origin/main` before and after implementation. Before this run's new
  commit, `git branch -r --no-merged origin/main` and
  `git branch --no-merged origin/main` returned no pre-existing feature branches
  with work stranded outside main.
- No older branch work was merged or rejected in this pass because the useful
  branch work from previous runs was already reachable from `origin/main`.
- This run's new production-worker work is intentionally left on the assigned
  branch for the automation PR flow. Cloud branch policy for this session says to
  push only `cursor/repository-branch-consolidation-d65c`, so do not manually
  push `main` from this checkout unless a later explicit instruction supersedes
  that policy.

Good next test-first targets:

- Persist production-worker claim/success/retry/failure transitions through a
  small adapter/scheduler wrapper that calls
  `compare_and_write_production_job_status(...)` for each planned action.
- Add stale-running production lease planning/persistence, mirroring the render
  lease contract before allowing concurrent local production workers.
- Add a deterministic dry-run production adapter that materializes placeholder
  proxy/analysis/look/graded/story outputs only at declared paths, then reports
  success through the new worker helpers.

## Implementation continuation note - 2026-05-09 15:00 UTC

Branch reconciliation found the active branch already aligned with
`origin/main`; after `git fetch origin main`, `git branch -r --no-merged
origin/main` returned no remote feature branches with work stranded outside main.
The remaining local `main` ref is still stale/behind, so compare future
reconciliation against `origin/main` unless it is explicitly fast-forwarded.

This run advanced the pre-render production orchestration layer:

- Added `plan_next_production_wave_from_status(...)`, which reloads the verified
  ingest manifest, rebuilds the deterministic production plan, loads trusted
  `production_status.json`, derives completed job IDs from succeeded statuses,
  and returns the next dependency-ready production jobs without writing analysis,
  graded, render-task, status, scheduler-report, or deliverable files.
  Superseded note: as of the 18:30 UTC handoff refinement, status-backed
  handoffs return only pending jobs as ready work; retryable jobs are
  review-required.
- `ProductionWaveHandoff` now carries `status_source`, `active_job_ids`, and
  `review_required_job_ids` so UI/agent consumers can distinguish legacy
  caller-reported progress from durable production status and avoid rescheduling
  running or failed jobs.
- `next-production-wave --use-production-status` exposes the durable status path
  on the CLI and rejects mixing that mode with `--completed-job` arguments.
- Documentation now treats status-backed next-wave planning as the product path
  before future production-worker claim/succeed/retry/fail helpers.

Good next test-first target: add production-worker transition helpers analogous
to the render-worker/status path, so proxy/VLM/grading/story jobs can claim a
pending/retryable production job, persist guarded status updates, verify declared
outputs, and report retry/failure without widening file authority or deleting
source/graded/deliverable media.

## Branch reconciliation note - 2026-05-09 15:00 UTC

This run refreshed remote branch state before implementation. The fetch pruned
older deleted `media-content-automation-*` branches and surfaced 24 remote
feature tips still not reachable from `origin/main`. Blindly merging those tips
would have downgraded the current consolidated core, because most were based on
the older `f30c6ec` lineage and lacked newer `workspace_health`,
`workspace_index`, `render_workspace`, demo-workspace hardening, and CLI
contracts.

Best-work reconciliation decisions:

- Integrated the missing synthetic card-dump-to-render demo workspace from the
  `ai-media-operating-system-c1c0` line onto the current core:
  `create-card-dump-demo-workspace` now builds fake card/SSD volumes, runs the
  real confirmed checksum ingest workflow, writes the resulting
  `ingest_manifest.json`, seeds deterministic trusted render-task demo inputs,
  and leaves render-status/scheduler report creation to the normal commands.
  A late-arriving consolidation branch added extra hardening that is also
  included here: ISO date validation before writes, synthetic capacity/read-only
  hints for deterministic routing, destination shoot-folder preflight, refusal of
  unexpected destination/source entries, and symlinked workspace-parent
  rejection.
- Added the storage-discovery regression from the native-volume-hints branches:
  hints for paths outside reviewed volume roots are ignored and cannot create a
  source/destination route.
- Integrated the new resumable `production_status.json` manifest from the
  production-status branches. It binds pre-render production job progress to the
  deterministic manifest-backed production-plan fingerprint and exposes
  `init-production-status --ingest-manifest <path>` without creating analysis,
  graded, render, or deliverable files.
- Kept current `macos_volume_metadata`, `storage_discovery`, `card_workflow`,
  `production_handoff`, `render_workspace`, `workspace_health`, and
  `workspace_index` implementations instead of replacing them with older branch
  variants. Those current modules have stricter validation, richer read-only
  summaries, render-input fingerprinting, and stronger safety tests.
- Did not add the older standalone `workspace_state` or parallel
  `render_inspection` modules because their useful read-only state behavior is
  already covered by the current `workspace_health`, `workspace_index`, and
  `render_workspace` surfaces. Future work can revisit "inspect outputs after
  render inputs are archived" as an explicit API change instead of introducing a
  duplicate inspection command.

Final verification after reconciliation:

```bash
git diff --check
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src python3 -B -m unittest discover -s tests
PYTHONPYCACHEPREFIX=/tmp/shootflow-pycache python3 -m compileall -q src tests
git branch -r --no-merged origin/main
git status --short --branch
```

Result: 256 tests passed, compileall and diff-check exited 0, no remote feature
branches remained unmerged into `origin/main`, and the working tree was clean.
Optional `python3 -m ruff check src/ tests/` still reports the two known
pre-existing unused imports in `tests/test_render_worker.py` and
`tests/test_story.py`.

## Branch consolidation note - 2026-05-09 01:00 UTC

The assigned branch `cursor/ai-media-operating-system-9806` started as an
ancestor of the latest verified `origin/cursor/ai-media-operating-system-515f`
lineage, so this run first fast-forwarded to that baseline and pushed it to the
assigned branch.

This run then added render-input provenance to the read-only continuation
surfaces:

- `shootflow.workspace_health.build_workspace_health_summary(...)` now computes
  a deterministic `render_inputs_fingerprint` and `render_input_count` for the
  unique trusted storyline/graded input files referenced by
  `deliverables/render_tasks.json`.
- `python -m shootflow.cli workspace-health --workspace <dir>` exposes those
  fields in its schema-versioned JSON (now schema version 2) without writing,
  repairing, deleting, or advancing any workspace artifact.
- `shootflow.workspace_index.build_workspace_index(...)` carries the same fields
  inside the derived `workspace_health` artifact, so persisted
  `shootflow_workspace_index.json` snapshots can be compared by future agents or
  native shells to notice in-place storyline/graded input changes.
- This is intentionally metadata-only. The trusted render task manifest remains
  the source of path authority, while the fingerprint helps detect drift between
  snapshots before future real renderers trust old status/report context.

## Branch consolidation note - 2026-05-08 23:30 UTC

The assigned branch `cursor/autonomous-media-studio-8ebc` started this cron run
at `origin/main`, so it first merged the already-verified
`origin/cursor/ai-media-operating-system-d72f` lineage and pushed that merge as
`merge: consolidate prior autonomous media studio iteration`.

This run then added a read-only continuation health layer:

- `shootflow.workspace_health.build_workspace_health_summary(...)` validates the
  trusted render-task manifest, matching render-status manifest, and scheduler
  report when present, summarizes render status counts, and returns a single next
  safe action without writing or repairing files.
- `python -m shootflow.cli workspace-health --workspace <dir>` prints the same
  schema-versioned JSON for Mac shells, launch agents, and future autonomous
  runs.
- Invalid handoffs are reported as review actions (`review_invalid_render_*`)
  instead of being overwritten or reset; missing handoffs are treated as normal
  workflow state (`write_render_tasks` / `init_render_status` /
  `run_dry_run_render_scheduler`).
- A post-implementation review found that valid scheduler reports with
  retryable/failed/blocked work should not recommend another scheduler run. The
  follow-up fix now routes any valid non-complete scheduler report to
  `review_scheduler_report`, with regression coverage for a retryable report.

Fresh verification after this change:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
python3 -m compileall -q src tests
git diff --check
```

Final result after the review follow-up: 184 tests passed; compileall and
diff-check exited 0.

## Branch consolidation note - 2026-05-08 23:00 UTC

The assigned branch `cursor/ai-media-operating-system-d72f` started this run at
`origin/main` and did not contain the richer autonomous media-studio work already
verified on `origin/cursor/autonomous-media-studio-3cfb`. This run merged that
branch into the assigned branch with merge commit
`merge: consolidate autonomous media studio work`, then pushed
`cursor/ai-media-operating-system-d72f` to origin.

Fresh post-merge verification on the assigned branch:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

Result: 179 tests passed. Future agents should continue from
`cursor/ai-media-operating-system-d72f` and treat the prior
`cursor/autonomous-media-studio-3cfb` / `cursor/ai-media-operating-system-37cf`
lineage as consolidated into this assigned branch unless new remote commits
appear there.

## Branch consolidation note - 2026-05-08 21:30 UTC

The assigned branch `cursor/autonomous-media-studio-3cfb` was intentionally
advanced from `origin/main` by merging the previously verified sibling branch
`origin/cursor/ai-media-operating-system-37cf`. This brings the native macOS
volume metadata bridge, real-shoot `write-render-tasks` CLI handoff, advisory
CLI `next_actions`, hard-link fallback, documentation, and 179-test regression
suite onto the active automation branch without changing the safety invariants
below. Future agents should continue from this branch rather than reimplementing
that sibling work.

Review follow-up on this branch hardened the render-task handoff after a
multi-agent review pass:

- `shootflow.assembly.ensure_render_tasks_manifest(...)` now reports whether the
  trusted manifest was created or safely reused, while preserving
  `write_render_tasks_manifest(...)` as the existing path-returning wrapper.
- Temporary render-task manifest write failures are wrapped as
  `AssemblyPlanError` and clean up partial `.tmp` files, so transient disk
  failures do not poison later retries with stale temp manifests.
- `write-render-tasks` now uses the single assembly-layer create/reuse policy,
  so concurrent matching manifest creation is reported as `created: false`.
- Empty native macOS metadata recommendation input now returns the same blocked,
  review-required route as "all native records skipped"; the lower-level
  converter still treats an empty candidate conversion call as invalid.
- Added regression coverage for those cases plus preview-only and blocked
  `card-dump-workflow` `next_actions`.

## Current direction

ShootFlow is being shaped as a Mac-first, iPhone-companion product for safe high-volume ingest, bulk color/story processing, and Instagram deliverables. The current implementation is a Python core that defines safety and planning contracts before native UI or renderer work begins.

## What landed in this iteration

- Added advisory native volume metadata hints for Swift/native shell integration:
  - `shootflow.storage_discovery.VolumeDiscoveryHint` lets a future Swift/Disk
    Arbitration or iPhone shell pass display names, removable status, and
    read-only status keyed by discovered volume path;
  - `discover_storage_candidates(..., volume_hints=...)` applies those hints only
    after a path is discovered under a reviewed volume root and still skips
    symlinks, files, inaccessible entries, and paths without filesystem stats;
  - read-only hints are conservative: `is_read_only=True` can prevent automatic
    destination selection, but `is_read_only=False` cannot override a failed
    filesystem writability check;
  - `discover_import_route(..., volume_hints=...)` carries the same metadata
    into source/destination ranking and capacity-gated route recommendation;
  - `run_card_dump_workflow(..., volume_hints=...)` carries the hint map through
    both the initial route pass and the source-size capacity-gated second pass,
    giving native shells one API for detected-volume metadata through the
    full card-dump workflow.
- Added a native macOS metadata adapter for future Swift/Disk Arbitration
  integration:
  - `shootflow.macos_volume_metadata.MacOSVolumeMetadata` captures typed native
    volume facts: name, mount path, free/total bytes, removable/ejectable/internal
    flags, read-only, network, and system-volume state;
  - `storage_candidates_from_macos_metadata(...)` validates the records, skips
    system volumes, network volumes, missing mounts, file-backed mounts, symlinked
    mount leaves, and symlinked mount parents, then maps usable records into the
    existing `StorageCandidate` ranking contract;
  - ejectable external drives are treated as removable for ranking while internal
    or ejectable detail remains advisory and cannot bypass review;
  - `recommend_import_route_from_macos_metadata(...)` reuses the same
    review-required and capacity-gated route recommendation logic as portable
    discovery, including a clean blocked report when all native records are
    skipped;
  - the adapter remains pure and non-destructive: no copy, delete, eject, format,
    recursive scan, or UI approval authority.
- Added `tests/test_macos_volume_metadata.py` covering native record conversion,
  unsafe record skipping, capacity-gated routing, all-skipped blocked
  recommendations, and validation of metadata/capacity arguments.
- Updated README, product strategy, business plan, design decisions, package
  exports, and continuation notes so the next agent can treat native metadata as
  the bridge between portable `/Volumes` scanning and a future SwiftUI/menu-bar
  approval shell.
- Added a real-shoot persisted assembly CLI handoff:
  - `python -m shootflow.cli write-render-tasks --ingest-manifest <path>` reloads
    the verified ingest manifest, rebuilds the production plan, verifies trusted
    `analysis/instagram_storylines.json` selections plus `graded/` artifacts
    through `shootflow.assembly`, then creates or reuses
    `deliverables/render_tasks.json`;
  - `--photo-set-chunk-size` exposes the existing high-volume chunking contract;
  - an existing different render-task manifest is rejected instead of overwritten;
  - the command writes no deliverable outputs, renders no media, and deletes no
    source files.
- Added tests covering successful render-task handoff creation, refusal to
  replace an existing different handoff, reuse of an existing matching handoff,
  and friendly CLI reporting for invalid ingest-manifest JSON.
- Updated README/product/business/design docs to place `write-render-tasks`
  between trusted storyline/grading work and `init-render-status`.
- Added machine-readable CLI `next_actions` fields:
  - confirmed `card-dump-workflow` reports now point native shells at the trusted
    storyline/graded-artifact preparation step and the exact
    `write-render-tasks --ingest-manifest <path>` handoff;
  - `write-render-tasks` summaries now point at `init-render-status` and
    `dry-run-render-scheduler`, including the trusted non-render dependencies
    each render task needs while still listing scheduler runtime arguments that
    must be supplied by the caller;
  - these fields are advisory orchestration hints only and grant no new copy,
    render, overwrite, delete, or source-media authority.
- Hardened the render-task manifest writer for external/media filesystems that
  do not support hard links: it still prefers the hard-link no-clobber commit,
  but falls back to exclusive final-file creation instead of surfacing an
  uncaught `OSError`.
- Added regression coverage that follows the emitted `write-render-tasks`
  `next_actions` through `init-render-status` and the dry-run scheduler, plus
  coverage for hard-link-unsupported manifest creation.
- Added the first workspace index handoff:
  - `shootflow.workspace_index.build_workspace_index(...)` inspects a shoot
    workspace and summarizes ingest manifests, derived production plans,
    storyline artifacts, render tasks, render status, and scheduler reports;
  - trusted artifacts are loaded through their existing validators, while
    standalone `analysis/instagram_storylines.json` is reported as
    `present_unvalidated` until rebound to a manifest-backed production plan;
  - `write_workspace_index(...)` persists only
    `shootflow_workspace_index.json` through a no-follow temporary metadata file
    and rejects symlinked index paths;
  - `python -m shootflow.cli index-workspace --workspace <dir>
    --generated-at <timestamp> [--write]` prints the same JSON for Mac app
    shells, background agents, and continuation runs.
- Added focused tests for building the index from the persisted CLI demo
  workspace, safe write/load behavior with symlink rejection, and CLI printing
  plus optional persistence.
- Updated README and strategy/design/business/legal docs to position the index
  as a metadata-only continuity artifact, not a new source of render authority.
- This branch then folded the read-only workspace health signal into the index
  as a derived `workspace_health` artifact. `index-workspace` now carries the
  same next safe action as `workspace-health` while remaining metadata-only and
  non-advancing.
- Review follow-up canonicalized workspace roots for persisted indexes, rejects
  missing `workspace-health --workspace` paths instead of emitting misleading
  next actions, and removed new source lint regressions in render-task manifest
  creation.
- Added an explicit renderer-adapter dispatch boundary:
  - `shootflow.render_adapter.supported_render_adapter_names()` now exposes the
    registered local adapters, currently only `dry-run-local`;
  - `shootflow.render_adapter.run_render_adapter_batch(...)` validates a trusted
    `RenderWorkerActionPlan`, refuses unsupported adapter names before any worker
    action is claimed, and then dispatches to the registered batch runner;
  - `shootflow.render_scheduler.run_dry_run_render_scheduler(...)` now validates
    adapter support before stale-lease expiration, status writes, or output
    materialization, so syntactically valid future names such as `ffmpeg-local`
    cannot accidentally run through the dry-run path;
  - the lower-level public dry-run entry points
    `run_dry_run_render_batch(...)`, `run_dry_run_render_action(...)`, and
    `materialize_dry_run_render_outputs(...)` now require `dry-run-local`
    actions/plans, closing the direct-call bypass found during code review.
- Added focused tests for registered dry-run dispatch, unsupported adapter
  rejection without status writes, scheduler-level unsupported adapter rejection,
  and direct dry-run entrypoint guards.
- Added a read-only render workspace inspection handoff:
  - `shootflow.render_workspace.inspect_render_workspace(...)` starts from the
    strict persisted `deliverables/render_tasks.json` manifest, treats a missing
    render-status file as `needs_status_initialization` without writing one, and
    validates matching status/scheduler reports when they exist;
  - `python -m shootflow.cli inspect-render-workspace --workspace <dir>` prints a
    schema-versioned JSON state summary with task counts, expected outputs,
    materialized outputs, review-required task IDs, and safe next actions for a
    Mac UI, launch agent, or continuation agent;
  - stale or conflicting scheduler reports fail closed instead of becoming UI
    truth; symlinked output paths are refused, and succeeded tasks whose
    declared deliverables are missing or whose bytes no longer match their
    recorded SHA-256 checksums are surfaced for render-output review.
- Added CLI tests covering missing-status inspection with no side effects,
  completed demo-workspace inspection after scheduler execution, stale
  scheduler-report rejection, missing succeeded-output review states, and
  checksum-mismatched output review states.
- Added machine-readable agent handoff state to `card-dump-workflow` success
  JSON:
  - each blocked, preview-ready, and ingest-complete response now includes an
    `agent_handoff` object with `next_step`, `human_review_required`,
    `safe_to_rerun`, `next_step_may_copy_bytes`, and `requires_confirm_ingest`;
  - blocked discovery reports `fix_route`, preview-only reports `review_preview`
    and marks the next confirmed step as copy-capable, and completed ingest
    reports `review_production_plan`;
  - this keeps Mac shells, launch agents, and continuation automations from
    parsing prose safety notes to decide whether a human must review or whether
    a next step can move bytes.
- Extended card-dump CLI tests to pin the handoff contract across blocked,
  preview-only, and confirmed-ingest states.
- Branch reconciliation notes for this cron run:
  - remote `main` advanced during the session and already integrated the
    workspace health/index line, adapter-dispatch registry, render-workspace
    inspection, card-dump agent handoff, native `VolumeDiscoveryHint` routing,
    and next-production-wave handoff;
  - the active branch was rebased by merge onto that advanced `origin/main`
    rather than pushing over it;
  - retained the public `create-demo-workspace` CLI handoff from
    `origin/cursor/ai-media-operating-system-255f` because `main` still lacked a
    direct native-shell command for creating the trusted persisted demo workspace;
  - retained strict `--volume-metadata-json` parsing on `plan-import-route` and
    `card-dump-workflow`, mapped onto the current `VolumeDiscoveryHint` contract,
    because it gives Swift/Menu Bar shells one file-based handoff for display
    name, capacity, removable, and read-only facts without granting copy/delete
    authority;
  - added `StorageDiscoveryError` so inconsistent native capacity overrides,
    including partial `free_bytes` overrides that exceed the filesystem total,
    return the normal `shootflow: ...` CLI error path instead of surfacing a raw
    traceback;
  - left older duplicate macOS/metadata/demo/workspace-state branches unmerged
    unless their exact capability is not represented by advanced `main` plus this
    branch's demo and metadata-JSON additions.

## Previous iteration

- Added the first unified card-dump workflow handoff:
  - `shootflow.card_workflow.run_card_dump_workflow(...)` composes mounted-volume
    discovery, source media size estimation, capacity-gated route recommendation,
    checksum ingest preview, optional confirmed copy, and read-only production
    reporting;
  - `python -m shootflow.cli card-dump-workflow` prints one schema-versioned JSON
    report for Mac app shells, launch agents, and GTM demos;
  - without `--confirm-ingest`, it only discovers/estimates/previews and copies
    no bytes; with `--confirm-ingest`, it runs the existing safe ingest boundary
    and then `plan-production` from the manifest;
  - destination subfolders such as `ShootFlow` are constrained to relative paths
    under the selected destination volume, preserving the no-escape/no-delete
    design posture.
- Added CLI tests covering preview-only operation with no destination side
  effects, confirmed ingest plus production reporting without downstream
  analysis/graded/deliverable writes, and blocked no-candidate route behavior.
- Updated README and product/business/design/legal/continuation docs to position
  this command as the next native-shell proof point between drive detection and
  AI/color execution.

## Previous iteration

- Added a read-only post-ingest production-plan handoff:
  - `shootflow.production_report.build_production_plan_report(...)` reloads a
    verified `ingest_manifest.json`, builds the deterministic production plan,
    and returns asset counts, job counts, wave summaries, and planned Instagram
    deliverables;
  - `python -m shootflow.cli plan-production --ingest-manifest <path>` prints
    that report as compact JSON for a Mac app, launch agent, or native-shell
    demo;
  - the command creates no `analysis/`, `graded/`, `deliverables/`, render-task,
    status, or scheduler-report files, so it is safe to run immediately after
    card offload before starting AI/color work.
- Added CLI tests covering a real `execute-ingest --confirm` output feeding the
  new production-plan report, preserving copied WAV/scratch audio in the ingest
  manifest while excluding it from photo/video production assets, and rejecting
  manifests that claim source media was deleted without downstream side effects.
- Updated README, design/product/business/legal docs to describe the new safe
  "what happens next" screen between ingest and production execution.

## Previous iteration

- Added `shootflow.demo_workspace` as a safe persisted CLI smoke/demo helper:
  - `create_persisted_cli_demo_workspace(...)` writes deterministic placeholder
    storyline/graded inputs plus `deliverables/render_tasks.json` for a tiny
    reel, reel variant, carousel, and photo-set package;
  - it refuses symlinked workspace roots, refuses existing different input files,
    and refuses to overwrite an existing different render-task manifest;
  - it deliberately does not create render status, scheduler reports, source
    media, or deliverable outputs so demos still exercise the real
    `init-render-status` and `dry-run-render-scheduler` path.
- Added a CLI smoke test that creates the demo workspace, initializes render
  status, runs the dry-run scheduler with bounded concurrency, reloads the
  persisted scheduler report, and verifies all expected outputs materialize
  through the trusted status/report boundary.
- Updated README/product/business/design docs to treat the demo helper as the
  current proof point for Mac UI shells, launch-agent smoke tests, and GTM demos.

## Previous iteration

- Added safe-ingest CLI commands that finally let a Mac launch agent or human
  operator drive the existing `shootflow.ingest` contracts from the command
  line:
  - `python -m shootflow.cli preview-ingest` wraps `plan_import(...)` and
    prints the planned items, SHA-256 checksums, sizes, and shoot folder as
    indented JSON. It never copies bytes and never writes a manifest, so it
    is safe to run repeatedly during operator review.
  - `python -m shootflow.cli execute-ingest` wraps `plan_import(...)` plus
    `execute_copy_plan(...)`. Without `--confirm` it refuses to run and prints
    a friendly stderr hint pointing at `preview-ingest`. With `--confirm` it
    performs the existing safety contract: no source deletion, no overwriting
    different bytes, SHA-256-verified copies through temp files, and a
    deterministic `ingest_manifest.json`.
- Widened `shootflow.cli.main`'s exception handling to also surface
  `IngestError` and `FileNotFoundError` as `shootflow: <message>` on stderr
  with exit code 1, without changing how the existing render-side or
  import-route commands behave.
- Added five focused CLI tests in a new `ShootFlowIngestCliTests` class:
  preview happy-path, `--confirm` refusal, `--confirm` success with manifest
  verification, symlinked-source rejection without destination side-effects,
  and shoot-slug validation surfacing as a stderr error.
- Updated README to document the `preview-ingest` / `execute-ingest --confirm`
  flow as the operator-facing handoff after `plan-import-route`.

## Previous iteration

- Added source-size estimation to ingest planning:
  - `estimate_import_source(...)` in `shootflow.ingest` reports media file count
    and estimated bytes for a reviewed source path without copying or deleting
    files;
  - this estimate can drive destination capacity checks before import starts.
- Added `python -m shootflow.cli plan-import-route`:
  - scans caller-provided volume roots, emits a review-required source/destination
    route recommendation, and can include discovered candidates in JSON output;
  - supports `--estimate-source-bytes` to estimate payload from the discovered
    source and enforce capacity headroom via the existing capacity-gated routing
    contract;
  - remains advisory-only and non-destructive (no copy, no delete, no format).
- Added CLI and ingest tests covering source-size estimation, successful route
  planning, blocked no-volume behavior, and conflicting capacity-input rejection.
- Updated README, product strategy, business plan, terms draft, and design
  decisions with deeper guidance on offload safety policy, ICP packaging
  strategy, monetization/validation guardrails, and indemnification/liability
  draft language.
- Added safe render-status bootstrapping for persisted render-task handoffs:
  - `initialize_render_status_manifest(...)` in `shootflow.render_status` loads
    an existing fingerprint-matching `deliverables/render_status.json` as-is or
    creates the first all-pending manifest only when the file is missing;
  - initialization holds the existing local advisory lock across the check/create
    path so two Mac launch agents do not both initialize from stale state;
  - stale, malformed, symlinked, or render-plan-mismatched status files are
    rejected instead of overwritten, preserving the no-reset/no-delete safety
    contract.
- Added `python -m shootflow.cli init-render-status`:
  - loads the strict persisted `deliverables/render_tasks.json` manifest as the
    trusted plan;
  - creates or reuses `deliverables/render_status.json`;
  - prints a compact JSON summary with task counts by status for Mac UI,
    background-agent, or smoke-test automation.
- Added tests covering initial creation, idempotent reuse with retryable/running
  progress preserved, stale fingerprint rejection, CLI JSON summaries, and CLI
  stale-status failures.
- Updated README, product strategy, business plan, and design decisions to
  document the two-step persisted-manifest flow:
  `init-render-status` then `dry-run-render-scheduler`.
- Added `shootflow.storage_discovery`:
  - `discover_storage_candidates(...)` validates caller-provided volume roots,
    scans only immediate child directories, skips symlinked/non-directory/inaccessible
    entries, reads filesystem capacity with `statvfs`, and emits conservative
    `StorageCandidate` records for the existing storage ranking layer;
  - `discover_import_route(...)` composes discovery with the existing reviewed
    import-route recommendation, including the high-volume capacity gate when an
    estimated import size is supplied;
  - empty volume roots now produce a blocked, review-required recommendation
    with no-delete/checksum safety notes instead of crashing a future Mac UI.
- Added `tests/test_storage_discovery.py` for mounted-volume discovery, symlink/file
  skipping, argument validation, capacity-gated route composition, and empty-volume
  blocked recommendations.
- Updated README, design/product/business/legal docs, and AGENTS notes to treat
  both render-status bootstrapping and mounted-volume discovery as the current
  Mac app/background-agent handoffs before native macOS Disk Arbitration or
  SwiftUI approval work.

## Previous iteration

- Added high-volume-aware import-route capacity gating in `shootflow.storage`:
  - new `recommend_import_route_with_capacity(...)` takes `expected_import_bytes`
    plus configurable `headroom_bytes`;
  - destination recommendation is blocked when free space is insufficient for the
    estimated import plus safety headroom;
  - recommendation safety notes now include the active capacity gate requirement;
  - preserved non-destructive route semantics (review required, no source deletion
    authority, checksum-manifest reminder).
- Added storage tests for:
  - capacity-gated destination rejection with explicit safety notes;
  - capacity-gated ready route when destination free space is sufficient;
  - capacity-gated argument validation.
- Deepened product docs:
  - `docs/PRODUCT_STRATEGY.md` now includes explicit ICP prioritization,
    Mac-first packaging rationale, monetization shape, and Instagram-led GTM
    framing;
  - `docs/BUSINESS_PLAN.md` added as a dedicated business/monetization/GTM and
    execution artifact;
  - `docs/TERMS_AND_CONDITIONS_DRAFT.md` now includes explicit draft clause
    language for indemnification and non-destructive file handling.

## Previous iteration

- Fast-forwarded the active branch from the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-5b63`, pushed that baseline to
  `cursor/media-content-automation-8119`, then added a reviewed storage import-route recommendation layer.
- Added `ImportRouteRecommendation` and `recommend_import_route(...)` in `shootflow.storage`:
  - validates public candidate arguments before ranking;
  - selects a likely camera-card/source candidate and a distinct automatic writable destination candidate only when
    that destination is still a mounted directory and is not nested inside the selected source tree;
  - returns `ready_for_review` only when both sides exist, otherwise returns `blocked` with missing-source or
    missing-destination safety notes;
  - always marks the recommendation as review-required and includes no-delete, checksum-manifest, and
    backup-verification notes so native UI/agent layers cannot treat drive detection as permission to delete or
    blindly import media.
- Added storage tests for a camera-card-to-SSD route, blocked missing-destination behavior, and invalid candidate
  argument validation, then added regression coverage for stale/unmounted destinations and destinations inside the
  selected source.
- Updated README, product strategy, and design decisions to position this as the Mac ingest-assistant contract
  before actual `shootflow.ingest` copy execution.

## Previous iteration

- Fast-forwarded the active branch from the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-301d`, pushed that baseline to
  `cursor/media-content-automation-5b63`, then added the first persisted-manifest scheduler CLI.
- Added `load_trusted_render_tasks_manifest(...)` in `shootflow.assembly`:
  - loads `deliverables/render_tasks.json` without requiring an already in-memory `AssemblyPlan`;
  - still rejects unknown fields, unsafe inputs/outputs, noncanonical tasks, symlinked manifests, stale temp paths, and
    persisted task inputs that are missing, directories, or symlinks;
  - lets background agents treat the strict persisted render-task handoff as the trusted plan when paired with the
    fingerprint-bound render-status manifest.
- Added `shootflow.cli` with `python -m shootflow.cli dry-run-render-scheduler`:
  - loads the trusted persisted render tasks, runs `run_dry_run_render_scheduler(...)`, reloads final status, writes
    `deliverables/render_scheduler_report.json`, and optionally prints that report JSON;
  - keeps the command as a thin wrapper around existing trusted core APIs instead of adding renderer authority;
  - exposes repeatable `--completed-dependency`, bounded `--max-concurrency`/`--max-iterations`, stale lease arguments,
    and explicit started/completed/generated timestamps for Mac launch agents and automation runners.
- Added CLI tests for successful report writing/printing and unsafe manifest rejection, plus assembly tests for the
  new trusted persisted-manifest loader.
- Updated README, product strategy, and design decisions to mark persisted-manifest CLI scheduling as the current
  Mac UI/background-agent handoff.

## Previous iteration

- Fast-forwarded the active branch from the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-47b6`, pushed that baseline to
  `cursor/media-content-automation-301d`, then added a product-facing scheduler report handoff.
- Added strict scheduler report persistence in `shootflow.render_scheduler`:
  - `write_dry_run_render_scheduler_report(...)` converts a scheduler result plus final trusted
    `RenderStatusManifest` into `deliverables/render_scheduler_report.json`;
  - the report is bound to the trusted `AssemblyPlan` render-plan fingerprint and final status manifest, so it cannot
    invent tasks, outputs, or review-required state;
  - it records completed, retryable, failed, blocked, attempted, skipped-retryable, expired-lease, conflicted-lease,
    review-required, materialized-output, and failure-message details for a Mac UI, retry flow, or next automation run;
  - `load_dry_run_render_scheduler_report(...)` rejects stale fingerprints, unknown task IDs, unknown materialized
    outputs, inconsistent review-required IDs, unknown fields, and malformed failure-message records;
  - report writes use a no-follow temporary file and replace only the metadata report, while renderers still consume
    trusted render tasks/status and receive no new file authority.
- Added scheduler report tests for successful UI summaries, retryable/manual-output conflicts that preserve the existing
  file, and stale fingerprint rejection.
- Updated README, product strategy, and design decisions to describe the scheduler report as the current Mac
  UI/background-agent handoff.

## Previous iteration

- Fast-forwarded the active branch from the initial commit to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-ccd0`, pushed that baseline to
  `cursor/media-content-automation-47b6`, then added the first iterative dry-run render scheduler.
- Added `shootflow.render_scheduler`:
  - exposes `run_dry_run_render_scheduler(...)` for a local Mac/background-agent style loop that reloads
    trusted render status each pass;
  - optionally plans and persists stale-running leases before scheduling ready work, using the same guarded
    lease persistence path and caller-supplied cutoff/updated timestamps;
  - plans dependency-ready worker actions from the trusted task/status pair and runs them through
    `run_dry_run_render_batch(...)` with bounded concurrency;
  - stops with explicit `complete`, `blocked`, `retryable`, `failed`, `waiting`, or `max_iterations` reasons and returns
    final succeeded/retryable/failed/blocked task IDs for UI/retry decisions;
  - skips tasks already attempted in the same scheduler run if they come back as retryable, so a persistent
    output conflict or manual editor export is preserved for review instead of being hammered repeatedly.
- Added scheduler tests for ready-batch completion, stale lease recovery into a new attempt, and retryable
  output conflicts that are attempted once without overwriting manual files.
- Updated README, product strategy, and design decisions to make the iterative scheduler the current orchestration
  boundary before real renderer backends.

## Previous iteration

- Fast-forwarded the active branch from the initial commit to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-8ef1`, pushed that baseline to
  `cursor/media-content-automation-ccd0`, then added stale lease persistence.
- Added `persist_stale_render_leases(...)` in `shootflow.render_worker`:
  - consumes a trusted `RenderLeaseExpirationPlan` from `plan_stale_render_leases(...)`;
  - persists each expired lease through `compare_and_write_render_task_status(...)` with
    `expected_state="running"`, the original attempt count, and `expected_updated_at=running_since`;
  - returns persisted lease records with the updated manifest for successful expirations;
  - returns task-level conflict records for compare/write precondition failures so heartbeat-refresh wins are
    surfaced as "another worker already changed this task" instead of being clobbered;
  - keeps conflict messages explicit that no source, graded, or deliverable files were deleted or cleaned up.
- Added render-worker tests for multi-lease persistence and conflict reporting without manifest clobbering.
- Updated README, product strategy, and design decisions to make lease persistence the current safe retry
  boundary for future scheduler loops.

## Previous iteration

- Fast-forwarded the active branch from the initial commit to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-d522`, pushed that baseline to
  `cursor/media-content-automation-8ef1`, then added the first dry-run batch scheduler.
- Added `run_dry_run_render_batch(...)` in `shootflow.render_adapter`:
  - consumes only a trusted `RenderWorkerActionPlan` produced by the existing render-worker planner;
  - binds every action's task ID, sequence/source/output metadata, inputs, outputs, dependencies, and
    parallelism flag back to the trusted `AssemblyPlan` before any claim or output materialization;
  - executes serial-only actions alone and contiguous parallel-safe action groups through a bounded
    `ThreadPoolExecutor` with caller-provided `max_concurrency`;
  - preserves action-order reporting even when parallel tasks finish out of order;
  - leaves `blocked_tasks` untouched and reports their task IDs for UI/scheduler visibility;
  - catches stale scheduler-level action failures, records explicit no-deletion failure messages, and does
    not materialize outputs for those stale actions;
  - still routes every real claim/result through `run_dry_run_render_action(...)`, which reloads the trusted
    status manifest and uses `compare_and_write_render_task_status(...)` for each task transition.
- Added focused render-adapter tests for successful mixed serial/parallel batches with blocked tasks, stale
  action-plan entries that fail without producing outputs while later ready actions continue, and forged
  action outputs that are rejected before any file is materialized.
- Updated README, product strategy, and design decisions to describe bounded batch execution as the next
  high-volume renderer-scheduler proof point.

## Previous iteration

- Merged the prior `shootflow` foundation onto the active branch.
- Added a strict `deliverables/render_tasks.json` manifest contract in `shootflow.assembly`:
  - writes deterministic, sorted JSON from trusted `AssemblyPlan` render tasks;
  - loads the manifest only when it exactly matches the trusted in-memory assembly plan;
  - rejects unknown manifest/task fields, unsafe analysis/graded inputs, unsafe deliverable outputs,
    symlinked manifest paths, and symlinked temporary manifest paths;
  - gives future render workers a resumable handoff without letting stale or model-authored JSON expand
    the renderer's file access.
- Added `shootflow.assembly` for renderer-neutral social assembly planning:
  - consumes `analysis/instagram_storylines.json` through the trusted storyline loader;
  - accepts only graded outputs from the manifest-backed `ProductionPlan`, never raw originals;
  - verifies selected graded files exist in the workspace before building render tasks;
  - rejects symlinked selected graded assets before a renderer can read through them;
  - enforces that reels use graded video assets and carousels/photo sets use graded photo assets;
  - produces deterministic output paths under `deliverables/` for reel, carousel slides, and photo-set
    JPEGs.
- Added a serialized storyline artifact contract around `StorylinePlan`:
  - writes deterministic JSON to `analysis/instagram_storylines.json`;
  - round-trips reel, carousel, and photo-set sequences with output kind, aspect ratio, asset paths,
    durations, and rationale;
  - rejects storyline artifacts that reference assets outside the trusted loaded analysis/graded
    artifact set;
  - avoids symlinked workspace/artifact paths and writes through a temporary file before replacement.
- Added `shootflow.analysis` for manifest/production-plan-backed VLM analysis loading:
  - loads only planned `analysis/00000.json` style per-asset files;
  - requires analysis to match the planned raw source asset and media type;
  - binds story inputs to graded artifact outputs, not originals;
  - rejects symlinked analysis files, unplanned numbered files, bad schemas, non-finite scores, invalid
    durations, and malformed tags;
  - covers a 10,000-record load path so future storyline planning remains high-volume friendly.
- Added `shootflow.story` for deterministic VLM-driven content selection:
  - validates per-asset analysis paths, media types, scene labels, and scores;
  - builds a first-cut reel from high-scoring video selects with scene diversity;
  - builds a carousel from scene-diverse photo selects;
  - preserves a full ranked photo set so valuable graded intermediates are not dropped.
- Updated production planning so Instagram deliverable assembly depends on a serialized `rank_instagram_storylines` job after scene grouping, look development, and graded-master rendering.
- Expanded product/legal docs around the story-planning layer, indemnification caution, and file deletion safety.

## Earlier render-worker planning iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-cd73` and pushed it to
  `cursor/media-content-automation-33f5`.
- Added deterministic multi-reel storyline variants:
  - `StorylinePlan` now carries named `ReelVariant` records alongside the existing default reel, carousel,
    and photo-set sequences;
  - `build_storyline_plan` emits `hero`, `behind_the_scenes`, and `fast_cut` variants from the same trusted
    VLM analysis records, keeping the default `plan.reel` behavior as the stable first cut;
  - `analysis/instagram_storylines.json` is now schema version 2 with a strict `reel_variants` list, while
    the loader still accepts legacy schema version 1 artifacts with no variants;
  - variant validation uses the same allowlist as primary sequences, so model-authored JSON cannot point a
    reel variant at raw originals or arbitrary files.
- Extended assembly planning for named reel variants:
  - default reels still render to `deliverables/instagram_reel.mp4`;
  - named variants render to collision-free paths such as `deliverables/instagram_reels/fast_cut.mp4`;
  - variant tasks use selected graded video inputs only, depend only on `rank_instagram_storylines` plus
    their selected grade jobs, and can be scheduled independently by future render workers;
  - render task manifest validation now accepts these deterministic variant task IDs/outputs without adding
    new model-controlled fields to the manifest.

## Design decisions to preserve

- Source media deletion remains out of scope.
- Ingest manifests are the boundary between file operations and AI/editing work.
- VLM/story outputs may rank and select content, but must not drive destructive file actions or override
  the manifest-backed production plan.
- Storyline inputs should reference graded artifacts; raw/original paths stay behind the catalog and
  production planning boundary.
- `analysis/instagram_storylines.json` is an edit-decision artifact. Renderers should consume the derived
  `deliverables/render_tasks.json` handoff, not ad hoc model JSON, and should still verify referenced
  graded artifacts before opening media files.
- Assembly tasks are still contracts, not renderers. They should remain deterministic and renderer-neutral
  until the project chooses a local Metal/Core Image, ffmpeg/LUT, DaVinci Resolve, or cloud GPU backend.
- Reel variants are review/export alternatives, not destructive edits. Keep the stable default reel path
  for backwards compatibility and put variants under `deliverables/instagram_reels/`.
- Photo-set chunking is a render-worker scheduling boundary only. It must not change graded artifact names,
  public photo output numbering, storyline ranking, or source-media handling.
- First-cut reel selection intentionally prefers one strong clip per scene before repeated coverage. Future iterations can add alternate reel variants for longer cuts.
- Full photo-set exports stay ranked but not capped; carousel is capped for Instagram.

## What landed in this iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-6863`, pushed that baseline to
  `cursor/media-content-automation-26a1`, then added one focused render-worker lease layer.
- Added `plan_stale_render_leases(...)` in `shootflow.render_worker`:
  - validates the trusted `RenderStatusManifest` against the trusted `AssemblyPlan` before considering
    stale work;
  - requires timezone-aware ISO 8601 `stale_before` and `updated_at` timestamps so timeout decisions are
    explicit scheduler policy rather than implicit worker guesswork;
  - returns `ExpiredRenderLease` records only for `running` statuses older than the cutoff, while skipping
    pending, retryable, succeeded, failed, and fresh running statuses;
  - produces retryable `RenderTaskStatus` transitions that preserve the original renderer adapter and attempt
    count so callers can persist each task through `compare_and_write_render_task_status(...)` with
    `expected_state="running"`, the matching attempt, and `expected_updated_at=running_since`;
  - includes a no-cleanup/no-deletion error message on each retryable status so an expired lease cannot be
    confused with authority to remove source, graded, or deliverable files.
- Tightened `compare_and_write_render_task_status(...)` with an optional `expected_updated_at` precondition so
  timeout-sensitive updates can fail if a same-attempt worker heartbeat refreshed `updated_at` after the
  scheduler planned expiration.
- Expanded render-worker tests for stale lease planning, exact-cutoff handling, invalid timestamp rejection,
  stale status-manifest rejection before timeout planning, and stale lease persistence rejection after a
  same-attempt heartbeat refresh.
- Updated README, product strategy, and design decisions to describe stale-running lease planning as the
  conservative retry boundary for interrupted local workers.

## What landed in the previous iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/-bc-31236baa-8641-4baf-8424-88808ac9e52c-7f37`, pushed that baseline to
  `cursor/media-content-automation-6863`, then added one focused render-status safety layer.
- Added `compare_and_write_render_task_status(...)` in `shootflow.render_status`:
  - holds a local advisory lock file across load, precondition check, replacement, and write so two local
    workers cannot both update from the same stale status snapshot;
  - loads the latest trusted `deliverables/render_status.json` from the workspace before updating;
  - validates the manifest against the supplied trusted `AssemblyPlan`, including shoot slug, task order,
    render-plan fingerprint, state-specific status fields, and assembly-plan path/dependency safety;
  - checks that the target task's current state and attempt count match the worker transition's expected
    precondition before accepting the update;
  - replaces exactly one `RenderTaskStatus` while preserving the manifest shoot slug, render-plan
    fingerprint, and task ordering;
  - validates the updated manifest and writes it through the existing safe status-manifest writer, including
    stale/symlinked temp-path rejection.
- Expanded render-status tests for single-task replacement, stale precondition rejection without rewriting
  the manifest, attempt-only precondition failures, concurrent same-task claims, unknown task IDs, stale
  fingerprints, and safe writer behavior during compare/write updates.
- Updated README, product strategy, and design decisions to describe single-task compare/write updates as
  the current durable boundary between worker transition helpers and future renderer adapters.

## What landed in the previous iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-7fad` and pushed that baseline to
  `cursor/-bc-31236baa-8641-4baf-8424-88808ac9e52c-7f37`.
- Added safe render-worker status transition helpers in `shootflow.render_worker`:
  - `claim_render_worker_action(...)` turns a trusted ready action plus matching current pending/retryable
    status into a `running` status with the selected renderer adapter, attempt number, and timestamp;
  - stale or mismatched claims are rejected if the current status task, state, or attempt count no longer
    matches the worker action;
  - `report_render_worker_success(...)` accepts only a running status matching the same action, verifies
    every declared output exists under `deliverables/`, rejects symlinked output paths, computes streaming
    SHA-256 checksums, and returns a `succeeded` status for exactly those outputs;
  - `report_render_worker_retryable(...)` and `report_render_worker_failure(...)` require a matching
    running status plus a clear error message and preserve the attempt count for retry/failure reporting.
- Expanded render-worker tests around claim, stale claim, success checksum, missing/symlinked outputs,
  mismatched running statuses, and retry/failure paths.
- Updated README, product strategy, and design decisions to document worker status transitions as the next
  contract between the trusted task/status manifests and real renderer adapters.

## Earlier render-worker planning iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-4a21`, pushed it to `cursor/media-content-automation-7fad`, and
  verified the restored baseline.
- Added `shootflow.render_worker` as the dry-run render-worker action contract:
  - validates the supplied `RenderStatusManifest` against the trusted `AssemblyPlan` before scheduling;
  - accepts a trusted set of completed non-render dependency IDs from the future production/job executor;
  - treats dependencies that name render tasks as satisfied only when that render task status is
    `succeeded`;
  - schedules only `pending` and `retryable` tasks whose dependencies are complete;
  - skips `running` tasks so workers are not duplicated before a timeout/lease policy exists;
  - skips `succeeded` and `failed` tasks, leaving failed-task retry decisions explicit;
  - emits `RenderWorkerAction` records with task ID, adapter name, next attempt number, inputs, outputs,
    dependency IDs, aspect ratio, output kind, and parallelism flag;
  - reports `BlockedRenderTask` records with missing dependency IDs for UI/scheduler visibility;
  - keeps actual media opening, rendering, output checksumming, status updates, and temp-output safety out
    of scope for future renderer adapters.
- Added `validate_render_status_manifest(...)` as a public validation wrapper around the existing strict
  status-manifest trust boundary.
- Tightened that trust boundary after review: render status validation now reuses full assembly-plan
  validation so in-memory plans with source-media inputs, unsafe paths, noncanonical outputs, or malformed
  dependencies cannot be fingerprinted or scheduled by the worker.
- Updated README, product strategy, design decisions, and these continuation notes to describe the ready
  action queue between status tracking and real render adapters.

## What landed in this iteration

- Fast-forwarded the active branch from the initial README to the latest ShootFlow foundation on
  `origin/cursor/media-content-automation-26a1`, pushed that baseline to
  `cursor/media-content-automation-d522`, then added the first safe renderer-adapter orchestration layer.
- Added `shootflow.render_adapter`:
  - `run_dry_run_render_action(...)` loads the latest trusted render status manifest, claims exactly one
    matching `RenderWorkerAction`, persists the claim with `compare_and_write_render_task_status(...)`, writes
    deterministic placeholder outputs, reports success checksums or retryable materialization errors, and
    persists the final status through the same compare/write boundary;
  - `materialize_dry_run_render_outputs(...)` consumes only the trusted action fields and never opens raw,
    source, or graded input files;
  - dry-run outputs are limited to declared `deliverables/` paths, reject unsafe/absolute/parent paths,
    reject symlinked workspaces/output directories/output files/temp files, and refuse to overwrite existing
    different bytes;
  - output commits use a same-directory exclusive temp file plus hard-link creation instead of blind replace,
    so a user/editor export that appears at the target path is preserved rather than overwritten;
  - if output materialization fails after a claim, the adapter persists a retryable status with an explicit
    no-deletion message rather than cleaning up files.
- Added focused tests for dry-run claim/success persistence, existing-output preservation, symlinked-output
  rejection, and stale-claim rejection before output materialization.
- Updated README, product strategy, design decisions, and terms draft notes to describe the dry-run adapter
  as a proof point for future ffmpeg/Core Image/Metal/DaVinci/cloud renderers.

## Suggested next iteration

The worker can now plan ready actions, produce safe per-task status transitions, persist one transition
through a manifest-level compare/write update, identify stale running leases for retry, execute one trusted
action through a deterministic dry-run adapter, execute trusted ready-action batches with bounded local
concurrency, persist planned stale lease expirations with heartbeat-conflict reporting, drive those pieces
through an iterative dry-run scheduler loop, persist a strict UI/agent scheduler report, initialize missing
render-status manifests from persisted render tasks without resetting progress, invoke that handoff from
persisted-manifest CLI commands, and discover mounted-volume candidates for reviewed import routing. The next
useful layer is either richer native macOS volume metadata, a real renderer temp-output contract, stronger
distributed lease persistence, or a small example/smoke fixture for the init-to-report CLI flow.

Good test-first targets:

- Add a native macOS metadata adapter (or a pure testable abstraction for it) that can mark internal disks,
  removable cards, read-only volumes, and external SSDs more accurately than the portable mount-root scanner.
- Add a real `ffmpeg-local` or Core Image/Metal adapter behind
  `run_render_adapter_batch(...)`, including temp-output contracts that replace
  dry-run placeholder bytes while keeping the same no-overwrite/no-delete status
  boundary.
- Add a CLI smoke fixture or example workspace that demonstrates persisted render-task input files, safe
  `init-render-status` bootstrapping, and the printed `render_scheduler_report.json` output a future Mac UI should
  consume.
- If cloud/distributed workers are introduced, add storage-native compare-and-swap or a lease service around
  the same manifest contract; the current advisory lock protects local workers sharing one filesystem.
- Keep real ffmpeg/Core Image/DaVinci rendering out of scope until leases, temp output paths, and adapter
  contracts are safe and well tested.
