# Safe Ingest Foundation Design

## Context

The larger product goal is a Mac + iPhone assistant that can ingest large shoots,
organize originals, generate color-graded intermediates, and assemble social
deliverables. The first implementation slice focuses on trust: planning safe
copies from a card/folder to a media library without deletion or overwrites.

## Design

The ingest foundation exposes a small Rust API:

- `MediaKind::from_path` classifies common RAW, JPEG, video, sidecar, and other
  files case-insensitively.
- `IngestPlanOptions` defines an absolute source root, absolute destination
  root, safe single-component shoot slug, and optional reserved destinations
  discovered by the caller.
- `build_ingest_plan` validates inputs and returns deterministic
  `CopyThenVerify` operations.

The planner preserves relative camera structure under media-kind buckets:

```text
destination/shoot-slug/raw/...
destination/shoot-slug/jpeg/...
destination/shoot-slug/video/...
destination/shoot-slug/sidecar/...
destination/shoot-slug/other/...
```

## Safety requirements

- Reject files outside the chosen source root.
- Normalize `.` and `..` lexically before checking roots and collisions.
- Reject multiple source files that map to the same destination.
- Reject destinations already reserved by the caller, such as files that exist
  in the destination library before copy execution.
- Reject relative source, destination, and reserved destination paths.
- Reject shoot slugs that contain path separators, absolute path syntax, `.`,
  or `..`.
- Emit no delete operations.
- Keep copy execution, hash verification, symlink-aware filesystem walking, and
  card cleanup out of scope until they have their own tests and audit-log
  design.

## Testing

Integration tests in `tests/ingest_plan.rs` cover classification, copy-plan
shape, outside-root rejection, duplicate destination rejection, unsafe slug
rejection, reserved destination rejection, and relative source/reserved path
rejection.
