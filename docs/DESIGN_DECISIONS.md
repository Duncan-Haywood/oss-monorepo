# ShootFlow Design Decisions

This document records decisions future agents should preserve unless there is a clear reason to change them.

## 1. File safety is the product's foundation

Photographers trust the tool with irreplaceable work. The current ingest implementation follows these rules:

- Never delete source media.
- Never overwrite a destination file when the bytes differ.
- Verify SHA-256 and byte size after each copy.
- Use temporary files for in-progress copies.
- Reject symlinked source media and symlinked destination paths.
- Write a manifest for every shoot import.

Deletion, card formatting, and source cleanup should remain out of scope until the product has explicit backup verification, human review, and recovery flows.

## 2. Drive detection is advisory, not magical

The storage ranking module intentionally makes conservative recommendations:

- Camera-card-like volumes are review-only sources and never automatic destinations.
- Large writable SSDs can be automatic destinations.
- Unknown or read-only volumes require review.

The Mac app should expose this reasoning to the user instead of silently moving data. Confidence labels and clear copy plans are more important than clever automation.

## 3. Pipeline shape favors parallel waves

The target production pipeline should stay wave-oriented:

1. Ingest and manifest.
2. Generate proxies and thumbnails per asset.
3. Run per-asset VLM/vision/audio analysis in parallel.
4. Group scenes and moments.
5. Develop a shoot-level color look.
6. Render graded masters per asset in parallel.
7. Rank storylines and assemble IG deliverables.

Per-asset work should be isolated and retryable. Global decisions such as scene grouping, look development, and final storyline ranking should happen after enough per-asset evidence exists.

## 4. Local-first with optional cloud acceleration

The personal tool should work with local drives and local files first. Cloud acceleration can help with heavy VLM analysis and rendering, but it must not become mandatory for basic ingest, organization, and preview deliverables.

Recommended split:

- Mac app: drive detection, import, preview, orchestration, batch progress, local render queue.
- iPhone app: review queue, select approval, shoot notes, lightweight posting prep.
- Cloud workers: optional parallel analysis/render jobs for large paid workloads.

## 5. Deliverables are plans before renders

The current `shootflow.deliverables` module produces deterministic job plans instead of rendered files. This is intentional: early iterations should make the selection and sequencing logic testable before adding expensive media processing dependencies.

Future renderers should consume job plans and produce:

- IG Reel timelines.
- Carousel export folders.
- Ranked photo sets.
- Client/editor review packages.

## 6. Instagram automation should keep a human review gate

The tool can prepare captions, hashtags, reels, carousels, and posting packages automatically. Direct posting should remain optional and review-gated because creators care about brand voice, subject consent, and client approvals.

## 7. Quality bar

The value proposition depends on quality, not just automation. Future VLM/color work should optimize for:

- Consistent color across mixed cameras.
- Cinematic but natural skin tones.
- Preservation of highlight detail.
- Scene-aware contrast and saturation.
- Taste profiles per photographer.
- Editor override and feedback loops.

