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

1. Safe source/destination detection for SD cards, local folders, and SSDs.
2. Reviewed ingest from SD cards and SSDs with no source deletion.
3. Repeatable shoot organization and manifests.
4. Bulk grading and select generation.
5. IG-ready reels/carousels/photos from graded intermediates.
6. Optional review and handoff to an editor.

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

1. Discover mounted-volume candidates from reviewed roots or typed native macOS
   metadata, rank detected storage, then recommend a review-required
   source/destination route.
2. Ingest safely from the approved card, local folder, or SSD.
3. Preserve originals and emit a manifest.
4. Generate a read-only production-plan report from that manifest so the user
   can review asset counts, parallel wave shape, and planned IG deliverables
   before AI/color jobs start writing new artifacts.
5. Fan out proxy and VLM analysis work across every asset.
6. Rejoin at scene grouping and look development so the grade is consistent.
7. Fan out graded master rendering.
8. Rank storylines from VLM quality, scene, and narrative signals.
9. Persist renderer-neutral assembly tasks from verified graded storyline
   selects through `write-render-tasks`, creating or reusing
   `deliverables/render_tasks.json` without rendering deliverables.
10. Initialize and track render progress and retry safety through a trusted
   status manifest that never resets existing matching progress.
11. Schedule only dependency-ready pending/retryable render work through a dry-run
   worker action plan.
12. Claim ready work as running and report success/retry/failure with checksums
    for expected deliverable outputs.
13. Persist each claim or result with a single-task compare/write status update
    that holds a local advisory lock and rejects stale state or attempt
    preconditions, with an optional `updated_at` lease token for timeout-sensitive
    updates.
14. Recover from interrupted local workers by planning explicit stale-running
    lease expirations from trusted status plus a caller-provided cutoff, then
    persisting each retryable transition through the same compare/write path so
    same-attempt heartbeat refreshes cannot be overwritten by stale schedulers.
    Conflicted expirations remain visible to the scheduler/UI as "another worker
    already changed this task" rather than being hidden as generic failures.
15. Prove renderer orchestration with a dry-run adapter that consumes only
    ready worker actions, persists claim/result transitions, writes only
    declared deliverable outputs, and refuses to overwrite existing different
    files.
16. Execute trusted dry-run action batches with bounded local concurrency so
    parallel-safe photo-set chunks can progress quickly while serial actions,
    stale claims, and blocked tasks stay explicit.
17. Run an iterative dry-run scheduler loop that reloads trusted render status,
    safely expires stale leases, plans ready work, executes bounded batches, and
    stops with explicit complete/blocked/retryable/failed/waiting state for the Mac app
    or background agent.
18. Persist a strict scheduler report for the Mac app or next background agent,
    including completed outputs, retryable/failed/blocked tasks, review-required
    task IDs, stale-lease conflicts, and human-readable failure messages.
19. Invoke the same init/scheduler/report handoff from persisted-manifest CLI
    commands so a Mac launch agent, menu-bar app, or automation runner can
    bootstrap and advance work without reconstructing the production planner in
    memory.
20. Resume safely with `workspace-health`: a read-only command that validates
    whichever handoff files exist, reports invalid manifests for review, shows
    render status counts, and prints the next safe command without writing or
    resetting anything.
21. Drive safe ingest itself through the same CLI surface: `preview-ingest`
    plans a checksum-verified copy and prints planned items as JSON without
    moving bytes; `execute-ingest --confirm` runs the existing safe copy +
    manifest contract (no source deletion, no overwriting different bytes,
    SHA-256-verified, deterministic `ingest_manifest.json`). The explicit
    `--confirm` requirement keeps background-agent automation from triggering
    a card copy by accident.
22. Offer a unified `card-dump-workflow` command for native-shell demos and the
    first Mac UI integration. It discovers a reviewed route, estimates source
    media size, capacity-gates the destination, previews the checksum copy, and
    only with `--confirm-ingest` performs the copy plus a read-only production
    summary. Confirmed reports now include explicit `next_actions` for trusted
    storyline/grading preparation and the subsequent render-task handoff.
23. Use `write-render-tasks` after trusted analysis/storyline/grading artifacts
    exist so production shoots can enter the same persisted init/status/scheduler
    flow that demos already exercise. Its summary now points native shells at
    `init-render-status` and `dry-run-render-scheduler` with the trusted
    completed dependency IDs included, while keeping runtime scheduler
    parameters outside the static handoff.
24. Create repeatable persisted-manifest smoke/demo workspaces through the core
    helper so Mac UI shells and GTM demos exercise the same init/status/scheduler
    handoff as real shoots.
25. Summarize the current shoot workspace through `index-workspace`, a
    metadata-only command that validates existing trusted artifacts and gives
    UI/agent layers one coherent handoff without treating raw model JSON as
    authority.
26. Assemble reels, carousels, and photo sets from graded masters.

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

