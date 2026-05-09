# CLI demo workspace command design

## Context

ShootFlow already has `shootflow.demo_workspace.create_persisted_cli_demo_workspace(...)`,
which creates a tiny trusted render-task workspace for demos and smoke tests. The
helper is safe by construction: it writes deterministic placeholder graded inputs
and `deliverables/render_tasks.json`, refuses symlinks and different existing
files, and leaves render-status initialization plus scheduling to the normal CLI
commands.

The gap is that Mac UI shells, launch-agent smoke tests, GTM demos, and future
automation runs currently need to import Python internals to create that fixture.
That weakens the CLI-as-contract direction used by the rest of the product.

## Design

Add a `create-demo-workspace` CLI command that wraps the existing helper without
adding new rendering or file-management authority.

Inputs:

- `--workspace <path>`: target workspace root to create or reuse.
- `--shoot-slug <slug>`: optional demo shoot slug, validated by the helper.

Output:

- schema-versioned, indented JSON with:
  - workspace root;
  - render-task manifest path;
  - shoot slug;
  - render task count;
  - required completed dependency IDs for `dry-run-render-scheduler`;
  - expected deliverable output paths;
  - safety notes.

## Safety and error handling

- The command delegates all path, slug, symlink, and overwrite checks to
  `create_persisted_cli_demo_workspace(...)`.
- It does not create `render_status.json`, scheduler reports, deliverable outputs,
  source media, or ingest manifests.
- It surfaces `DemoWorkspaceError` through the existing `shootflow: <message>`
  CLI error style.
- Re-running the command against an identical demo workspace is idempotent; running
  it against user-owned conflicting files fails without overwriting them.

## Tests

Use test-first coverage in `tests/test_cli.py`:

1. Happy path: `create-demo-workspace` prints the expected JSON and writes only
   the trusted inputs plus `deliverables/render_tasks.json`.
2. End-to-end smoke: create the workspace through the CLI, then run
   `init-render-status` and `dry-run-render-scheduler` from the printed dependency
   IDs to verify the public CLI-only flow reaches a complete scheduler report.
3. Conflict path: an existing different demo input makes the CLI fail with no
   stdout and no render-task manifest side effect.

## Documentation updates

Update README, product/design notes, and continuation notes so future agents treat
`create-demo-workspace -> init-render-status -> dry-run-render-scheduler` as the
repeatable CLI smoke path for native shells and demos.
