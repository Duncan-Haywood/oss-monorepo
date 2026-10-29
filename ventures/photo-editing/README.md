# ShootFlow

ShootFlow is an early-stage personal tool and product concept for photographers
and videographers who want high-quality Instagram reels, carousels, and graded
intermediates without spending their lives on file wrangling.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/photo-editing/

The product direction is:

- ingest SD cards, local folders, SSDs, RAW/JPEG/log/video footage safely;
- never delete source media during ingest;
- copy with checksums, manifests, and conflict detection;
- build highly parallelizable color-grading and deliverable jobs;
- produce cinematic reels, carousels, feed photo sets, and intermediate graded
  masters for human review or editor handoff.

## Process a shoot overnight on your Mac (ffmpeg)

ShootFlow can now turn an ingested shoot into real media on your own machine,
unattended, with nothing uploaded anywhere. It needs `ffmpeg` (`brew install
ffmpeg`) and Python 3.10+. Run these from `ventures/photo-editing/`.

```bash
# 1. Copy the card to your SSD with checksums (never deletes the card).
PYTHONPATH=src python3 -m shootflow.cli execute-ingest \
  --source /Volumes/EOS_DIGITAL --destination /Volumes/SSD/shoots \
  --shoot-date 2026-10-18 --shoot-slug wedding --confirm

# 2. Optional: drop your look in as a 3D LUT (.cube), e.g. a log-to-Rec.709 LUT.
mkdir -p /Volumes/SSD/shoots/2026-10-18_wedding/color
cp MyLook.cube /Volumes/SSD/shoots/2026-10-18_wedding/color/shoot_look.cube

# 3. Run every stage now...
PYTHONPATH=src python3 -m shootflow.cli run-local-pipeline \
  --ingest-manifest /Volumes/SSD/shoots/2026-10-18_wedding/ingest_manifest.json \
  --max-concurrency 3

# ...or have launchd run it at 01:30 every night.
PYTHONPATH=src python3 -m shootflow.cli write-launchd-plist \
  --ingest-manifest /Volumes/SSD/shoots/2026-10-18_wedding/ingest_manifest.json \
  --output ~/Library/LaunchAgents/dev.shootflow.local-pipeline.plist
launchctl load ~/Library/LaunchAgents/dev.shootflow.local-pipeline.plist
```

What you get in the shoot folder:

| Folder | Contents |
| --- | --- |
| `proxies/` | Review/selection proxies: photos ≤1024 px, H.264 video ≤960 px |
| `graded/` | Full-resolution masters with your LUT applied: ProRes 422 HQ for `.MOV`, high-bitrate H.264 for `.MP4`, photos in their own format |
| `deliverables/instagram_reel.mp4`, `deliverables/instagram_reels/` | 1080×1920 H.264 reels cut from the selected clips (≤4 s each, ≤90 s total, no audio) |
| `deliverables/instagram_carousel/`, `deliverables/instagram_photo_set/` | 1080×1350 (4:5) JPEGs |

How it stays fast and safe:

- **Hardware encoders.** On a Mac, H.264 and ProRes use VideoToolbox
  (`h264_videotoolbox`, `prores_videotoolbox`); elsewhere `libx264`/`prores_ks`.
  Override with `SHOOTFLOW_H264_ENCODER` / `SHOOTFLOW_PRORES_ENCODER`.
- **Parallel jobs.** Each proxy, grade and render task is its own ffmpeg
  process; `--max-concurrency` runs that many side by side.
- **Unattended but conservative.** The nightly job runs under `caffeinate -i`
  so the Mac stays awake mid-encode; if the Mac is asleep at 01:30, launchd
  runs it on wake. Reruns skip finished work. Jobs left running by a run
  that was killed part-way are marked retryable after six hours. Existing
  outputs are never overwritten, and a task's files are committed only once
  all of them have encoded.
