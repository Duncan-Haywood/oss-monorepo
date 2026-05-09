# ShootFlow

ShootFlow is an early-stage personal tool and product concept for photographers
and videographers who want high-quality Instagram reels, carousels, and graded
intermediates without spending their lives on file wrangling.

The product direction is:

- ingest SD cards, local folders, SSDs, RAW/JPEG/log/video footage safely;
- never delete source media during ingest;
- copy with checksums, manifests, and conflict detection;
- build highly parallelizable color-grading and deliverable jobs;
- produce cinematic reels, carousels, feed photo sets, and intermediate graded
  masters for human review or editor handoff.

## Current repository state

This repo currently contains the first testable core utilities:

- `shootflow.ingest` plans and executes safe media copies.
- `shootflow.catalog` loads ingest manifests into a photo/video catalog for
  downstream production planning.
- `shootflow.analysis` loads per-asset VLM JSON outputs only when they match a
  trusted production plan, then binds them to graded artifact paths for story
  selection.
- `shootflow.assembly` consumes trusted storyline selections and produces
  explicit render tasks from verified graded assets, without performing media
  rendering or destructive file operations. It can persist those tasks to a
  strict `deliverables/render_tasks.json` manifest for future render workers,
  including chunked photo-set export tasks for high-volume shoots.
- `shootflow.render_status` persists a strict `deliverables/render_status.json`
  manifest keyed by trusted render task IDs so workers can resume, retry, and
  report progress without adding source-media paths or delete instructions.
  Status files are bound to a render-plan fingerprint so stale progress cannot
  be reused after storyline selections or render inputs change. Manifest-level
  compare/write helpers take a local advisory lock, update exactly one task
  status, and check the expected prior state, attempt, and optional timestamp
  lease token. A matching initialization helper can create the first all-pending
  status manifest from trusted render tasks, while refusing to reset existing
  progress or overwrite stale/mismatched status files.
- `shootflow.render_worker` turns trusted render tasks plus trusted status into
  dry-run worker actions. It schedules only dependency-ready pending/retryable
  tasks, reports blocked tasks, skips running/succeeded/failed tasks, claims
  ready work as running, and reports success/retry/failure statuses with
  checksums for declared deliverable outputs only. It can also plan explicit
  stale-running lease expirations as retryable status transitions and persist
  those expirations through the same compare/write boundary without granting
  cleanup or deletion authority.
- `shootflow.render_adapter` adds the first renderer-adapter boundary: a
  deterministic dry-run adapter that claims one trusted worker action, writes
  only its declared `deliverables/` outputs through non-overwriting placeholder
  files, reports checksums, and persists both claim and result through the
  single-task compare/write status path. It exposes an explicit registered
  adapter dispatch path for `dry-run-local`, so future ffmpeg/Core Image/Metal
  backends can plug into the same worker-action contract without forking status
  orchestration. It can also execute a trusted dry-run action plan in batches,
  running parallel-safe ready actions up to a caller supplied concurrency limit
  while preserving serial-only actions and leaving blocked tasks untouched for
  UI/scheduler visibility.
- `shootflow.render_scheduler` ties the dry-run render pieces into an iterative
  local orchestration loop: it reloads trusted status each pass, optionally
  persists stale lease expirations, plans dependency-ready actions, runs bounded
  dry-run batches, avoids hammering retryable tasks within the same run, and
  returns a compact completion/blocked/retryable/failed summary for a future Mac app.
  It can also persist `deliverables/render_scheduler_report.json`, a strict
  UI/agent handoff that records completed, retryable, failed, blocked,
  review-required, materialized-output, lease-conflict, and failure-message
  details without granting any new file authority.
- `shootflow.render_workspace` gives a Mac app, launch agent, or continuation
  automation a read-only inspection surface over persisted render handoffs. It
  loads the strict render-task manifest, optionally validates the matching
  status and scheduler reports, reports task counts, expected/materialized
  outputs, review-required task IDs, and safe next-action recommendations, and
  writes no files.
