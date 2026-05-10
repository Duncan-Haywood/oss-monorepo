# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ShootFlow is a pure-Python (stdlib-only, zero third-party dependencies) media
automation tool for photographers/videographers. The repository now contains the
tested core on `main`; continue feature work on the branch assigned by the
automation prompt.

### Python version

Requires Python 3.10+. The VM ships with Python 3.12.3, which works.

### Running tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

All committed tests use `unittest` (stdlib). No pytest, no test dependencies.
The `PYTHONPATH=src` prefix is required so `import shootflow` resolves.

### Running the CLI

```bash
PYTHONPATH=src python3 -m shootflow.cli --help
PYTHONPATH=src python3 -m shootflow.cli init-render-status --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli plan-import-route --volume-root <dir> ...
PYTHONPATH=src python3 -m shootflow.cli workspace-health --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli handoff-controls --handoff-json <path>
PYTHONPATH=src python3 -m shootflow.cli index-workspace --workspace <dir> --generated-at <timestamp>
PYTHONPATH=src python3 -m shootflow.cli pilot-dashboard --workspace <dir> --generated-at <timestamp>
PYTHONPATH=src python3 -m shootflow.cli pilot-cohort-report --dashboard-json <path> ... --generated-at <timestamp>
PYTHONPATH=src python3 -m shootflow.cli pilot-cohort-brief --cohort-report <path>
PYTHONPATH=src python3 -m shootflow.cli pilot-cohort-brief --cohort-report <path> --format text
PYTHONPATH=src python3 -m shootflow.cli create-pilot-cohort-demo --workspace <dir> --workspace-count <n> --dashboard-generated-at <timestamp> --generated-at <timestamp>
PYTHONPATH=src python3 -m shootflow.cli write-render-tasks --ingest-manifest <path>
PYTHONPATH=src python3 -m shootflow.cli next-production-wave --ingest-manifest <path> ...
PYTHONPATH=src python3 -m shootflow.cli dry-run-production-scheduler --ingest-manifest <path> --generated-at <timestamp> ...
PYTHONPATH=src python3 -m shootflow.cli inspect-render-workspace --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli create-demo-workspace --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli dry-run-render-scheduler --workspace <dir> ...
```

The production init/scheduler CLI commands need a trusted `ingest_manifest.json`
and matching `production_status.json` in the shoot workspace. The scheduler
writes a trusted `production_scheduler_report.json` bound to the final status.
It can expire stale running production leases when both `--stale-before` and
`--lease-updated-at` are provided; expired jobs become retryable review states,
and same-attempt heartbeat refreshes are reported as conflicts rather than
being clobbered. Production and render scheduler reports are schema v3 and
include root observe-only `workflow_authority` plus validated product metric
counts derived from the report state. Legacy schema v1/v2 scheduler reports
still load as observe-only for existing saved workspaces.
`workspace-health`, `index-workspace`, and `pilot-dashboard` expose production
status/report summaries and validated scheduler product metrics read-only before
falling through to render handoffs. `pilot-dashboard` is the first stable
activation/throughput/intervention summary for Mac shells and pilot analytics;
schema v2 also evaluates default pilot acceptance thresholds for completion
rate, manual intervention rate, and materialized outputs. It consumes workspace
health rather than raw worker internals, omits executable commands for
write-capable next actions, and grants no copy, retry, cleanup, overwrite,
materialization, or deletion authority. Pilot dashboard JSON includes a
structured `workflow_authority` object marking the payload observe-only,
presentation-only, and false for copy, retry, cleanup, overwrite,
materialization, deletion, and any file mutation.
`pilot-cohort-report` aggregates saved schema v2 dashboard JSON payloads into
pilot-ready workspace rate, median intervention rate, and first-draft output
count without reading raw worker internals or granting workflow authority; its
JSON emits the same observe-only `workflow_authority` contract.
`pilot-cohort-brief` reads one saved cohort report and emits presentation-ready
status/headline/card labels for native shells and GTM demos while remaining
observe-only and command-free. JSON remains the default for agents; `--format
text` emits the same validated brief as a deterministic text-mode demo/readout
without executable workflow commands. Brief JSON also carries the shared
observe-only `workflow_authority` object.
`workspace-health` JSON now uses schema v4 and includes the same structured
observe-only `workflow_authority` object. `index-workspace` JSON now uses schema
v2, includes the shared authority object at the index root, and embeds the
derived workspace-health authority inside the `workspace_health` artifact
summary; old schema v1 workspace indexes still load as observe-only. These
fields are presentation/diagnostic contracts only and do not authorize copy,
retry, cleanup, overwrite, materialization, deletion, or any file mutation.
The `plan-import-route`, `preview-ingest`, `execute-ingest`,
`plan-production`, `next-production-wave`, `write-render-tasks`,
`card-dump-workflow`, render-workspace inspection, and demo workspace CLI
summary/receipt JSON surfaces are schema v2 and also carry root
`workflow_authority`. Write-capable `next_actions` are descriptive and
command-free; treat `next_actions`, `next_steps`, and `agent_handoff` as
review/presentation aids only unless a separate explicit command invocation
supplies its required confirmation/runtime arguments. Consumers that need native
control state should call
`shootflow.workflow_authority.observe_only_handoff_controls_to_dict(...)` and
bind file-operation controls to its all-disabled output rather than parsing
presentation fields. The `handoff-controls` CLI command is a read-only wrapper
around that same reader for shell/native integrations that validate saved
handoff JSON files before enabling adjacent UI controls.
`create-pilot-cohort-demo` writes a controlled no-real-media fixture: trusted
demo render workspaces, saved schema v2 dashboard JSON files, and a saved
`pilot_cohort_report.json`. It preflights the saved dashboard/report paths before
creating workspaces and refuses existing different report files.
The render init/scheduler CLI commands need trusted `deliverables/render_tasks.json`
and `deliverables/render_status.json` manifests in the workspace directory.
`write-render-tasks` can create the render-task manifest from an ingest manifest
once trusted storyline and graded artifacts exist. Tests in `tests/test_cli.py`
show how to create these programmatically.

### Linting

No lint configuration is committed. For ad-hoc checking:

```bash
ruff check src/ tests/
mypy src/shootflow/ --ignore-missing-imports
```

Pre-existing findings:
- `ruff`: 2 unused imports in test files (F401).
- `mypy`: 8 dict-variance arg-type notes (harmless, `dict` invariance vs `Mapping`).

### Platform note

Uses `fcntl` for advisory file locking — Linux/macOS only, will not work on
Windows.

### No external services

No database, no Docker, no Node.js, no external APIs. Everything runs against
the local filesystem.