- **Stops for a person, never guesses.** A job that fails (an unsupported
  file, a timeout) is marked retryable and listed in `needs_review_ids`; the
  command exits `2`. After a look, rerun with `--retry-retryable`.

Current limits, stated plainly: RAW stills (`.CR3`, `.CR2`, `.ARW`, `.NEF`,
`.DNG`, …) are *scored* from the full-size JPEG preview the camera embedded
(`raw_preview.py`, no RAW developer needed), and since 2026-10-29 their review proxies are
that preview downscaled to 1024 px (`proxies/<job>/IMG_0001.CR3.jpg`; synthetic containers
only, no real camera file yet). They are not developed: graded masters still need a
JPEG/TIFF, so a RAW still stops the pipeline before the grade stage, and a RAW with no embedded
preview fails its proxy (`no embedded JPEG preview`) and keeps the sha256 stand-in scores. Camera-raw video is not decoded. The preview
reader is tested on synthetic containers, not yet on real camera files. The analysis stage now measures each photo and clip
from decoded frames (sharpness, exposure, contrast, motion, framing) and groups
near-identical shots by perceptual hash, so a burst or repeated take
contributes one frame to the reel, the best-scoring one. `framing` finds
where the detail sits (detail-energy centroid against the rule-of-thirds points,
and how concentrated the detail is) and feeds 15% of `story_score`; it locates
detail, it does not recognise a subject. `tilt_degrees` reads how far the
strong near-horizontal and near-vertical edges lean off the axes (positive: right
side lower); a crooked frame loses up to 8% of `story_score`, scaled by
`tilt_confidence`, so a frame of diagonals or plain sky is never penalised. Tested
on synthetic soft-edged horizons only, not yet on real photos. `noise_sigma` reads sensor grain (Immerkaer's mask, median-read so edges are not
counted) and the grain's share is taken out of `sharpness`, which grain would
otherwise inflate; heavy grain costs up to 15% of `technical_score`. Tested on
Gaussian grain added to synthetic frames (recovered within 20%), not yet on real
high-ISO files. It ships no face model, but photos can be scored for closed eyes
through a detector you supply: set `SHOOTFLOW_FACE_DETECTOR` to a command that
takes an image path and prints `{"faces": [{"size": 0.1, "eyes_open": 0.9}]}`
(`src/shootflow/faces.py`). A prominent face (1% of the frame or more) with eyes
open adds 0.03 to `story_score`; the least-open eye costs up to 0.25; off by
default, run without a shell, and any failure keeps the measured score. `tools/opencv_face_detector.py` (2026-10-29) is a reference detector for that contract: OpenCV Haar
cascades (`pip install "opencv-python-headless<5"`; 5.x dropped the cascade classifier), on your machine, nothing
uploaded. `eyes_open` is 0.95, 0.5 or 0.1 for two, one or no eyes found in the upper face, and null under 70 px wide.
It is a classical detector, not a blink classifier: the eye cascade was trained on open eyes, so sunglasses,
shadow and head turns read as blinks. Checked on one real portrait (scikit-image's astronaut: one face, eyes
0.95; coffee, camera-man and cat: no faces) and with that face's eye band blurred harder (kernel 9 to 31: 0.95,
0.5, 0.5, 0.1), a crude stand-in for a closed lid. Not run on real closed-eye photos or human picks. Tested
against made-up detector output and a fake command, and the tool's no-face path (`tests/test_opencv_face_detector.py`). `story_score` is otherwise only a blend of the measured scores, so
*which* shot wins is technical, not taste-based. The scene and look stages are
still deterministic stand-ins. The grade is your LUT, or no color change if you have
none. Every asset is graded before selection; grading only the selected
shots is the next throughput step.

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
  details plus derived product metrics and root observe-only
  `workflow_authority` without granting any new file authority. Legacy scheduler
  report schemas still load as observe-only for existing saved workspaces.
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
  manifest only when missing, and never resets existing matching progress.
  Scheduler commands then run against matching status manifests, write scheduler
  reports bound to final status, and can print those reports as JSON for a Mac
  app or automation runner. The
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
  whether production status, production scheduler reports, render tasks, render
  status, and render scheduler reports exist and validate, summarizes production
  and render status counts, surfaces validated scheduler product metrics when
  trusted reports are present, and suggests the next safe CLI action without
  creating, resetting, deleting, or repairing any files. Its schema v4 JSON
  includes the shared observe-only `workflow_authority` contract so native UIs
  and agents can fail closed before interpreting suggested next actions.
