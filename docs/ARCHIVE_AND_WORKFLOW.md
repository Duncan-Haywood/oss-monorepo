# Archive and Content Workflow

## End-to-end user flow

1. User inserts an SD card or connects a drive.
2. PhotoFlow identifies candidate media sources and archive destinations.
3. User names the shoot or accepts a suggested name.
4. PhotoFlow creates an import plan and shows risk warnings.
5. User confirms copy-first ingest.
6. PhotoFlow copies originals, verifies checksums, and writes a manifest.
7. PhotoFlow generates thumbnails, proxies, and metadata.
8. AI analysis creates selects, rejects, tags, scenes, and deliverable ideas.
9. Color pipeline creates graded intermediates and look variants.
10. Content pipeline creates reels, carousels, and photo export drafts.
11. User reviews, revises, exports, and optionally feeds corrections back into
    style memory.

## Shoot workspace folders

```text
00_manifest/
  import-manifest.json
  operations.log
  model-runs.jsonl
01_originals/
  raw/
  jpeg/
  video/
  audio/
  sidecars/
02_proxies/
  thumbnails/
  video/
  waveform/
03_analysis/
  technical-rejects.json
  semantic-tags.json
  scenes.json
  selects.json
04_grades/
  photo/
  video/
  luts/
  sidecars/
05_drafts/
  reels/
  carousels/
  photo-sets/
06_exports/
  instagram/
  client-review/
07_handoff/
  editor-package/
```

The exact folder layout can evolve, but the manifest should remain portable and
complete enough to reconstruct state.

## Reel generation workflow

Inputs:

- selects and scene clusters;
- music or beat markers;
- target duration;
- aspect ratio and safe margins;
- client/style preferences.

Draft algorithm:

1. Pick a hook shot.
2. Build a loose story arc: establish, detail, action, emotion, payoff.
3. Avoid repeated near-duplicates unless repetition is intentional.
4. Choose crops that keep subjects in safe areas.
5. Place high-energy clips near beats.
6. Export multiple variants with reasons for each choice.

## Carousel generation workflow

Carousel sequence should feel editorial, not like random selects:

1. Cover frame that stops the scroll.
2. Establishing frame.
3. Detail or texture.
4. Human/product proof.
5. Alternate angle or motion still.
6. Closing frame, CTA, or strongest remaining hero.

## Color grading workflow

PhotoFlow should separate technical correction from creative look:

1. Detect camera, profile, and likely color space.
2. Normalize exposure and white balance.
3. Protect skin tones and highlight rolloff.
4. Apply scene-consistent look.
5. Generate small look variants before rendering every asset.
6. Persist grade settings and sidecars where possible.

## Human override points

- choose archive destination;
- mark do-not-use people or moments;
- approve delete-after-copy if ever offered;
- choose style reference;
- approve or reject selects;
- lock hero frames;
- revise grade intensity;
- approve final export.

Automation should reduce busywork, not remove control where stakes are high.