- `shootflow.cli` exposes the first background-agent commands:
  `python -m shootflow.cli init-production-status`,
  `python -m shootflow.cli dry-run-production-scheduler`,
  `python -m shootflow.cli init-render-status`, and
  `python -m shootflow.cli dry-run-render-scheduler`. The init command loads the
  strict persisted render-task manifest, creates the companion render-status
  manifest only when missing, and never resets existing matching progress. The
  scheduler command then runs the dry-run scheduler against the matching
  render-status manifest, writes the scheduler report, and can print that report
  as JSON for a Mac app or automation runner. The
  `inspect-render-workspace` command is read-only and summarizes current render
  state before initialization, after scheduling, or during retry/review loops.
- `shootflow.demo_workspace` can create a tiny persisted CLI smoke workspace for
  demos and native-shell testing. It writes deterministic placeholder graded
  inputs plus `deliverables/render_tasks.json`, refuses to overwrite existing
  different files, and leaves render-status/report creation to the normal CLI
  commands so existing progress is not reset. It can also create a synthetic
  card-dump-to-render demo workspace by building fake card/SSD volumes, running
  the real confirmed checksum ingest flow, and seeding the resulting shoot
  folder with the same persisted render-task smoke handoff.
- `shootflow.storage` ranks possible source and destination drives
  conservatively, then can recommend a review-required import route from a
  likely camera card/source to a writable SSD/local destination without granting
  deletion or blind-import authority. It also includes an optional
  capacity-gated recommendation path for high-volume shoots so estimated import
  size plus safety headroom can block risky destination choices.
- `shootflow.storage_discovery` is the first native-app-facing discovery
  bridge: it scans reviewed mounted-volume roots such as macOS `/Volumes`,
  skips symlinks/files/inaccessible entries, turns immediate volume directories
  into `StorageCandidate` records, and can feed the same capacity-gated route
  recommendation contract.
- `shootflow.macos_volume_metadata` is the richer native metadata bridge for a
  future Swift/Disk Arbitration shell. It accepts typed macOS volume facts,
  skips system, network, missing, file-backed, and symlinked mounts, maps
  ejectable/removable drives into the existing `StorageCandidate` contract, and
  reuses the same review-required, capacity-gated import-route recommendation.
- `shootflow.workspace_health` gives Mac shells, launch agents, and continuation
  automations a read-only health check over trusted handoff files. It reports
  whether render tasks, render status, and scheduler reports exist and validate,
  summarizes status counts, and suggests the next safe CLI action without
  creating, resetting, deleting, or repairing any files.
- `shootflow.deliverables` builds initial Instagram deliverable job plans.
- `shootflow.story` turns VLM analysis scores into ranked first-cut reel,
  carousel, photo-set, and named reel-variant recommendations, then persists
  the selections as a deterministic `analysis/instagram_storylines.json`
  edit-decision artifact.
- `shootflow.production` expands a shoot into deterministic proxy, VLM
  analysis, look-development, grading, storyline selection, and Instagram
  packaging waves.
- `shootflow.production_report` turns a verified `ingest_manifest.json` into a
  compact read-only production-wave report, giving a Mac app or launch agent the
  next safe screen after card offload without creating analysis, graded, or
  render files.
- `shootflow.production_status` persists a strict `production_status.json`
  manifest for proxy, analysis, grading, storyline, and package production jobs.
  It binds progress to the deterministic manifest-backed production-plan
  fingerprint, initializes only when missing, validates exact job ordering and
  states, and writes through the same no-follow, lock-protected local manifest
  pattern used by render status.
- `shootflow.production_worker` turns trusted production jobs plus trusted
  status into safe worker actions. It schedules only dependency-ready
  pending/retryable jobs, claims work as running, verifies declared output bytes
  before reporting success, reports retry/failure states without file cleanup
  authority, and pairs with guarded single-job compare/write status updates so
  stale workers cannot clobber newer production progress.
- `shootflow.production_adapter` proves that pre-render worker handoff with a
  deterministic dry-run adapter. It consumes only trusted production-worker
  actions, persists each claim and final result through the guarded
  `production_status.json` compare/write boundary, materializes only declared
  file outputs, refuses symlinked, directory-style, or different existing files,
  and reports retryable status without deleting source, graded, render, or
  deliverable media. It can also execute trusted action plans in bounded
  parallel batches while preserving serial-only production jobs and blocked-job
  visibility for UI/scheduler review.