- `shootflow.pilot_dashboard` turns that trusted workspace-health state into the
  first read-only pilot analytics contract: activation signals, throughput
  counts, manual-intervention counts, metric-source availability, default pilot
  acceptance thresholds, and the same next safe action for Mac shells or pilot
  dashboards. It intentionally consumes
  validated health/report metrics instead of raw worker internals and grants no
  copy, retry, cleanup, overwrite, materialization, or deletion authority. Its
  JSON includes a structured `workflow_authority` block so native UIs and agents
  can reject file-changing interpretations without parsing prose notes.
- `shootflow.pilot_cohort_report` aggregates saved schema v2
  `pilot-dashboard` JSON payloads into cross-workspace pilot analytics. It
  reports pilot-ready workspace rate, median intervention rate, first-draft
  output count, structured readiness-blocker counts, and per-workspace readiness
  evidence without reading raw worker internals or granting workflow authority.
  It validates the dashboard's component threshold flags against the reported
  metrics before trusting readiness. Its JSON also carries the same observe-only
  `workflow_authority` contract.
- `shootflow.pilot_cohort_brief` reads one saved cohort report and converts it
  into presentation-ready observe-only labels for native shells and GTM demos:
  status, headline, summary percentages, and per-workspace readiness cards. It
  can also render a deterministic text-mode demo surface. It does not emit
  commands or grant workflow authority, and its JSON exposes the same
  structured observe-only authority block as the dashboard and cohort report.
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
  stale workers cannot clobber newer production progress. It can also plan and
  persist stale-running lease expirations as retryable statuses, using the
  running job's `updated_at` as a compare/write lease token so active heartbeat
  refreshes win without deleting source, analysis, graded, render, or deliverable
  files.
- `shootflow.production_adapter` proves that pre-render worker handoff with
  local adapters. The dry-run adapter writes deterministic placeholder
  artifacts, while the metadata adapter reads trusted local inputs and writes
  deterministic metadata JSON to declared output files as the first
  non-placeholder production path. The proxy adapter is the first local
  media-byte materializer: it byte-copies a trusted source input into its
  declared proxy output as a conservative stand-in before ffmpeg/Metal proxy
  generation lands. `analysis-production-local` is the first deterministic
  per-asset analysis probe: it writes schema-compatible analysis JSON for
  `vlm_asset_analysis` jobs only, deriving conservative local scores from trusted
  input bytes so the analysis/status boundary can be exercised before real VLM
  execution is trusted. `scene-production-local` consumes those validated
  per-asset analysis artifacts, verifies them against their succeeded status
  checksums, and writes a deterministic `analysis/scene_groups.json` grouping
  summary for `scene_grouping` jobs only, proving the next serial rejoin point
  before real scene clustering is trusted. `look-production-local` consumes that
  checksum-verified scene summary and writes a deterministic
  `color/shoot_look.json` profile for `look_development` jobs only, proving the
  scene-to-look handoff before real color science, creator style learning, or
  grading adapters are trusted. `grade-production-local` consumes one trusted
  original plus schema-validated/checksum-verified analysis and look
  dependencies to write deterministic per-asset graded stand-ins for
  `graded_photo`/`graded_video` jobs. `story-production-local` verifies the
  planned analysis, scene, look, and graded inputs against trusted status
  checksums, then writes the existing schema v2
  `analysis/instagram_storylines.json` artifact for `storyline_selection` jobs
  only. `package-production-local` verifies trusted storyline plus graded
  dependency outputs and writes deterministic package handoff artifacts for
  `instagram_reel`, `instagram_carousel`, and `instagram_photo_set` jobs;
  directory-style package outputs are represented by a controlled
  `package_manifest.json` plus a deterministic directory checksum. Unexpected
  existing package-directory entries are reported by relative name in retryable
  adapter/scheduler errors while their bytes are preserved. All adapters
  consume only trusted production-worker actions, persist each claim and final
  result through the guarded
  `production_status.json` compare/write boundary, materialize only declared
  outputs, refuse symlinked paths or different existing files, and report
  retryable status without deleting source, graded, render, deliverable, or
  package media. The local batch dispatcher can execute trusted action plans
  in bounded parallel batches while preserving serial-only production jobs and
  blocked-job visibility for UI/scheduler review. Shared adapter handoff types
  now use adapter-neutral `ProductionAdapter*` names, so scheduler and future
  worker code no longer imply that metadata/proxy execution is merely dry-run
  machinery.
