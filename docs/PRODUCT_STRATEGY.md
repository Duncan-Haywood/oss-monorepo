# ShootFlow Product Strategy

## Audience

ShootFlow is for photographers, videographers, creators, and small studios who
need a faster path from shoot day to polished Instagram output. The initial
buyer likely already feels one of these pains:

- They lose evenings to culling, copying cards, matching color, and exporting
  social formats.
- They pay an editor but still spend time preparing drives, writing notes,
  chasing turnaround, and requesting social cutdowns.
- They have valuable old footage and raw files sitting unused because turning
  archives into posts is too much operational work.

## Product promise

Dump a card or folder into the app. ShootFlow safely organizes the media,
produces graded intermediates, and proposes high-quality reels, carousels, and
photo sets with enough control for professionals to trust the output.

## Wedge

The first wedge is not "replace the editor." It is "remove the boring parts of
media operations while improving social output throughput." That wedge is easier
to trust and sell:

1. Safe ingest from SD cards and SSDs.
2. Repeatable shoot organization and manifests.
3. Bulk grading and select generation.
4. IG-ready reels/carousels/photos from graded intermediates.
5. Optional review and handoff to an editor.

## Differentiation

- **Media safety first:** never delete card/source media, never overwrite
  different bytes, always emit manifests.
- **Parallel by design:** per-asset jobs can scale across local compute, cloud
  workers, or future device clusters.
- **Quality before speed theater:** use VLM analysis and scene grouping before
  grading so the output looks like one coherent shoot, not 10,000 individually
  optimized files.
- **Professional control:** humans can review drive detection, selects, grading
  references, and final deliverables before export.
- **Archive aware:** old shoots and new cards use the same import, catalog, and
  deliverable pipeline.

## Workflow value

The current core models a concrete promise for high-volume users:

1. Ingest safely from a card, local folder, or SSD.
2. Preserve originals and emit a manifest.
3. Fan out proxy and VLM analysis work across every asset.
4. Rejoin at scene grouping and look development so the grade is consistent.
5. Fan out graded master rendering.
6. Rank storylines from VLM quality, scene, and narrative signals.
7. Plan renderer-neutral assembly tasks from verified graded storyline selects.
8. Assemble reels, carousels, and photo sets from graded masters.

This is the right business wedge because it can save time even before the AI is
perfect. A photographer or editor can trust the file organization, review the
structured job plan, and then decide how much of the color and social packaging
to automate.

## Business model options

- Solo creator subscription for local-only ingest, organization, and batch
  exports.
- Pro subscription with accelerated cloud/vLLM processing, team presets, and
  shared review links.
- Studio/editor workflow tier for client folders, handoff packages, and
  recurring brand looks.
- Usage-based compute add-on for very large shoots and video-heavy archives.

## Next product bets

1. Desktop ingest assistant that ranks likely SD cards and SSD destinations.
2. Color-look profile model that can learn from a reference edit or existing
   Lightroom/DaVinci exports.
3. Selects model that creates several reel/carousel narratives instead of one
   brittle "best" output. The first implemented contract now ranks VLM asset
   analysis into scene-diverse first-cut reels, scene-varied carousels, and
   complete ranked photo sets, then persists those choices as a deterministic
   edit-decision artifact for review/export. The next contract turns those
   selections into verified render tasks so a future local or cloud renderer can
   execute the package without trusting raw model paths.
4. Review UI for accepting, tweaking, or regenerating deliverables.
5. iPhone companion for review, approvals, publishing prep, and mobile imports.
