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
PYTHONPATH=src python3 -m shootflow.cli index-workspace --workspace <dir> --generated-at <timestamp>
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
being clobbered. Production and render scheduler reports are schema v2 and
include validated product metric counts derived from the report state.
`workspace-health` and `index-workspace` expose production status/report
summaries read-only before falling through to render handoffs.
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