- `shootflow.production_scheduler` runs trusted local production adapters in an
  iterative local loop: each pass reloads trusted `production_status.json`,
  optionally expires stale-running leases through the guarded production-worker
  helper, plans dependency-ready pending/retryable jobs, runs a bounded local
  batch, requires explicit review before retrying a previously retryable job,
  avoids retrying a job that already became retryable in the same run, and
  returns explicit complete/blocked/retryable/failed/waiting state for Mac shells
  and background agents. It can persist `production_scheduler_report.json` with
  completed, retryable, failed, blocked, attempted, skipped retryable,
  expired-lease, conflicted-lease, review-required, materialized output, and
  failure-message details plus derived product metrics bound to the final
  production status. The persisted report also carries root observe-only
  `workflow_authority`, so post-operation evidence cannot unlock retry, cleanup,
  overwrite, materialization, deletion, or other file-changing controls.
- `shootflow.card_workflow` ties mounted-volume route discovery, source-size
  estimation, checksum ingest preview, optional confirmed copy, and read-only
  production reporting into one product-facing card-dump workflow for Mac app
  shells and GTM demos. Its CLI JSON includes an `agent_handoff` block so
  native shells and launch agents can distinguish blocked routing,
  review-required previews, and post-ingest production-plan review without
  parsing prose notes. The root schema v2 handoff JSON also includes the shared
  observe-only `workflow_authority` block so those shells cannot treat preview,
  copy, retry, render, cleanup, overwrite, materialization, or deletion as
  authorized by the report payload.
- `shootflow.cli` also exposes `write-render-tasks`, a post-storyline
  handoff that rebuilds the manifest-backed production plan, verifies trusted
  storyline selections and graded artifacts through `shootflow.assembly`, then
  creates or reuses `deliverables/render_tasks.json` without rendering media or
  creating deliverable outputs. Its schema v2 summary, plus the
  `plan-import-route`, `preview-ingest`, `execute-ingest`, `plan-production`,
  `next-production-wave`, `inspect-render-workspace`, and demo-workspace
  summaries/receipts, carries the same root observe-only `workflow_authority`
  contract. Write-capable next actions are command-free descriptors so JSON
  payloads cannot double as executable workflow plans.
