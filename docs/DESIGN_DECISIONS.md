# ShootFlow design decisions

## Current product bet

ShootFlow starts as a personal macOS-oriented ingest and automation tool for high-volume photographers and videographers. The near-term value is not a generic editor; it is a reliable assistant that handles the unglamorous workflow:

1. detect card, local, and SSD storage safely;
2. copy source media without deleting or overwriting originals;
3. create a manifest that downstream grading and editing jobs can trust;
4. generate intermediate selects, color-graded exports, reels, carousels, and delivery folders.

## Safety invariants

- Never delete files from camera cards or source folders.
- Never overwrite an existing destination file with different content.
- Verify copies with SHA-256 before marking them copied.
- Write manifests so every generated edit can be traced back to source media.
- Treat destination-inside-source as invalid because it can recurse and pollute the card.

## Architecture direction

- Keep core decisions in pure Python modules first so behavior can be tested without macOS APIs.
- Add platform adapters later:
  - macOS drive discovery: Disk Arbitration, FileProvider, or a signed helper.
  - iPhone companion: import review, shoot status, approval, and lightweight queue control.
  - GPU workers: Metal/CoreML/FFmpeg/DaVinci Resolve or cloud render farm adapters.
- Make all destructive or expensive steps two-phase: plan first, execute second.
- Store manifests as JSON initially; graduate to SQLite when queueing, retries, and asset lineage need queries.

## VLM and creative automation direction

- Use VLMs to score shots, detect themes, match brand references, identify faces/objects/scenes, and draft reel/carousel storyboards.
- Keep actual media transformations deterministic and inspectable: LUTs, color transforms, FFmpeg filtergraphs, Resolve timelines, or edit decision lists.
- Use iterative critique loops: create draft exports, run aesthetic/technical checks, adjust selects and grade recipes, then re-render.
- Preserve intermediate graded photos/video clips for human review and editor handoff.

## Business viability notes

Primary audience: photographers and videographers who already have too much edit/file-management overhead and need faster Instagram output.

High-value wedge:

- safer ingest than manual Finder copies;
- faster turnaround for reels and carousel drafts;
- more output per shoot without replacing the photographer's taste;
- editor-assistant workflow for people already paying editors.

Trust is the moat. The app must be boringly safe with originals before promising cinematic automation.
