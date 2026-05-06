# Product Strategy

## Target customer

Primary users are working photographers, videographers, creators, and small
studios who regularly shoot enough content that ingesting, culling, grading, and
assembling social deliverables steals time from shooting or client work.

The sharpest early customer is a shooter who already pays an editor or spends
late nights editing after every shoot. They value:

- faster turnaround from card dump to usable Instagram assets
- more output per shoot without lower taste
- predictable file organization across SD cards, SSDs, and archives
- intermediate exports they can still tweak in Lightroom, Resolve, Final Cut, or
  Capture One
- confidence that original media will not be lost or silently modified

## Product wedge

Start with a "shoot-to-social assistant" rather than a general editing suite.
The app should ingest a shoot, create a safe local library, grade selects, and
generate draft reels, carousels, and photo posts. The user should review and
steer taste, not micromanage every clip.

The first paid-worthy promise is:

> Dump a card or folder, pick a vibe, and get organized originals plus editable
> graded outputs and social drafts in one place.

## Why this can be commercially viable

- Creators already spend money on editors, presets, storage, delivery tools, and
  content schedulers.
- Existing tools solve parts of the workflow, but the pain is the handoff across
  ingest, organization, grading, selection, and social packaging.
- Local-first processing is attractive because professional footage is large,
  private, and expensive to upload repeatedly.
- A high-quality assistant can increase editor throughput instead of only
  replacing editors: one editor can review more machine-generated options.

## Differentiation

1. **File safety before AI magic.** Trust comes from never losing originals.
2. **Taste loops.** The product should learn reusable looks, references, client
   preferences, pacing, and creator voice over time.
3. **Parallel media engine.** Large shoots should be processed in batches across
   CPU, GPU, Neural Engine, and optional cloud workers.
4. **Editable intermediates.** Export LUTs, sidecars, graded stills, proxies,
   project timelines, and manifests so professionals are not locked in.

## Initial packaging

- Personal tool: local Mac app with a command-line core for batch operations.
- Creator pro product: paid desktop app with optional iPhone companion for
  review, selects, capture notes, and publishing prep.
- Studio/team tier later: shared taste profiles, editor queues, and audit logs.

## Near-term build priorities

1. Safe ingest planning and copy verification.
2. Shoot manifest with hashes, media types, camera metadata, and sidecar links.
3. Proxy generation and preview cache.
4. Select ranking using blur, exposure, faces/subjects, moments, and duplicate
   detection.
5. Look matching from references, LUTs, and natural-language direction.
6. Reel/carousel draft generation with editable timelines and captions.