- `shootflow.cull` (`shootflow cull FOLDER --out REPORT_DIR [--recursive] [--write-xmp] [--picks FILE]`)
  is the standalone culling pass: it scores each still (JPEG, PNG, TIFF, or a
  RAW file's embedded preview), groups near-identical frames by dHash (Hamming
  distance 8 or less, single linkage), keeps the best frame per group as the
  keeper, and rejects blurred, badly exposed or (with `SHOOTFLOW_FACE_DETECTOR`)
  closed-eye frames. It writes `cull_report.json` and `cull_report.html`, and
  with `--write-xmp` a Lightroom/Bridge sidecar per photo (keeper 4 stars,
  alternate 2, reject -1). Photos are read-only and an existing `.xmp` is never
  overwritten. Tested on stubbed metrics and two real ffmpeg-made JPEGs; not yet
  compared with a photographer's real picks on a wedding or event set.
  `--picks FILE` (one file name or path per line, `#` comments allowed) scores
  the cull against the frames you would keep and adds an "Against your picks"
  block to the report: how often the keeper is one of your picks, and how many
  of your picks the cull flagged reject (the costly miss). Names match by path,
  else by file name or stem; an ambiguous name matches nothing. Tested on stubs;
  it gives the first real measurement as soon as someone supplies a shoot.
- `shootflow.workspace_index` builds a metadata-only
  `shootflow_workspace_index.json` handoff for Mac apps, background agents, and
  continuation runs. It summarizes trusted ingest, production-status,
  production-scheduler-report, render-task, render-status, and scheduler-report
  artifacts through their existing validators, marks model-authored storyline
  JSON as untrusted until rebound to a production plan, includes the
  health-derived next safe action plus the shared observe-only authority
  contract, and never creates analysis, graded, render, deliverable, or deletion
  files. Persisted index schema v2 carries `workflow_authority` at the root and
  inside the derived workspace-health artifact; schema v1 indexes still load as
  observe-only.

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
   starting AI/color work. The schema v2 JSON is presentation-only and grants no
   copy, retry, materialization, cleanup, overwrite, deletion, or general file
   mutation authority.
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
    shells schedule only pending work whose dependencies are recorded as
    succeeded in `production_status.json` instead of rebuilding progress from
    caller-reported command-line IDs. Retryable jobs remain visible as
    review-required IDs and are retried through the scheduler only after the
    caller explicitly allow-lists them. The handoff JSON is observe-only; it
    describes candidate work and does not authorize the agent to claim, retry, or
    materialize jobs by itself.
12. Use production-worker transition helpers to plan dependency-ready
    proxy/VLM/color/story jobs from trusted status, claim one matching attempt as
    running, verify every declared output before success, and report retry/failure
    states without deleting source, graded, or deliverable media.
13. Exercise those pre-render transitions with local production adapters before
    real proxy, VLM, look-development, grading, or storyline runners are wired
    in. The dry-run adapter writes only declared placeholder file artifacts. The
    metadata adapter reads local trusted inputs and writes deterministic metadata
    JSON into declared output files, giving the product a real input-fingerprint
    path without deleting or inventing media paths. The proxy adapter copies
    trusted local input bytes into declared proxy outputs as a safety-proven
    stand-in for future downsampled proxy generation. The story adapter writes
    the trusted storyline artifact from checksum-verified analysis, scene, look,
    and graded inputs before real editorial intelligence is trusted. Stale claims,
    directory-style package outputs, missing inputs, or output conflicts remain
    visible in production status.
14. Run `python -m shootflow.cli dry-run-production-scheduler` when a local
    shell or background agent should advance trusted pre-render work from
    persisted status. The scheduler loops over status reload, ready-action
    planning, bounded local adapter batches, and retryable-job review stops without
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
26. Build a read-only pilot dashboard with `pilot-dashboard` when Mac shells,
    pilot analytics, or GTM demos need activation, throughput, and
    intervention-rate signals. The dashboard consumes `workspace-health` and
    validated scheduler product metrics only; missing reports leave metric fields
    unavailable rather than defaulting them to false precision. Its schema v2
    `pilot_acceptance` field evaluates trusted completion rate, manual
    intervention rate, and materialized-output count against default pilot
    thresholds without authorizing workflow actions. Its structured
    `workflow_authority` object marks the payload as `observe_only`,
    `presentation_only`, and false for copy, retry, cleanup, overwrite,
    materialization, deletion, and all file mutation.
