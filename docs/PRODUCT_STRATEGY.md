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
8. Track render progress and retry safety through a trusted status manifest.
9. Schedule only dependency-ready pending/retryable render work through a dry-run
   worker action plan.
10. Claim ready work as running and report success/retry/failure with checksums
    for expected deliverable outputs.
11. Persist each claim or result with a single-task compare/write status update
    that holds a local advisory lock and rejects stale state or attempt
    preconditions, with an optional `updated_at` lease token for timeout-sensitive
    updates.
12. Recover from interrupted local workers by planning explicit stale-running
    lease expirations from trusted status plus a caller-provided cutoff, then
    persisting each retryable transition through the same compare/write path so
    same-attempt heartbeat refreshes cannot be overwritten by stale schedulers.
    Conflicted expirations remain visible to the scheduler/UI as "another worker
    already changed this task" rather than being hidden as generic failures.
13. Prove renderer orchestration with a dry-run adapter that consumes only
    ready worker actions, persists claim/result transitions, writes only
    declared deliverable outputs, and refuses to overwrite existing different
    files.
14. Execute trusted dry-run action batches with bounded local concurrency so
    parallel-safe photo-set chunks can progress quickly while serial actions,
    stale claims, and blocked tasks stay explicit.
15. Run an iterative dry-run scheduler loop that reloads trusted render status,
    safely expires stale leases, plans ready work, executes bounded batches, and
    stops with explicit complete/blocked/retryable/failed/waiting state for the Mac app
    or background agent.
16. Persist a strict scheduler report for the Mac app or next background agent,
    including completed outputs, retryable/failed/blocked tasks, review-required
    task IDs, stale-lease conflicts, and human-readable failure messages.
17. Assemble reels, carousels, and photo sets from graded masters.

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
   brittle "best" output. The implemented contract now ranks VLM asset analysis
   into a scene-diverse first-cut reel, named `hero`, `behind_the_scenes`, and
   `fast_cut` reel variants, scene-varied carousels, and complete ranked photo
   sets, then persists those choices as a deterministic edit-decision artifact
   for review/export. Assembly turns those selections into verified render tasks
   so a future local or cloud renderer can execute the package without trusting
   raw model paths. Render status manifests now let that renderer report
   pending/running/succeeded/failed/retryable progress without introducing new
   file authority, and render-worker action plans identify ready or blocked work
   before any adapter opens media files. Worker status-transition helpers now
   let adapters claim a matching attempt and report completed outputs by checksum
   without receiving authority to invent paths or delete media; compare/write
   status updates keep stale local workers from overwriting newer task progress.
   Stale-running lease plans now give schedulers a conservative way to retry
   interrupted work without treating a timeout as permission to clean up or
   delete media. The first dry-run renderer adapter now exercises this contract
   end-to-end by claiming one trusted action, materializing deterministic
   placeholder outputs under `deliverables/`, refusing symlinked or different
   existing outputs, and persisting success or retryable status updates through
   the same compare/write boundary.
   The dry-run adapter can now run a trusted action plan in batches, respecting
   each action's serial/parallel flag, capping local concurrency, preserving
   blocked-task visibility, and recording stale-action failures without
   materializing outputs or deleting media.
   Stale-running lease expirations can now be persisted as guarded retryable
   status updates, with heartbeat-refresh conflicts reported at task granularity.
   The dry-run scheduler now loops over trusted status reloads, stale-lease
   expiration, ready-action planning, and bounded batch execution until the plan
   is complete or explicitly blocked/retryable/failed/waiting. It also avoids retrying a
   task again in the same run after that task becomes retryable, which protects
   manual editor exports and other persistent output conflicts from tight-loop
   overwrite attempts.
   Scheduler runs can now persist `deliverables/render_scheduler_report.json` as
   the product-facing summary for UI/retry/agent handoff, bound to the trusted
   render-plan fingerprint and final status manifest so stale or model-authored
   reports cannot invent tasks, outputs, or review state.
4. Review UI for accepting, tweaking, or regenerating deliverables.
5. iPhone companion for review, approvals, publishing prep, and mobile imports.