1. Desktop ingest assistant that turns detected SD cards, folders, and SSD destinations into a reviewed
   import route. The current core now includes portable mounted-volume discovery, a typed native macOS
   metadata adapter for Disk Arbitration/Swift handoff, capacity-gated route recommendation, safe ingest
   commands, a read-only `plan-production` report after ingest, and a
   `write-render-tasks` handoff once trusted storyline/graded artifacts exist;
   the next step is a SwiftUI/menu-bar approval screen around the
   `card-dump-workflow` contract before proxy/analysis/grading work begins.
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
   The first CLI commands now start from persisted render-task manifests,
   safely initialize the matching render-status manifest when it is missing,
   preserve existing progress on repeated launches, run the trusted dry-run
   scheduler, write that report, and can print JSON summaries for a Mac app or
   background automation process. The demo workspace helper now creates a tiny
   trusted persisted render-task workspace for smoke tests and product demos
   without bypassing the real init/status/scheduler path. The workspace index
   now gives those shells a single metadata snapshot across ingest, storyline,
   render-task, render-status, and scheduler-report artifacts, while preserving
   each artifact's original trust boundary.
4. Review UI for accepting, tweaking, or regenerating deliverables.
5. iPhone companion for review, approvals, publishing prep, and mobile imports.

## Focus decision: who we serve first

ShootFlow should prioritize one paying segment first, then expand:

1. **Primary ICP (v1):** professional photographers/videographers with recurring
   client work (weddings, events, portrait/editorial teams) who process large
   weekly batches and can justify paid software quickly.
2. **Secondary ICP (v1.5+):** creator businesses (small teams or solo creators
   with sponsorship workflows) that need more output consistency and throughput.
3. **Later ICP:** casual creators and hobbyists, once the workflow is stable and
   support burden is low enough for lower-price plans.

Why this order:

- Pros feel pain weekly, not occasionally.
- Pros already pay either with hours or with editor spend.
- Pros care about safe ingest + predictable turnaround, which is ShootFlow's
  strongest moat versus generic AI editing apps.

## Product packaging and platform strategy

- **Mac app first:** full ingest/organize/edit/export automation for high-volume
  local media workflows and attached drives.
- **iPhone app second (companion):** review selects, approve reels/carousels,
  annotate grade tweaks, and prep captions/calendars while away from desk.
- **Cloud optional, local default:** local processing and storage should remain
  first-class so customers are not forced to upload terabytes. Cloud acceleration
  can be an opt-in compute booster for burst jobs.

## Monetization strategy (working model)

- **Base subscription:** local-first pipeline (ingest safety, organization, batch
  grading, draft IG deliverables).
- **Pro tier:** stronger presets/looks, collaboration/review tools, and faster
  job orchestration.
- **Usage add-on:** optional accelerated VLM/render credits for very large shoots
  or faster turnaround windows.

Pricing should be anchored against time/editor replacement value, not only
"software category" pricing. A credible value story:

- If users save 8-15 hours/week of editing/admin time or avoid part of editor
  spend, even a premium monthly price can remain ROI-positive.
- The product promise should be "more high-quality outputs per week with less
  operational overhead," not guaranteed engagement outcomes.

## Go-to-market thesis

- **Primary channel:** Instagram-native marketing (creator/pro reels showing
  before/after workflow speed, not only visual quality).
- **Secondary channels:** partnerships with editing educators, wedding/photo
  communities, and post-production agencies.
- **Positioning:** "the safest way to turn card dumps into client-ready and
  IG-ready deliverables at scale."

Messaging should emphasize:

1. Source-media safety (no destructive ingest).
2. Predictable ingest-to-deliverable turnaround.
3. Better content throughput without adding editing headcount.

## Operational trust policy (card offload + deletion boundaries)

To keep the product useful for professionals, ingest must stay conservative:

1. **Detection is advisory:** drive/card detection proposes a route for review; it
   is never permission to start destructive actions.
2. **Offload before edit:** users should route source card -> working destination
   first, then run grading/assembly from the ingest manifest boundary.
3. **Capacity gate by default:** destination selection should require estimated
   import bytes plus safety headroom before route status is `ready_for_review`.
4. **No-delete lock:** source deletion and card formatting remain explicitly out of
   scope for default workflows; any future cleanup features should be opt-in,
   delayed, and recoverable.
5. **Backup reminder baked in:** route recommendations should continue to include
   notes to verify backups before ejecting cards.

## Audience split: one core engine, staged packaging

The request spans three real segments, but they should share one execution core:

- **Pro service teams (primary):** photographers/videographers with recurring
  paid client turnaround pressure.
- **Creator businesses (secondary):** social-first teams optimizing weekly output
  velocity and consistency.
- **Casual creators (later):** lower willingness to pay, higher support load.

Execution implication: the product should keep one deterministic ingest -> grade
-> social package engine while exposing different workflow presets and pricing,
instead of branching into separate codebases too early.
