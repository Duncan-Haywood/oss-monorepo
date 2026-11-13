# ShootFlow

ShootFlow is an early-stage personal tool and product concept for photographers
and videographers who want high-quality Instagram reels, carousels, and graded
intermediates without spending their lives on file wrangling.

**Live page:** https://marisstella.app/photo-editing/

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
only, no real camera file yet). Since 2026-11-10 the pipeline develops DNG stills itself
(see "Develop DNG raw files" below): the grade stage develops the sensor data into a 16-bit
TIFF and grades that into `graded/<job>/IMG_0001.DNG.tif`, and a DNG with no embedded preview
gets its proxy and its scores from a half-size development instead of failing. Since
2026-11-12 a Canon CR2 is developed by the grade stage too, with its camera's `.dcp` profile
from the workspace's `color/camera-profiles/` ("CR2 in the pipeline" below). Other RAW
formats (CR3, NEF, ARW, ...) are still scored from their preview but stop at the grade
stage with a message to convert them to DNG (Adobe's free DNG Converter). A CR2 with no preview
fails its proxy (`no embedded JPEG preview`) and keeps the sha256 stand-in scores. Camera-raw video is not decoded. The preview
reader is tested on synthetic containers, not yet on real camera files. Since 2026-11-10 it
counts only 8-bit lossy JPEGs as previews: CR2 sensor data is a lossless JPEG (SOF3) and DNG
sensor tiles usually are too, and before that fix a lossless stream with more pixels than the
preview won and ffmpeg scored the Bayer mosaic as the photo (reproduced with a real ffmpeg
`ljpeg` stream beside a baseline preview, `tests/test_raw_preview.py`). The analysis stage now measures each photo and clip
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
none. By default every asset gets a full-resolution master. Since 2026-11-11,
`--grade-scope selected` (or `SHOOTFLOW_GRADE_SCOPE=selected`) gives full masters
only to the assets the storyline picks. Every other clip is graded from its review
proxy and gets a `.review-grade.json` note beside it ("Grade only the picks" below).

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
- `shootflow.cull` (`shootflow cull FOLDER --out REPORT_DIR [--recursive] [--write-xmp] [--picks FILE] [--thumbs]`)
  RAW+JPEG pairs (same folder and stem) count as one shot: the JPEG is scored, the RAW is listed as a companion, one sidecar covers both (2026-11-04, made-up files only).
  is the standalone culling pass: it scores each still (JPEG, PNG, TIFF, or a
  RAW file's embedded preview), groups near-identical frames by dHash (Hamming
  distance 8 or less, single linkage), keeps the best frame per group as the
  keeper, and rejects blurred, badly exposed or (with `SHOOTFLOW_FACE_DETECTOR`)
  closed-eye frames. It writes `cull_report.json` and `cull_report.html`, and
  with `--write-xmp` a Lightroom/Bridge sidecar per photo (keeper 4 stars,
  alternate 2, reject -1). Photos are read-only and an existing `.xmp` is never
  overwritten. Tested on stubbed metrics and two real ffmpeg-made JPEGs; not yet
  compared with a photographer's real picks on a wedding or event set.
  `--thumbs` (2026-10-29) embeds 220 px JPEG thumbnails (via ffmpeg; a RAW's
  embedded preview) in `cull_report.html` as a contact sheet by burst, keeper
  green, rejects red, so the report can be judged by eye without opening a
  catalogue; the file stays local. Tested on stubs and one ffmpeg-made JPEG;
  no real shoot yet.
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

## Cull close calls (2026-11-08)

`shootflow cull` reports each keeper's score lead over the best alternate (`margin`); under 0.03 it is a `close_call`, counted in `summary.close_calls`. The 0.03 threshold is unmeasured; checking it against a photographer's real picks is open.

`--picks` now also measures that threshold (2026-11-08): `keeper_misses` counts burst groups where you picked a frame other than the keeper, `misses_flagged_close` how many of those the close-call flag caught, and `margin_to_flag_all_misses` the lead a threshold would need to catch them all (null when a missed keeper had no rival). Tested on made-up frames only; a real shoot and its picks are still wanted.

## Grade only the picks (2026-11-11)

Most of the overnight run goes into encoding a full-resolution ProRes master of every
clip, and most of those clips never reach a reel. `run-local-pipeline --grade-scope
selected` (also `write-launchd-plist --grade-scope selected`, or
`SHOOTFLOW_GRADE_SCOPE=selected`) gives full masters only to the clips and photos the
storyline picks for the hero reel, a reel variant, the carousel or the photo set.
Every other asset is graded from its review proxy: same LUT, proxy resolution
(≤960 px video). Beside it goes `graded/<job>/<name>.review-grade.json`, which says
where it came from and how to get a full master later.

The grade stage can know the picks ahead of time because the storyline is a pure
function of the analyses, and all of them are final and sha256-verified by the time
any grade job runs (its look dependency waits on every analysis). As a backstop, the
story stage refuses to run if a pick holds only a review grade. The photo set takes
every photo, so in practice only video clips get review grades.

Measured (`eval/grade-scope-2026-11-11.md`, `eval/grade_scope_bench.py`): on 12
synthetic 1080p clips (four shots, three takes each) plus three 24 MP JPEGs, 6 clips
were picked. The grade stage went from 164 s to 88 s and the whole pipeline from
214 s to 129 s, with the same deliverables rendered. The picks are capped at about 180 s
of footage, so longer shoots should save more. That projection has not been measured,
and neither has real 4K camera footage. The default stays `all`, because an editor
may want masters of every clip for their own NLE.

## Develop DNG raw files (2026-11-10)

`shootflow develop FILE.dng [FILE2.dng ...] --out DIR` renders each DNG's sensor data into a
16-bit TIFF master (`--format png` for 8-bit PNG, `png16` for 16-bit PNG), never overwriting
a file, and prints a JSON report per file (size, CFA, white balance, which matrix, levels,
exposure, share of clipped sensels). `--half` gives a quarter of the pixels with no
interpolation and runs about three times as fast; `--exposure EV` adds stops to the file's
`BaselineExposure` (`--no-baseline-exposure` ignores it); `--wb R,G,B` replaces the as-shot
white balance with camera multipliers. Stdlib only, like the rest of ShootFlow
(`src/shootflow/raw_develop.py`); when numpy is installed it renders about 20 times faster on
the same arithmetic and writes the same bytes (`src/shootflow/raw_develop_np.py`, below;
`--engine python|numpy` to choose, default `auto`).

What it reads: DNG, and Canon CR2 with a `.dcp` profile (since 2026-11-12; convert CR3, NEF and ARW with Adobe's free DNG Converter first), raw
data in IFD0 or a SubIFD, in strips or tiles, uncompressed 8/16-bit or packed 10-14-bit, or
lossless JPEG (SOF3, all seven predictors, restart markers, multi-component tiles); 2x2
RGB colour filter arrays in any phase, and LinearRaw. It applies the linearization table,
black level (repeat pattern and row/column deltas), white level, active area, default crop,
`AsShotNeutral` or `AsShotWhiteXY`, the DNG specification's colour model (both camera
matrices blended for the light the photo was taken in, `ForwardMatrix`, `CameraCalibration`,
`AnalogBalance`; next section), `BaselineExposure` and the orientation tag. It refuses, with the reason, lossy DNG, deflate
and floating-point DNG, four-colour CFAs and non-DNG files.

What it does not do: use DNG profile hue/saturation maps or look tables, a third
calibration illuminant (DNG 1.6 `ColorMatrix3`), reconstruct blown highlights, reduce noise,
or use a better demosaic than bilinear. Colours follow the DNG specification's matrices, not
Adobe's full profiles, so they will still differ from Lightroom's. Masters are neutral on purpose: the look is the
grade stage's job, and since 2026-11-10 the pipeline's grade stage calls the developer for
every DNG still (below).

How it was checked:

- `tests/test_raw_develop.py` (18 tests): DNGs written by the test from a known scene taken
  through a camera matrix give the scene back within 1% in linear light, for every Bayer
  phase, half and full size, per-position black levels, a linearization table, active area
  and default crop, all eight storage variants (16-bit, packed 12 and 14-bit, tiles, lossless
  JPEG with predictors 1-7, two-component tiles, restart markers, SubIFD), orientation 6,
  LinearRaw, highlight clipping, the CLI, and refusals.
- Lossless JPEG decoding is checked against an independent encoder: ffmpeg's `ljpeg` encoder
  (left, plane and median predictors) decodes sample-exact.
- Lossless JPEG written by a camera, against LibRaw (2026-11-11, `tools/cr2_ljpeg_check.py`,
  `eval/ljpeg-decoder-2026-11-11.md`): a Canon CR2 stores its sensor data as one lossless JPEG
  the camera encoded itself, so the decoder DNG tiles go through can be pointed at it. On the
  real Canon 5D Mark II CR2 (23 MB stream, 1448x3804 frame, four components, two Huffman
  tables, predictor 1) every one of 22,032,768 sensels, with Canon's slices put back side by
  side, equals LibRaw's `raw_image`. This is the first camera-written lossless JPEG the decoder
  has read; it does not yet cover a camera- or Adobe-written DNG's tiles.
- Against LibRaw on real camera files (`tools/libraw_differential.py`, needs `rawpy` and
  `numpy` in a separate venv; results in `eval/raw-develop-libraw-2026-11-10.md`): a real
  Nikon NEF (NASA ISS photo, 12 MP, RGGB) and a real Canon 5D Mark II CR2 (21 MP, GBRG,
  per-channel black about 1026, white 15600), both from rawpy's test folder on GitHub. LibRaw
  reads the sensor data and metadata, the tool writes them into an uncompressed DNG, and our
  render of that DNG is compared with LibRaw's own render set to the same steps (bilinear,
  camera white balance, clip, no auto-brightening, sRGB; since 2026-11-12 the tool asks for `--colour dcraw`, the model LibRaw uses). Every pixel agrees within one 8-bit
  step at full size and at half size (worst pixel 0.46 to 0.60 of a step, mean 0.08 to 0.12).
  The first run on the Canon had 10% of pixels over one step, all in the deep shadows: we
  clamped below-black noise after demosaicing and LibRaw clamps each sensel before; matching
  LibRaw's order fixed it, and it also removed a few highlight-edge outliers on the Nikon.
  This checks the levels, white balance, matrix, demosaic and curve on real sensor data. It
  does not check our reading of a DNG written by a camera or Adobe's converter (the DNGs here
  are written by our tool), and no camera-written lossless-JPEG DNG was available (raw.pixls.us
  and rawsamples.ch answer 403 from the build sandbox).