27. Aggregate saved dashboard JSON files with `pilot-cohort-report` when pilot
    operations need cohort-level ready rate, median intervention rate,
    first-draft output count, and structured blocker counts for missing metrics,
    low completion, high intervention, or missing materialized outputs. The
    report consumes only dashboard payloads, validates component threshold flags
    against dashboard metrics, never reads raw workspace manifests, and cannot
    copy, retry, materialize, clean up, overwrite, or delete files; the same
    `workflow_authority` object is emitted for agent-native consumers.
28. Convert a saved cohort report into native-shell display state with
    `pilot-cohort-brief` when a Mac shell, GTM demo, or continuation agent needs
    human-readable readiness labels, structured readiness blocker counts,
    controlled blocker labels, and workspace cards without parsing raw report
    metrics or receiving executable commands. JSON consumers should respect its
    observe-only `workflow_authority` before presenting any adjacent retry or
    materialization controls.
29. Run the same handoff through
    `python -m shootflow.cli init-render-status` followed by
    `python -m shootflow.cli dry-run-render-scheduler` when a UI/background-agent
    process starts from persisted manifests instead of an in-memory production
    plan.
30. Inspect persisted render workspace state with
    `python -m shootflow.cli inspect-render-workspace` so UIs and continuation
    agents can decide whether to initialize status, run the scheduler, review
    blocked/retryable work, or review finished deliverables without writing
    files. Succeeded render outputs must still be present and match their
    recorded SHA-256 checksums before inspection reports the workspace complete.
31. Use `python -m shootflow.cli card-dump-workflow` as the first complete
    native-shell handoff from detected volumes to previewed ingest, and only
    with `--confirm-ingest`, verified copy plus a read-only production summary.
    The report includes machine-readable `agent_handoff` fields for the next
    safe step and whether that step requires human review or may copy bytes.
32. Use `shootflow.demo_workspace.create_persisted_cli_demo_workspace(...)` to
    build a safe, repeatable persisted-manifest smoke workspace for Mac UI shells,
    GTM demos, and continuation agents without touching source media or resetting
    render progress. Use `create_card_dump_cli_demo_workspace(...)` or
    `python -m shootflow.cli create-card-dump-demo-workspace` when a demo should
    also prove the detected-card -> checksum-ingest -> production-summary path.
33. Use `python -m shootflow.cli create-pilot-cohort-demo` when a GTM or pilot
    demo needs multiple saved dashboard JSON payloads plus a cohort report
    without real media. The fixture still runs the normal demo render init and
    scheduler handoff for each workspace, then writes saved dashboard/cohort JSON
    as observational proof rather than workflow authority.
34. Run `python -m shootflow.cli workspace-health --workspace <dir>` whenever a
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
  --generated-at 2026-05-07T15:59:06Z \
  --stale-before 2026-05-07T15:30:00Z \
  --lease-updated-at 2026-05-07T15:59:00Z \
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
PYTHONPATH=src python3 -m shootflow.cli pilot-dashboard --workspace <dir> \
  --generated-at 2026-05-07T16:00:08Z
PYTHONPATH=src python3 -m shootflow.cli pilot-cohort-report \
  --dashboard-json <dashboard-a.json> \
  --dashboard-json <dashboard-b.json> \
  --generated-at 2026-05-07T16:00:09Z
PYTHONPATH=src python3 -m shootflow.cli pilot-cohort-brief \
  --cohort-report <pilot_cohort_report.json>
PYTHONPATH=src python3 -m shootflow.cli pilot-cohort-brief \
  --cohort-report <pilot_cohort_report.json> \
  --format text
PYTHONPATH=src python3 -m shootflow.cli handoff-controls \
  --handoff-json <saved-handoff.json>
PYTHONPATH=src python3 -m shootflow.cli package-handoff-brief \
  --ingest-manifest <dir>/ingest_manifest.json
PYTHONPATH=src python3 -m shootflow.cli create-pilot-cohort-demo \
  --workspace <demo-dir> \
  --workspace-count 2 \
  --dashboard-generated-at 2026-05-07T16:00:10Z \
  --generated-at 2026-05-07T16:00:11Z
