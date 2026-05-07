# Architecture

## Design goals

- Handle tens of thousands of photos and videos without blocking the UI.
- Keep source media safe and recoverable.
- Make every automated decision inspectable and reversible.
- Run high-throughput local jobs on Mac hardware, then use optional cloud/GPU
  workers only when they improve quality or throughput.
- Share core planning logic between Mac, iPhone, CLI, and future server workers.

## Proposed system layers

### 1. Native apps

- **Mac app:** primary ingest, project library, queue control, local rendering,
  color review, and export.
- **iPhone app:** shoot review, selects, lightweight approvals, caption review,
  and social-ready export handoff.

### 2. Shared core

The TypeScript core in this repository currently models ingest and Instagram
deliverable planning. Over time this core should either remain a portable
planning library or be mirrored by a Swift package for native embedding.

Core responsibilities:

- classify files
- create safe ingest operations
- produce manifests
- plan content deliverables
- validate inputs
- avoid side effects

### 3. Media project database

Use a local SQLite database for the Mac app with tables for:

- projects
- volumes and cards
- assets
- manifests
- checksums
- generated intermediates
- grades
- content plans
- exports
- review decisions

File operations should be append-only in the database. Destructive operations
should require explicit human review and should be recorded as separate audit
events.

### 4. Worker graph

The heavy pipeline should run as a resumable job graph:

1. Detect source volumes.
2. Fingerprint files and build ingest plan.
3. Copy to project storage.
4. Verify checksums.
5. Extract metadata and proxy media.
6. Score quality, faces, motion, sharpness, exposure, and story tags.
7. Cluster scenes and identify duplicates/near-duplicates.
8. Generate color references and grade candidates.
9. Render intermediate graded media.
10. Build reel, carousel, and photo post edit plans.
11. Render social exports.
12. Generate captions, alt text, and editor notes.

Each node should be idempotent: if a machine sleeps or an SSD disconnects, the
job resumes from verified state instead of starting over.

### 5. VLM and model orchestration

VLMs should assist with semantic understanding, not own file safety. Use them
for:

- scene and subject descriptions
- selecting story beats
- identifying best frames for covers
- caption prompts and carousel narratives
- warning about inconsistent grades or awkward crops
- matching style references

Keep deterministic code in charge of:

- paths
- manifests
- checksums
- copy state
- deletion policy
- export formats

### 6. Color pipeline

Color should be staged:

- Preserve camera originals.
- Generate proxies for speed.
- Apply camera transform or LUT when known.
- Produce ranked grade candidates.
- Allow project-level and camera-level presets.
- Render editable intermediate assets before final social exports.

Future native implementation should evaluate AVFoundation, Core Image, Metal,
and industry tools such as FFmpeg where licensing and distribution allow.

## Storage layout

Default shoot layout:

```text
Shoots/
  2026/
    2026-05-07-desert-campaign/
      manifest.json
      originals/
        raw-photo/
        processed-photo/
        raw-video/
        video/
        audio/
      reference/
        color-log/
        sidecar/
        unknown/
      proxies/
      graded/
      social/
        reels/
        carousels/
        photos/
      review/
```

## Safety rules

- Card ingest defaults to copy.
- Move requests are represented as copy, verify, then human review.
- Source deletion is never added to an automated plan.
- Missing checksums produce warnings.
- Name collisions allocate new destination names instead of overwriting.
- Project manifests must be written before rendering derived assets.

## Next technical bets

- Add a drive detection adapter for macOS using Disk Arbitration or FileManager
  volume APIs.
- Add a CLI that can run ingest plans against a sample folder.
- Add SQLite schema and persistence for manifests.
- Add metadata extraction with ExifTool/FFprobe adapters behind interfaces.
- Add Swift package experiments once the native app scaffold begins.