- In the pipeline (`eval/pipeline-dng-grade-2026-11-10.md`): `run-local-pipeline` on a card
  holding the Nikon's sensor data as a DNG (no embedded preview) and one clip rendered every
  deliverable with nothing for review in 75 s. The graded master is 4284x2844 rgb48le and
  bit-identical to `shootflow develop`'s TIFF of the same file (no LUT), so the grade stage
  adds no loss; the proxy is 1024 px from a half-size development and the scores are measured
  (`frame_metrics`), not the sha256 stand-in. `tests/test_ffmpeg_pipeline.py` runs the same
  path on a synthetic red DNG (the master's centre is the scene's sRGB value within 3 steps)
  and checks that a CR2 with a preview stops at the grade with the DNG message.
- Speed, pure Python on the build container: 12 MP Nikon 37 s full size, 12 s half; 21 MP
  Canon 65 s full size, 23 s half. LibRaw takes well under a second. Fine for an overnight job,
  slow for interactive use.
- Speed with numpy (2026-11-10, `eval/develop-numpy-engine-2026-11-10.md`): the optional
  engine repeats every floating-point step of the pure path in the same order on doubles
  (numpy's add and multiply do not fuse into FMA), so the output is byte-identical, not just
  close. Rendering after the file is read, same container, same session: Nikon 31.0 s to 1.5 s
  full size (20.7x) and 8.8 s to 0.56 s half; Canon 54.2 s to 2.6 s full (20.8x) and 15.6 s to
  1.1 s half; all four outputs byte-identical (`tools/develop_engine_check.py`). Against LibRaw
  the numbers are unchanged (mean 0.088/0.102/0.101 of a step on the Nikon). The overnight
  pipeline on the Nikon card (above) went from 74.5 s to 7.5 s. `tests/test_raw_develop_engines.py`
  compares the two engines byte for byte on every Bayer phase, odd and 2x2 sizes, per-position
  black, row and column black deltas, linearization, active area and crop, all eight
  orientations, exposure, white balance, clipping and LinearRaw (skipped without numpy, so CI,
  which has no numpy, still runs the pure path). Still pure Python either way: reading the
  file (0.7 s for the Nikon's uncompressed DNG, 2.2 s for the Canon's) and the lossless-JPEG
  decoder (next item).
- Lossless-JPEG decoder speed (2026-11-11, `eval/ljpeg-decoder-2026-11-11.md`): the decoder
  now runs in two passes. The first reads every Huffman difference from de-stuffed 32-bit
  words through a 12-bit table that decodes a code and its extra bits in one look-up; the
  second turns differences into samples, for predictors 1 and 2 as one running sum per
  component (`itertools.accumulate`) instead of a Python step per sample. On the Canon's
  camera-written 22-megasample stream: 16.8 s to 7.3-7.5 s (2.2x), output identical to the old
  one-pass decoder (kept as `_decode_scan_reference`) and to LibRaw. On a DNG-shaped 256x256
  tile (two components, synthetic smooth data): 52 ms to 19 ms (2.75x), which puts a 12 MP
  lossless DNG at about 3.5 s of decoding instead of 9.5. The rest is the Huffman loop itself,
  about 0.2 microseconds a sample, the floor for a pure-Python bit reader on this container
  (a 16-bit table was no faster). `tests/test_ljpeg_fast.py` (345 cases) encodes random
  images with code tables that reach every branch: codes that fit the table, codes whose
  extra bits do not, codes longer than it, size 16, byte stuffing, all seven predictors, one
  to four components, restart intervals on and off row boundaries, point transform; both
  decoders must return the encoded samples exactly.
- Prediction pass on numpy (2026-11-11, `eval/ljpeg-numpy-predict-2026-11-11.md`): with
  numpy installed, predictors 1 and 2 turn differences into samples as array running sums
  (`raw_develop_np.predict_rows`) instead of over Python ints, and hand `parse_raw` an
  `array('H')`. On the Canon CR2 stream the pass after the Huffman reader goes from 3.8-4.1 s to
  1.1-1.5 s and the whole decode from 9.5-9.8 s to 6.6-7.3 s on the same container; a
  256x256-sensel tile 27-30 ms to 18-21 ms. Same samples as the pure pass on all 345 encoder
  cases and sensel-for-sensel equal to LibRaw on the CR2. `raw_develop.DECODE_ENGINE`
  (`auto`, `python`, `numpy`) chooses; the Huffman pass is now about 85% of decoding.

- Huffman pass in native code (2026-11-12, `eval/ljpeg-native-huffman-2026-11-12.md`): an
  optional C reader (`shootflow/ljpeg_native.py`, about 40 lines of C kept as a string,
  compiled with the system `cc` on first use into `~/.cache/shootflow` and loaded with
  `ctypes`; no package, nothing downloaded) reads the Huffman differences through one 16-bit
  prefix table per component. On the Canon CR2 stream the whole decode goes from 8.8-11.7 s to
  1.2-1.7 s (0.7-1.1 s on the array path `develop` takes; the C call itself 0.48 s), a DNG-shaped
  256x256-sensel tile from 17 ms to 1.3 ms. Same samples as the pure loop on every encoder case
  and on the CR2, and still 0 of 22,032,768 sensels different from LibRaw. No compiler, Windows
  or `SHOOTFLOW_NATIVE=0`: the pure loop runs. `raw_develop.HUFFMAN_ENGINE` (`auto`, `python`,
  `native`) chooses; an invalid code falls back to the pure loop, which raises as before.

## Develop a Canon CR2 directly (2026-11-12)

`shootflow develop IMG_0001.CR2 --dcp "Canon EOS 5D Mark II Adobe Standard.dcp" --out DIR`
develops a Canon CR2 with no DNG Converter step. A CR2's sensor is the same lossless JPEG a DNG
tile is (the decoder above, native Huffman reader included), cut into vertical slices that
`src/shootflow/cr2.py` puts back side by side. What a DNG states in tags, the reader finds:

- **Image area** from the maker note's SensorInfo (tag 0x00E0) borders; the rest is masked.
- **Black level** per 2x2 position: the median of the masked columns left of the image.
- **White level**: read from the picture when the frame has clipped sensels (since the same
  day, "Five Canon bodies" below): a pile of at least 64 sensels on one 2x2 position's maximum,
  8 times the values just below it and well above black, is the clip, and the lowest such pile
  is the white level. Otherwise the top of the stream's precision (16,383 at 14 bits), which
  changes nothing when nothing clipped. LibRaw's per-model table (15,600 for the 5D Mark II,
  13,584 for the 7D) is not copied.
