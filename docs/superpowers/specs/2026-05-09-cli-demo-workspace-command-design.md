# CLI Demo Workspace Command Design

## Context

ShootFlow already has `shootflow.demo_workspace.create_persisted_cli_demo_workspace(...)`, which creates a tiny trusted render-task workspace for native-shell demos. The helper is useful, but Mac UI shells, launch agents, GTM demos, and future automation runs should not need to import Python internals just to create the persisted manifest handoff.

## Goal

Expose the existing demo helper as a public CLI command that:

- creates deterministic placeholder analysis/graded inputs and `deliverables/render_tasks.json`;
- returns schema-versioned JSON describing the created handoff;
- tells callers which non-render dependencies must be supplied to `dry-run-render-scheduler`;
- lists expected deliverable output paths for smoke verification;
- preserves the existing no-delete, no-reset, no-overwrite demo safety posture.

## Command contract

Add:

```bash
PYTHONPATH=src python3 -m shootflow.cli create-demo-workspace --workspace <dir> [--shoot-slug <slug>]
```

The command prints JSON with:

- `schema_version`;
- `workspace`;
- `render_tasks_manifest_path`;
- `shoot_slug`;
- `render_task_count`;
- `required_completed_dependency_ids`;
- `expected_output_paths`;
- `safety_notes`;
- `next_steps`.

`next_steps` should make the intended CLI-only smoke flow explicit: run `init-render-status`, then run `dry-run-render-scheduler` with the returned dependency IDs.

## Safety and error handling

The CLI should be a thin wrapper around the existing helper. `DemoWorkspaceError` should be surfaced through the existing `shootflow: <message>` stderr pattern with exit code `1` and no stdout. The command must not create render status, scheduler reports, deliverable outputs, source media, or ingest manifests.

## Tests

Add CLI tests that prove:

- command JSON exposes the manifest path, dependency IDs, output paths, and next-step hints;
- the created workspace can run through `init-render-status` and `dry-run-render-scheduler`;
- pre-existing conflicting demo inputs fail cleanly without overwriting the user-owned file or creating `render_tasks.json`.

## Scope boundaries

Do not add real renderer behavior, cloud upload, deletion workflows, native Swift UI code, or any new media-writing authority beyond the existing demo helper.