- `shootflow.production_scheduler` runs the dry-run production adapter in an
  iterative local loop: each pass reloads trusted `production_status.json`,
  plans dependency-ready pending/retryable jobs, runs a bounded dry-run batch,
  requires explicit review before retrying a previously retryable job, avoids
  retrying a job that already became retryable in the same run, and returns
  explicit complete/blocked/retryable/failed/waiting state for Mac shells and
  background agents.
- `shootflow.card_workflow` ties mounted-volume route discovery, source-size
  estimation, checksum ingest preview, optional confirmed copy, and read-only
  production reporting into one product-facing card-dump workflow for Mac app
  shells and GTM demos. Its CLI JSON includes an `agent_handoff` block so
  native shells and launch agents can distinguish blocked routing,
  review-required previews, and post-ingest production-plan review without
  parsing prose notes.
- `shootflow.cli` also exposes `write-render-tasks`, a post-storyline
  handoff that rebuilds the manifest-backed production plan, verifies trusted
  storyline selections and graded artifacts through `shootflow.assembly`, then
  creates or reuses `deliverables/render_tasks.json` without rendering media or
  creating deliverable outputs.
- `shootflow.workspace_index` builds a metadata-only
  `shootflow_workspace_index.json` handoff for Mac apps, background agents, and
  continuation runs. It summarizes trusted ingest, render-task, render-status,
  and scheduler-report artifacts through their existing validators, marks
  model-authored storyline JSON as untrusted until rebound to a production plan,
  includes the health-derived next safe action, and never creates analysis,
  graded, render, deliverable, or deletion files.

The intended first workflow is:

1. Discover mounted-volume candidates from reviewed roots such as `/Volumes`,
   or pass native macOS volume metadata from a Swift/Disk Arbitration shell,
   then rank attached cards, folders, and SSDs and present a reviewed
   source-to-destination import route with explicit no-delete/checksum notes.
2. Plan and execute a safe import from the approved card, folder, or SSD.
3. Keep the generated `ingest_manifest.json` as the boundary between file
   management and AI/editing work.
4. Load the manifest with `shootflow.catalog`, which rechecks manifest
   location, destination paths, file sizes, and checksums before production.
5. Summarize the manifest-backed production plan with `plan-production` so a Mac
   UI can show asset counts, parallel waves, and planned IG deliverables before
   starting AI/color work.
6. Build production waves from manifest-backed photo/video assets so proxies,
   VLM analysis, color decisions, graded masters, storyline choices, and
   Instagram packages all trace back to verified originals.
7. Load VLM results with `shootflow.analysis` so social planning consumes graded
   artifact paths and rejects analysis that does not match the planned source
   assets.
8. Persist `shootflow.story` selections as a trusted storyline artifact for
   downstream reel, reel-variant, carousel, and photo-set assemblers.
9. Build `shootflow.assembly` render tasks that verify selected graded files
   exist, keep raw originals out of social assembly inputs, and write
   deterministic `deliverables/` targets for future renderers. Large ranked
   photo sets are split into resumable chunks while preserving stable public
   output names like `photo_00001.jpg`; named reel variants render under
   `deliverables/instagram_reels/` without replacing the default reel handoff.
10. Initialize `production_status.json` from the verified ingest manifest when
    a production worker or UI needs durable progress for proxy, analysis,
    grading, storyline, and packaging jobs before render tasks exist.
11. Ask for the next production wave from that durable status with
    `next-production-wave --use-production-status`, so background agents and Mac
    shells schedule only pending/retryable work whose dependencies are recorded
    as succeeded in `production_status.json` instead of rebuilding progress from
    caller-reported command-line IDs.
12. Use production-worker transition helpers to plan dependency-ready
    proxy/VLM/color/story jobs from trusted status, claim one matching attempt as
    running, verify every declared output before success, and report retry/failure
    states without deleting source, graded, or deliverable media.
13. Exercise those pre-render transitions with the dry-run production adapter
    before real proxy, VLM, look-development, grading, or storyline runners are
    wired in. The adapter writes only declared placeholder file artifacts and
    keeps stale claims, directory-style package outputs, or output conflicts
    visible in production status.
14. Run `python -m shootflow.cli dry-run-production-scheduler` when a local
    shell or background agent should advance trusted pre-render work from
    persisted status. The scheduler loops over status reload, ready-action
    planning, bounded dry-run batches, and retryable-job review stops without
    deleting or cleaning up source, graded, render, or deliverable files. A
    previously retryable job is retried only when the caller passes that reviewed
    job ID with `--retryable-job`.
