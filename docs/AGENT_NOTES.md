# Agent Continuity Notes

## Current state

- Branch: `cursor/media-content-automation-4f3a`.
- Repo began as a README-only project.
- This iteration added a dependency-free Python reference core for import
  planning and product/design documentation.
- Swift is not available in the current cloud image, so native-app code was not
  compiled here.

## Design decisions made

- Start with file safety because trust is the prerequisite for any AI editing
  product handling irreplaceable shoots.
- Keep import planning separate from import execution. Plans can be displayed,
  audited, persisted, retried, and tested without touching user media.
- Default to copy mode. Move mode requires verified copy plus explicit delete
  intent, but current operations still preserve source files. Cleanup/deletion
  should become a separate post-verification plan.
- Flatten imported filenames into a shoot directory for the reference planner,
  using checksum-aware duplicate detection and suffix-based collision handling.
  A later native implementation may preserve camera folder structure if the UI
  benefits from it.
- Treat raw/JPEG/XMP files sharing a basename and source folder as a sidecar
  group; repeated camera filenames in different folders are not grouped.
- Skip symlinked source media and reject destination paths containing symlinks.
  This keeps later executors inside the selected source/archive boundaries.
- Keep legal notes as counsel-reviewable drafting guidance, not final legal text.

## Good next slices

1. Add an import manifest writer/reader with JSON output and tests.
2. Add a dry-run CLI around `ImportPlanner` so a local card/folder can be scanned
   without copying files.
3. Add device/volume detection abstractions for macOS, with a fake detector for
   tests.
4. Add total-byte, media-type, operation-state, and free-space fields to
   `ImportPlan` so it can fully back a safe import UI.
5. Define the SQLite schema for shoots, assets, sidecar groups, operations, AI
   analysis jobs, grade versions, and deliverables.
6. Add a first VLM prompt contract for scene/select analysis as JSON.
7. Draft the native Mac app architecture around SwiftUI + AppKit file/volume
   escape hatches.
8. Add a grading pipeline design doc for photos versus video/log footage.

## Verification commands

```bash
python3 -m unittest discover -s tests
```

## Cautions for future runs

- Do not add destructive copy/move/delete execution until the manifest and
  checksum verification paths are tested.
- Do not claim native app support until a Swift/Xcode-capable environment has
  compiled it.
- Do not present the terms notes as legal advice or final terms.
- Keep edits small and durable; another automation run is expected to continue.