PYTHONPATH=src python3 -m shootflow.cli inspect-render-workspace --workspace <dir>
```

Use `--worker ffmpeg-proxy-production-local` and `--worker
ffmpeg-grade-production-local` for real ffmpeg proxies and graded masters, and
`--renderer ffmpeg-local` for real reel/carousel/photo-set media;
`run-local-pipeline` (top of this README) chains them for you.
Use `--worker metadata-production-local` for the deterministic local metadata
adapter. Use `--worker proxy-production-local` for the conservative local proxy
stand-in that copies trusted input bytes into declared proxy outputs. Both follow
the same scheduler/status contract, read only trusted workspace-bound inputs,
write only declared outputs, and record retryable review states for symlinked
inputs/outputs, directory-style outputs, missing inputs, or output conflicts.
The production adapter registry declares stage capability metadata for local
workers. The scheduler reads that registry before planning actions or expiring
stale leases, so `proxy-production-local`, `analysis-production-local`,
`scene-production-local`, `look-production-local`, `grade-production-local`, and
`story-production-local`, and `package-production-local` receive only the output
kinds they can materialize, while incompatible later work stays pending or
running for its own future adapters instead of being attempted through the wrong
worker.

The production-status init command writes only `production_status.json` in the
shoot workspace, never creates analysis/graded/render/deliverable outputs, and
refuses stale status manifests whose production-plan fingerprint no longer
matches the verified ingest manifest. `workspace-health` now validates that
status and the optional `production_scheduler_report.json`, exposes production
job counts plus pending/running/succeeded/failed/retryable counts, and points at
`init-production-status`, `dry-run-production-scheduler`, or the relevant review
state before render handoffs. The dry-run production scheduler then advances
only dependency-ready jobs from that trusted status file, reports retryable or
blocked jobs for review, retries prior retryable jobs only when their IDs are
explicitly supplied with `--retryable-job`, and does not retry a newly retryable
job in the same run. When both `--stale-before` and `--lease-updated-at` are
supplied, it expires stale running jobs into retryable review states through the
guarded production-status compare/write path and reports heartbeat-refresh
conflicts without clobbering the active worker. It writes
schema v3 `production_scheduler_report.json` so UI and continuation layers can inspect the
last run, observe-only authority, and derived product metrics without rerunning worker orchestration. The render-status init command writes only
metadata under `deliverables/`, never deletes media, and fails rather than
overwriting an existing status manifest that no longer matches the trusted
render-task plan.
The index command writes only `shootflow_workspace_index.json`, summarizing
validated artifacts and explicitly marking unvalidated storyline JSON as
non-authoritative. It includes production-status and production-scheduler-report
summaries as metadata-only artifacts, and embeds the same read-only next safe
action exposed by `workspace-health`, so native shells and continuation agents
can render one coherent state snapshot without granting the index any write
authority. When a trusted render-task handoff exists, both workspace health and
the index include a metadata-only `render_inputs_fingerprint` plus
`render_input_count` over the current storyline/graded inputs, giving future
agents a cheap way to detect in-place input changes between snapshots without
changing renderer authority.
The pilot dashboard command writes nothing and consumes the same health summary
instead of raw worker internals. It reports which scheduler metric sources are
available, activation flags for trusted production/render handoffs, aggregate
throughput, manual-intervention counts, and a pilot-readiness assessment. The
assessment uses integer basis points over trusted scheduler metrics: by default,
a workspace is ready for pilot review only when completion is at least 90%,
manual intervention is at most 20%, and at least one declared output has been
materialized. Missing or invalid scheduler reports keep throughput/intervention
and acceptance fields unavailable rather than deriving dashboard numbers from
untrusted files. The dashboard names the next safe action for display, but omits
executable commands for write-capable actions so analytics surfaces cannot become
schedulers.
The pilot cohort report command also writes nothing. It reads saved dashboard
JSON payloads rather than shoot folders, then calculates cohort-level pilot-ready
workspace rate, median intervention rate, and first-draft output count from the
trusted dashboard acceptance fields. Dashboards without trusted metrics are
counted as unavailable instead of being treated as failures or successes, and
the cohort report does not emit workflow commands. It also derives structured
readiness blocker counts from validated dashboard threshold flags so pilot ops
can see whether the bottleneck is missing metrics, completion rate, intervention
rate, or absent first-draft outputs without parsing free-form notes.
The pilot cohort brief command reads one saved cohort report and writes nothing.
It turns the trusted cohort metrics into a native-shell-friendly status,
headline, summary labels, structured readiness blocker counts, and
per-workspace readiness cards so demos can show readiness, intervention,
first-draft output evidence, and the specific blocker category without parsing
raw worker internals. JSON remains the default output for integrations;
`--format text` prints a deterministic command-free native-shell view for demos
and operator readouts, using controlled blocker labels while omitting saved
paths, timestamps, workspace titles, and free-form report notes so text output
cannot become a shell handoff. It remains observe-only and does not emit
executable workflow commands.
The pilot cohort demo command writes a controlled fixture for demos: multiple
trusted persisted render demo workspaces under `workspaces/`, saved schema v2
dashboard JSON under `pilot_dashboards/`, and one saved
`pilot_cohort_report.json`. It preflights those saved report paths before
creating shoot workspaces, refuses existing different dashboard/report files, and
does not add copy, retry, cleanup, overwrite, materialization, or deletion
authority beyond the existing demo scheduler path.
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
after a verified ingest). Its root `workflow_authority` block is still
observe-only; `agent_handoff.next_step_may_copy_bytes` is an instruction to
present an explicit reviewed confirmation path, not permission for a background
agent to copy bytes.

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
shells can ask for timestamps/render adapter settings at the right layer. The
root observe-only authority block remains the permission gate; the advisory
commands are display/review aids, not authorization to mutate files.

## Workflow authority for native shells

Use `shootflow.workflow_authority.observe_only_handoff_controls_to_dict(...)`
when a native shell, launch agent, or continuation automation reads a JSON
handoff that includes `workflow_authority`. The reader validates the root
observe-only authority object and returns disabled file-operation controls, so
UIs do not infer copy, retry, materialization, cleanup, overwrite, deletion, or
general file-mutation permission from `next_actions`, `next_steps`,
`writes_files`, `agent_handoff`, or prose. See `docs/WORKFLOW_AUTHORITY.md` for
the consumer contract. Shell integrations can use
`python -m shootflow.cli handoff-controls --handoff-json <path>` to run the same
fail-closed validation over a saved handoff file and print the disabled native
control map as observe-only JSON. When a native shell needs package-specific
state, `python -m shootflow.cli package-handoff-brief --ingest-manifest <path>`
loads the trusted production status and scheduler report, summarizes package
readiness/materialized package outputs, and returns disabled copy/retry/
materialization controls derived from the report authority.
Pass `--format text` for a deterministic operator-readable summary of the same
read-only package handoff; text output never includes executable workflow
commands or confirmation flags.

## Run tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Product docs

**TSX-first** in `docs-site/` (hand-authored pages plus build-time conversion of
approved `docs/` HTML/Markdown to semantic JSX). For quick one-off PDF/HTML, export
from the running docs site; see `docs-site/README.md` and
`.cursor/rules/documentation-tsx.mdc`. Deploy/auth: `docs-site/README.md`.

- `docs/PRODUCT_STRATEGY.md`
- `docs/BUSINESS_PLAN.md`
- `docs/DESIGN_DECISIONS.md`
- `docs/WORKFLOW_AUTHORITY.md`
- `docs/TERMS_AND_CONDITIONS_DRAFT.md`
- `docs/CONTINUATION_NOTES.md`