- **As-shot white balance** from ColorData (tag 0x4001), whose version is told by its length
  (ExifTool's documented layouts; unknown versions develop unbalanced and say so).
- **CFA phase**: a CR2 has no CFAPattern tag and the phase differs between bodies, so it is
  read from the picture: the green diagonal is the pair of 2x2 positions that agree most, and
  red is told from blue by the as-shot balance, or, when that balance is too close to neutral,
  by the sign of the correlation between the two non-green positions and the RGB thumbnail's
  red/blue across a 12 x 8 grid (needs |r| of at least 0.8; a clear thumbnail that contradicts
  a clear balance is refused). When these are unclear the file is refused with a request for
  `--cfa RGGB|GRBG|GBRG|BGGR`, never guessed. (The thumbnail cannot place the green diagonal:
  on the 5D Mark II it is framed differently and matched no phase clearly. Red against blue
  needs only a sign, which survives the framing.)
- **Colour** needs a camera profile: a CR2 has no colour matrix. Adobe's free DNG Converter
  installs one `.dcp` per camera (`CameraRaw/CameraProfiles/Adobe Standard/` under
  `ProgramData` on Windows or `/Library/Application Support/Adobe` on macOS); dcamprof and
  RawTherapee write them too. Without `--dcp` the command stops and says so.

Checked (`eval/cr2-direct-2026-11-12.md`, `tools/cr2_develop_check.py`): on the real Canon
5D Mark II CR2 from rawpy's test folder, the image area is LibRaw's crop to the pixel
(56, 168, 3744 x 5616), the black levels are within 2 of LibRaw's, the CFA phase found (GBRG)
is LibRaw's, the white balance is LibRaw's camera multipliers, and, developed with a profile
built at run time from LibRaw's own matrix for the camera, the half-size render is within
0.61 of an 8-bit step of LibRaw's at the median (3.9 at the 99th percentile; channel means
within 3%). Full size, 21 MP to a 16-bit TIFF: 4.3 s with numpy and the native Huffman reader.
`tests/test_cr2.py` (12 tests) builds CR2s with a known scene behind each of the four CFA
phases and checks every inferred tag, the refusals (unclear phase, sRAW, no profile), a grey
patch rendering neutral, the numpy and pure engines byte for byte, and the CLI. Not done: a
real Adobe profile (not in the build container), sRAW/mRAW and CR3. (The pipeline's grade stage
reads CR2 since later the same day: "CR2 in the pipeline"; four more bodies on real files:
"Five Canon bodies".)

## Five Canon bodies on real files (2026-11-12)

Real full-size CR2s from the 350D (12-bit, ColorData1), 600D (ColorData6), 70D (ColorData7)
and 7D (ColorData4), from the public metadata-extractor-images collection, joined the 5D Mark
II (`eval/cr2-five-bodies-2026-11-12.md`, `tools/cr2_ljpeg_check.py`,
`tools/cr2_develop_check.py`). Against LibRaw on all five: 0 sensels different, the image area
to LibRaw's crop, black levels within 2, the as-shot white balance equal, and the CFA phase
LibRaw's. Two bodies needed changes:

- **The 70D was refused.** Its as-shot balance is nearly neutral (red level 1,993, blue
  1,964), so the balance cannot tell red from blue. The RGB thumbnail now decides when the
  balance cannot: its red/blue correlates with the two non-green positions at +0.99 when the
  first is red, -0.98 to -0.99 when it is blue, on four of the five bodies (the dim ISO 3200
  5D Mark II frame gives -0.06, so there the balance alone decides, as before). The 70D now
  develops as RGGB, LibRaw's phase.
- **The 7D's highlights were pink.** Its greens clip at 12,649 and 12,650 (25,793 sensels
  piled there), not at 16,383. Read as 16,383, the 14,224 clipped half-size pixels rendered a
  pinkish grey (mean 0.94, 0.87, 0.87; none white). With the clip level read from the frame
  they render white (mean 0.998, 1.000, 0.981; 69% at 0.97 or more in every channel).
  LibRaw's table value for the body, 13,584, would also leave them grey.

The other three frames have no pile at the clip, so their white level stays 16,383 (4,095 on
the 12-bit 350D, whose pile sits at full scale). Rendered against LibRaw with LibRaw's matrix,
the median difference first measured 3.0-5.6 8-bit steps, with ShootFlow 3-9% brighter in every
channel. That gap was the check's own fault (next section). Speed with numpy: read 0.3-0.7 s.

## The CR2 brightness gap was the check (2026-11-12)

`tools/cr2_develop_check.py` passed LibRaw the white level with black included, but LibRaw's
`user_sat` is black-subtracted, so every LibRaw render was darker by white / (white - black):
predicted 1.067-1.193 in linear light, measured the same. It also binned the 350D on a 2x2 grid
one row off LibRaw's, and compared the 70D one pixel out of place. With all three fixed, the
median difference is 0.07-0.88 steps (was 0.6-5.6). Re-rendered through dcraw's own matrix,
ShootFlow's data matches LibRaw to 0.05-0.19 steps on all five bodies. The rest is the DNG colour
model against dcraw's, which grows with the as-shot white's distance from D65 (0.07 on the 7D
near D65, 0.88 on the 70D at about 4,700 K, tinted green). ShootFlow keeps the DNG model; a
colour chart under that light would say which is closer. Details:
`eval/cr2-brightness-gap-2026-11-12.md`.

## CR2 in the pipeline (2026-11-12)

Copy your camera's profile into the shoot workspace's `color/camera-profiles/` (Adobe's free
DNG Converter installs them under `CameraRaw/CameraProfiles`, several per body; copying the
whole camera folder is fine) and the overnight pipeline's grade stage develops each CR2 into
`graded/<job>/IMG_0001.CR2.tif` like a DNG. The profile is chosen per file by the camera that
took it (`src/shootflow/camera_profiles.py`): a file named `<camera>.dcp` first, then the one
profile tagged for that camera, then its Adobe Standard among several; anything else stops the
file for review naming the candidates, rather than picking a colour silently. With no profile
for the camera it stops naming the folder and the cameras it does hold. `shootflow develop
--dcp FOLDER` does the same for a batch from several bodies.

Checked (`eval/cr2-pipeline-grade-2026-11-12.md`, `tools/real_cr2_pipeline.py`): a real
Canon 5D Mark II CR2 and a clip through the whole pipeline in 7.1 s, the 21 MP 16-bit master
bit-identical to `shootflow develop --dcp` with the same profile, a decoy profile for another
body left unused, proxy from the camera's preview and measured scores.
`tests/test_camera_profiles.py` (12 tests) covers each rule, the refusals, symlinks, the CLI
folder mode and a synthetic CR2 through the pipeline with and without a profile. Not done: a
real Adobe profile, regional model names (rename the profile file), other bodies on real files.

