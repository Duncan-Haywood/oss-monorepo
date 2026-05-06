# Continuation Notes

This project is being built by recurring automation runs. Keep each run focused,
tested, committed, and pushed on `cursor/media-content-automation-a704`.

## Current state

- Repository started as a one-line README.
- Added a Python standard-library core because it can be tested on Linux without
  Xcode while still mapping cleanly to future Swift/macOS/iOS app layers.
- Implemented:
  - `media_automation.ingest`: pure ingest planning for safe copy/quarantine
    workflows.
  - `media_automation.content_pipeline`: pure job-graph planning for VLM
    analysis, color grading, and IG deliverable assembly.
- Tests:
  - `python3 -m unittest tests.test_ingest_plan tests.test_content_pipeline`

## Next high-value implementation options

1. Add a real filesystem scanner/executor around `plan_ingest`.
   - Scanner should identify removable drives and candidate camera cards.
   - Executor should copy to a temp path, fsync where practical, verify checksum,
     then atomically rename into place.
   - Quarantine source files only after successful verification and explicit user
     confirmation.
2. Add manifest serialization.
   - JSON schema for ingest manifests and content plans.
   - Resume/retry support keyed by sha256 and destination path.
3. Add preset/look planning.
   - Represent target look intent: cinematic neutral, warm editorial, moody
     contrast, clean wedding, brand-specific LUT reference.
   - Keep the planner provider-agnostic; do not bake in a single model vendor.
4. Add a CLI.
   - Commands: `scan`, `plan-ingest`, `execute-ingest --dry-run`,
     `plan-content`, `render-manifest`.
   - Default every destructive-adjacent action to dry-run.
5. Start Swift app scaffolding once the core contracts stabilize.
   - macOS app first for SD card and SSD access.
   - iPhone companion second for review, selects, approvals, and posting prep.

## Safety reminders

- Never add automatic deletion of source media.
- Treat "move" as copy, verify, then quarantine.
- Preserve RAW, JPEG/HEIC, sidecars, video, and audio as separate source-of-truth
  assets.
- Keep every planned operation auditable before execution.
- Make provider integrations replaceable; photographers should be able to bring
  their own editor, LUTs, model account, or storage policy later.
