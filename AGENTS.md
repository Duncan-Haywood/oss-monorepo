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

All 145 tests use `unittest` (stdlib). No pytest, no test dependencies. The
`PYTHONPATH=src` prefix is required so `import shootflow` resolves.

### Running the CLI

```bash
PYTHONPATH=src python3 -m shootflow.cli --help
PYTHONPATH=src python3 -m shootflow.cli init-render-status --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli dry-run-render-scheduler --workspace <dir> ...
```

The CLI needs pre-built `deliverables/render_tasks.json` and
`deliverables/render_status.json` manifests in the workspace directory. Tests
in `tests/test_cli.py` show how to create these programmatically.

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