## Colour for the light the photo was taken in (2026-11-12)

A camera does not respond to colour the same way under tungsten as under daylight, so a DNG
carries two colour matrices, measured under two calibration lights (almost always Standard
Illuminant A, about 2856 K, and D65). Until today the developer picked the daylight matrix and
white-balanced in camera space, as dcraw and LibRaw do. That is right for daylight shots and
drifts for indoor ones. `shootflow develop` (and the pipeline's grade stage) now follows the
DNG specification's colour model by default (`src/shootflow/dng_colour.py`):

- the as-shot white is the one consistent with `AsShotNeutral`: blend the matrices for a
  white's colour temperature, map the neutral back to XYZ, and the same white must come out.
  The specification finds it by plain iteration, which took over 200 steps on some strongly
  different matrix pairs in testing; here it iterates on the blend weight and bisects once
  it stalls. `AsShotWhiteXY` is used directly when there is no neutral;
- `ColorMatrix`, `CameraCalibration` and `ForwardMatrix` are blended linearly in inverse
  temperature (mired) and clamped outside the two calibration lights; colour temperature is
  Robertson's 1968 method;
- with `ForwardMatrix`, camera to XYZ D50 is `FM * D * inv(AB * CC)`; without it, Bradford
  from the white to D50 after the inverted blended matrix; then XYZ D50 to sRGB through
  Bradford to D65;
- `CameraCalibration` only when its signature matches the profile's; `AnalogBalance` is taken out.

`--colour dcraw` (`DevelopSettings(colour="dcraw")`) keeps the old method, which is what the
LibRaw comparison above measures (`tools/libraw_differential.py` now asks for it). The JSON
report gains `colour`, `white_xy` and `cct`, and `matrix` says which tags were blended at what
temperature (`"ColorMatrix1+2 at 3584 K"`).

How it was checked (`eval/dng-colour-2026-11-12.md`):

- `tests/test_dng_colour.py` (15 tests) writes DNGs from a known scene: a camera whose true
  response under A differs from the one under D65, photographing patches lit by that light.
  Under tungsten the new model gives the patches back within 0.0004 in linear light; the old
  one misses them by 0.036. It also covers daylight, greys staying grey at any white, a
  `ForwardMatrix` that carries the real response when the colour matrices are a crude fit,
  `AsShotWhiteXY` against the neutral, `AnalogBalance`, the `CameraCalibration` signature rule,
  one matrix or unknown illuminants, a `--wb` override (the white is found from it), and refusals.
- Against an independent implementation, colour-hdri (BSD-3, colour-science.org), which has
  its own Robertson code, iteration and blending (`tools/dng_colour_check.py`, in a separate
  venv): on 2,000 random profiles of the shape Adobe publishes (with and without
  `CameraCalibration`, `AnalogBalance` and `ForwardMatrix`) and whites from 2,000 to 10,000 K,
  a little off the Planckian locus, the white, its temperature and the camera-to-XYZ matrix
  agree to rounding (largest matrix difference about 1e-13), apart from two profiles with
  several self-consistent whites where the two loops, started from different guesses,
  settle on different ones.
- On a real file's tags: exiftool's test DNG, written by Adobe's converter from a Canon EOS
  350D (image data stripped, so tags only: two matrices for A and D65, a `CameraCalibration1`,
  an as-shot neutral). Its white is x 0.4014, y 0.3905, 3584 K (an indoor shot), the blend is
  64% the tungsten matrix, and colour-hdri gives the same white and matrix within 2e-15. On 64
  colour patches at that white the old one-matrix method lands up to 35 8-bit sRGB steps from
  the DNG model (mean 9). That measures how much the two models differ on a real camera
  profile, not which is closer to the scene: a real tungsten-lit chart with known colours is
  still wanted for that, as is a DNG with `ForwardMatrix` written by a camera or Adobe.

## Camera profiles: hue/saturation maps, look tables and `.dcp` files (2026-11-12)

The matrices are only half of a camera profile. Adobe's profiles, and the ones RawTherapee
and dcamprof make, also carry a **hue/saturation map**: a grid over hue, saturation and
(sometimes) brightness that nudges each colour's hue, saturation and value. Many also carry
a **look table**, the same kind of grid applied after the exposure. These are what give a raw
converter its colour rendering. The developer now applies both by default, in the DNG
specification's order: camera to linear ProPhoto, the map (two maps blended for the as-shot
light like the matrices), the exposure, the look table, then sRGB.

```
shootflow develop IMG_0001.dng --out masters/                          # tables embedded in the DNG
shootflow develop IMG_0001.dng --out masters/ --dcp "Canon EOS 5D Mark II.dcp"   # your own camera profile
shootflow develop IMG_0001.dng --out masters/ --no-profile-tables      # matrices only
```

`--dcp` reads a `.dcp` camera profile, the file Adobe DNG Converter installs and dcamprof and
RawTherapee write. Its matrices, maps and look table replace the DNG's own. The camera's
`AnalogBalance` and `CameraCalibration` still come from the DNG, as the specification says.
A profile made for another camera model renders with a note. The JSON report's `profile` field
names the profile and the tables it applied (`"Canon EOS 5D Mark II: HueSatMap 90x30x1"`).

How it was checked (`eval/dcp-tables-2026-11-12.md`):

- `tests/test_dng_profile_tables.py` (15 tests): the table code against a second
  implementation built on the stdlib's `colorsys`, worst difference under 1e-9 on four table
  shapes; known hue, saturation and value edits; the hue wrap; the sRGB-encoded value axis;
  renders against the plain render edited by hand (within 0.004 linear); DCP and embedded
  tags giving the same bytes; the numpy engine byte-identical to pure Python.
- `tools/dcp_check.py` on all 161 profiles RawTherapee ships: every one reads, greys stay
  exactly grey, and numpy matches pure Python on 2,000 colours per profile. A typical profile
  turns saturated colours' hue by about 10 degrees and raises their saturation about 27%.
  One shipped profile (FUJIFILM X-A7) has a +/-180 degree angle-wrap fault in its map.
- On a real Canon 5D Mark II raw frame with its RawTherapee profile, the maps move 36% of
  pixels by more than 5 8-bit steps. The two engines give identical bytes, and numpy takes
  3.8 s at half size against 1.3 s without the tables.

Not yet: DNG 1.6's third illuminant, and a comparison against Adobe's own render of the same
profile. The tone curve landed later the same day (next section).

## The profile's tone curve (2026-11-12)

Most camera profiles also carry a **tone curve** (`ProfileToneCurve`): the contrast curve the
profile's maker meant to sit on top of its colours. 126 of RawTherapee's 161 profiles have
one; 53 of those are a plain straight line, and 68 share one 8,192-point film-like curve that
takes linear mid-grey (0.18) to 0.388 and steepens the mid-tones about 2.1 times. The
developer now applies it after the look table, by default, as the DNG specification and
Adobe's reference code do:

- the points are joined by the **natural cubic spline** (second derivative zero at both ends)
  and sampled into a 4,096-step table;
- the curve is applied in linear ProPhoto by the **hue-preserving RGB tone**: the brightest and
  darkest channel go through the curve and the middle one keeps its place between them, so
  a colour gains contrast without its hue drifting the way a per-channel curve shifts it.

```
shootflow develop IMG_0001.dng --out masters/ --dcp "Canon EOS 6D.dcp"   # tone curve applied
shootflow develop IMG_0001.dng --out masters/ --no-tone-curve            # tables, plain sRGB curve
```

The report's `profile` field lists it (`"Canon EOS 6D: HueSatMap 90x30x1, LookTable 90x30x30,
ToneCurve 8192 points"`); `--no-profile-tables` turns the curve off with the tables.

How it was checked (`eval/tone-curve-2026-11-12.md`):