15. Use `python -m shootflow.cli write-render-tasks` once the trusted storyline
    artifact and graded masters exist, so background agents and Mac shells can
    persist the assembly handoff from an `ingest_manifest.json` without
    reconstructing in-memory state or overwriting a different existing render
    task manifest.
16. Persist and reload `deliverables/render_tasks.json` against the trusted
   assembly plan so parallel render workers cannot consume model-authored or
   stale task JSON.
17. Initialize, persist, and reload `deliverables/render_status.json` against the
   same trusted render tasks so a Mac app, local renderer, or cloud worker can
   show pending, running, succeeded, failed, and retryable work safely without
   resetting prior progress.
18. Derive renderer-neutral worker actions from the trusted task/status pair
    before any ffmpeg/Core Image/DaVinci/cloud adapter opens media files.
19. Use worker status-transition helpers to claim ready work, reject stale
    attempts, and report completed outputs by checksum before persisting updated
    render status manifests through a single-task compare/write update.
20. Let the scheduler plan stale running leases from the trusted status
    manifest when a caller supplies an explicit cutoff, then persist each
    retryable transition through the same compare/write boundary with the
    observed `running_since` value as `expected_updated_at`, reporting
    same-attempt heartbeat refreshes as conflicts instead of clobbering them.
21. Exercise adapter orchestration with the registered dry-run renderer before
    introducing ffmpeg, Core Image/Metal, DaVinci Resolve, or cloud GPU backends.
    The adapter dispatch path refuses unsupported renderer names before any task
    claim; the adapter consumes only worker actions, refuses symlinked or different
    existing outputs, and never deletes source, graded, or deliverable files.
22. Use the dry-run batch scheduler to execute dependency-ready actions at a
    bounded local concurrency level, record stale-action failures without
    materializing outputs, and keep blocked/running/failed work visible for
    later retries or review.
23. Use the iterative dry-run scheduler to alternate trusted status reloads,
    guarded stale-lease expiration, ready-action planning, and bounded batch
    execution until the current render plan is complete, blocked, failed,
    waiting, or has retryable work that should not be hammered again without review.
24. Persist `deliverables/render_scheduler_report.json` against the trusted
    assembly plan and final render status so a Mac app, background agent, or next
    automation run can show what finished and what needs review without parsing
    worker internals.
25. Build or persist `shootflow_workspace_index.json` with
    `index-workspace` so native shells and future agents can discover the
    current shoot state from one strict metadata summary without trusting
    arbitrary model JSON or widening file authority.
26. Run the same handoff through
    `python -m shootflow.cli init-render-status` followed by
    `python -m shootflow.cli dry-run-render-scheduler` when a UI/background-agent
    process starts from persisted manifests instead of an in-memory production
    plan.
27. Inspect persisted render workspace state with
    `python -m shootflow.cli inspect-render-workspace` so UIs and continuation
    agents can decide whether to initialize status, run the scheduler, review
    blocked/retryable work, or review finished deliverables without writing
    files. Succeeded render outputs must still be present and match their
    recorded SHA-256 checksums before inspection reports the workspace complete.
28. Use `python -m shootflow.cli card-dump-workflow` as the first complete
    native-shell handoff from detected volumes to previewed ingest, and only
    with `--confirm-ingest`, verified copy plus a read-only production summary.
    The report includes machine-readable `agent_handoff` fields for the next
    safe step and whether that step requires human review or may copy bytes.
29. Use `shootflow.demo_workspace.create_persisted_cli_demo_workspace(...)` to
    build a safe, repeatable persisted-manifest smoke workspace for Mac UI shells,
    GTM demos, and continuation agents without touching source media or resetting
    render progress. Use `create_card_dump_cli_demo_workspace(...)` or
    `python -m shootflow.cli create-card-dump-demo-workspace` when a demo should
    also prove the detected-card -> checksum-ingest -> production-summary path.
30. Run `python -m shootflow.cli workspace-health --workspace <dir>` whenever a
    native shell, launch agent, or automation resumes a shoot. The command
    validates the durable handoff files it can trust, reports invalid handoffs
    for review, and prints the next safe command instead of trying to repair or
    advance the workspace itself.

