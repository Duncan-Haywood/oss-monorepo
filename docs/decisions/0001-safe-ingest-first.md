# Decision 0001: Build safe ingest before editing automation

## Status

Accepted.

## Context

The product goal is an app for photographers and videographers that can ingest entire shoots from SD cards or SSDs, bulk color grade photos and videos, and automatically create Instagram reels, carousels, and still selections. The highest-risk early failure mode is not grading quality; it is file loss, duplicate confusion, or a user losing trust before the creative pipeline starts.

## Decision

Start the codebase with a non-destructive ingest planner:

- It discovers raw, JPEG, and video files under a source root.
- It computes checksums before planning copies.
- It preserves source-relative paths under media-kind folders.
- It marks already-copied matching files as verified.
- It reports checksum conflicts instead of overwriting.
- It never schedules deletions.

The planner returns data structures, not side effects. Future UI, CLI, or agent flows should review and execute the plan explicitly.

## Consequences

- The product can grow around a trustworthy file-safety invariant.
- Parallel grading and content generation can depend on stable, checksummed asset identities.
- The app can support SD-card detection and human confirmation without binding core ingest logic to macOS APIs too early.
- Future destructive cleanup features must be introduced as a separate, heavily guarded capability with explicit tests and user confirmation.

## Next implementation notes

Good next slices:

1. Add an `execute_ingest_plan` function that copies files atomically to a temporary path, verifies checksum after copy, then renames into place.
2. Emit a JSON manifest per shoot containing source path, destination path, checksum, media kind, size, and ingest timestamp.
3. Add a macOS drive-detection adapter that identifies likely camera cards by volume path and common DCIM/private folder layouts.
4. Add a lightweight CLI for `plan-ingest` and `execute-ingest` so the workflow is usable before native app work begins.
5. Add pipeline job models for grade proxies, RAW/JPEG derivatives, clip selection, reel assembly, carousel export, and quality review.
