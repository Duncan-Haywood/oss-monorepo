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

#### Known false failures when running as root in a disk-quota-capped sandbox

If you're running inside a root-uid, disk-quota-capped agent sandbox (the
profile of this repo's own scheduled Claude Code sessions), expect exactly
6 of 438 tests to fail even on a clean, unmodified checkout:

- `test_cli.py::ShootFlowCliTests::test_plan_import_route_command_discovers_capacity_gated_route_from_estimated_source`
- `test_cli.py::ShootFlowCardDumpWorkflowCliTests::test_card_dump_workflow_confirm_ingests_and_reports_production`
- `test_cli.py::ShootFlowCardDumpWorkflowCliTests::test_card_dump_workflow_previews_route_without_copying`
- `test_cli.py::ShootFlowCardDumpWorkflowCliTests::test_card_dump_workflow_rejects_broken_symlinked_destination_subfolder`
- `test_cli.py::ShootFlowCardDumpWorkflowCliTests::test_card_dump_workflow_rejects_symlinked_destination_subfolder_before_preview`
- `test_workspace_health.py::WorkspaceHealthTests::test_unreadable_render_input_is_reported_for_review`

Two unrelated environment effects cause these, both confirmed by direct
reproduction rather than assumed:

1. **Permission bits don't restrict a root process.** Tests that
   `os.chmod(path, 0)` to simulate an unreadable file (e.g.
   `test_unreadable_render_input_is_reported_for_review`) find the file
   readable anyway, because uid 0 bypasses the permission check the
   production code correctly relies on.