The current persisted-manifest CLI flow is:

```bash
PYTHONPATH=src python3 -m shootflow.cli workspace-health --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli init-production-status \
  --ingest-manifest <dir>/ingest_manifest.json
PYTHONPATH=src python3 -m shootflow.cli next-production-wave \
  --ingest-manifest <dir>/ingest_manifest.json \
  --use-production-status
PYTHONPATH=src python3 -m shootflow.cli dry-run-production-scheduler \
  --ingest-manifest <dir>/ingest_manifest.json \
  --worker dry-run-production-local \
  --started-at 2026-05-07T15:59:00Z \
  --completed-at 2026-05-07T15:59:05Z \
  --max-concurrency 3 \
  --max-iterations 10
PYTHONPATH=src python3 -m shootflow.cli init-render-status --workspace <dir>
PYTHONPATH=src python3 -m shootflow.cli dry-run-render-scheduler --workspace <dir> \
  --completed-dependency rank_instagram_storylines \
  --renderer dry-run-local \
  --started-at 2026-05-07T16:00:00Z \
  --completed-at 2026-05-07T16:00:05Z \
  --generated-at 2026-05-07T16:00:06Z
PYTHONPATH=src python3 -m shootflow.cli index-workspace --workspace <dir> \
  --generated-at 2026-05-07T16:00:07Z \
  --write
PYTHONPATH=src python3 -m shootflow.cli inspect-render-workspace --workspace <dir>
```

The production-status init command writes only `production_status.json` in the
shoot workspace, never creates analysis/graded/render/deliverable outputs, and
refuses stale status manifests whose production-plan fingerprint no longer
matches the verified ingest manifest. The dry-run production scheduler then
advances only dependency-ready jobs from that trusted status file, reports
retryable or blocked jobs for review, retries prior retryable jobs only when
their IDs are explicitly supplied with `--retryable-job`, and does not retry a
newly retryable job in the same run. The render-status init command writes only
metadata under `deliverables/`, never deletes media, and fails rather than
overwriting an existing status manifest that no longer matches the trusted
render-task plan.
The index command writes only `shootflow_workspace_index.json`, summarizing
validated artifacts and explicitly marking unvalidated storyline JSON as
non-authoritative. It also embeds the same read-only next safe action exposed by
`workspace-health`, so native shells and continuation agents can render one
coherent state snapshot without granting the index any write authority. When a
trusted render-task handoff exists, both workspace health and the index include a
metadata-only `render_inputs_fingerprint` plus `render_input_count` over the
current storyline/graded inputs, giving future agents a cheap way to detect
in-place input changes between snapshots without changing renderer authority.
The inspection command writes nothing; it fails closed if an existing status or
scheduler report no longer matches the trusted render-task plan, and it marks
succeeded tasks for review if their declared deliverable files are missing,
symlinked, or checksum-mismatched.

The import-route planning flow is:

```bash
PYTHONPATH=src python3 -m shootflow.cli plan-import-route \
  --volume-root /Volumes \
  --estimate-source-bytes \
  --headroom-bytes 34359738368 \
  --print-candidates
```

This command performs mounted-volume discovery and emits a review-required JSON
recommendation for source/destination routing. It can estimate media bytes from
the discovered source and apply a destination capacity gate before ingest.
It does not copy files, delete source media, or grant destructive authority.

The unified card-dump workflow for a Mac app shell or demo is:

```bash
# Preview detected route + checksum copy plan. No bytes are copied.
PYTHONPATH=src python3 -m shootflow.cli card-dump-workflow \
  --volume-root /Volumes \
  --shoot-date 2026-05-08 \
  --shoot-slug desert-editorial \
  --destination-subfolder ShootFlow

# Execute the same reviewed route and then print the read-only production summary.
PYTHONPATH=src python3 -m shootflow.cli card-dump-workflow \
  --volume-root /Volumes \
  --shoot-date 2026-05-08 \
  --shoot-slug desert-editorial \
  --destination-subfolder ShootFlow \
  --confirm-ingest
```