- `tests/test_dng_tone_curve.py` (14 tests): the spline against a second implementation in the
  test (second-derivative form, dense elimination) and against scipy's
  `CubicSpline(bc_type="natural")`, worst 1e-9 on 200 random curves; HSV hue unchanged and the
  brightest and darkest channel through the curve on 5,000 colours with ties; renders against
  the plain render toned by hand; DCP and embedded curves giving the same bytes; the numpy
  engine byte-identical to pure Python.
- `tools/dcp_check.py` on all 161 profiles: all 126 curves load, every table is
  non-decreasing, the spline equals scipy's to 3e-16, hue moves at most 6e-14 degrees, and
  numpy matches pure Python on every colour.
- A real Canon 5D Mark II frame (its own profile's curve is a straight line, so the shared
  8,192-point curve was taken from the Canon EOS 6D profile): 37% of pixels move more than 5
  8-bit steps, mean level 26.0 to 29.6, and the two engines give identical bytes (numpy 4.9 s,
  pure Python 40 s, half size).

Still open: whether the curve brings the render closer to Adobe's own (needs an Adobe render
of a known frame). Adobe's default curve for profiles with none landed later the same day
(next section).

## The default tone curve, for profiles with none (2026-11-12)

The shared 8,192-point curve above turned out to be **Adobe's "ACR3 default" curve**, the one
Adobe's raw converters fall back to when a profile carries no tone curve: resampled from the
1,025-entry table that RawTherapee (`rtengine/dcp.cc`) and Adobe's DNG SDK carry, it matches
within 4.5e-7 linear on 4,097 points; two RawTherapee profiles carry the 1,025-point original.
So 35 of RawTherapee's profiles, and any DNG whose embedded profile has no curve, rendered
flatter here than in Lightroom or RawTherapee.

shootflow now has that curve as **20 knots of its own** (`dng_colour.DEFAULT_TONE_KNOTS`), a
weighted least-squares natural-spline fit, not a copy of the table: worst error 5.1e-4 linear
and 0.077 of an 8-bit sRGB step; mid-grey 0.18 goes to 0.3880 (the curve: 0.3881).
`tools/default_tone_fit.py` re-derives the knots from any profile that embeds the curve.

```
shootflow develop IMG_0001.dng --out masters/ --default-tone-curve always   # Adobe's behaviour
shootflow develop IMG_0001.dng --out masters/ --default-tone-curve never    # plain sRGB curve
```

`auto` (the default) applies it only when the profile has no curve and its
`ProfileToneCopyright` names Adobe, which is RawTherapee's rule; `always` applies it to every
profile without one. A profile's own curve, even a straight line, always wins. The report's
`profile` field says `default ToneCurve (ACR3 fit)` when it ran.

How it was checked (`eval/default-tone-curve-2026-11-12.md`):