2. **The capacity-gate destination heuristic requires >64GB free**
   (`_rank_candidate`'s `writable_capacity` check in `src/shootflow/storage.py`).
   A sandbox whose writable disk allowance is capped below that (this one's
   `df` reports ~30GB avail) can never classify any path as a `destination`
   candidate, so every card-dump-workflow test that expects a route to be
   found comes back `blocked` instead — not because routing logic regressed,
   but because no candidate in the sandbox clears the real-world threshold.

Neither is a product bug — they're artifacts of the sandbox not looking like
a real workstation with real removable volumes and non-root permissions. If
you see a *different* test fail, treat it as real; don't extend this list
speculatively, and don't loosen the 64GB threshold or the permission checks
to make these 6 pass, since both exist for genuine data-safety reasons
(preventing an import onto too-small a destination; refusing to read a file
the OS says isn't readable).

### Running the CLI

```bash
PYTHONPATH=src python3 -m shootflow.cli --help
PYTHONPATH=src python3 -m shootflow.cli init-render-status --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli plan-import-route --volume-root <dir> ...
PYTHONPATH=src python3 -m shootflow.cli workspace-health --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli handoff-controls --handoff-json <path>
PYTHONPATH=src python3 -m shootflow.cli package-handoff-brief --ingest-manifest <path>
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
being clobbered. The scheduler dispatches trusted local production adapters:
`dry-run-production-local` writes placeholders, `metadata-production-local`
fingerprints real local inputs and writes deterministic metadata JSON only to
declared output files, and `proxy-production-local` byte-copies trusted local
inputs into declared proxy outputs as a conservative stand-in before real
ffmpeg/Metal proxy generation. `analysis-production-local` writes deterministic
schema-compatible analysis JSON only for `vlm_asset_analysis` jobs as a local
contract probe before real VLM execution. `scene-production-local` reads those
validated per-asset analysis artifacts and writes deterministic
`analysis/scene_groups.json` summaries only for `scene_grouping` jobs as the
first serial scene-rejoin proof. `look-production-local` reads that verified
scene-group summary and writes deterministic `color/shoot_look.json` only for
`look_development` jobs as a shoot-look handoff proof before real color science
or style learning. `grade-production-local` reads one trusted original plus its
schema-validated/checksum-verified analysis and look dependencies, then writes
deterministic stand-in graded artifacts only for `graded_photo`/`graded_video`
jobs before real ffmpeg/Core Image/Metal grading is trusted.
`story-production-local` verifies the planned analysis, scene, look, and graded
inputs against trusted status checksums, then writes deterministic schema v2
`analysis/instagram_storylines.json` only for `storyline_selection` jobs before
real editorial/story intelligence is trusted. `package-production-local`
verifies trusted storyline plus graded dependencies and writes deterministic
package handoff artifacts only for `instagram_reel`, `instagram_carousel`, and
`instagram_photo_set` jobs before real render/export packaging is trusted;
directory-style package outputs receive a deterministic manifest file and
directory checksum rather than being treated as arbitrary cleanup targets, and
unexpected existing package-directory entries are named in retryable
adapter/scheduler errors without deleting or trusting those bytes.
Scheduler dispatch is adapter-capability aware, so proxy, analysis, scene,
look, grade, story, and package adapters receive only the output kinds they can
materialize and leave incompatible downstream work pending or blocked for a
compatible worker.
None of these adapters may delete, clean up, overwrite different bytes, or invent
media paths.
Production and render scheduler reports are schema v3 and include root
observe-only `workflow_authority` plus validated product metric counts derived
from the report state, so persisted post-operation reports cannot be mistaken
for retry, cleanup, materialization, overwrite, deletion, or other file-mutation
authority. Legacy schema v1/v2 scheduler reports still load as observe-only for
existing saved workspaces.
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
pilot-ready workspace rate, median intervention rate, first-draft output count,
and structured readiness blocker counts without reading raw worker internals or
granting workflow authority. It validates component dashboard threshold flags
against reported metrics before trusting readiness; its JSON emits the same
observe-only `workflow_authority` contract.
`pilot-cohort-brief` reads one saved cohort report and emits presentation-ready
status/headline/card labels, structured blocker counts, and controlled
per-workspace blocker labels for native shells and GTM demos while remaining
observe-only and command-free. JSON remains the default for agents; `--format
text` emits the same validated brief as a deterministic text-mode demo/readout
without executable workflow commands or free-form saved report fields. Brief JSON
also carries the shared observe-only `workflow_authority` object.
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
handoff JSON files before enabling adjacent UI controls. The
`package-handoff-brief` CLI command is a read-only native-shell bridge over a
trusted `production_status.json` plus `production_scheduler_report.json`: it
summarizes package readiness/materialized package outputs and returns the same
disabled controls derived from the scheduler report authority.
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
- `ruff`: clean (0 findings). The 5 unused-import findings recorded here
  previously (2 in test files, plus 3 in `pilot_authority.py`) are fixed —
  the test-file ones were genuinely dead; `pilot_authority.py`'s three were
  a deliberate re-export shim (`pilot_dashboard.py`, `pilot_cohort_report.py`,
  and `pilot_cohort_brief.py` import from it), now made explicit via
  `__all__` instead of removed.
- `mypy`: 31 errors across 10 files (`production_status.py`, `assembly.py`,
  `render_status.py`, `production_handoff.py`, `production_adapter.py`,
  `render_scheduler.py`, `production_scheduler.py`, `demo_workspace.py`).
  Not fixed — mostly `dict` invariance (`dict[str, X]` passed where
  `dict[object, object]`/`Mapping` is expected) and a few genuine
  return-type/assignment mismatches in `production_adapter.py` and
  `demo_workspace.py` that need case-by-case review, not a mechanical
  pass. Not wired into any CI gate, so nothing currently enforces this.

### Platform note

Uses `fcntl` for advisory file locking — Linux/macOS only, will not work on
Windows.

### Private docs site (`docs-site/`)

`docs-site/` is a Next.js app (npm) for internal documentation, separate from the
stdlib Python core. **Documentation is TSX-first**: hand-authored pages under
`src/app/docs/`, plus `scripts/build-docs.mjs` rewriting approved `docs/*.html` and
selected markdown into `src/generated/doc-content/*.tsx` and thin route wrappers.
Do not add new long-form Markdown/HTML in `docs/` as canonical hand-maintained docs
unless they are on the build-docs ingest list. For one-off PDF/HTML sharing, export
from the built site (browser Print → PDF or Save Page As) — do not maintain parallel
canonical copies. See `.cursor/rules/documentation-tsx.mdc`.

```bash
cd docs-site && npm ci && npm run build
```

Production auth uses `DOCS_SITE_PASSWORD` (HTTP Basic + optional session cookie)
and/or `DOCS_SITE_TOKEN` (login form + bearer). Set `DOCS_SITE_DOMAIN` for custom
host metadata. See `docs-site/README.md` for Vercel domain and Deployment
Protection.

### No external services

No database, no Docker, or external APIs for the Python core. Everything runs
against the local filesystem. The docs site deploys separately on Vercel when used.