Without `--confirm-ingest`, this command only discovers, estimates, and previews
the copy plan. With `--confirm-ingest`, it still never deletes source media,
never overwrites different destination bytes, verifies every copied item by
SHA-256, writes `ingest_manifest.json`, and then runs read-only production
planning from that manifest. Confirmed card-dump reports include
machine-readable `next_actions` for preparing trusted storyline/graded artifacts
and invoking `write-render-tasks`, so native shells do not need to infer the
next safe handoff from nested paths. The report also includes an `agent_handoff`
block: the machine-readable launch-agent/UI contract (`fix_route` for blocked
discovery, `review_preview` before any confirmed copy, `review_production_plan`
after a verified ingest).

For repeatable GTM or native-shell smoke demos that need to prove the full
card-dump-to-render handoff without real media, create a synthetic demo tree:

```bash
PYTHONPATH=src python3 -m shootflow.cli create-card-dump-demo-workspace \
  --workspace /tmp/shootflow-demo \
  --shoot-date 2026-05-08 \
  --shoot-slug launch-demo \
  --destination-subfolder ShootFlow
```

The command creates fake card/SSD volumes under the supplied workspace, runs the
same confirmed checksum ingest path as `card-dump-workflow`, writes the resulting
`ingest_manifest.json`, and seeds the shoot folder with deterministic
`deliverables/render_tasks.json` inputs. It still leaves render-status
initialization and scheduler execution to the normal CLI commands, never deletes
source media, and refuses to overwrite existing different demo files or
unexpected source media.

The safe ingest CLI flow (after operator review of the planned route) is:

```bash
# 1) Preview which media files would be copied. Computes SHA-256 checksums but
#    never copies bytes and never writes a manifest.
PYTHONPATH=src python3 -m shootflow.cli preview-ingest \
  --source /Volumes/EOS_DIGITAL \
  --destination /Volumes/Samsung_T7/ShootFlow \
  --shoot-date 2026-05-08 \
  --shoot-slug desert-editorial

# 2) Execute the safe checksum-verified copy. Without --confirm the command
#    refuses to run; with --confirm it copies through temporary files, verifies
#    each destination's SHA-256, and writes ingest_manifest.json in the shoot folder.
PYTHONPATH=src python3 -m shootflow.cli execute-ingest \
  --source /Volumes/EOS_DIGITAL \
  --destination /Volumes/Samsung_T7/ShootFlow \
  --shoot-date 2026-05-08 \
  --shoot-slug desert-editorial \
  --confirm
```

The ingest CLI never deletes source media, never overwrites destination files
with different bytes, rejects symlinked source/destination paths, and writes
the manifest only after every copy passes its SHA-256 check. `execute-ingest`
requires explicit `--confirm` so background-agent automation cannot trigger a
copy by accident.

After ingest, the read-only production-plan report is:

```bash
PYTHONPATH=src python3 -m shootflow.cli plan-production \
  --ingest-manifest /Volumes/Samsung_T7/ShootFlow/2026-05-08_desert-editorial/ingest_manifest.json
```

This reloads and revalidates the manifest, skips non-photo/video files for
production, summarizes asset counts, parallel production waves, and planned IG
deliverables, and writes no analysis, graded, render-task, status, or
deliverable files.

After the AI/color pipeline has written trusted `analysis/instagram_storylines.json`
and `graded/` artifacts, the persisted assembly handoff is:

```bash
PYTHONPATH=src python3 -m shootflow.cli write-render-tasks \
  --ingest-manifest /Volumes/Samsung_T7/ShootFlow/2026-05-08_desert-editorial/ingest_manifest.json \
  --photo-set-chunk-size 250
```

This rebuilds the manifest-backed production plan, verifies storyline selections
against trusted graded outputs, writes `deliverables/render_tasks.json` only when
missing, and refuses to replace an existing different render-task manifest. It
does not render media, delete sources, or create deliverable outputs. Its JSON
summary includes `next_actions` for `init-render-status` and the
`dry-run-render-scheduler` command, including the trusted completed dependency
IDs the scheduler needs. Runtime-only arguments are called out separately so app
shells can ask for timestamps/render adapter settings at the right layer.

## Run tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Product docs

- `docs/PRODUCT_STRATEGY.md`
- `docs/BUSINESS_PLAN.md`
- `docs/DESIGN_DECISIONS.md`
- `docs/TERMS_AND_CONDITIONS_DRAFT.md`
- `docs/CONTINUATION_NOTES.md`