- `tests/test_default_tone_curve.py` (12 tests): the knots pass the tag checks and the table
  never falls; the curve's published landmarks within 6e-4; auto, always and never; a
  profile's own curve (and a straight line) wins; after the tables; the off switches; a `.dcp`
  with an Adobe copyright; numpy byte-identical to pure Python. With
  `SHOOTFLOW_DEFAULT_TONE_DCP` naming a profile that embeds the curve, it is also checked
  point by point (passes on RawTherapee's `Canon EOS 100D.dcp`, 1,025 points).
- A real Canon 5D Mark II frame at half size: the fitted default against the embedded
  8,192-point curve differs by a mean 0.014 8-bit steps, p99 0.68, max 0.81; no pixel moves
  a whole step. The curve itself against no curve: mean 6.9 steps, max 205.


## Three calibration lights: DNG 1.6 profiles (2026-11-12)

A two-matrix profile blends between tungsten and daylight. A photo lit by a fluorescent tube or
an LED lies off that line, and DNG 1.6 lets a profile carry a third set of tags for a third
light (`ColorMatrix3`, `CalibrationIlluminant3`, `CameraCalibration3`, `ForwardMatrix3`,
`ProfileHueSatMapData3`), plus `IlluminantData` to describe a custom light by its xy or its
spectrum. The developer now reads them from the DNG or a `.dcp` and blends the three sets the
way Adobe's DNG SDK does: by the photo's white's distance to each light in a plane of tint and
inverse temperature (`dng_colour.triple_weights`). The as-shot white is found by the SDK's loop on
xy. The report names the sets used and their weights (`"ColorMatrix3 at 4225 K (weights
0.00/0.00/1.00)"`). A third set that breaks the SDK's validity rules is ignored with a note
saying why. A light coded 255 ("other") takes its white from `IlluminantData`, in two-light
profiles too.

How it was checked (`eval/triple-illuminant-2026-11-12.md`): on a synthetic fluorescent-lit
scene the third matrix gives the patches back within 0.0005 linear, against 0.079 when the same
file is read as two-light. Temperature and tint match colour-science's Robertson on 5,000 whites
(to 6e-15 and 5e-13), and spectra give colour-science's xy on 20 CIE illuminants within 5e-5
(`tools/triple_illuminant_check.py`). The weights were not compared value for value with the
SDK's output, and no real DNG 1.6 profile has been read yet.

## Phone DNGs: the lens shading map, and camera DNGs against LibRaw (2026-11-12)

Android phones write their raw files uncorrected and store the lens shading they measured in
the DNG's `OpcodeList2` as four `GainMap`s, one per Bayer position. Ignore them and the corners
come out at about a third of their brightness, tinted. `shootflow develop` now runs `GainMap`
(`shootflow.dng_opcodes`, the DNG specification's rectangle, pitch and map coordinates, gain
bilinear between map points, capped at white) on both engines, byte-identical, and names every
other opcode in the report (`"OpcodeList3: 1 x WarpRectilinear (required) not applied"`).
`--no-opcodes` turns it off. On a real LG Nexus 5X DNG the gains run 1.00 at the centre to 3.8
in the corners, different per colour. Picture: `docs/reports/img/photo-editing-2026-11-12-gainmap.jpg`
in the repository.

The first three camera-written DNGs read against LibRaw (`tools/dng_camera_check.py`, opcodes
off on both sides, since rawpy's LibRaw does not run them): Nexus 5X, Leica T and Pentax Q-S1
match to a median 0.105, 0.027 and 0.023 of an 8-bit step through dcraw's colour method, with
the same black, white and white balance. Correctness of the gain map itself is checked on
synthetic files, including a linear map whose flat-field answer is known in closed form; it
has not been compared with an Adobe render. Details: `eval/camera-dngs-2026-11-12.md`.

## Lens distortion from the DNG: WarpRectilinear (2026-11-12)

Cameras with corrected lenses store the correction in the DNG's `OpcodeList3` as a
`WarpRectilinear`. It has a radial polynomial per colour plane, so it covers both distortion and
lateral colour. Adobe's readers apply it; LibRaw, as rawpy packages it, does not. `shootflow
develop` now runs it after demosaic, on the linear image before colour and tone. Both engines run
it with the same output bytes, and `--no-opcodes` turns it off. On the real Leica T DNG the
correction moves features by up to 5 px at the 720 px preview's scale (about 34 px at full size).
Block-matched against the camera's own embedded preview, 444 patches sit a median 4.2 px off with
the warp off. The offsets follow the formula's prediction within 0.1-0.3 px at every radius. With
the warp on they drop to 0.18 px, the same as the matcher's noise across the radius.
`tools/warp_preview_check.py` runs that check on any DNG with a preview and a warp. The formula is
also checked exactly on synthetic ramps (13 tests) and agrees with darktable's reading of the same
opcode. Details, choices and what is not checked: `eval/warp-rectilinear-2026-11-12.md`.

## Higher-order lens distortion from the DNG: WarpRectilinear2 (2026-11-12)

`WarpRectilinear2` (opcode 14, DNG 1.6) now runs in `OpcodeList3` beside WarpRectilinear. Its
radial polynomial has 15 terms on every power of `r` up to `r^14`, odd as well as even, where
WarpRectilinear has four even ones. It can also divide by the polynomial instead of multiplying,
and it clamps `r` to a valid range before the polynomial. The layout and formula were read from
the DNG 1.7.1.0 specification text (pages 120-122), not from memory. The specification's skip rule
is in too: a writer can put an optional WarpRectilinear2 first and a plain WarpRectilinear or
WarpFisheye after it for older readers, and a reader that applies the first skips the second.
`plan()` does that and says so in the notes. If the WarpRectilinear2 can't be read, the fallback
runs. Both engines give the same bytes, and `--no-opcodes` turns it off.

Why it matters, measured: lensfun's 5,440 ptlens calibrations (1,079 lenses) carry exactly as a
WarpRectilinear2 (kr0..kr3 from `a, b, c`; checked to 1.8e-12 px against lensfun's formula). 4,741
of them have an odd term that WarpRectilinear can't hold. Even with its four terms chosen as well
as possible (a minimax fit), WarpRectilinear leaves more than 1 px on a 6,000 px wide frame for
17% of rectilinear profiles, and more than 0.5 px for 38%. A plain least-squares fit leaves more
than 1 px for 52%. `tools/lensfun_warp_fit.py` runs it.

What is checked: 21 tests (`tests/test_dng_warp2.py`). The source point is checked against the
specification's formula, written out separately in the test, for odd terms, clamping, `r^14` and
the division form. An even-only WarpRectilinear2 gives WarpRectilinear's points. The skip rule is
checked on the specification's three worked examples. numpy and pure Python give the same bytes.
What is not: no camera- or converter-written file carrying it has been tried. The gap found in
passing here (opcodes with flag bit 1 skipped in every develop) was fixed on 2026-11-13: see
"Full and preview quality" below. Details: `eval/warp-rectilinear2-2026-11-12.md`.

## Full and preview quality: opcode flag bit 1 (2026-11-13)

Each DNG opcode carries two flag bits. Bit 0 marks it optional. Bit 1, in the
specification's words (DNG 1.7.1.0, chapter 6, p. 104), means the opcode "can be skipped when
doing 'preview quality' processing, and only needs to be applied when doing 'full quality'
processing". Until 2026-11-13 `dng_opcodes.plan()` treated bit 1 as "preview only" and skipped
such opcodes in every develop, so a full develop of a file using the flag left out a correction
the file asked for. Now a develop is full quality by default and runs them; `--preview-quality`
(`DevelopSettings.preview_quality`) skips them and names each one in the report
(`"OpcodeList2: 1 x GainMap skipped (full quality only; this is a preview-quality render)"`). The
half-size still made for proxies and analysis when a DNG has no embedded preview
(`still_for_review`) is the one preview-quality render ShootFlow makes. A WarpRectilinear2 skipped
this way does not arm the skip rule, so the fallback warp after it runs.

Checked: 11 tests (`tests/test_dng_quality_flag.py`, plus the WarpRectilinear2 skip-rule case in
`tests/test_dng_warp2.py`); 6 of them fail on the old code. On real files it changes nothing yet:
`tools/dng_opcode_flags.py` lists the flags of the six camera DNGs in the metadata-extractor
collection (DJI Phantom 4 x2, LG Nexus 5X, Leica T, Leica X Vario, Pentax Q-S1) and none sets bit
1. The two DJI files are the first real ones here carrying FixVignetteRadial and FixBadPixelsList;
the first develops in 46 s, repairs 9,334 sensels and matches LibRaw to a median 0.012 8-bit steps
with opcodes off. Details: `eval/opcode-quality-flag-2026-11-13.md`.

## Cubic resampling for the lens warps (2026-11-13)

Every warp (the DNG's WarpRectilinear, WarpRectilinear2 and WarpFisheye, and the lensfun corrections
from `--lens-db`) maps each output pixel to a point between source pixels and has to sample there.
Until now that was bilinear, a blend of the four nearest pixels, which softens the image a little
wherever the point falls between pixels. The DNG specification recommends "a suitable resampling
kernel, such as a cubic spline" (1.7.1.0, p. 107). `shootflow develop --warp-kernel cubic`
(`DevelopSettings.warp_kernel="cubic"`) now samples 16 pixels with the Catmull-Rom spline (Keys'
cubic convolution, a = -0.5), clips the spline's overshoot at hard edges to the plane's range, and
gives the same bytes on the pure-Python and numpy engines.

Measured (`eval/warp-kernel-cubic-2026-11-13.md`, `tools/warp_kernel_check.py`): under the Leica T's
own WarpRectilinear, on gratings whose true value at every source point is known, cubic is 2 to 100
times closer than bilinear (RMS 0.0133 against 0.0550 at 0.25 cycles per pixel). On the real Leica T
frame, the bilinear warp keeps 73% of the unwarped render's fine detail (mean absolute Laplacian of
green) and cubic keeps 89%. The cost: the full-size warp takes 14.6 s instead of 5.7 s on the numpy
engine, so bilinear stays the default until a faster cubic lands. Not checked: the kernel Adobe's
DNG SDK uses.

## Value tables and row/column fixes from the DNG: MapTable, Delta/Scale per row and column (2026-11-12)

Five more opcodes now run in `OpcodeList2` and `OpcodeList3`, in list order with the others:
`MapTable` (opcode 7) sends each value through a table of up to 65,536 16-bit entries (a sensor's
non-linear response, or a converter's tone map); `DeltaPerRow` and `DeltaPerColumn` (10, 11) add
one offset per row or column, the fix for the banding a sensor's readout leaves; `ScalePerRow` and
`ScalePerColumn` (12, 13) multiply by one gain per row or column. Each takes the same area, plane
range and pitches as `MapPolynomial`; results are pinned to 0..1, and in stage 3 the white-balance
scale is taken off and put back. The table is indexed as the DNG SDK indexes 16-bit data:
`floor(x * 65535 + 0.5)`, a short table's last entry serving every larger value. A per-row or
per-column list whose length does not match its area's steps is named and skipped, as the SDK
rejects it. Both engines give the same bytes (numpy: 0.15-0.34 s per opcode on a 12 MP plane);
`--no-opcodes` turns them off. `OpcodeList1` still runs only the bad-pixel fixes: there the SDK's
float view of a raw value is `value / 65535` whatever the white level, and no file has shown which
unit a camera means, so these five stay named there.

What is checked: 16 tests (`tests/test_dng_table_per_line.py`) against the formulas written out in
the test. A raw file with its rows darkened by known gains, a fixed offset added per column, or
its values squared develops back to the clean scene with `ScalePerRow`, `DeltaPerColumn` or a
square-root `MapTable` (within 3, 3 and 8 8-bit steps; off, more than 10); tables of 1 to 65,536
entries match the lookup exactly; area, plane and pitch select exactly the named samples; numpy
and pure Python agree byte for byte in both stages, full and half size. What is not: no camera- or
converter-written file carrying any of the five has been tried. Details:
`eval/table-per-line-2026-11-12.md`.

## Cropping inside the opcode lists: TrimBounds (2026-11-12)

`TrimBounds` (opcode 6) now runs in `OpcodeList2` and `OpcodeList3`. It crops the image to a
rectangle, and every opcode after it in the list works on the smaller image: its area counts from
the trimmed top-left, and a vignette's or warp's optical centre and corner distance are measured
on the trimmed frame (as the DNG SDK resets a trimmed image's origin, `dng_simple_image::Trim`).
A converter writes it after a warp to drop the edges the warp leaves without data. Before this, a
DNG carrying it got "TrimBounds (required) not applied" and its full frame.

How it runs: no pixel moves while the lists run. `dng_opcodes.frame_trims` resolves each list once
the image size is known, wraps every opcode after a trim with its frame, and the developer crops
its output to the last frame after encoding; an `OpcodeList2` trim is the frame `OpcodeList3`
starts in. A trim that is empty or does not lie inside the image is skipped with a note (the SDK
rejects the file). On a half-size develop the rectangle is halved. The DefaultCrop, given relative
to the active area, moves with the trim and is cut to it. Choices to check against Adobe's output
when a file turns up: the demosaic sees the whole active area, so the outermost pixel or two of an
`OpcodeList2` trim are interpolated from neighbours the SDK would not see; and whether the SDK
moves the DefaultCrop with a trim, or reads it in the trimmed image's own coordinates. In
`OpcodeList1` (a crop of the stored frame, Bayer phase and all) it stays named and undone.

What is checked: 17 tests (`tests/test_dng_trim_bounds.py`). A trim alone, in either list, gives
the untrimmed develop's pixels inside the rectangle byte for byte, at full and half size; an
`OpcodeList3` trim inside an `OpcodeList2` trim lands where the two compose; a vignette, a warp and
a per-row gain after a trim give exactly what they give on the cropped image, and an opcode before
it what it gives on the whole image; a row gain indexed from the trim's top undoes rows darkened
by known gains (within 3 8-bit steps away from the trim's edge); the DefaultCrop inside, across and
outside a trim; numpy and pure Python agree byte for byte with two trims per list. Three seeded
faults (frame offset dropped, framed result not written back, frames not applied) each fail 3 to 5
of the tests. What is not: no camera- or converter-written file carrying TrimBounds has been tried.

## The opcodes against the DNG specification's own text (2026-11-12)

Earlier opcode work was written without the specification, which no session had fetched. It
turns out to be reachable from a cloud session (Adobe's helpx PDF of DNG 1.7.1.0, September 2023).
So every opcode ShootFlow runs was compared with chapter 6 of that text: GainMap, WarpRectilinear,
WarpFisheye, FixVignetteRadial, FixBadPixelsConstant/List, TrimBounds, MapTable, MapPolynomial
and Delta/ScalePerRow/Column. Parameter layouts and formulas all match, including the WarpFisheye
formula written from memory. One thing differed. The specification places the optical centre
between the top-left and bottom-right *pixels* (`(1, 0)` is "the top-right pixel") and measures
`m` to the farthest *pixel*. The module measured both from the image's edges and called that a
choice the specification leaves open. It now follows the text, for both warps and the vignette.
On the Leica T's terms a source point moves at most 0.048 px. The check against that camera's
own preview, re-run, is unchanged: median radial shift +0.18 px over 444 patches. That shows
nothing regressed; the preview can't tell the two conventions apart. Tests: the independent
formula helpers now use the text's pixel-index coordinates, and a new test pins the text's `(1, 0)`
example and `r = 1` at the farthest pixel. Not done: an Adobe render or the SDK's own code, which
may differ from its text. Details: `eval/opcode-spec-audit-2026-11-12.md`.

## Fisheye unwrapping from the DNG: WarpFisheye (2026-11-12)

`WarpFisheye`, the DNG's other warp, now runs in `OpcodeList3` beside `WarpRectilinear`, in list
order and through the same resampler. A converter writes it for a fisheye lens: each output pixel
at normalised radius `r` reads from radius `kr0 t + kr1 t^3 + kr2 t^5 + kr3 t^7` with
`t = atan(r)`, per colour plane, so an equidistant fisheye comes out as a rectilinear (pinhole)
image. Before, the report named it as "required, not applied" and the frame stayed curved. Both
engines give the same bytes; `--no-opcodes` turns it off. 13 tests (`tests/test_dng_warp_fisheye.py`)
check it on closed forms: with `kr0 = 1` every pixel reads from radius `atan(r)` along its own ray,
the centre pixel reads itself, and on a ramp every pixel equals the ramp at the formula's source
point. What is not checked: the formula was written from memory, since neither the specification
nor Adobe's SDK could be fetched that session (it has since been compared with the DNG 1.7.1.0
text and matches; see "The opcodes against the DNG specification's own text" above); no
camera- or converter-written file carrying it has been tried. Details:
`eval/warp-fisheye-2026-11-12.md`.

## Vignetting and value maps from the DNG: FixVignetteRadial and MapPolynomial (2026-11-12)

Two more opcodes now run, in `OpcodeList2` (on the sensor values, before demosaic) and
`OpcodeList3` (after it), in the order the list gives them alongside `GainMap` and
`WarpRectilinear`. `FixVignetteRadial` brightens the frame by `1 + k0 r^2 + ... + k4 r^10`, with
`r` the distance from the optical centre over the distance to the farthest corner, capped at
white. `MapPolynomial` maps each value in an area, plane range and pitch through a polynomial of
degree up to 8, pinned to 0..1. In stage 3 the developer holds white-balanced values, so each
plane is divided by its white-balance scale for the polynomial and multiplied back: the opcode
sees the 0..1 camera values the specification describes. Both engines give the same bytes, and
`--no-opcodes` turns them off. (`OpcodeList1` now runs the two bad-pixel fixes; see below.)

What is checked: 13 tests (`tests/test_dng_vignette_poly.py`) against the formulas written out
independently. A raw file darkened by the inverse of a known vignette, or with its red sensels
halved, develops back to the undarkened scene within 3 8-bit steps (the darkened sensels'
rounding); a stage-3 vignette and polynomial hit the closed form at every pixel to 12 places;
area, plane and pitch select exactly the named samples; numpy and pure Python agree byte for
byte with a mixed list in both stages, full and half size. What is not: no camera-written DNG
carrying either opcode has been found (`eval/vignette-polynomial-2026-11-12.md` lists the names
tried), and the SDK evaluates the vignette on a coarser fixed-point mask, so an Adobe render may
differ in the last bits.

## Dead and hot sensels from the DNG: FixBadPixelsConstant and FixBadPixelsList (2026-11-12)

The first opcode list, `OpcodeList1`, now runs too, for the two opcodes a camera writes there to
mark defective sensels. `FixBadPixelsConstant` says "every sensel holding this value is bad";
`FixBadPixelsList` lists bad points and rectangles (a dead column is a one-wide rectangle). Both
run on the stored CFA values before black subtraction or anything else reads them, so a dead
sensel never reaches the demosaic as a black dot with a coloured fringe.

A bad sensel becomes the mean of the nearest good sensels of its own colour: the four diagonal
neighbours for green, the eight two rows or columns away for red and blue, widening one step at a
time (up to 8) when those are bad too. Repairs read only original good values, so their order
does not matter. On any plane `a + b*row + c*col` a whole ring gives the exact value back, so an
isolated point, a dead column or a dead row comes back exactly. A constant that would flag more
than 1% of the frame is not run (that is an under-exposed frame, not a defect map) and the report
says so. Both engines read the repaired copy, so they give the same bytes; `--no-opcodes` turns it
off. A 12 MP frame with 2,000 marked sensels repairs in 0.15 s (numpy scan) or 0.34 s (pure).

What is checked: 15 tests (`tests/test_dng_bad_pixels.py`): parse round trips and malformed
parameters; the nearest rings and the green parity for all four Bayer phases; isolated points, a
dead column and a dead row exact on a plane; corners, adjacent bad sensels and blocks equal to a
brute-force reference written in the test; a develop of a file with zeroed sensels and either
opcode equal byte for byte to the develop of the clean file (and far from it with opcodes off);
numpy and pure Python identical. What is not: no camera-written DNG with `OpcodeList1` has been
found yet (the Nexus 5X and Leica T files carry none), and the SDK's own interpolation weights are
not reproduced, so an Adobe render can differ at the repaired sensels. Details:
`eval/bad-pixels-2026-11-12.md`.

## Lens correction for raws that carry none: lensfun profiles (2026-11-13)

Most raw files carry no lens correction: every Canon CR2, and most DNGs. `shootflow develop FILE
--lens-db DIR` now corrects their distortion from lensfun's open database. `DIR` is a folder of its
`data/db/*.xml`, CC BY-SA 3.0, read at run time and not shipped here. The camera, lens and focal
length come from the file's EXIF (`--lens`, `--lens-focal` and `--lens-crop` override them). The
calibration is chosen and interpolated by lensfun's own rules, ported from its source: word
matching, mount and crop filters, a Hermite spline over focal length, and the crop and aspect
rescaling. It then becomes an exact `WarpRectilinear2`, which runs through the same warp code as a
camera's own opcode, so both engines give the same bytes. By default it zooms just enough that no
edge is smeared or empty (`--no-lens-fill` keeps the centre's scale). A file's own lens warp wins.
An unknown lens is a note in the report, not an error. A lens name that is only a focal length,
such as `105mm` (how Canon bodies write third-party lenses), is refused rather than guessed.

Measured: the module's warp lands within 1e-7 px of lensfun's pipeline written out separately (17
tests, including a camera crop that differs from the calibration's, a portrait frame, poly3 and
poly5). All 6,500 calibrations in the database build a warp. 1,576 of its 1,580 lenses find their
own name first, and the other 4 find an alias of themselves. On a real Canon 600D CR2 it found the
EF100-400mm at 100 mm and developed half size in 9.5 s. On the one real file carrying both a
maker's correction and a lensfun profile, a Leica X Vario at 46 mm, the two differ by up to 8 px at
full size once their zooms are matched, more than the camera's own correction of under 4 px. Which
is right is not settled by that file. Details: `eval/lensfun-correction-2026-11-13.md`.

### Lateral colour too, and Canon lens names from the maker note (2026-11-13)

With `--lens-db`, a lens that lensfun also has a TCA calibration for (909 of its lenses) now gets its
lateral colour corrected with its distortion: the red and blue fringes that grow toward the corners.
Lensfun moves red and blue after the distortion, on the distorted point. So each plane's source
radius is `r f_D(r) f_T(s r f_D(r))`, a polynomial of degree at most 14. That is exactly the 15
terms a WarpRectilinear2 plane holds, so the three planes carry it with no approximation, and the
fill zoom keeps all three inside the frame. TCA calibrations are interpolated over focal length as
lensfun does, with the `v` terms not scaled by focal length (`lens.cpp`, `__parameter_scales`).
`--no-lens-tca` corrects distortion only. Canon bodies from before EXIF 2.3 (the 5D Mark II, 7D,
550D) write no `LensModel` tag but name the lens in their maker note (tag 0x0095). The CR2 reader
now hands that name on, so the real 5D Mark II test file finds `Canon EF 50mm f/1.2L USM` without
`--lens`.

Measured: every lens with TCA in lensfun's database (909 lenses, 6,257 focal lengths counting
midpoints) lands within 3e-12 px of lensfun's pipeline written out step by step
(`tools/lensfun_tca_check.py`). On a 6000 px frame at the calibration's crop, the uncorrected
corner has red and blue a median 0.56 px apart, over 1 px for 30% of cases and over 2 px for 9%,
and up to 9.9 px. 12 tests (`tests/test_lens_tca.py`). Four seeded faults each fail 1 or 2 of them:
TCA before the distortion, `v` scaled by focal length, `b` scaled once, and a fill zoom from green
alone. Not checked: a real frame with sharp corner edges, to see that the fringes go. Details:
`eval/lensfun-tca-2026-11-13.md`.

### Vignetting too (2026-11-13, later)

With `--lens-db`, a lens with a lensfun vignetting calibration (`pa`, 717 lenses) now has its dark
corners brought up. Lensfun divides each pixel by `1 + k1 r^2 + k2 r^4 + k3 r^6`, interpolated to
the shot's focal length, f-number and subject distance by inverse distance weighting
(`lens.cpp`, `InterpolateVignetting`), with `r = 1` at the corner of the calibration's sensor
(`mod-color.cpp`). The developer already runs the DNG FixVignetteRadial opcode, whose gain is a
polynomial `1 + k0 r^2 + ... + k4 r^10`, so the five terms are fitted to lensfun's `1 / c` (least
squares, then Lawson reweighting where that leaves more than 0.1%) and the opcode goes into
OpcodeList3 before the warp, as lensfun corrects colour on the uncorrected image. The f-number is
EXIF FNumber; the distance is EXIF SubjectDistance, else 1000 m (said in the notes).
`--lens-aperture`, `--lens-distance` and `--no-lens-vignetting` override. A calibration that goes
dark inside the frame, or that the fit misses by more than 10%, is refused with a note.

Measured on every `pa` calibration in lensfun's database and the midpoints between apertures
(54,108 cases on 717 lenses; `tools/lensfun_vignetting_check.py`): the fitted gain is a median
0.0036% from lensfun's, 1.1% at the 99th percentile; 0.7% of cases are refused. Lensfun's own corner
gain is a median +0.46 EV, over a stop in 18% of cases: that much darker are those corners without
it. 16 tests (`tests/test_lens_vignetting.py`), and nine seeded faults all caught. Not checked: a
real evenly lit frame. Details:
`eval/lensfun-vignetting-2026-11-13.md`.

### Vignetting against the compiled lensfun (2026-11-13, later still)

`tools/lensfun_vignetting_released_check.py` runs liblensfun 0.3.4's own devignetting (lensfunpy's
`apply_color_modification` on an image of ones) on every `pa` lens in that release's database that
we find by the same name: 97,382 cases on 474 lenses, calibration points and midpoints in f-number
and in focal length, on 3:2 and 4:3 frames at two crop factors. Our interpolation and units agree
with it to a median 0.00012% of the gain (99th percentile 0.0034%; the largest, 0.32%, is lensfun's
own float32 rounding on a 93x corner gain). Where lensfun's `c` goes negative it returns black;
`build_vignette` refuses all 133 such cases. One difference is deliberate: the release measures the
radius by the pixel-centre diagonal `hypot(w - 1, h - 1)`, master (which we follow) by the
edge-to-edge one, `hypot(w, h)`. That moves the corner gain by a median 0.0075% on a 6000 px frame,
but by up to 10% on the steepest calibrations (46% on an 800 px preview), so programs built on the
release and on master disagree there. The FixVignetteRadial we ship is within 1.2% of the release at
the 99th percentile on an 800 px frame. 6 tests (`tests/test_lensfun_vignetting_released.py`); four
seeded faults all caught. Details: `eval/lensfun-vignetting-released-2026-11-13.md`.

## The lensfun port against the real lensfun library (2026-11-13)

The lensfun correction above was checked against lensfun's own compiled code, not just against its
formulas written out again. lensfunpy bundles liblensfun 0.3.4, lensfun's latest release.
`tools/lensfun_released_check.py` runs it on every rectilinear ptlens, poly3 and poly5 lens in that
release's database: at each calibrated focal length and between each pair, on 3:2 and 4:3 frames, at
two crop factors. It compares where each pixel reads from with our WarpRectilinear2. We follow
lensfun's master branch, which keeps the centre's scale. The release keeps Hugin's half-height point
instead, and one exact change of radius takes one to the other (derived in the eval).
On 36,756 cases over 1,083 lenses the median gap is 0.008 px (ptlens) and 0.005 px (poly3). The
worst is 0.40 px, on lenses with large terms, inside the error of lensfun's own approximate square
root. The exception is five lenses that list one focal length twice: lensfun 0.3.4 keeps the last
entry and master, which we follow, the first.

The first comparisons were 0.05-0.3 px off. The cause was a bug in lensfun 0.3.4 itself. Its SSE
loops for ptlens and poly3 (`mod-coord-sse.cpp`) compute each pixel's factor, then multiply it lane
by lane into interleaved `(x, y)` registers. Six of every eight coordinates get a neighbouring
pixel's factor. Lensfun's master branch fixed it; no release has the fix yet. So the check compares
only the coordinates lensfun computes with their own factor, and reports the bug's size separately.
`tests/test_lensfun_released.py` (3) holds the identity to 1e-9 px against v0.3.4's pipeline written
out, and runs the real library when lensfunpy is installed. Details:
`eval/lensfun-released-check-2026-11-13.md`.
