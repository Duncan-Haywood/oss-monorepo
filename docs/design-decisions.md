# MediaFlow Design Decisions

## Product wedge

The most valuable first wedge is reliable ingest and organization, not color
grading. Photographers and videographers lose trust immediately if a tool
mishandles cards, overwrites files, or deletes originals. A cinematic automation
engine only becomes useful after the source assets are safely copied, indexed,
and traceable.

## Audience

Primary users are working photographers and videographers who need more
Instagram output from each shoot:

- solo shooters who edit late at night and want time back;
- creators who already pay an editor but want more versions per dollar;
- small studios that need faster reels, carousels, and selects without adding
  file-management overhead.

## Architecture direction

MediaFlow should stay local-first for source media:

1. **Ingest layer**: detects candidate cards/drives, plans a copy or move,
   checksums source files, writes an immutable manifest, and never deletes
   removable-media originals unless the user explicitly opts in.
2. **Asset index**: builds a local catalog from manifests, groups RAW/JPEG/video
   siblings, records camera metadata, and tracks derived assets.
3. **Grading pipeline**: generates proxy assets, runs scene and quality analysis,
   chooses or learns looks, applies LUT/color transforms through GPU-friendly
   workers, and preserves intermediate graded stills/video clips.
4. **Creative assembly**: uses multimodal models to identify best moments,
   faces, motion, story beats, and composition. It proposes reels, carousels,
   selects, captions, and cutdowns with editable timelines.
5. **Export layer**: renders platform-specific outputs for IG reels, carousels,
   stories, and still posts with consistent naming and delivery manifests.

## Parallelization model

The long-term system should parallelize at multiple levels:

- file hashing and metadata extraction across workers;
- proxy generation per video;
- scene detection per clip;
- grade search per asset group;
- render jobs per deliverable;
- model inference batches per shoot segment.

The scheduler should treat each step as restartable and manifest-backed. A
failed render must not require re-ingesting the card or redoing completed work.

## File-safety policy

- Default to copy, not move.
- Never overwrite; collision-safe names use checksum suffixes.
- Verify every copied file by checksum before marking it ingested.
- Write a manifest for every execution.
- Treat removable media as non-destructive by default.
- If source removal is allowed, remove originals only after all destination
  copies in the plan have verified successfully.
- Prefer quarantine/trash workflows over permanent deletion in future UI builds.
- Keep generated assets separate from originals and make lineage visible.

## Business viability notes

The product should compete on turnaround and output volume without asking users
to surrender creative control. A strong paid tier can focus on:

- repeatable personal looks and studio presets;
- batch reels/carousels from full shoots;
- editor handoff packages with manifests, proxies, and rough cuts;
- local processing for privacy plus optional cloud burst rendering;
- review loops where users approve looks and selects once, then the system
  generalizes across the shoot.

The app should avoid promising fully autonomous taste. The better positioning is
"first-pass editor, organizer, and creative multiplier" that produces strong
drafts and finished exports when the user has trained preferences.

## Near-term next iterations

1. Add drive discovery for macOS volumes and common Linux mount points, with
   confidence scoring for camera cards.
2. Add an asset index SQLite database generated from ingest manifests.
3. Group RAW/JPEG/video/sidecar siblings into shoot assets.
4. Add FFmpeg probe/proxy generation with restartable job manifests.
5. Add a local scoring pass for sharpness, exposure, faces, and motion.
6. Add an export recipe model for IG reel and carousel deliverables.
