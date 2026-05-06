# Shotflow

Shotflow is an early personal-tool/product prototype for photographers and
videographers who want to turn full shoots into organized, color-graded media
and Instagram-ready reels, carousels, and stills with much less editing and file
management overhead.

The first implemented slice is a conservative media ingest core. It scans a
card, drive, or folder; classifies supported photo/video/log files; creates a
destination plan grouped by shoot and media type; and can copy files with
checksum verification. It never deletes source files.

## Current capabilities

- Discover common RAW, JPEG/HEIC/TIFF, video, and camera-log formats.
- Build a JSON manifest for safe ingest into a local or SSD-backed library.
- Organize files as `<library>/<shoot-slug>/<media-kind>/<original-name>`.
- Avoid overwrites by suffixing collisions with an eight-character file
  fingerprint, without reading entire media files during planning.
- Copy files with checksum verification while leaving SD cards and source drives
  untouched.
- Expose a minimal CLI:

```bash
python3 -m shotflow.cli plan-ingest /Volumes/CAMERA_CARD /Volumes/MediaLibrary \
  --shoot-name "Client Shoot 01"
```

## Safety principles

1. **Never delete camera originals automatically.** Source deletion requires a
   future explicit, audited, user-confirmed workflow.
2. **Copy before any destructive move.** "Move" should be implemented as
   copy + checksum verification + manifest write + separate manual review.
3. **Prefer manifests over memory.** Every ingest/edit/export run should produce
   a machine-readable manifest that can be reviewed, replayed, or debugged.
4. **Preserve original filenames.** Add suffixes only to prevent collision.
5. **Make dry-run planning first-class.** Users should see exactly what will
   happen before any bytes are copied.

## Development

Run tests with:

```bash
python3 -m unittest discover -s tests
```

## Product direction

See `docs/design-decisions.md` for the current architecture and roadmap,
including the planned Mac/iPhone app, parallel color pipeline, VLM curation, and
Instagram export agent.