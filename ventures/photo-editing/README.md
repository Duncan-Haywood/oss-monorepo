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
from the workspace's `color/camera-profiles/` ("CR2 in the pipeline" below), and since
2026-11-14 a Sony ARW, a Nikon NEF, an Olympus ORF, a Panasonic RW2, a Samsung SRW and a Pentax PEF the same way ("Sony ARW", "Nikon NEF",
"Olympus ORF", "Panasonic RW2", "Samsung SRW" and "Pentax PEF" below), and a Fujifilm RAF too, X-Trans included ("Fujifilm RAF" below), and since 2026-11-15 a Canon CR3, full quality and C-RAW ("Canon CR3" below). Since 2026-11-15 the GH6-era RawFormat 8 RW2 too ("Lumix bodies from 2022 on" below). Since 2026-11-16 a C-RAW CR3 stored in several tiles too ("C-RAW in tiles" below). Since 2026-11-18 the 2018-2023 bodies' tiled CR3s and older C-RAW layout too (EOS R, RP, M50, M6 Mark II, 250D, 90D, 850D, M200, R100: "Every CR3 body on raw.pixls.us" below). Other RAW formats (a CR3 with an unknown codec version, ...) are still scored from their preview but stop at the grade
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
default, run without a shell, and any failure keeps the measured score. Since 2026-11-16 the recommended detector is `tools/mediapipe_face_detector.py`: Google's MediaPipe Face Landmarker (Apache 2.0, a 3.8 MB model you download once, path in `SHOOTFLOW_FACE_LANDMARKER`; on Linux `apt-get install libegl1 libgles2`) reads each lid's blink score, searches the frame in tiles so group shots' small faces are found, and averages the score over every view of a face. On 105 real CC0 photos it flagged 5 of 6 closed-eye photos and none of the other 99; the Haar detector below flagged 3 of 6 and 8 of 99 (open eyes behind sunglasses or narrowed by a smile, a sleeping cat). The labels are an agent's, not a photographer's, and the open/shut margin was thin (blink 0.44 against 0.50): `eval/blink-landmarker-2026-11-16.md`. A face cut in half by the frame edge, which no face finder sees, is searched for in each edge's strip mirrored across the edge (later on 2026-11-16): the set's one miss is now flagged (6 of 6, still 0 of 99), and of 40 half faces cut from the set's own faces 20 are found instead of none, 19 reading the same as the whole face (16 of 18 faces over 100 px wide; `eval/blink-edge-mirror-2026-11-16.md`). `tools/opencv_face_detector.py` (2026-10-29) is the older reference detector for that contract: OpenCV Haar
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

## Cull raw files in the browser (2026-11-23)

`site/cull.html` (live at https://marisstella.app/photo-editing/cull.html) is the
culling step with no install: drop a card's raw files, and it shows each from the
JPEG the camera embedded (`site/rawpreview.mjs` finds it by TIFF tags, CR3 boxes,
the RAF header or the Olympus maker note, with a byte scan last), reads camera,
lens, exposure and capture time from EXIF, groups frames under 1.5 s apart from
one body into bursts, scores detail (Laplacian variance in the busiest of 16
cells, the same family of measure as `shootflow cull`) and marks the most detailed
frame of each burst. Keys: arrows, 1-5 stars, X reject, 6-9 labels, Space for the
large view, Z for 100% at the most detailed cell. It downloads XMP sidecars
(`IMG.xmp` for Adobe and Capture One, `IMG.CR3.xmp` for darktable), a picks list
or a CSV. Nothing is uploaded; marks persist in the browser's local storage.

Checked on the 65 public raws of drewnoakes/metadata-extractor-images
(`eval/cull-page-previews-2026-11-23.md`): a preview in 61, all 61 decode in
Pillow at the size the parser read; 39 are 2,000 px wide or more. In Chromium
(Playwright) the page read all 65 files (1.1 GB) in 4.7 to 5.4 s, with every
portrait frame upright. Not done: BigTIFF DNGs, phone DNGs with no JPEG inside,
the 640 px previews of 2000s Olympus compacts (only their 160 px thumbnail).

```bash
node --test site/rawpreview.test.mjs site/usage.test.mjs
node eval/cull-page-previews.mjs mei OUT > report.tsv   # mei = the sample clone
python3 eval/cull-page-previews-decode.py OUT           # needs Pillow
```

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
  distance 8 or less, single linkage, or, since 2026-11-17, a crop-tolerant match:
  frames up to 24 apart also group when two of their 88% windows on a 5 x 5 grid
  are within 6 and at least 5 closer than the whole frames, so a burst the
  camera panned or zoomed a few percent through stays one group; on burst-like
  pairs cut from 166 held-out real photos, pair recall 0.40 to 0.72 for 2 more
  false merges in 13,695 pairs of distinct photos,
  `eval/cull-crop-grouping-2026-11-17.md`; since 2026-11-18 also a zoom match:
  frames up to 28 apart group when one frame's whole hash is within 6 of a
  90-96% window of the other (4 sizes x 5 x 5 positions) and at least 6 closer
  than the whole frames, so a frame zoomed 3-10% tighter stays in its burst;
  held-out pair recall 0.72 to 0.91, zooms 0.36-0.64 to 0.98-1.00 at 10%, for 2
  more false merges in 13,695, `eval/cull-zoom-windows-2026-11-18.md`; and a wide-pan match the same day:
  frames up to 44 apart group when two 88% windows offset further than the centre
  window reaches (9-12% of the frame) are within 5 and at least 6 closer than the
  whole frames, so a burst panned 8-10% stays together; held-out pair recall 0.91
  to 0.985, those pans 0.07-0.77 to 0.86-1.00, for 1 more false merge in 13,695,
  `eval/cull-pan-windows-2026-11-18.md`; and later that day the crop match's gate
  rose from 24 to 44, the wide-pan match's, because every 6% pan it still split had
  windows within 0-7 bits but whole frames 25-33 apart: held-out pair recall 0.985
  to 0.991, 6% pans 0.85-0.86 to 1.00, no added false merge in 13,695; both window
  matches now run as one packed comparison,
  `eval/cull-crop-gate-2026-11-18.md`; and since the same day every other pair of
  windows at those wide offsets counts too, within 5 and at least 10 closer than
  the whole frames, because the one pair nearest the middle often sat 6-11 bits
  apart while another row lined up: held-out pair recall 0.991 to 0.995, 10% pans
  0.87 / 0.95 / 0.86 to 0.98 / 1.00 / 0.89 (horizontal / vertical / diagonal), no
  added false merge in 13,695, grouping about 1.8x slower (5,000 frames 11.8 to
  21.7 s), `eval/cull-pan-all-pairs-2026-11-18.md`; since the same day, from 500 photos up, a
  chunked hash index finds the only pairs any match could link instead of comparing
  every pair, with identical groups: 2,000 frames 10.0 to 3.6 s, 10,000 frames 251
  to 42 s, `eval/cull-grouping-index-2026-11-18.md`, and since later that day the
  index and the exact checks run in C on every core when a C compiler is present
  (`shootflow.cull_native`; same groups, 10,000 frames 115 to 5.8 s with the fine
  match in, `eval/cull-grouping-native-2026-11-18.md`); and later that day a fine-offset
  match: 24 more 88% windows at 1% and 2% of the frame make a 7 x 7 grid whose
  offsets differ by every whole percent from 0 to 12, so a pan between the 3% steps
  (a 10% pan moves the content 11.1%, a 7% pan 7.5%) still finds a window pair
  within half a percent; frames up to 44 apart group when such a pair is within 5
  and at least 8 closer than the whole frames: held-out pair recall 0.982 to 0.998
  (with 5, 7 and 9% pans added to the test), 7-10% pans 0.78-0.95 to 0.99-1.00, no
  added false merge in 13,695, `eval/cull-fine-offsets-2026-11-18.md`; with the fine
  match in, the every-other-pair match above added 0.0001 held-out recall for one more
  tune false merge and 1.8x the grouping time, so the cull no longer runs it; its
  functions stay in `frame_analysis` for its tune tool), keeps the best frame per group as the
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
   With `ffmpeg-local`, a variant cut from the same clips as a reel already
   encoded in the run (the hero variant always is) is a copy of that encode,
   made only while the sources and the earlier file are unchanged; it saves
   one full reel encode per shoot (about 16 s for a 48 s reel on 4 cores).
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

What it reads: DNG, and Canon CR2, Sony ARW, Nikon NEF, Olympus ORF, Panasonic RW2, Samsung SRW, Pentax PEF, Fujifilm RAF and Canon CR3 with a `.dcp` profile (CR2 since 2026-11-12, ARW, NEF, ORF, RW2, SRW, PEF and RAF since 2026-11-14, CR3 since 2026-11-15, C-RAW included, "Sony ARW", "Nikon NEF", "Olympus ORF", "Panasonic RW2", "Samsung SRW", "Pentax PEF", "Fujifilm RAF" and "Canon CR3" below), raw
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
  and rawsamples.ch answer 403 from the build sandbox; on 2026-11-15 raw.pixls.us answered and served
  real Fujifilm files, `eval/fujifilm-compressed-raf-2026-11-15.md`).
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
- Point-transform scans in C (2026-11-14, `eval/point-transform-c-2026-11-14.md`): a
  lossless-JPEG scan with a non-zero point transform now predicts and shifts in C too, off the
  GIL, instead of falling back to the numpy or Python pass: 4x (predictor 1) to 54x
  (predictor 6) faster on a synthetic 1,000 x 750 scan, identical samples. No real camera file
  we have uses a point transform, so measured reads do not change. `parse_raw` also allocates
  the raw plane once (peak 50 MB to 24 MB on a 12-megasensel DNG).

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

## The noise reading in C: same bytes, a third less added time (2026-11-19)

`--demosaic noise-aware` reads the frame's noise before it blends. Its profile guard took 1.4 s of the 3.1 s
that noise-aware adds to a 24 MP develop. That guard builds a leave-one-out residual for every sensel and
takes the median of each 24 x 24 block. Both steps now run in a small C helper (`src/shootflow/noise_native.py`).
It is built on first use like the decoders, and `SHOOTFLOW_NATIVE=0` or a missing compiler keeps the numpy path.
The C code uses numpy's arithmetic in numpy's order, so the output does not change: 14 of 14 large sample raws
develop to the same bytes. The time noise-aware adds over directional fell by a median 31% (0.124 to 0.085 s per
megapixel), and noise-aware now takes 1.77x directional's time instead of 2.05x. `auto` still picks
directional. The measurements and what is left are in eval/noise-aware-native-spread-2026-11-19.md.

## The blend and its bilinear image in C: same bytes, 43% less added time (2026-11-19)

The same afternoon, the two biggest remaining costs of `--demosaic noise-aware` moved into that helper too: the
bilinear image it blends toward and the per-pixel blend itself, with the final clip folded into the blend's own
pass. The blend's luma step had been a BLAS matrix-vector product, whose fused multiply-adds give different last
bits on different machines; it is now a fixed elementwise order in numpy, which C copies exactly, so a raw
develops to the same bits everywhere. On the 14 large sample raws every output is still the same bytes as before.
The time noise-aware adds over directional fell by a median 43% (0.094 to 0.053 s per megapixel), noise-aware now
takes 1.46x directional's time instead of 1.74x, and the memory it adds at peak fell by a median 16%. `auto` still
picks directional. Details: eval/noise-aware-native-blend-2026-11-19.md.

That evening the per-block statistics the noise reading and the blend weights share went to C too. Two
statistics were done in numpy: each 24 x 24 block's mean level and its largest value. numpy built each one
from two whole-frame copies. Now one pass computes both. It sums each block in numpy's own pairwise order, so
the bits stay the same. All 12 of the 12 largest sample raws tried are the same bytes. The noise-aware develop
is a median 1.11x faster and now takes 1.32x directional's time. The develop is also checked against machine
dependence: the remaining BLAS step, the patch-PCA noise read, would need an error about 10,000 times larger
than a BLAS reordering gives before one 16-bit code moved. Details: eval/noise-aware-native-levels-2026-11-19.md.

Later that night the patch-PCA noise read lost its BLAS calls too. Its covariance and texture energy are now sums
in a fixed order (numpy's pairwise tree), the same in a C helper and in the numpy fallback. So the noise model a
raw gets no longer depends on the BLAS library or its thread count. The bins run side by side and no bin's patches
are copied. The step is a median 1.25x faster on 12 real planes, the model moves by at most 2e-12 relative, and all
12 sample raws still develop to the same bytes. Noise-aware now takes 1.26x directional's time. Details:
eval/noise-pca-native-2026-11-19.md.

## The sRGB encode, interpolated (2026-11-17)

The develop's last step, linear light to sRGB, read a 4,096-entry table at the nearest entry, so a 16-bit
master held at most 4,096 levels per channel and sat up to 104 codes (of 65,535) off the curve in the
shadows. It now reads a 16,384-entry table with linear interpolation (`raw_develop.srgb_table`,
`SRGB_TABLE_SIZE`), in both engines with the same arithmetic. On five public camera DNGs the output holds
45,014-65,536 levels per channel (was 2,239-4,096), every value is within 1 code of a near-exact reference,
the two engines still write identical bytes, and the gap to LibRaw's render shrinks (p99 in 8-bit steps:
Leica T 0.136 to 0.035, Pentax Q-S1 0.160 to 0.047). Every develop's bytes change. How it was checked:
`eval/srgb-table-interp-2026-11-17.md` (`tools/srgb_table_check.py`).

What it buys in an edit (`eval/shadow-lift-banding-2026-11-17.md`, `tools/shadow_lift_check.py`): pushed +3
stops in linear light and shown in 8 bits, the old masters never reached 1-39 of the codes a near-exact
encode reaches per channel (up to 129 at +5 stops); the new ones miss none, on the same five DNGs. On a
noise-free shadow ramp the old encode, lifted 3 stops, jumped 2-7 codes at a time below code 70: bands.

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

## Sony ARW (2026-11-14)

Until now Sony's raw files had to go through Adobe's DNG Converter first. `shootflow develop DSC00001.ARW --dcp PROFILE.dcp` (or `--dcp FOLDER`,
chosen per camera as for CR2) now reads the ARW itself, and the pipeline's grade stage develops
ARW stills with the workspace's `color/camera-profiles/` like CR2 (`src/shootflow/arw.py`).

What it reads: all three ways Sony stores the sensor. Compressed RAW (every Alpha and NEX body
since about 2008): 16-byte blocks of 16 same-colour sensels (an 11-bit maximum and minimum, their
positions, fourteen 7-bit deltas with a shift), through the tone curve the file's SonyToneCurve tag
gives; this format is lossy in the camera, and the reader returns exactly what the camera kept.
Uncompressed 14-bit. Lossless compressed (A7 IV, A1, A7R V and later): 512 x 512 tiles, each a
four-component lossless JPEG of 2x2 Bayer cells, decoded by the same lossless-JPEG decoder DNG
and CR2 use, on every CPU. Black level and as-shot white balance come from the raw IFD on newer
bodies and from the SR2 sub-IFD on older ones, which Sony encrypts with a key-seeded shift
register (an independent implementation of the scheme dcraw and ExifTool describe). Newer
bodies' DefaultCrop is applied; older ones carry none and develop at the full stored width.

Like a CR2, an ARW carries no colour matrix the DNG colour model can use, so it needs the camera's
`.dcp` (Adobe's free DNG Converter installs one per body, e.g. `Sony ILCE-7M3 Adobe Standard.dcp`).

How it was checked (`tools/arw_libraw_check.py`, `eval/sony-arw-reader-2026-11-14.md`): six real
ARWs from six bodies (DSLR-A500, NEX-5N, NEX-7, A5000, A7 III compressed; A7 IV lossless), from
the public metadata-extractor-images collection. Against LibRaw 0.22 through rawpy: every one of
133.9 M sensels equal on both engines, and the as-shot white balance, black level and CFA pattern
equal on all six. Reading takes 0.4-1.5 s per file with numpy and 3.5-6.2 s on the standard library
alone. `tests/test_arw.py` (11 tests) writes ARWs in all three storages with an encoder of its own,
an encrypted SR2 sub-IFD, partial edge tiles, and runs the profile chooser, the CLI and both engines.

Not done: colour is only as good as the profile you supply (no profile ships here); ARW 1.0
(DSLR-A100) and SR2/SRF are refused; the older bodies' masked right-hand columns are not trimmed
(LibRaw trims 8-32 columns by a per-model table; with no tag naming them they are developed);
Sony's own lens corrections (the raw IFD's 0x7032 vignetting and distortion parameters) are not
applied. Since the same day the maker note's LensSpec names the lens for lensfun (see "Sony and Samsung:
lenses named from the maker note" below).

## Canon CR3 (2026-11-15)

Every Canon body since 2018 (EOS R, RP, R5, R6, R7, R8, R10, R50, R3, M50, M6 Mark II, 90D, 250D...)
writes CR3, and until now ShootFlow sent those files to Adobe's DNG Converter first. A full-quality CR3
("RAW" in the camera's menu) is now read directly: `shootflow develop IMG_0001.CR3 --dcp PROFILE.dcp`
(or `--dcp FOLDER`, chosen per camera) and the pipeline's grade stage take it like a CR2.

What it reads (`src/shootflow/cr3.py`): a CR3 is an MP4-family box file, not a TIFF. Canon's `uuid` box
holds IFD0 (CMT1), EXIF (CMT2) and the maker note (CMT3: SensorInfo for the crop, the lens name); the
raw track's `CMP1` box is the codec header and its `CDI1/IAD1` box names the optical-black rectangle,
where black is measured (on the R8 the light-sensitive area starts 12 columns left of the crop, so the
CR2 rule of "every column left of the crop" would read 6 levels high). The as-shot white balance is not in
the maker note: it is in the timed-metadata track (CTMD), record type 8, ColorData11 index 0x69. The
CFA is CMP1's layout turned by the crop's parity.

The sensor data is Canon's CRX codec at its lossless setting: four planes, one per 2x2 position, each
coded line by line with a median edge predictor, an adaptive Rice code and a JPEG-LS-style run mode.
An independent implementation (the format as LibRaw's `crx.cpp` decodes it), pure Python as the
reference and C through the same optional ctypes library as the other readers.

Checked on the five CR3s in the public metadata-extractor-images collection (`tools/cr3_libraw_check.py`,
`eval/canon-cr3-reader-2026-11-15.md`): on both full-quality EOS R8 files every one of 25.5 M sensels
equals LibRaw 0.22's, with both decoders, and the white balance, CFA and white level match; black is
within 1 level of LibRaw's stated figure. 0.5 s per file with the C decoder, 35 s in pure Python.

**C-RAW (later on 2026-11-15).** The other three files (an R3 and two R8s) are C-RAW, the smaller
quality (about 40% smaller files), and are read directly too (`src/shootflow/cr3_wavelet.py`): each
plane is a three-level reversible 5/3 wavelet whose subbands are quantised by a per-tile QP grid; the
deepest low band is coded like a lossless band and the others with a zero-run Rice code that does not
predict values. On all three files every one of 25.5-25.7 M sensels equals LibRaw 0.22's with both
decoders, and the white balance, CFA and white level match; 0.6-0.7 s per file with the C decoder
(each plane on its own thread), 25-28 s in pure Python. The R3 frame develops to a median 0.24 of an
8-bit step from LibRaw's render (`eval/canon-cr3-craw-2026-11-15.md`).

**Sensors stored in several tiles (later on 2026-11-15).** Canon's widest sensors (the R5 class, it was thought; the real R5 and R5 Mark II files of 2026-11-18 are one tile) can
store a frame as tiles side by side, and those files were refused. A full-quality CR3 in tiles is now
read: CMP1's tile size cuts each plane into a grid (every tile that size except the last of each row and
column, which takes the rest, at least 22 plane sensels, as LibRaw requires); the sample header lists each
tile's header (0xFF01, carrying its index) and its four planes' headers in turn, and the data follows tile
after tile, each tile's plane an independent band at the tile's width. The C decoder writes each tile
straight into its place in the frame, so speed is unchanged (0.53 s for 25.5 M sensels in two tiles).

No public tiled CR3 could be fetched (raw.pixls.us refuses this container's proxy; every CR3 in the
metadata-extractor-images collection is one tile). So `tools/cr3_tiled_libraw_check.py` makes them: it
re-stores a real one-tile EOS R8 frame as tiles with the repository's own CRX encoder, splices the sample
into a copy of the real file, and asks LibRaw 0.22 to read it. LibRaw is an independent reader: it gave back
every original sensel on six such files (two real R8 frames, each as two tiles across in two splits
and as a 4 x 3 grid whose last column is 22 plane sensels, the narrowest LibRaw allows), and so did both of
our engines. A deliberately wrong layout (the same tiles written column by column) comes back from LibRaw
with 21.4 M of 25.5 M sensels wrong and is refused by ours, so the check can fail. What it cannot prove: the layout comes from this
repository's reading of LibRaw, not from a Canon body, so a real R5 file is still the stronger test
(`eval/canon-cr3-tiled-2026-11-15.md`). C-RAW in tiles is read since 2026-11-16 (next section).

**C-RAW in tiles (2026-11-16).** The smaller C-RAW quality in tiles was the last CR3 layout ShootFlow
refused. It is harder than full quality: a C-RAW tile is not an independent picture but a wavelet
decomposition, and the 5/3 filter reaches across the seam. Each tile is coded as its own three-level
decomposition (its first sample even at every level), and its subbands carry a few coefficients lent by
its neighbours: one more high-pass coefficient before a left (or top) neighbour, and after a right (or
bottom) one 0-2 per band and level, as LibRaw's `exCoefNumTbl` gives them for the tile's size mod 8. With
them the inverse runs straight across the seam, and each level rebuilds the next level's low band with its
own borrowed edge. Each tile has its own QP grid; a borrowed coefficient takes the step of the nearest own
column. `cr3_wavelet.tile_geometry` sizes the bands, `inverse_53` and `inverse_level` take the
neighbour flags, and the C decoder (`shootflow_craw_plane`) does the same per tile and plane.

No public tiled C-RAW exists to test with, so `tools/cr3_craw_tiled_libraw_check.py` makes them from real
one-tile files: each tile's decomposition is computed from the real sensels around it
(`tests/craw_tiled.py`), the sample is spliced into a copy of the real file, and LibRaw 0.22 reads it.
On all 20 side-by-side layouts tried (two R8 frames and an R3 frame, two to five tiles across, plane tiles
from 22 sensels, the narrowest LibRaw allows, to 2,048, and an odd 619), LibRaw and both of our engines return
the same sensels: equal to the original when every step is 1, and equal to each other when the file's own
steps are used (`eval/canon-cr3-craw-tiled-libraw-2026-11-16.jsonl`). Reading a tiled file takes as long as a
one-tile one, 0.6-0.9 s with the C decoder.

**Where LibRaw and ShootFlow part: tiles stacked one above another.** A grid with more than one row of
tiles does not come back from LibRaw: on the same R8 frame cut 1 x 2 it returns 160,305 of 25.5 M sensels
different from the original (rows next to the seam only), 1 x 3 gives 370,013, and the 4 x 3 grid fails to
decode at all. Our reader returns every original sensel on all three. Reading LibRaw's `crx.cpp` shows one
cause: in `crxIdwt53FilterTransform` the test for a tile below is nested inside the end-of-tile test, so a
tile with a neighbour below never computes its last rows (and the branch written for that case is dead
code; `crxIdwt53FilterDecode` uses the combined test). Rebuilt with the two tests combined, LibRaw gives the
upper tile back exactly, but the first 8 rows of the lower tile still differ, and this run could not trace
that second difference. So side-by-side tiles (the layout once expected of the wide R5-class sensors) are checked by an
independent reader; stacked tiles are read by the same seamless rule, which nothing independent confirms
yet, and a developed frame carries a note saying so. The QP row rule LibRaw uses for borrowed rows (row
minus the bottom count, where columns subtract the left count) is followed but likewise unconfirmed
(`eval/canon-cr3-craw-tiled-2026-11-16.md`).

**Real R5, R5 Mark II and R3 files (2026-11-18).** raw.pixls.us answered this container today, so nine
real CC0 files were checked against LibRaw 0.22: four EOS R5 (RAW and C-RAW, full frame and 1.6x crop),
four R5 Mark II (the same four), one R3 RAW. Every one of 290.1 M sensels is equal (C decoder; the
Python reference too on two of them). Two things changed:

- The wide bodies do not store tiles. CMP1's tile size equals the frame on all nine, the R5's 8352 and
  the R5 Mark II's 8480 sensels across included, so the "R5 class" above was a guess the real files do
  not bear out, and the tiled layouts are still checked only on re-stored R8 frames.
- The R5 Mark II developed with its black 8-41 levels low and no as-shot white balance. IAD1's optical
  black there covers a darker, noisier strip (columns 0-131, about 470) as well as the real one (132-259,
  512.2), and its ColorData12 (4,528 entries) was not in the balance table. The reader now takes the
  black level ColorData states (PerChannelBlackLevel, found at 0x157, 0x16B and 0x17F on the R5, R3 and
  R5 Mark II, equal to LibRaw on all nine) where its place is known, notes a measured one more than 4
  levels away, and reads ColorData12's balance at 0x69. Black and balance now equal LibRaw on all nine.
  In the APS-C crop the old black lifted a tone five stops under middle grey by half a stop
  (`eval/canon-cr3-r5-real-2026-11-18.md`).

**Every CR3 body on raw.pixls.us (later on 2026-11-18).** 39 files of 21 cameras, from the EOS M50 and EOS R
of 2018 to the R6 Mark III and PowerShot V1, against LibRaw 0.22.2. The older bodies (EOS R, RP, M50 and
Kiss M, M50 Mark II, M6 Mark II, M200, 250D/SL3, 90D, 850D, R100) do store tiles: two side by side, 6288 to
7128 sensels wide, while every later body stores one tile even at 8480. ShootFlow refused 17 of their 18
files: their RAW leaves CMP1's several-tiles flags at 0 (the reader demanded they match the grid; LibRaw
reads the grid from the sizes), and their C-RAW is an older layout, CMP1 version 0x100 with no QP grid and
one fixed step per subband, packed with the band's QP and padding into one word of the 0xFF03 header. Both
are now read: **0 of 986.8 M sensels differ** from LibRaw on all 39 (17 tiled, 17 C-RAW, 8 of the old
layout), the first real tiled CR3s this reader has seen, and the as-shot balance is equal on all 39.
The stated black level is now found by ColorData's length and version (3,778 entries is two layouts:
version 48 on the R7/R10/R50/R6 Mark II/R8 at 0x16B, 65-66 on the PowerShot V1 and R6 Mark III at 0x17F;
the older bodies at 0x149), which took the R50 C-RAW's black from 13 levels high to within 2 of LibRaw.
On the R6 Mark III and PowerShot V1, LibRaw 0.22.2 itself reads a wrong black (0 to 145 per channel, where
the masked columns read 512.0-512.2 and ColorData states 512); ShootFlow uses 512
(`eval/canon-cr3-every-body-2026-11-18.md`).

## Fujifilm RAF (2026-11-14)

Fujifilm raw files no longer need Adobe's DNG Converter, and that includes X-Trans, the 6x6 colour
layout most Fujifilm X bodies use instead of a Bayer pattern. `shootflow develop DSCF0001.RAF --dcp
PROFILE.dcp` (or `--dcp FOLDER`, chosen per camera as for the other raw formats) reads the RAF itself,
and the pipeline's grade stage develops RAF stills with the workspace's `color/camera-profiles/`
(`src/shootflow/raf.py`).

What it reads: the RAF's own header (not a TIFF), its header records and the CFA block, which on
X-Trans bodies is a small TIFF of Fujifilm tags (size, bits, data offset, 36 black levels, balance)
and on older Bayer bodies is the sensor data itself. Uncompressed 16-bit words and 12-bit packing.
The X-Trans layout comes from header record 0x0131, which is stored backwards. The crop is the
camera's picture area from the header (0x0110, 0x0111): on all three files it is centred on the
camera's embedded JPEG, which drops a further 8 px a side on the X-Trans bodies
(`eval/raf_jpeg_alignment.py`).

The developer now demosaics 6x6 patterns: the bilinear demosaic takes the CFA's period as a
parameter (every 3x3 X-Trans window holds all three colours), an edge sensel with no in-image
neighbour of a colour borrows the reflected ones on both engines, and half size on X-Trans averages
2x2 blocks of a full-size demosaic. The pure-Python and numpy engines still give identical bytes.

How it was checked (`tools/raf_libraw_check.py`, `eval/fujifilm-raf-reader-2026-11-14.md`): the
three RAFs in the public metadata-extractor-images collection, an X-E1 (12-bit packed), an X-E2
(14-bit) and a FinePix S5500 (Bayer). Against LibRaw 0.22 through rawpy, every sensel is equal on
all three (37.3 M in all), and so are the as-shot white balance, the black level at each of the 36
(or 4) CFA positions, the white level and the CFA layout. 0.01-0.33 s to read; 7 s to develop a
16 MP X-Trans frame with numpy. `tests/test_raf.py` (14 tests) writes RAFs of each layout, checks
the sensels exactly, keeps flat fields flat through the X-Trans demosaic, compares the two engines
byte for byte and runs a synthetic RAF through the profile chooser and the CLI.

Not done: SuperCCD files are refused (none at hand); colour is only as good as the profile you
supply (no real Fujifilm `.dcp` was at hand). Lossless compressed RAFs: see the next section.

## Fujifilm lossless compressed RAF (2026-11-15)

Fujifilm's "lossless compressed" raw, offered from the X-Pro2 and X-T2 on and about half the size of
an uncompressed RAF, is now read directly too, X-Trans and Bayer (GFX): `shootflow develop
DSCF0001.RAF --dcp PROFILE.dcp` and the grade stage take it like any other RAF
(`src/shootflow/raf_compressed.py`; the strip decoder also in C in the optional `ljpeg_native`
library, strips in parallel; the pure-Python decoder is the reference and runs with no compiler).
The lossy compressed mode (header version 0) is read too since the same day: see "Fujifilm lossy
compressed RAF" below.

How it was checked (`tools/raf_libraw_check.py`, `eval/fujifilm-compressed-raf-2026-11-15.md`, rows
in `eval/fujifilm-compressed-raf-libraw-2026-11-15.jsonl`): five real lossless compressed RAFs from
raw.pixls.us (CC0), an X-T2, X-H1, X-T3 and X-S10 (X-Trans) and a GFX 50S (Bayer, 51 MP). Against
LibRaw 0.22 every one of 159.5 M sensels is equal, and so are the balance, the black levels, the
white level and the CFA layout. 0.5-1.0 s to read a file with the C decoder on four cores (1.6 s on
one); 48-56 s in pure Python, which also matches on every sensel. 24 s to develop the 26 MP X-T3
frame end to end. A Bayer RAF with a Fujifilm sub-IFD now takes the 0x3E00 white level the older
Bayer bodies use (LibRaw's value for the GFX 50S; that frame has no clipped highlights to confirm
it). `tests/test_raf_compressed.py` (10 tests) encodes known sensels with a test-only encoder and
decodes them on both paths.

## Fujifilm lossy compressed RAF (2026-11-15)

The "compressed" (lossy) raw setting of the X-S10, X-E4 and other recent Fujifilm bodies is read
directly too, by the same decoder (`src/shootflow/raf_compressed.py`, C and pure Python). It was the
top open item on this flagship. A lossy stream adds, for each strip and each six-row group, a
quantisation base `q`: residuals are coded in steps of `2q + 1`, the gradient thresholds widen with
`q`, and flat patches switch to one of three fixed side quantisers. The module docstring has the
layout.

How it was checked (`eval/fujifilm-lossy-raf-2026-11-15.md`, rows in
`eval/fujifilm-lossy-raf-libraw-2026-11-15.jsonl`): the two lossy RAFs on raw.pixls.us (CC0), an
X-S10 and an X-E4. Against LibRaw 0.22.2 (rawpy 0.28) every one of 2 x 26.7 M sensels is equal, and
so are the balance, black level, white level and CFA, in C (0.7 s a file on four cores) and in pure
Python (73-75 s a file). The X-T2 and GFX 50S lossless files were rerun after the change and still
match on every sensel. What the files show about the format: both sit at 4.75 bits a sensel
(15.8 MB for 26.7 M sensels), so the camera holds a bit budget and varies the step instead: the
X-S10 frame's bases run 0-9 (mean step 5.7 counts), the X-E4 frame's 0-13 (mean step 11.2 counts,
under 0.1% of its 1,022-16,383 range). `tests/test_raf_compressed.py` (now 15 tests) has a lossy
test encoder: bases changing between groups, all three side quantisers, a 12-bit Bayer stream, a
base-0 lossy stream that must come back exactly, and truncated bases.

## Directional X-Trans demosaic (2026-11-14)

X-Trans files are now demosaiced directionally by default (with numpy): green is built four times,
each time interpolated along one direction only (across, down, both diagonals), red and blue follow
from each, and every pixel keeps the direction whose result is most even in L\*a\*b\*, with a 3x3
median of the colour differences after. The bilinear demosaic averaged across edges and left coloured
fringes on them. `shootflow develop X.RAF --demosaic auto|bilinear|directional` (auto, the default, is
directional on X-Trans with numpy and bilinear otherwise; the pure-Python engine keeps bilinear and
says so). The code is the repository's own, from the published idea, not dcraw's or LibRaw's source
(`src/shootflow/xtrans_demosaic.py`).

How it was checked (`tools/xtrans_demosaic_check.py`, `eval/xtrans-directional-demosaic-2026-11-14.md`):
known-truth pictures mosaicked with the real X-E1 and X-E2 layouts and demosaiced by ours and by LibRaw
itself (the mosaic written into the RAF's sensor data, so LibRaw runs its own linear and Markesteijn
X-Trans methods). Colour PSNR against bilinear: 36.6 against 34.8 dB on the X-E1 frame (binned 4x4 as
truth), 47.9 against 42.0 on the held-out X-E2 frame, 33.5 against 20.3 on a synthetic zone plate and
colour-edge sheet; 99th-percentile false colour down 27-75%. That beats LibRaw's one-pass Markesteijn on
two of the three (X-E2 46.5, sheet 25.9; X-E1 37.5) and trails its three-pass method by 2-6 dB. 7-8.5 s
for a 16 MP frame on four cores (bilinear 0.9 s; LibRaw's three-pass 1.7 s in C). Not done: a C path,
LibRaw's three-pass quality, a noisy known truth (on real sensor data our luminance is further from
LibRaw's render than bilinear's is, unexplained), Bayer files (they keep bilinear).

**2026-11-15: within half a dB of LibRaw's three-pass.** Two changes, both found by measuring where
the error was (`eval/xtrans-clamp-gradient-2026-11-15.md`). First, the L\*a\*b\* homogeneity choice
turned out to be no better than averaging all four directions on the X-E1 frame (36.38 against 36.39
dB) and worse on the sheet, while the best direction per pixel would have reached 40.0: the choice
was the weak step. It is replaced by a blend weighted by each direction's smoothness along its own
line (second difference, 3x3 window, weights (D_min/D)^4). Second, each directional green is now
held between the two greens it was interpolated from; the colour-difference estimate overshot where
the 3x3 estimate of the sensel's own colour was off. Colour PSNR, old rule to new: X-E1 frame 36.60
to 38.56 dB (LibRaw three-pass 39.27), held-out X-E2 frame 47.88 to 49.43 (LibRaw 49.89), sheet 33.51
to 35.00 (LibRaw 39.37); 99th-percentile false colour down 20-33%. Half size: X-E1 40.07 to 42.27.
Tuned on the X-E1 frame and the sheet; the X-E2 was looked at once, with the final settings. On the real
frames' sensor data the output is nearer LibRaw's three-pass render than before (X-E1 colour 45.72 to
47.52 dB, luma 47.41 to 49.44), and the luma gap to bilinear's closeness (51.22) is the median's: without
it, 52.40. `directional(...,
clamp=False, select="homogeneity")` reproduces the 2026-11-14 numbers exactly. With sensor-like
noise added to the mosaic (`--noise-snr 60 --noise-snr 25`, scored against the clean truth, LibRaw given
the same noisy mosaic) the gap narrows: X-E1 0.65 and 0.43 dB short, X-E2 0.09 dB short and 0.12 dB
ahead. Still open: the sheet's 4.4 dB gap to LibRaw's three passes (fine rings near the sampling limit),
whether the median should leave green alone (+0.4 dB on the frames, -2.4 on the sheet; needs a real
noisy frame with a known answer), a C path, Bayer.

**In C since 2026-11-15** (`src/shootflow/xtrans_native.py`, `eval/xtrans-native-2026-11-15.md`). The
whole X-Trans demosaic (estimates, four clamped directional greens, red and blue, the gradient blend,
passes and median) in one C function per band, built with the system compiler on first use and loaded
through `ctypes`; numpy stays the reference and the fallback. On the real X-E1 and X-E2 frames the output
is equal to numpy's bit for bit, and a 16 MP frame takes 1.3 s on four cores (numpy 5.0 s; LibRaw's
single-threaded three-pass `postprocess` 2.5 s). To make that exact on every machine the blend's
`** 4` became two squarings: numpy's float32 power follows the CPU's SIMD library and differed from libm
on a fifth of values here (output moved by at most 0.02 of a 16-bit step). `SHOOTFLOW_NATIVE=0` turns it off.

**2026-11-16: checked on seven held-out truths; ahead of LibRaw's three passes under noise on all seven**
(`eval/xtrans-fresh-truths-2026-11-16.md`). Only two X-Trans frames are in the public sample set, so the
check tool now borrows scenes: `tools/xtrans_demosaic_check.py --truth-from FILE` renders any raw LibRaw
reads (here six Bayer frames from Sony, Nikon, Canon, Panasonic, Samsung and OM System bodies), bins it
4 x 4 and mosaics it with the RAF's own X-Trans layout, LibRaw getting the same mosaic. On those six and the
X-E2, none used to tune it, the shipped default has higher colour PSNR than LibRaw 0.22.2's three-pass
Markesteijn on four of seven noise-free (-0.46 to +2.41 dB) and all seven at SNR 25 (+0.07 to +2.3), higher
luma on six of seven noise-free, and lower 99th-percentile false colour at SNR 25 on all seven. Under noise
its luma trails by 0.01-0.6 dB on six (the median's cost). Two changes that gained on the X-E1 were
refused: keeping green out of the median (now `directional(..., median_green=False)`, numpy only: worse on
six of seven noise-free, up to 1.4 dB, a wash at SNR 25) and a green-guided red/blue step. The default is
unchanged.

### Noise-aware demosaic: bilinear where edge-keeping only adds noise (2026-11-16)

**The default since 2026-11-19** (eval/auto-noise-aware-2026-11-19.md): `--demosaic auto` picks noise-aware
wherever it picked directional, after a rule committed before the cost was measured passed all five tests. On 53
public sample raws from 49 bodies it takes 1.34x directional's time (median, 0.062 s per megapixel added) and
1.015x its added peak memory (none over 1.21x). On 6,008 rows from three raw.pixls.us sweeps it is ahead of
directional on average in every set, noise level and scenario, and 0.78% of rows lose over 0.1 dB, all near
clean (worst -0.58 dB). `--demosaic directional` gives the old default and its bytes. The same check found that
frames under 24 sensels in one dimension crashed the blend; they are one block now.

**Near clean, the leak is closed on Bayer (2026-11-19, eval/near-clean-gate-2026-11-19.md).** The blend spreads
block weights to pixels by interpolating between block centres, so a detailed block beside a smooth one took part
of the smooth block's bilinear weight, and near clean bilinear is about 10 dB worse than directional on detail.
That, not the ramps, was the -0.58 dB tile. Each block's q is now raised to at least its largest neighbour's over
12 before the blend (`lift_near_detail`, `NEAR_DETAIL`). On 1,272 held-out rows from 29 bodies, rows losing over
0.1 dB to directional fall from 18 to 11 (none new), the worst at SNR 200 from -0.27 to -0.14 dB, and no noise
level's mean drops. X-Trans passed two of the three tests but not the third, so it is unchanged. `near_detail=False`
gives the old blend.

**X-Trans tuned on its own, and a noisy-reference check (2026-11-19, eval/near-clean-gate-xtrans-tune-2026-11-19.md).**
A tune pass on 53 fresh sample raws (51 bodies, github.com/drewnoakes/metadata-extractor-images) on the X-Trans
layout found no row losing over 0.1 dB to directional at any k, so there is nothing for the lift to fix and X-Trans
keeps the old blend. On the Bayer layout all 15 losing rows were one ISO 1600, 30 s Pentax K-1 Mark II frame whose
binned reference is itself at SNR 7 to 17. Sweep rows now carry the reference's own noise (`truth_sigma18`), and
`near_clean_gate.py tune|rule --clean-truths` drops rows whose reference is noisier than the noise added. On the
352 rows left, what ships loses over 0.1 dB on none.

**The reference's noise read from the raw, not the scene (2026-11-19, eval/near-clean-truth-noise-2026-11-19.md).**
`truth_sigma18` is the shipped noise read run on the reference, so it reads fine texture as grain too: on the 11
rows still losing on raw.pixls.us (Nikon D780 forest at ISO 100, a D600 wallpaper tile) it says SNR 13 to 25,
where the raw's own sensels say 74 to 181. `tools/truth_noise_check.py` reads the raw's noise at native resolution
and measures how much of it survives into the binned reference; sweep rows carry it as `truth_grain18`, and
`--clean-truths` uses it first. By it, 6 of the 11 losers are real: the frame read stops at the foliage, 2.3 to 5.2
times the noise added. The Bayer lift still passes all three held-out tests on the rows it keeps.

`shootflow develop FILE.dng --demosaic noise-aware` (numpy, Bayer and X-Trans; opt-in until 2026-11-19) blends the
directional result toward bilinear block by block (24 x 24). Each block's weight comes from how far
directional departs from bilinear there, against the noise the sensor has at that brightness. The noise
comes from the DNG's own NoiseProfile tag, which phones and converted DNGs write. Without the tag the
noise is read from the frame itself (the default since 2026-11-17, below; `--no-noise-from-frame` develops such a file as directional, and the notes say so). On 25 held-out sample files (scenes from 41 bodies,
noise drawn at three levels), colour PSNR rises +0.43 dB on X-Trans and +0.31 dB on Bayer over the
directional default on average, +0.93 / +0.68 dB at SNR 12, and no tile is worse by more than 0.01 dB.
That beats the best single blend weight per frame chosen with the truth in hand (+0.41 / +0.26). The
answer to "which frames want less edge-keeping" is "parts of every frame".

Measured, not shipped: the same blend with the noise estimated from the mosaic, which reads texture as
noise on detailed frames and lost up to 5 dB. Also measured, not shipped: one weight per frame, worst
-2.6 dB. It stays opt-in because a profile that overstates the noise by about 1.5x starts to cost detail,
and only one real profile (an LG Nexus 5X's, about 20% above the in-frame estimate) has been checked.
4.4 s against 2.0 s for 12 MP. How it was checked:
`tools/xtrans_frame_choice.py`, `eval/xtrans-noise-aware-blend-2026-11-16.md`.

**Since the same day every profile is checked against the frame before the blend uses it.** On 83 real CFA
DNGs from 80 bodies (raw.pixls.us), 43 profiles state more than 1.25x the noise their own sensels show, 25
more than 2x and 11 more than 5x, up to 77x (third-party iPhone apps 14-32x; Adobe-written profiles 0.94-1.20).
The check (`xtrans_demosaic.profile_ratio`) compares the profile with the quietest blocks at each brightness.
It reads an honest synthetic profile as 0.95-1.02 and a k-times-overstated one as k within 5%, and texture can
only make it read low. A profile over 1.25x is scaled to 1.25x, and the develop notes say so. On a synthetic
scene where a 4x-16x overstated profile cost 1.4-10.6 dB, the guarded blend is within 0.02 dB of the true
profile's at every overstatement from 2x to 100x, on Bayer and X-Trans. The guard adds a median 2.7 s per file.
The same check found that the reader refused profiles with a read-noise term of exactly 0, which DNG 1.7.1.0
allows and 14 of the 83 files write (Samsung, OnePlus, Xiaomi, LG, asus). They are read now. The mode stays
opt-in: its gains are still measured on synthetic noise. `tools/noise_profile_check.py`,
`tools/noise_profile_guard_synth.py`, `eval/noise-profile-real-dngs-2026-11-16.md`.

**Since the same day the blend's luma is scored, under noise drawn as a sensor draws it, and the guard reads each
colour plane on its own.** On 25 held-out files the blend raises luma PSNR over the directional default by
+0.61 dB (Bayer) and +0.92 dB (X-Trans), and by +0.91 / +1.31 dB when the noise is drawn before white balance
with each file's own gains. No tile in 522 per layout is worse in luma by more than 0.01 dB. Under that
white-balanced noise the old guard, which carried a profile by one mean gain, read honest profiles as high as
1.55x and trimmed them on up to 33 of 174 tiles, at a cost of up to 0.68 dB luma on a tile. The guard now carries
each plane's pair by its own gain and checks it against that colour's sensels. Honest profiles then read at most
1.03 at the 95th percentile in every scenario, a trim costs at most 0.12 dB, and a profile overstated on one
plane is scaled on that plane alone. NoiseProfiles with one pair per plane are read through CFAPlaneColor.
On 24 real DNGs only a Pixel 4 XL's green plane read differently from the old check (1.34). The blend itself
keeps the one-gain carry it was tuned with: a per-colour noise model in the blend gained 0.01-0.05 dB colour and
lost 0.05-0.07 dB luma. Still opt-in, still synthetic noise. `tools/noise_aware_planes.py`,
`eval/noise-aware-planes-luma-2026-11-16.md`.

**Since 2026-11-17 luma has its own ramp.** The blend's ramp had been fitted on colour, and one ramp re-fitted
on luma only traded colour for luma. Now the output keeps the colour difference (R-G, B-G) of the colour ramp
and takes its luma from a second, later ramp that leans further to bilinear (`LUMA_RAMPS`: Bayer q 0.8-1.5,
X-Trans 0.8-2.0, fitted on 21 tune files). On 25 held-out files luma over directional rises from +0.76 to
+0.99 dB (Bayer) and +1.12 to +1.28 dB (X-Trans), RGB PSNR from +0.35 to +0.48 and +0.51 to +0.61 dB, and no
tile is worse than directional by more than 0.08 dB. The Bayer ramp was chosen with a rule added after seeing
held-out results (the note says how). Sensels no longer keep their raw value under the luma shift; putting it
back gave back most of the gain. `noise_aware(luma_ramp=False)` gives the old blend.
`tools/noise_aware_ramp_refit.py`, `eval/noise-aware-luma-ramp-2026-11-17.md`.

**Since 2026-11-17 a raw with no NoiseProfile can use the blend too, opt-in: `--noise-from-frame`.** Every raw
read directly (ARW, NEF, CR2, RW2, RAF and the rest) and many DNGs carry no profile, so `--demosaic noise-aware`
fell back to directional on them. With the flag, the noise model is read from the frame itself
(`xtrans_demosaic.frame_noise`: the in-frame estimate, sigma scaled by 0.8, then the profile guard). On held-out
tiles whose noise is at least as loud as their finest detail, it keeps 80-94% of the true model's luma gain:
+0.79 to +1.72 dB (Bayer) and +0.99 to +1.94 dB (X-Trans) over directional, against +0.84 to +1.94 and +1.09 to
+2.42. On clean, finely textured tiles the estimate reads texture as noise, and it is 0.3 dB below directional
on average, down to -4 to -6 dB on single tiles. No in-frame estimator tried (lower percentiles, a wavelet
residual, a two-scale reading that cancels self-similar texture) removed that tail, so the flag is meant for
high-ISO frames and is not the default fallback. About 2-5x the directional demosaic's time.
`tools/noise_aware_estimated.py`, `tools/noise_estimator_accuracy.py`, `eval/noise-aware-estimated-2026-11-17.md`.

**Since the afternoon of 2026-11-17 `--noise-from-frame` reads the noise with patch PCA, and fine texture no
longer reads as noise on Bayer files.** `src/shootflow/noise_pca.py` keeps only patches whose gradients are
no bigger than noise alone would give (Liu, Tanaka and Okutomi 2013) and reads sigma from their smallest
covariance eigenvalues (Chen, Zhu and Heng 2015), on 6 x 6 patches of the mosaic itself: scene texture is
nearly the same in every colour while noise is independent sensel to sensel, so texture falls out of the small
eigenvalues. On 240 held-out Bayer tiles no tile is now worse than directional by over 0.03 dB (the block-spread
estimate: 43 tiles over 0.1 dB, down to 4.17 dB), at the same mean luma gain (+0.52 dB against +0.53). On
X-Trans, 17 of 248 tiles still lose over 0.1 dB (worst 1.48 dB, from 45 and 5.65 dB), so the flag stays
opt-in. The 0.8 scale was picked after seeing held-out Bayer rows; on X-Trans the tune-only rule picked it.
`frame_noise(..., estimator="spread")` gives the old model. `tools/noise_estimator_accuracy.py`,
`tools/noise_aware_estimated.py sweep --pca`, `eval/noise-pca-estimator-2026-11-17.md`.

**Since the evening of 2026-11-17 X-Trans files no longer lose detail to it either.** On X-Trans a colour's next
copy is six sensels away, so the afternoon's texture test saw the scene at a six-sensel scale and kept textured
patches; two-period (12 x 12) patches were worse, not better. The test now takes the differences of touching
same-colour sensels (every X-Trans green touches another), reading texture at one sensel. On 248 held-out
X-Trans tiles no tile is now worse than directional by over 0.1 dB (was 17, worst -0.04 dB against -1.48), and
the mean luma gain rose from +0.45 to +0.53 dB. Bayer is unchanged. `estimate_noise_pca(..., texture="colour")`
gives the afternoon's model. `eval/xtrans-noise-pca-12-2026-11-17.md`.

**Since the night of 2026-11-17 it is the default: `--demosaic noise-aware` on a file with no NoiseProfile reads
the noise from the frame** (`--no-noise-from-frame` gives the old fallback to directional). Checked on whole
real frames from the public sample set: all 52 files without a profile that develop (ARW, CR2, NEF, ORF, RW2,
SRW, RAF, PEF and DNG; four Bayer phases and two X-Trans) took the frame-read model, and the one DNG with a
profile kept it. With no truth on those frames the check is behavioural: at ISO 50-200 the blend moves a median
1.5% of pixel values (PSNR 58 dB against directional), at ISO 800-6400 a median 23% (48 dB). It cost about
0.5 s per megapixel and up to 6.4 GB on a 36 MP frame, which is why the default demosaic (`auto`) stays
directional. `tools/noise_fallback_real.py`, `eval/noise-fallback-real-2026-11-17.md`.

**Since late on 2026-11-17 it costs a third of that, with the same output bytes.** The guard's residual, the
per-block detail, the blend and the final clip run in bands of rows on every core instead of as whole-frame
float64 arrays, and the blend writes over the bilinear image. On the 14 largest public sample raws (12-36 MP,
Bayer and X-Trans) the noise-aware develop is a median 2.2x faster (1.7-2.8x), its extra time over directional
fell from 0.49 to 0.16 s per megapixel (8.6 s in all on a 36 MP D810, was 21.6 s), and the memory it adds fell
41% (2.9 GB on the D810, was 5.1 GB). All 14 outputs are byte-identical to before. `auto` still picks
directional. `tools/noise_aware_cost.py`, `eval/noise-aware-full-frame-cost-2026-11-17.md`.

**The bilinear image is float32 since 2026-11-17 (night): another 15% less memory, no visible change.** The
largest array the noise-aware develop holds, the bilinear image the blend writes over, is now float32 as the
Bayer directional image already was (each band's arithmetic stays float64). On the same 14 raws the memory the
develop adds fell a median 15% more (0.086 to 0.073 GB per megapixel; 3.85 to 2.45 GB on the Sony A7 IV, 2.86 to
2.44 GB on the D810); time is unchanged (median 1.00x). 13 of 14 outputs change, in at most 4 in 100,000 values
(1,446 of 36 million on the Nexus 5X), and every changed value is exactly one step of the develop's 4,096-entry
tone table: values that sat within float32 rounding of a step boundary, which the float64 develop rounds just
as arbitrarily. `tools/noise_aware_cost.py --keep/--codes`, `eval/noise-aware-float32-2026-11-17.md`.

**A higher scale was tried and did not ship (2026-11-17, evening).** The frame-read model is scaled to 0.8 of
what patch PCA reads, which keeps 41-71% of the true model's gain on noisy tiles. A scale picked on tune
rows only, constant or switched per frame by three frame statistics (block spread over PCA, patches the texture
test keeps, and how much the reading drops when the mosaic is binned), always climbs to 1.25 and loses up to
2.51 dB on held tiles. Even 0.9 loses 0.21 dB. Every loss at 0.9-1.1 is on one fine-grained crop that the
frame statistics cannot tell from noise, so 0.8 stays. `tools/noise_aware_estimated.py adapt`,
`eval/noise-scale-per-frame-2026-11-17.md`.

**A card-level noise floor was tested on real cards and did not ship (2026-11-18).** Frames from one body at one
ISO share the sensor's noise and not their texture, so the lowest reading across a card should expose a frame
that reads its own fine detail as noise. On 454 scenes from 182 bodies on raw.pixls.us, three rules were each
committed before the rows they judged existed, and none passed: the floor alone understates noisy frames, and
capping what ships at 1.5x the floor, on 153 bodies no rule had seen, removed 17 of 24 rows worse than
directional (none added) but cost 0.015 dB of mean luma against a 0.01 bar. The run also found that what ships
is worse than directional by over 0.1 dB on 0.8% of real full-size rows (worst -0.53 dB, all near clean), and
that most raw.pixls.us multi-file sets are one scene saved several ways (`tools/card_scenes.py` finds them).
`eval/noise-card-floor-real-2026-11-18.md`.

**The card floor's last two fixes failed too, and the line is closed (2026-11-18).** Taking the floor on the
pre-white-balance scale changed nothing (a card's frames carry similar as-shot gains). Taking it from the
second-lowest scene halved the cost and was tested, rule first, on 24 raw.pixls.us bodies no earlier rule had read
(Pentax, Leica, Leaf, Kodak, Samsung, Fujifilm's Bayer X-M5, OM System, newer Nikon and Sony folders): it still
cost 0.020 dB of mean luma (bar 0.01) and fixed none of the 5 losing rows. On all 5, the true noise model loses
as much as what ships (-0.58 dB on a Pentax K-3 Mark III tile at SNR 200): the blend loses near clean, not the
estimate. `eval/noise-card-floor-rank-2026-11-18.md`.

**Since 2026-11-21 white-balanced noise is read at its level on Bayer files.** After white balance the colours'
noise differs (red and blue are amplified more than green), and Chen's eigenvalue rule read the mix nearer the
quiet green: a median 0.52 to 0.62 of the true sigma at SNR 60 to 12, held out. On Bayer, `frame_noise` now reads
each colour's noise *ratio* from its own block of the patch covariance, scales the colours to equal noise, and
takes the *level* with Chen's rule as before (`eig="mpcw"`), so texture in the quietest direction is not
amplified the way the 2026-11-19 smallest-eigenvalue reads amplified it. Picked and tested by rules committed before
any real row was read, on 51 bodies from github.com/drewnoakes/metadata-extractor-images split by body: held out,
+0.09 dB luma and +0.04 dB colour over what shipped on average, +0.21 dB luma on the white-balanced SNR 25 and 12
rows, no row newly losing to directional. Reading the noise of the patch *selection* the same way (`eig="mpcws"`)
gains three times as much held out (+0.31 dB) but failed the pick: it adds 4 losing rows on one Pentax K-1 II file
(ISO 1600, 30 s). X-Trans keeps Chen's read. `eval/noise-pca-whitened-level-2026-11-21.md`. A noisy truth does not
explain those rows (2026-11-22): a second reading of each truth's grain from the difference of the two green sites,
pre-registered as the judge, failed its own validity tests (it reads scene detail as grain on small frames, median
2.6 times the raw read there against 1.1 on full-size frames), and even taken at face value it keeps every K-1 II
SNR 12 row clean, where `mpcws` still loses. On the tile where it loses alone, `mpcws` reads 0.028 to 0.040 against
0.013 to 0.014 for `mpcw`, more than the truth's grain and the added noise together: its patch selection, driven by
its own higher read, keeps texture. `eval/noise-pca-mpcws-noisy-truth-2026-11-22.md`. Cutting that feedback (`eig="mpcw1"`: one
reselection at `mpcw`'s level, never iterated) failed its pre-registered gates the same day: it still read 1.48 times
`mpcw` on that tile (bar 1.3), added one losing row on tune and lost 0.05 dB in the six-row SNR 200 white-balanced
cell held out, while keeping only +0.01 dB of `mpcws`'s +0.26 dB tune gain. The gain and the over-read share one
cause. `mpcw` stays the default. `eval/noise-pca-mpcw1-2026-11-22.md`.

**Real noise, not added noise (2026-11-22).** Every test above draws its noise. Google's HDR+ burst dataset (CC BY-SA
4.0) holds, per burst, the phone's raw reference frame and the burst merged onto it, so the reference minus the merge
is that frame's own sensor noise with the scene removed (`tools/hdrplus_noise_truth.py`: a lens-shading gain fitted
per cell, edges left out, the merge's remaining noise corrected for). On 57 bursts from Nexus and Pixel phones the
phones' own calibrated NoiseProfiles read a median 1.09 of that truth. Against it the frame reads, before the 0.8
scale, come out `mpcw1` 1.03, `mpcw` (the default) 0.96, Chen 0.87 and `mpcws` 1.16, above the truth on 52 of 57: the
read that looked best on synthetic noise over-reads real noise. What ships reads under the truth on 55 of 57
(median 0.77), the safe side by design. Questions and bars were committed before the 57 were scored.
`eval/hdrplus-noise-truth-2026-11-22.md`.

**The demosaic on real noise (2026-11-22, later).** The same bursts as a dB test (`tools/hdrplus_demosaic_sweep.py`):
the merge binned 4 x 4 as the clean scene, and at every site the reference's own residual from a sensel of that
colour, carried to the scene's level, as the noise. On 48 bursts (5 skipped: over a quarter of the frame was a
moving subject) what ships gains +0.56 dB luma and +0.26 colour over plain directional, no burst losing; the
oracle model gains +0.75 / +0.24. `mpcws` gains +0.13 dB luma and +0.04 colour over what ships, growing with
noise (+0.06, +0.12, +0.22 by thirds), and passed three of four pre-registered tests, but two bursts lose over
0.1 dB to what ships, so the default stays `mpcw`. On both of those bursts the oracle loses by as much: the next
question is the blend's ramps on real noise, not the read. The phones' own NoiseProfiles, as the developer uses
them, gain luma (+0.16) but lose colour (-0.13) against the frame read. `eval/hdrplus-demosaic-sweep-2026-11-22.md`.

**The blend's ramps on real noise (2026-11-22, later still).** `tools/hdrplus_ramp_fit.py` refits the two ramps on
those 48 bursts and scores the picks on 91 bursts no demosaic test had used (79 scored), with the questions
committed first. Ramps fitted for what ships gain +0.10 dB colour and +0.10 luma on the fresh bursts but leave 6
of them over 0.1 dB worse, so by the committed rule the ramps stay. The finding is elsewhere: on the shipped ramps
the oracle noise model is over 0.1 dB worse than what ships on 14 of 79 bursts, and with each read on its own
fitted ramps on none. The ramps were tuned around a read that errs low, so a read that is right looked worse than
it is; the oracle on its own ramps gains +0.18 colour and +0.22 luma over what ships with no burst losing. Next is
`mpcws` on its fitted ramps, tested on a fresh draw from the full 3,640-burst HDR+ set.
`eval/hdrplus-ramp-fit-2026-11-22.md`.

**Three blind draws of the better read (2026-11-22, evening).** `tools/hdrplus_joint_check.py` puts `mpcws` on
fresh seeded draws from the full HDR+ set, the rule committed before each draw. Over 384 scored bursts it gains
about +0.07 to +0.08 dB colour and +0.10 luma over what ships with no new loser to directional, but every draw
has had 2 to 3 bursts over 0.1 dB worse, so nothing has shipped. The third draw (137 bursts) kept the shipped luma
ramp and counted a loss only where the true noise level does not lose too; it still failed on 2, both frames
where the read finds almost no shot noise and lands at a third to a half of the truth. A fallback to what ships
when the read is under 0.6x the shipped read's level is committed for a fourth draw.
`eval/hdrplus-joint-check-2026-11-22.md`, `eval/hdrplus-joint-check-j3-2026-11-22.md`.

**The fourth draw passes: `--noise-read mpcws` (2026-11-23, opt-in).** On 111 fresh bursts the read with that
fallback gains +0.08 dB colour and +0.12 luma over what ships. No burst is 0.1 dB worse and there is no new loser
to directional, so it passes every committed test and ships as an option:
`shootflow develop --demosaic noise-aware --noise-read mpcws` on Bayer raws with no NoiseProfile. The default stays
`ship`, with the same bytes, until a check on camera raws: every burst so far is a Google phone. One finding for
the next step: on this draw the 0.6 line fell back on 3 frames where the read was right and the shipped read was
the one over-reading (2.2 to 6.6x the true shot slope), so the next fallback test should look at the read's own
slope. `eval/hdrplus-joint-check-j4-2026-11-23.md`.

**A fifth draw: the fallback stays as it is (2026-11-23, later).** The read's own slope was tried as the fallback
test: fall back where the shot term is under half the model's noise at 18% grey. Committed before a fifth draw of
240 bursts (126 scored), it failed: one burst lost 0.35 dB because the read collapsed completely (both terms near
0, so their ratio looked healthy), and the slope turned out to be exactly 0 on 22 bursts where the read still
gained on most, so the test fell back on 31 frames and gave up 0.017 dB luma off the mean. The shipped 0.6 ratio
line passed the same draw with no burst 0.1 dB worse (+0.06 dB colour, +0.10 luma): two blind draws, 237 bursts,
none lost. `eval/hdrplus-joint-check-j5-2026-11-23.md`.

**On camera raws too: `mpcws` is the default (2026-11-23, evening).** The check the fourth draw named: the option
against what ships on 11 Bayer camera raws no noise read had been scored on (Canon 5D Mark II, Nikon D3X, D3S and
D4, Olympus E-3, Panasonic G1 and GF1, Pentax K200D, Sony A300 and two darktable test scenes, from the test folders
of rawpy, OpenImageIO and darktable), with noise drawn on clean truths at four levels. The rule was committed
before any file was scored. On 76 clean-truth rows it gains +0.22 dB luma and +0.12 colour, no row is 0.1 dB worse
and no new row loses to directional, so all four tests pass and `shootflow develop` now reads noise this way on
Bayer raws with no NoiseProfile. `--noise-read ship` gives the old bytes. The drawn noise follows the model the read
assumes, so the real-noise phone bursts' +0.08 / +0.12 dB is the better guide to the size.
`eval/camera-drawn-mpcws-2026-11-23.md`.

## A directional demosaic for Bayer files (2026-11-15)

Nearly every camera has a Bayer sensor, and until now every Bayer file the developer read (DNG, CR2,
CR3, NEF, ARW, ORF, RW2, SRW, PEF, the GFX's RAF) was demosaiced bilinearly, which leaves zipper
patterns and false colour along every sharp line. `src/shootflow/bayer_demosaic.py` builds green along
the row and the column (Hamilton-Adams), decides which way each edge runs from how fast the colour
difference changes along each (the test Menon, Andriani and Calvagno published in 2007) and blends the
two, then fills red and blue as weighted colour differences. It is the default with numpy installed
(`--demosaic auto`); `--demosaic bilinear` gives the old bytes on both engines.

Checked with `tools/bayer_demosaic_check.py` against known truth (five real frames binned 4x4, and a
synthetic zone plate and colour-edge sheet) and against LibRaw's own seven Bayer methods run on the same
mosaics (`eval/bayer-directional-demosaic-2026-11-15.md`). Tuned on a Canon 70D, a Nikon D810 and the
sheet; a Sony A7 III, an Olympus E-M10 and a Pentax K-1 Mark II were held out. Against bilinear: +0.25
to +14 dB colour PSNR and 9-78% less false colour (99th percentile) on every truth. Against LibRaw's
VNG, PPG, AHD, DCB, DHT and AAHD: the highest colour PSNR on five of the six truths (second on the A7
III, 0.07 dB behind VNG) and the least false colour on five of six. Not better everywhere: on the two
finest, most aliased frames (A7 III, K-1 II) its luma trails bilinear, DCB or VNG by 0.8-1 dB, and with
heavy noise (SNR 25) a plain average has the higher colour PSNR on two frames while leaving 1.2-1.9x the
false colour. A 24 MP frame takes 1.8 s on four cores (bilinear 0.6 s, LibRaw's AHD 1.0 s).

**In C since 2026-11-15** (`src/shootflow/bayer_native.py`, `eval/bayer-native-2026-11-15.md`). The same
steps in one C function per band, built with the system compiler on first use and loaded through
`ctypes` like the raw decoders; numpy stays the reference and the fallback. On the five real frames
above the output is equal to numpy's bit for bit, and it runs 4.2-4.9x faster on four cores: a 24 MP
A7 III frame in 0.44 s (numpy 2.13 s; LibRaw's single-threaded AHD `postprocess` 0.99 s), a 36 MP D810
or K-1 II in 0.6-0.7 s. The median clean-up stays numpy-only; `SHOOTFLOW_NATIVE=0` turns it off.

**Less Laplacian, 2026-11-15** (`eval/bayer-laplace-weight-2026-11-15.md`). The row and column greens
now carry 3/16 of the sensel's own second difference instead of Hamilton and Adams' quarter (an eighth
is what a smooth green gives; the quarter assumes a linear colour difference, which fine aliased texture
is not). Picked on the tuning truths only, then run once on the held-out frames: luma on the A7 III
goes from 0.99 dB behind bilinear to 0.08 behind, on the K-1 II from 0.77 behind VNG to 0.17 behind;
colour PSNR rises on all six truths (+0.10 to +4.28 dB), so ours now has the highest colour PSNR of
LibRaw's seven methods and bilinear on all six; the sheet goes from 35.59 to 39.87 dB with false colour
119 to 42, without the median. `directional(..., laplace=0.25)` gives the earlier output.

**Per-sensel weight, and a fresh held-out set, 2026-11-16** (`eval/bayer-adaptive-laplace-2026-11-16.md`).
`directional(..., laplace="adaptive")` picks the weight per sensel in [1/8, 1/4] as the least-squares
weight that makes the colour difference closest to linear over a 3 x 3 window. It is an option, not the
default: on five frames no earlier note used (Sony A7 IV, Nikon D800E, Canon 7D, Panasonic GF7,
Samsung NX1) it adds 0.10 dB colour PSNR on average (-0.03 to +0.37), and on the sheet false colour
falls from 42 to 9.6, but it loses luma on the A7 III and K-1 II (-0.33, -0.24), takes about twice the
time and runs in numpy only. The same five frames are the first independent check of the 3/16
default: it beats all seven LibRaw methods on colour PSNR on every one, by 0.5-1.5 dB noise-free and
0.2-1.1 dB at SNR 25.

**A learned weight, 2026-11-16** (`eval/bayer-learned-laplace-2026-11-16.md`). `--demosaic learned`
(`directional(..., laplace="learned")`) sets the weight per sensel from a quadratic in eight scale-free
local features (45 weights). It is fitted by weighted least squares on 40 sample frames, and the ten
frames above were never in the fit. On those ten, colour PSNR is equal or higher than the 3/16 default
on every one (+0.01 to +0.39 dB, mean +0.14). Luma is higher on every one (+0.02 to +0.66, mean +0.29),
and that includes the A7 III and K-1 II, where the least-squares weight lost luma. It is opt-in: it
loses on the synthetic sheet (colour -0.45 dB, false colour 42 to 59) and takes longer.
`tools/bayer_laplace_train.py` refits it. Since the same day it runs in C when a compiler is present
(`eval/bayer-learned-native-2026-11-16.md`). On seven real frames the output equals numpy's bit for
bit. It is 1.9-2.8x faster than numpy, and 2.6-3.3x the default's time instead of 4-6x: 2.0 s for
24 MP on four cores. Later the same day its feature passes were fused into one row pipeline over 8-row
rings and vectorized (`eval/bayer-learned-fused-2026-11-16.md`). It is still bit for bit with numpy on
the same seven frames, 1.8-2.2x faster than the morning's C, and 1.5-2.0x the default's time: 0.73 s for
24 MP on four cores, faster than LibRaw's AHD on every frame.

**Refitted on noisy mosaics, 2026-11-16** (`eval/bayer-learned-noisy-nyquist-2026-11-16.md`). The
weights now come from the same 40 frames plus a noisy copy of each at SNR 25 and 50, scored against
the clean green (`bayer_laplace_train.py --noise-snr`). This passed a test written before it was run.
At SNR 25 colour is +0.014 dB and luma +0.07 dB over the first fit, and colour beats the 3/16 default
on all ten frames, noisy and noise-free. Noise-free colour is 0.023 dB lower. Fixed 1/8 still leads
on three frames at SNR 25, but by 0.01-0.02 dB, down from 0.04-0.06. The model's form and speed are
unchanged. Adding synthetic near-Nyquist gratings (`--synthetic`) made the sheet worse (38.64 dB): on
gratings between unrelated colours 1/8 is right, while on the grey zone plate 3/16 beats it by 5 dB.
So the weight should follow how strongly the channels' fine detail is correlated, not only how fine
the detail is. That is the next feature to try.

**Channel correlation tried, not shipped, 2026-11-16** (`eval/bayer-channel-correlation-2026-11-16.md`).
Four correlation features (`bayer_demosaic.CORRELATION_FEATURES`: how strongly the sensel's own second
difference and the other colour's move together over a 3 x 3 or 5 x 5 window) and synthetic frames
matched to real photographs' correlation went through a pre-registered test. The best set gained only
+0.012 dB in cross-validation (the bar was 0.02), and the matched frames lowered that, so nothing reached
the test frames and `LEARNED_LAPLACE` is unchanged. On real frames the hypothesis runs backwards: weakly
correlated detail wants *more* borrowing (1/4 comes within 0.1-0.2 dB of 3/16, 1/8 stays 0.5-0.7 dB
behind). Scored afterwards, as exploration only, the features also made the sheet worse (39.24 dB). A
model with these features runs through `directional(..., laplace=<10-feature weights>,
laplace_extra=(...))` in numpy. `bayer_laplace_train.py --extra` and `--synthetic-kind matched` fit one.

**How much is left: the oracle ceiling, 2026-11-16** (`eval/bayer-oracle-ceiling-2026-11-16.md`,
`tools/bayer_oracle_ceiling.py`). On whole frames of the 40 training raws (clean, SNR 50, SNR 25), the
best weight per sensel gains +1.91 dB of green over 3/16. The best single weight per 4 x 4 tile gains only
+0.83, and per 32 x 32 tile +0.41, which is what B already reaches in sample (+0.405). So more than half
of the per-sensel oracle is choice that changes inside four sensels. Under the pre-registered rule, a
richer model is still worth one try, with +0.83 as its realistic ceiling against B's +0.385 held out.
Fitting B's model to a 4 x 4 box-averaged target lost 0.062 dB in cross-validation, so nothing changed in
the shipped demosaic.

**Boosted trees, 2026-11-16** (`eval/bayer-boosted-weight-2026-11-16.md`, `tools/bayer_boosted_weight.py`;
pre-registered in its own commit before any score). LightGBM on 29 features (the eight, the four
correlation features, log|D| and the 5 x 5 mean and spread of the eight) gains +0.527 dB in five-fold CV
against +0.386 for B's model on the same folds, better on 108 of 120 copies, and +0.451 against B's +0.406
on the ten test frames (22 of 30 copies). Both bars passed, about 31% of the way from B to the 4 x 4
ceiling. Not shipped: on the Pentax K-1 Mark II it falls below the 3/16 default at every noise level
(-0.21 to -0.29 dB, where B gains +0.25), and the A7 III loses to B too. Next: a guarded variant judged
per frame, then tree inference in numpy and C.

**Guarded trees and numpy inference, 2026-11-16** (`eval/bayer-boosted-guard-2026-11-16.md`,
`tools/bayer_boosted_guard.py`, `src/shootflow/tree_ensemble.py`; pre-registered in its own commit). Four
fallbacks to B were scored in CV. The rule picked a frame guard: B for the whole frame when any of the
eight feature means falls outside the training range. It gains +0.518 dB in CV and +0.398 against B's
+0.242 on six fresh cameras no note had used (Canon R3, R8, 10D, Kodak DCS Pro SLR/n, Leica D-LUX 109 and
V-LUX 114). No fresh frame does worse than B, and the guard catches the R8, where unguarded trees lose
0.65 dB to B. Still not shipped: on the ten test frames the K-1 II (-0.49) and A7 III (-0.12) look
ordinary to the guard and stay below B. `shootflow.tree_ensemble` evaluates a LightGBM model from flattened
arrays in numpy, matching `Booster.predict` exactly on the full model. It is a reference, not yet a developer path: 58 s against lightgbm's 3.7 s on 0.6 million sensels, so shipping one would need the walk in C.

## Pentax PEF (2026-11-14)

Pentax raw files no longer need Adobe's DNG Converter, and they are no longer skipped at ingest:
before this, `.pef` was in none of the ingest, catalogue or preview extension lists, so a Pentax
card's raws were not even copied. `shootflow develop IMGP0001.PEF --dcp PROFILE.dcp` (or `--dcp
FOLDER`, chosen per camera as for the other raw formats) reads the PEF itself, and the pipeline's
grade stage develops PEF stills with the workspace's `color/camera-profiles/`
(`src/shootflow/pef.py`).

What it reads: Pentax's compression 65535, a stream of Huffman-coded differences whose code table
the camera stores in its maker note (tag 0x0220), predicted from two columns left (the first two
columns from two rows up). Black level (0x0200) and as-shot balance (0x0201) come from the maker
note, the CFA from EXIF CFAPattern, white level from the bit depth. The crop is the camera's own
picture area: on the K-1 Mark II the embedded 7360 x 4912 JPEG sits at (14, 28) of the stored
7392 x 4950 frame, measured by sliding the JPEG over the raw (the same shift in all four corners,
`eval/pef_jpeg_alignment.py`); other bodies get the JPEG's size centred, with a note. The decode
runs in C through the same optional ctypes library as the other readers (0.5 s for 36.6 MP), with a
pure-Python reference that gives the same sensels (32 s).

How it was checked (`tools/pef_libraw_check.py`, `eval/pentax-pef-reader-2026-11-14.md`): the
K-1 Mark II PEF in the public metadata-extractor-images collection, the only PEF there. Against
LibRaw 0.22 through rawpy, every one of 36.6 M sensels is equal on both decoders, and so are the
as-shot white balance, the black level at each CFA position, the white level and the CFA. The
masked rows and columns average 1,026, next to the maker note's black of 1,024. `tests/test_pef.py`
(13 tests) writes PEFs with an encoder and a Huffman table of its own, in both byte orders, checks
that the C and Python decoders agree on random streams, and runs a synthetic PEF through the
profile chooser and the CLI.

Not done: one real body only (older bodies' tables are read by the same rule, but no K10D or
K-5 PEF was at hand); colour is only as good as the profile you supply (no real Pentax `.dcp` was
at hand); uncompressed PEFs and Pixel Shift's four frames are refused with a message to convert
to DNG; the measured crop exists for the K-1 Mark II alone.

## Samsung SRW (2026-11-14)

Samsung NX raw files no longer need Adobe's DNG Converter. `shootflow develop SAM_0001.SRW
--dcp PROFILE.dcp` (or `--dcp FOLDER`, chosen per camera as for the other raw formats) reads the
SRW itself, and the pipeline's grade stage develops SRW stills with the workspace's
`color/camera-profiles/` (`src/shootflow/srw.py`).

What it reads: all four storage schemes in the test set. Compression 32770 with a row table (the
Galaxy NX and the NX300 generation: rows of 16-sensel blocks with adaptive bit lengths and a
vertical or horizontal predictor), 32770 without one (the NX20: 12-bit packed), 32772 (the
NX3000: fixed-table Huffman differences) and 32773 (the NX1 and NX500: 14-bit blocks with
prediction modes and a magnitude scale). Black level and as-shot balance come from the maker note,
where they are stored with an encryption key added (tag 0xA020; subtracting it gives LibRaw's
numbers exactly); the crop is the maker note's picture area, which on all four bodies is exactly
the size of the camera's own JPEG. The three compressed schemes decode in C through the same
optional ctypes library as the other readers (0.25-0.5 s per file), with pure-Python references
that give the same sensels (17-28 s).

The CFAPattern tag is not trusted: the Galaxy NX writes garbage there and the NX3000 writes GBRG,
but its image is GRBG (checked against the embedded JPEG's colour, and as LibRaw reads it), so
every SRW is read as GRBG and the develop notes say when the tag disagreed.

How it was checked (`tools/srw_libraw_check.py`, `eval/samsung-srw-reader-2026-11-14.md`): the
four camera SRWs in the public metadata-extractor-images collection (Galaxy NX, NX1, NX20,
NX3000). Against LibRaw 0.22 through rawpy, every one of 90.5 M stored sensels is equal on both
decoders, and so are the as-shot white balance, the black level at each CFA position, the white
level and the CFA on all four. `tests/test_srw.py` (12 tests) writes each scheme with an exact
encoder of its own, checks that the C and Python decoders agree on random streams, and runs a
synthetic SRW through the profile chooser and the CLI.

Not done: colour is only as good as the profile you supply (no real Samsung `.dcp` was at hand);
the lens is named from the maker note's LensType since the same day (see "Sony and Samsung: lenses
named from the maker note"); uncompressed and 32769 SRWs are
refused for want of a test file.

## Panasonic RW2 (2026-11-14)

Panasonic Lumix raw files no longer need Adobe's DNG Converter. `shootflow develop P1000001.RW2
--dcp PROFILE.dcp` (or `--dcp FOLDER`, chosen per camera as for CR2, ARW, NEF and ORF) reads the
RW2 itself, and the pipeline's grade stage develops RW2 stills with the workspace's
`color/camera-profiles/` (`src/shootflow/rw2.py`).

What it reads: Panasonic's compressed RW2 with RawFormat 4, which every body in the test set
writes (the 2009 GF1 to the 2015 GF7). The data comes in 0x4000-byte blocks, each stored rotated
by 0x2008 bytes, read from the top of the block down; every run of 14 sensels on a row restarts
two predictions, and every third sensel reads a 2-bit shift for the 8-bit steps that follow.
Size, sensor borders (the crop), CFA, black level, white level and as-shot balance come from
Panasonic's own tags in IFD0. The decode runs in C through the same optional ctypes library as
the NEF and ORF readers (0.07-0.15 s per file), with a pure-Python reference that gives the same
sensels (7-11 s).

Like a CR2, ARW, NEF or ORF, it is developed with the camera's `.dcp` (e.g. `Panasonic DMC-GF7
Adobe Standard.dcp` from Adobe's free DNG Converter).

How it was checked (`tools/rw2_libraw_check.py`, `eval/panasonic-rw2-reader-2026-11-14.md`): the
four camera RW2s in the public metadata-extractor-images collection (GF1, GF3, GF7, LX7). Against
LibRaw 0.22 through rawpy, every one of 50.1 M stored sensels is equal on both decoders, and so are
the as-shot white balance, the black level at each CFA position, the CFA pattern and the crop on
all four. `tests/test_rw2.py` (9 tests) writes RW2s with an encoder of its own that picks a shift
for every three sensels and writes each value through the decoder's block addressing, across
several blocks and all four shifts, and runs both decoders, the profile chooser, the crop and the
CLI.

Lens: the RW2's own EXIF names no lens, so since 2026-11-14 the lens comes from the JPEG the camera
embeds (tag 0x2E, JpgFromRaw): its EXIF maker note's LensType ("LUMIX G 20/F1.7") becomes LensModel,
and `--lens-db` (or the grade stage's `color/lens-profiles/`) corrects the frame with no `--lens`.
On the GF1, GF3 and GF7 the name and serial equal metadata-extractor's and the lensfun pick equals
the compiled lensfun 0.3.4's (`tools/rw2_lens_check.py`, `eval/panasonic-rw2-lens-2026-11-14.md`);
the fixed-lens LX7 uses lensfun's camera entry as before.

Not done: colour is only as good as the profile you supply; the GF7's own colour matrix (tags
0x11C-0x120) is not read yet. The GF1's white level is 4095, where LibRaw takes 3986 from a
per-model table. Older 16-bit RW2s (RawFormat 2 and 3) are refused for want of a test file.

### Lumix bodies from 2017 on: RawFormat 5, 6 and 7 (2026-11-15)

Until today the reader stopped at the G9, GH5S, S1, S1R, S1H and S5: they write newer layouts,
and a photographer on one of them still had to convert to DNG first. Now three of those layouts
are read (`eval/panasonic-rw2-newer-2026-11-15.md`):

| RawFormat | bodies checked | how it is stored |
|---|---|---|
| 5 | G9 (12-bit, an 82 MP high-resolution frame), GH5S (14-bit) | the same rotated 0x4000-byte blocks as RawFormat 4, but no prediction: each 16-byte line holds 10 sensels of 12 bits or 9 of 14, from the line's lowest bit up |
| 6 | S1, S1R, S1H (14-bit) | 11 sensels a 16-byte line, read from the top bit down: two absolute 14-bit values, then three groups of a 2-bit shift and 10-bit values that step from the previous value of the same column parity; 15 is taken off every sensel |
| 7 | S5 (14-bit) | RawFormat 5's packing, stored in order with no block rotation |

Two fixes came with it, both found on the new files. The crop is now the camera's own (tags
0x2F-0x32): a GH5 frame shot at 1:1 develops 3888 x 3888, as the camera framed it and as LibRaw
crops it, where it used to develop the whole 5184-wide sensor; the GX9 and TZ200 frames are the
same story at 1:1 and 4:3. And on formats 5 to 7 the black-level tags are used as stored (RawFormat
4 adds 15) and a 14-bit body's white level is no longer held at 4095.

Checked against LibRaw 0.22 (`tools/rw2_libraw_check.py`, rows in
`eval/panasonic-rw2-newer-libraw-2026-11-15.jsonl`) on 12 public CC0 files from raw.pixls.us, one
per body: every one of 331.7 M sensels is equal, and so are the as-shot white balance, the black
level at each CFA position, the CFA pattern and the crop on all twelve. That includes six RawFormat
4 bodies newer than the first set (GH5, G90, G100, GX9, LX100 II, TZ200), which already read
sensel for sensel. The C decoder takes 0.06-0.6 s a file; the Python reference gives the same
sensels on the S1, S5 and GH5S (1-8 s). The white level equals LibRaw's too, but not on the first
try: we first used the hard clip (16368 on the S1), and counting the sensels near the top showed
the S1-family bodies saturate at several levels from 16320 up (144,576 sensels of one S1 frame at
16352-16355), which would have tinted blown highlights. RawFormat 6 and 7 now take LibRaw's 64-level
margin (16319).

Not done: a RawFormat 5-7 row that is not whole 16-byte lines is refused (no file has one).

### Lumix bodies from 2022 on: RawFormat 8 (2026-11-15)

Every Lumix announced since 2022 (GH6, GH7, G9 II, S5 II, S1 II, S9) writes RawFormat 8, and until
today a photographer on one of them had to convert to DNG before the pipeline would develop a
frame. Now `shootflow develop P1000001.RW2 --dcp PROFILE.dcp` and the grade stage read it
(`eval/panasonic-rw2-format8-2026-11-15.md`).

How it is stored: the frame is split into 2 or 3 tiles across, each its own bit stream (bytes read
from their lowest bit). Sensels come in 2x2 blocks, each sensel a Huffman symbol from the file's own
17-entry table (tag 0x40) and that many raw bits, a lossless-JPEG style step from the same sensel
of the block to its left. The decode runs in C through the same optional library (0.5-0.6 s for a
24 MP file, 1.6-1.9 s for the 96-100 MP high-resolution modes), with a pure-Python reference that
gives the same sensels (12-14 s for 24 MP).

Checked against LibRaw 0.22 (`tools/rw2_libraw_check.py`, rows in
`eval/panasonic-rw2-format8-libraw-2026-11-15.jsonl`) on ten public CC0 files from raw.pixls.us,
all six bodies, 12-, 14- and 16-bit, including the GH6's 100 MP and the S1 II's and S9's 96 MP
high-resolution frames: every one of 464.6 M sensels is equal, and so are the as-shot white
balance, the black level at each CFA position, the CFA pattern and the crop on all ten.

White level: 12- and 14-bit files take LibRaw's 16- and 64-level margin under the clip, as
RawFormat 6 and 7 do. Measured before choosing: on the S1 II's 96 MP frame 474,477 blown sensels
sit at 16381-16382, one or two levels under the 16383 clip, and would have developed as not quite
saturated. 16-bit files (GH6, GH7, G9 II) keep 65535, as LibRaw does.

`tests/test_rw2_c8.py` (9 tests since 2026-11-18) writes RawFormat 8 files with an encoder of its own and checks
both decoders sensel for sensel, a hand-worked stream through the per-symbol shift, tile grids,
the levels and the refusals.

Not done: no checked file uses a tone curve (tags 0x39/0x3A), per-symbol shifts or starting
values. A file with a curve is refused with the reason; shifts and starting values are read as
LibRaw reads them, tested on synthetic streams only. Colour needs the camera's `.dcp`, as for every
RW2 here.

### RawFormat 8: S1R II, S5 IIX, S1 II E, and a second row of tiles (2026-11-18)

Three more bodies read sensel for sensel as LibRaw 0.22.2 does: the S1R II (12- and 14-bit,
the 65:24 crop, electronic shutter, multiple exposure), the S5 IIX and the S1 II E, plus the
S5 II's and S9's 96 MP frames. That is nine files and 462.0 M sensels, with white balance, black,
CFA, crop and white level all equal (`eval/panasonic-rw2-format8-grid-2026-11-18.md`).

The S1R II's 177 MP high-resolution mode (16296 x 10856) stores its frame in 4 x 2 tiles, the
only public file with a second row of them. Both this reader and LibRaw 0.22.2 refused it. Tag
0x45 turned out to hold `(top << 16) | left`, not just the left edge. Now it develops (3.05 s
to read), and a tile whose stored top disagrees with the tiles above it is refused. With no
other decoder to compare against, `tools/rw2_grid_check.py` scores the decode: the seams are as
smooth as on files LibRaw confirms (0.98 to 1.07), against 19 to 46 when a block is swapped,
and the C and Python decoders agree.

Later the same day a second decoder confirmed it: LibRaw's git snapshot 202611 (built by hand,
`tools/libraw_dump.cpp`; rawpy still bundles 0.22.2) opens the frame, and every one of its
176,909,376 sensels, the white balance, black, CFA, crop and white level equal ours
(`tools/libraw_dump_check.py`, `eval/panasonic-rw2-177mp-libraw-snapshot-2026-11-18.md`). 0.22.x
refused it because it holds only single-row stripes; the snapshot sums each tile's top from the
heights above it and drops the top that tag 0x45 stores, which this reader cross-checks.

Tone curves: none of the 35 public RawFormat 8 files on raw.pixls.us, from all nine bodies,
carries one, and none has shifts or starting values either
(`eval/panasonic-rw2-format8-curve-survey-2026-11-18.txt`), so the refusal stays.

### Leica RWL, and a card copy that leaves no raw behind (2026-11-16)

Leica's D-LUX, V-LUX and C-LUX are Lumix bodies, and their `.RWL` files are RW2 under another
name. They now develop like any RW2 (`shootflow develop L1000001.RWL --dcp DIR`): on a real
D-LUX (Typ 109) and V-LUX (Typ 114) every one of 32.7 M sensels, the white balance, black
level, CFA, crop and white level equal LibRaw 0.22's.

The card copy used to take only the ten raw formats the developer reads and say nothing about
the rest, so a `.RWL`, `.NRW`, `.CRW` or `.X3F` stayed on the card. It now copies 27 raw
formats, HEIF/HIF stills, MXF and M2TS video and XMP sidecars, skips the hidden `._` files a Mac
writes on a card (which carry the raw's extension and used to be copied as photos), and lists
every other file it leaves behind as `left_on_card` in the preview, the result and
`ingest_manifest.json`. On the 71 camera raw files in the public metadata-extractor-images
corpus the old copy left 6 behind; the new one leaves none. Formats with no reader are culled
from their embedded preview and stop at the grade with the "convert to DNG" message. Details:
`eval/leica-rwl-and-card-formats-2026-11-16.md`; tests: `tests/test_card_formats.py`.

### Canon CRW, the 2000-2004 bodies (2026-11-16)

Canon's CIFF raw files (`.CRW`: the EOS D30, D60, 10D and 300D, the PowerShot G2 to G6, Pro1 and
S30 to S70) now develop directly: `shootflow develop CRW_0001.CRW --dcp DIR`, and the grade stage
takes them like any CR2 (`src/shootflow/crw.py`). It reads the CIFF heap, Canon's 64-sensel block
coder with its three tree pairs, the 12-bit bodies' stored low bits, SensorInfo's picture area and
masked rectangle (black level), the as-shot white balance from whichever of the three colour
records the body writes, and the camera's rotation. On 20 real files from 15 bodies every one of
114.0 M sensels and the CFA equal LibRaw 0.22's, the white balance too wherever the file records
one, black within 2; 2-4 s a file in Python. A PowerShot on Auto white balance keeps no levels for
the shot, so none is applied and the report says so. The four-colour G1, Pro70 and Pro90 IS are
refused. Details: `eval/canon-crw-reader-2026-11-16.md`; check: `tools/crw_libraw_check.py`;
tests: `tests/test_crw.py`.

### Minolta and Konica Minolta MRW (2026-11-18)

Minolta's MRW files (the DiMAGE 7, 7i, 7Hi, A1, A2 and A200, 2001-2005, and the Konica Minolta
Dynax 7D, sold as the Maxxum 7D and Alpha-7 Digital) now develop directly: `shootflow develop
PICT0001.MRW --dcp DIR`, and the grade stage takes them like any other profiled raw
(`src/shootflow/mrw.py`). An MRW is not a TIFF: a `\0MRM` header and a chain of named blocks come
before the sensor. PRD gives the sensor size, the storage (12-bit packed, or the DiMAGE 7 family's
big-endian 16-bit words) and the Bayer pattern (RGGB, or GBRG on the A200); WBG the as-shot gains in
the pattern's own 2x2 order; TTW a whole TIFF with Make, Model, orientation and EXIF. On nine real
files from raw.pixls.us every one of 54.1 M sensels, the CFA, the white balance and the black level
(0 on every body) equal LibRaw 0.22's, 0.02-0.16 s a file. Developed with LibRaw's own colour matrix
as a stand-in profile, the mean colour of each picture is within 0.017 in chromaticity of LibRaw's
render. The DiMAGE Z2's `.MRW` has no MRW header at all and is refused. Details:
`eval/minolta-mrw-reader-2026-11-18.md`; checks: `tools/mrw_libraw_check.py`,
`tools/mrw_develop_check.py`; tests: `tests/test_mrw.py`.

### Kodak DCR (2026-11-18)

Kodak's DCR files from the DCS Pro SLR/n (2004) and its siblings now develop directly: `shootflow
develop M3XV3143.DCR --dcp DIR` (`src/shootflow/kodak.py`). A DCR is a big-endian TIFF whose sensor
sits in a SubIFD with Kodak's own compression, 65000: each row in blocks of up to 256 sensels, a
4-bit bit length per sensel, then the differences read least-significant bit first from pairs of
big-endian 16-bit words, two predictors (one per CFA column) reset every block; a block with a length
over 12 is stored as plain 12-bit values instead. The codes are 10-bit and go through Kodak IFD entry
2317, a 1024-step linearisation table whose last step is the white level (3700). The as-shot white
balance is the 72-byte record in entry 1021 (2048 over each multiplier), or entry 2120 + n when that
record is missing. On the one public DCR (the DCS Pro SLR/n file in metadata-extractor-images) every
one of 13.6 M sensels, the CFA, the white level and the white balance equal LibRaw 0.22's; the C
decoder reads the frame in 0.13 s, the pure-Python reference in 5.1 s, with identical output.
Developed with LibRaw's colour matrix for the body as a stand-in profile, the picture's mean colour is
within 0.0023 in chromaticity of LibRaw's render (compared in linear light). Other Kodak compressions
(the DC-series 262 and 32867 and the KDC formats) are refused with the reason. Details:
`eval/kodak-dcr-reader-2026-11-18.md`; checks: `tools/dcr_libraw_check.py`,
`tools/dcr_develop_check.py`; tests: `tests/test_kodak.py`.

### Phase One IIQ (2026-11-18)

Phase One's IIQ files (the P+ and IQ backs, the H 25, the iXU and iXM aerial cameras, and the `.TIF`
raws of the P25, P30 and P45) now develop directly, and with no `.dcp`: an IIQ carries its own
camera-to-ROMM matrix, which `src/shootflow/iiq.py` turns into a DNG ColorMatrix1 at D50 (the as-shot
neutral maps to D50 white exactly), so `shootflow develop CF000001.IIQ --out masters` works like a DNG
and the grade stage takes them too. The sensor sits in an `IIII` container inside the TIFF; IIQ L
(format 3, and the P+ backs' 8-bit-coded format 5) is decoded row by row, with each row's and column's
black offsets for the split sensor halves added as dcraw does, by an optional C decoder (about 0.8 s for
106 M sensels) or the pure-Python reference. On ten real files from raw.pixls.us (H 25, P25, P20+, P25+,
P30, P45+, P65+, IQ140, IQ150, IQ3 100MP) every one of 342.7 M sensels, the CFA, the white balance and
the orientation equal LibRaw 0.22's; per-channel levels after black are within 0.7% of LibRaw's linear
render on nine (P45+: 2.2%, where LibRaw also applies Phase One's flat-field and defect corrections; applied
here too since 2026-11-19, which brings it to 0.02%). The mean colour of eight of nine developed frames is within 0.02 in chromaticity of
LibRaw's render (P25+ 0.026; the two colour models differ, see the eval). The uncompressed formats and
the 16-bit format 8 (IQ4, Trichromatic) are refused with the reason. Details:
`eval/phaseone-iiq-reader-2026-11-18.md`; checks: `tools/iiq_libraw_check.py`,
`tools/iiq_develop_check.py`; tests: `tests/test_iiq.py`.

**IIQ S (later the same day).** Phase One's smaller compressed setting (format 6), the one the iXU180,
iXM-100 and iXM-RS150F aerial cameras and half the IQ180 files on raw.pixls.us use, now reads too: per
block of eight columns a scale for each colour lane and a shared refinement, then eight samples, written
independently from the layout LibRaw 0.21+ decodes (the module docstring describes it). On six real IIQ S
files from five bodies (IQ180 twice, iXU180, IQ3 100MP, iXM-100, iXM-RS150F) every one of 546.9 M
sensels, the CFA, white balance, crop and orientation equal LibRaw 0.22's, and on three IIQ L files from
two bodies the first check had not read (IQ180, iXM-100) 205.8 M more; a 154 MP frame reads in 1.2 s with
the C decoder. Three of the six files send a refinement above the scale, which in LibRaw's C is a shift by a
negative count; all 880 such samples carry zero bits, so any reading gives LibRaw's values, and non-zero
bits there are refused as corrupt (`tools/iiq_s_shift_check.py`). Levels after black are within
0.6% of LibRaw's render on five of six; the iXU180, with offset tables down to -336, is 5.2% apart on
blue, where Phase One's flat-field corrections (applied since 2026-11-19, see below) matter most. Details:
`eval/phaseone-iiq-s-reader-2026-11-18.md`.

**16-bit IIQ L: the IQ4 150MP and the Trichromatic (that evening).** Format 8, the last coded IIQ format
still refused, is the IIQ L code with 16-bit values stored as they are rather than times four; the IQ4
150MP writes it for its "IIQ L 16-bit" and "IIQ L 16 Extended" settings, and the IQ3 100MP and its
Trichromatic for their 16-bit IIQ L. On all four public files (raw.pixls.us: two IQ4 150MP, an IQ3 100MP,
the Trichromatic) every one of 519.9 M sensels, the CFA, white balance, crop and orientation equal LibRaw
0.22's, and so do the IQ4's 14-bit IIQ L (154.0 M, a body new to the check) and eleven files from ten
bodies already read (no regression). A 154 MP 16-bit frame reads in 1.1-1.4 s with the C decoder. The two
extra bits are used (each of the four low-bit values in 25.0% of sensels), but the IQ4's masked-area
noise is 6.0-6.8 of the 16-bit steps, so 14-bit rounding would add 1.4-1.8% to it. The IQ4's own
matrix and LibRaw's disagree: on the IQ4's blue-sky frames the mean colour is 0.09 apart, and the 24
ColorChecker patches through the two matrices differ by a mean delta E of 16 (cyan 58); the file's matrix
gives a cyan-blue sky and LibRaw's a lavender one, and with no photographed target neither can be called
right, so the file's own matrix stays the default (`--dcp` overrides it). Details:
`eval/phaseone-iiq-16bit-2026-11-18.md`; check: `tools/iiq_matrix_check.py`.

**Phase One's sensor calibration (2026-11-19).** Every Phase One back writes a factory calibration into
each raw, in the block at sensor tag `0x110`: defect maps, flat fields per tile and colour, a polynomial
for the right readout half shifted by the sensor temperature, and per-quadrant gains and linearisation
splines. Capture One and LibRaw apply it, and ShootFlow now does too, by default
(`src/shootflow/iiq_calibration.py`; `iiq.parse_iiq(..., calibrate=False)` leaves it off). It matters:
LibRaw's calibration moves the P45+ by 0.94-1.06 across the frame and the IQ180's four tiles by up to
11%. On ten backs (H 25, P20+, P25, P25+, P30, P45+, P65+, IQ140, IQ150, IQ180; 387 M sensels) the
calibrated sensels were compared with LibRaw 0.22's calibrated render. Leaving out the columns a file
marks dead, five backs are equal on every sensel and the other five are within 3 codes, with none off
by more than 1%. Before calibration, 1.7-96% of sensels were within 1%. The dead columns are filled
with fixed weights, where LibRaw picks a direction for each sensel; on 300 good columns a frame,
blanked and refilled on four backs, the two kinds of fill were equally good. The P45+'s channel levels
moved from 2.2% off LibRaw's render to 0.02%. Calibration costs 0.15-0.8 s a frame with the C helper.
Details: `eval/phaseone-iiq-calibration-2026-11-19.md`; check: `tools/iiq_calibration_check.py`;
tests: `tests/test_iiq_calibration.py`.

**The calibration on IIQ S, 16-bit and aerial backs, and the iXU180's gap (2026-11-19).** The same check
was run on the 13 remaining public Phase One files (iXU180, IQ180 IIQ S and L, IQ3 100MP in S, L and 16-bit,
IQ3 100MP Trichromatic, IQ4 150MP three ways, iXM-100 twice, iXM-RS150F; 1.42 billion sensels). Nine equal
LibRaw on every sensel, the IQ180s are within 3 codes, and the iXU180 is within 2 outside its four dead
columns. The iXU180's 5.2% blue gap turned out not to be the calibration. It comes from the file's black
offset tables. ShootFlow applies them, as LibRaw does for IIQ L, but LibRaw's IIQ S loader never reads
them. On the iXU180 the row table is a smooth ramp from about -30 codes at the top and bottom edges to
-333 at the middle row. With the tables zeroed, ShootFlow's levels equal LibRaw's to four decimals. Which
reader is right needs a dark frame or a Capture One export of an iXU180, and none is public. ShootFlow keeps
the tables. Details: `eval/phaseone-iiq-calibration-newer-backs-2026-11-19.md`; check:
`tools/iiq_offsets_check.py`.

### Hasselblad 3FR (2026-11-18)

Hasselblad's 3FR files (H3D, H4D-60, X1D, X1D II, X2D, the CFV II 50C and CFV 100C backs, and the
older CFV, CFV-50c and Ixpress CF132) now develop directly: `shootflow develop B0000079.3FR --out DIR`,
with no `.dcp`, because a 3FR carries its own ColorMatrix1 and AsShotNeutral in IFD0; the grade stage
takes them like a DNG (`src/shootflow/hasselblad.py`). The X-series and new backs store plain 16-bit
words; the H-series and older backs use Hasselblad's own lossless JPEG (pairs of size codes, read from
little-endian 32-bit words), decoded in C with a pure-Python reference. On ten real files from
raw.pixls.us every one of 561.5 M sensels, the CFA and the white balance equal LibRaw 0.22's, 0.1-1.4 s
a file. The H4D-60's data is black-subtracted and its noise wraps to the top of the 16-bit range (0.5% of
the frame would develop as white specks); the reader finds that from the gap it leaves in the histogram
and reads the frame with a 256 offset, as LibRaw does by model. The mean colour of each developed frame
equals LibRaw's to four places with `--colour dcraw` on eight of ten bodies (the 100 MP two carry
Hasselblad's own matrix). Writing the colour check found the MRW check's flaw: it undid LibRaw's BT.709
output with the sRGB curve. Multi-shot frames are not read. Details:
`eval/hasselblad-3fr-reader-2026-11-18.md`; checks: `tools/hasselblad_libraw_check.py`,
`tools/hasselblad_develop_check.py`; tests: `tests/test_hasselblad.py`.

### Hasselblad Phocus .fff (2026-11-18)

Phocus's `.fff` files (what Hasselblad's tethering and export software writes) now develop like 3FRs:
`shootflow develop Job_0079.fff --out DIR`, and the grade stage takes them. The sensor data is the 3FR
layout written big-endian; on eleven real files from nine bodies on raw.pixls.us (713.7 M sensels; CFV-50, CFV-50c,
H4D-40, H4D-50, H5D-40, H5D-50c, H6D-100c, X1D II 50C, X2D 100C) every sensel, the CFA and the stored
white balance equal LibRaw 0.22's. Three things differ from a 3FR, and each is now read:

- **Newer Phocus exports scale red and blue by AnalogBalance and keep the old neutral.** Two frames on
  raw.pixls.us exist as both 3FR and `.fff` (an X2D 100C and a CFV-50c). Green sensels are identical; red
  and blue are multiplied by the file's AnalogBalance (1.028 and 1.014 on the X2D) while AsShotNeutral is
  copied unchanged. Read as the DNG specification reads it, that leaves a cast (chromaticity 0.008-0.017
  off the 3FR's own develop; LibRaw has the same cast). A digital gain leaves its mark in the data: a gain
  of g empties 1 - 1/g of the codes. On six of the eleven files (CFV-50c, X1D II, H6D-100c, X2D) every
  channel's empty share equals its AnalogBalance's to 0.001, and there the reader scales the neutral by the
  same gains; each paired `.fff` then develops to its 3FR's colour within 0.0001. The other five (CFV-50,
  H4D-40, H4D-50, H5D-40, H5D-50c, older exports) carry the tag without that gain, and their neutral is
  used as written.
- **The colour matrix is ColorMatrix2, or missing.** Six files carry it as ColorMatrix2 with no
  illuminant, used alone; five carry none. For the CFV-50c and X2D 100C the body's own matrix is taken
  from its 3FR (`hasselblad.OWN_MATRICES`); the H4D-40 and H6D-100c have no public 3FR to read it from,
  so those need a `.dcp` (the develop says so).
- **UniqueCameraModel names only the series** ("Hasselblad H4D" on H4D-40 and H4D-50 files, whose
  matrices differ), so the camera name for the profile chooser now comes from the Model tag when it
  extends it ("Hasselblad H4D-40", "Hasselblad CFV-50c").

Details: `eval/hasselblad-fff-reader-2026-11-18.md`; checks: `tools/hasselblad_fff_pair_check.py`
(3FR against its `.fff`), `tools/hasselblad_libraw_check.py`, `tools/hasselblad_develop_check.py`;
tests: `PhocusFffTests` in `tests/test_hasselblad.py`.

## Olympus ORF (2026-11-14)

Olympus and OM System raw files no longer need Adobe's DNG Converter. `shootflow develop
P1010001.ORF --dcp PROFILE.dcp` (or `--dcp FOLDER`, chosen per camera as for CR2, ARW and NEF)
reads the ORF itself, and the pipeline's grade stage develops ORF stills with the workspace's
`color/camera-profiles/` (`src/shootflow/orf.py`).

What it reads: Olympus's compressed ORF, which every E-system, PEN, OM-D, OM System and Tough body
in the test set writes (the E-30 of 2008 to the OM-1 and TG-7). It is one bit stream per frame with
an adaptive bit width per column parity, a unary escape, and an edge or median-style prediction from
left, up and up-left. It also reads the older compacts' 12-bit packed, interlaced ORF (even rows,
then odd rows from the next 2048-byte boundary). Black level, as-shot balance and the camera's crop
come from the maker note's ImageProcessing IFD; the older compacts' balance comes from the main
note, and the CFA from EXIF. The crop becomes the DNG DefaultCrop, which leaves out the masked or
dim columns several bodies store at the right edge. The decode runs in C through the same optional
ctypes library as the NEF and lossless-JPEG readers (0.2-0.5 s per file), with a pure-Python
reference that gives the same sensels (9-19 s).

Like a CR2, ARW or NEF, an ORF carries no colour matrix the DNG colour model can use, so it needs the
camera's `.dcp` (e.g. `Olympus E-M10 Adobe Standard.dcp` from Adobe's free DNG Converter).

How it was checked (`tools/orf_libraw_check.py`, `eval/olympus-orf-reader-2026-11-14.md`): 18 real
ORFs from 18 bodies, from the public metadata-extractor-images collection (14 compressed, 4 packed
and interlaced). Against LibRaw 0.22 through rawpy, every one of 219.6 M sensels is equal on both
decoders, and so are the as-shot white balance, the black level at each CFA position and the CFA
pattern on all 18. `tests/test_orf.py` (9 tests) writes ORFs with an encoder of its own, including
the escape field, the run counter and an interlaced compact with its extra row, and runs both
decoders, the profile chooser, the crop and the CLI.

Not done: colour is only as good as the profile you supply. The white level is 4095, where LibRaw
lowers it on four of the 18 bodies from a per-model table (E-30: 4028). The E-1/E-300-era layouts
(12-bit packed without interlace, 16-bit unpacked) and high-res composites are refused for want of
a test file.

## Nikon NEF (2026-11-14)

Nikon's raw files no longer need Adobe's DNG Converter either. `shootflow develop DSC_0001.NEF
--dcp PROFILE.dcp` (or `--dcp FOLDER`, chosen per camera as for CR2 and ARW) reads the NEF itself,
and the pipeline's grade stage develops NEF stills with the workspace's `color/camera-profiles/`
(`src/shootflow/nef.py`).

What it reads: Nikon's compressed NEF (compression 34713, every body from the D1X/D100 on), lossy
or lossless, 12- or 14-bit: a Huffman-coded difference per sensel from one of six fixed code
tables, predicted from two columns left (or two rows up at the start of a row) and mapped through
the linearisation curve the maker note's tag 0x0096 stores (in full, or as points interpolated
linearly, with the "split row" after which a second, scaling code table takes over). And
uncompressed NEFs, packed 12/14-bit or 16-bit. As-shot white balance comes from the maker note's
WB_RBLevels (0x000C), black level from its BlackLevel (0x003D) on bodies that write one (D810:
600; older bodies store black-subtracted data), white level from the top of the stored curve. The
decode runs in C through the same optional ctypes library as the lossless-JPEG reader (0.1-0.6 s
per file), with a pure-Python reference that gives the same sensels (4-29 s).

Like a CR2 or an ARW, a NEF carries no colour matrix the DNG colour model can use, so it needs the
camera's `.dcp` (Adobe's free DNG Converter installs one per body, e.g. `Nikon D810 Adobe
Standard.dcp`).

How it was checked (`tools/nef_libraw_check.py`, `eval/nikon-nef-reader-2026-11-14.md`): seven real
NEFs from seven bodies (D70 lossy with a full curve; D90 and D5100 lossy with a stepped curve; D300,
D800E and D810 lossless; D200 uncompressed), from the public metadata-extractor-images collection.
Against LibRaw 0.22 through rawpy: every one of 130.6 M sensels equal on both decoders, and the
as-shot white balance, black level and CFA pattern equal on all seven. The one difference is the
D5100's white level: LibRaw takes 15,846 from a per-model table, but its own sensor data for that
frame reaches 16,383, the top of the file's curve, which is the value used here (no clipping of
values the camera stored). `tests/test_nef.py` (11 tests) writes NEFs with an encoder of its own in
every storage, including a split row coded with the scaling table, and runs the profile chooser,
the CLI and both decoders.

Not done: colour is only as good as the profile you supply (no profile ships here); Nikon's
high-efficiency NEF (Z bodies) is refused with a message to convert to DNG. (This line used to say
Coolpix NEFs were refused too; they were not, they were misread: see "Coolpix NRW" below.)

### Real split rows, the Z 6II's lossy curve and 12-bit black levels (2026-11-15)

Eleven more NEFs from raw.pixls.us (CC0), found by probing all 235 for a non-zero split row in the
maker note: 1 J5, D3400, D5000, D5200, D5500, D5600 x2, D5, D7000 and two Z 6II frames. The split
rows were already right (every sensel equal to LibRaw's on all nine 0x44 0x20 files). Three other
faults were not: the Z 6II's lossy form (0x44 0x40, a curve with its step and range quartered) fell
to the full-curve branch and got 99.3% of sensels wrong; a 12-bit file's black level was read 4x too
high (tag 0x003D is on a 14-bit scale), which put 82-95% of a frame's sensels at or under black, so
every 12-bit NEF from a 2014-on body developed nearly black; and the edge-column rule cut two picture
columns from busy D3400 and D5600 frames (its correlation bar is now 0.5, not 0.8, after measuring
every masked column on 18 bodies). All three fixed: 18 of 18 real NEFs now equal LibRaw in every
decoded sensel, black level, balance, CFA and visible area (the J5 keeps 2 picture rows LibRaw does
not decode). `eval/nikon-nef-split-row-2026-11-15.md`, `tests/test_nef.py` (21 tests).

### The edge columns that hold no picture (2026-11-15)

Five of the seven bodies store columns at the right edge that are not picture: optically masked
sensels, then padding of one value (D800E: 46 of 7,424, ending in a column of 16,382 and thirty of
1). Developed whole, a D800E came out with a grey band, a white line and fifteen black columns down
its right side. Nothing in a NEF marks the edge, and dcraw and LibRaw trim by a per-model table, so
`nef.masked_margins` reads it from the sensels: a picture column varies as much as a tenth of the
middle of the frame and moves with its same-colour neighbour two columns in (correlation 0.5 or
more since 2026-11-15; it was 0.8, which cut two picture columns of busy lossy frames); a masked or padding column does neither. The result becomes the ActiveArea, and the report's
notes say how many columns were left out. Against LibRaw's table: seven of seven bodies equal
(D800E 46, D300 32, D5100 44, D90 42, D70 1, D200 2 left and 3 right, D810 none). Run on the picture
alone at 0, 3 and 6 stops under, it cut nothing in 21 of 21 cases; on a very dark frame it keeps a
margin rather than guess. `eval/nikon-nef-visible-area-2026-11-15.md`, `tools/nef_libraw_check.py`
(now gates on the visible area too), `tests/test_nef.py` `VisibleAreaTests`.

### Coolpix NRW and the E-series NEFs (2026-11-18)

Nikon's compacts write raws too: `.NRW` from the P6000 (2008) on, `.NEF` before that (E5400 to
E8800). They are TIFFs laid out like a NEF, so the reader took them, but not one of twelve real
files read right: their sensors are stored in layouts no D-series body uses, and the reader
decoded them as if they were D-series data. 8.0 to 20.1 M sensels wrong per frame (a picture of
noise), no white balance on four bodies, black 0 on seven, and the P6000's CFA tag puts
green on the wrong diagonal. Nothing errored, and the card copy keeps `.NRW` files (2026-11-16),
so a Coolpix shooter got a confident, wrong develop.

What is read now (`src/shootflow/nef.py`, "Coolpix NRW"): 12-bit samples packed MSB first (P330
and P340, though their raw IFD says Nikon-compressed; E8800, its even rows stored before its odd
ones); the same packing inside little-endian 32-bit words (P6000, P7000, P7100, P950, P1000, B700);
one 16-bit word per sensel, little-endian (A1000) or big-endian with the value in the top 12 bits
(P330, P7700, P7800). The byte count tells packed from 16-bit, and the byte order is chosen from
the sensels: decoded each way, a band of rows from the middle of the frame is a picture in one
and noise in the other. The black level and the as-shot balance come from the maker note's NRW
colour block (tag 0x0014) when tag 0x000C is missing; the 4032-wide bodies carry no level and take
200 (on the 12-bit scale). When the CFA tag's green diagonal disagrees with the sensels' (the
P6000), the sensels win. `.nrw` is now a developable path for `shootflow develop` and the
pipeline's grade stage (with the camera's `.dcp`, as for every NEF).

How it was checked (`eval/nikon-nrw-reader-2026-11-18.md`, `tools/nef_libraw_check.py`): thirteen
Coolpix files from raw.pixls.us (CC0), twelve bodies plus the Coolpix A (a DX NEF the reader
already got right), against LibRaw 0.22. Before: 12 of 13 wrong. After: 13 of 13 equal in every
sensel on both decoders, and in black level, white balance, CFA pattern and visible area (the
P330 at LibRaw's scale: LibRaw drops the low 4 bits of its words and keeps the P7700's and
P7800's; here all three keep them). The seven D-series NEFs of 2026-11-14 still read equal.
`tests/test_nef.py` `CoolpixTests` (8 tests) writes each layout.

Not done: no Coolpix colour profile ships (Adobe's DNG Converter installs them). One file per
body was checked; P7000 and P7100 frames at ISO 400 and over (where dcraw assumed a black of 255,
which LibRaw now calls "probably obsolete") and bodies with no public sample are unchecked.

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

## Value tables and row and column gains on the stored raw values: OpcodeList1 (2026-11-13)

`MapTable`, `ScalePerRow` and `ScalePerColumn` now run in `OpcodeList1` too, on the stored CFA
values before black subtraction or anything else reads them. Until now they ran only in
`OpcodeList2` and `OpcodeList3`. In the first list they were named and left undone, because no
file had shown what unit a stored raw value is in. The DNG 1.7.1.0 text settles it for these
three (chapter 6, p. 105): after each opcode "image values are clipped ... to the logical range
of the image being modified. For OpcodeList1, this range is 0 to 2^32-1 for images with a bit
depth greater than 16, otherwise 0 to 2^16-1." So the first list works on integers:

- `MapTable`: the stored value is the table index. Value `v` becomes `table[min(v, size - 1)]`.
  That picks the same entry the SDK's float view (`v / 65535`, indexed at `floor(x * 65535 + 0.5)`)
  picks, so one rule holds in all three lists. A sensor that stores companded values (a square
  root or log curve, to fit a wide range into fewer bits) writes the expansion table here.
- `ScalePerRow` / `ScalePerColumn`: a gain has no unit. `v * scale` is rounded half up and clipped
  to `0..65535` (`0..2^32-1` above 16 bits). This is the fix for row or column readout gain
  mismatch, applied where the mismatch happens: on the raw values, black level included.

The other three still wait. `DeltaPerRow`, `DeltaPerColumn` and `MapPolynomial` need a unit. An
offset of 0.01 is 0.01 of what? The text doesn't say for stored values, so in `OpcodeList1` they
stay named and undone. Also named and skipped: a `MapTable` on 32-bit stored data (a 16-bit table
gives no index there), and a plane range that leaves out plane 0 (a CFA image has one plane).
Areas count from the stored frame's top-left, as the bad-pixel fixes do. One choice to check
against Adobe's output when a file turns up: the SDK multiplies in float32, so where a product
lands within float32 rounding of a half step, its result may differ from this float64 one by one
count.

Speed on a 12.2 MP stored frame (4032 x 3024): `MapTable` 0.07 s, a row or column scale
0.15-0.16 s with numpy; pure Python 1.4 s and 2.6-2.9 s. Both give the same values.

What is checked: 12 tests (`tests/test_dng_list1_table_scale.py`), each on both engines. Every
answer is checked against the closed form written out in the test:

- tables of 1, 2, 300, 4,096 and 65,536 entries, over the whole frame and over an area with row
  and column pitches; the input is left untouched;
- row and column scales, including gains of 0 and 3 (clipped), with an exact half rounding up;
- a table and a scale composing in list order, and 32-bit stored data;
- on a whole develop, a sensor that stored square-root-companded 16-bit values develops
  byte-identical to the clean sensor with the expansion table in `OpcodeList1` (more than 100
  8-bit steps off without it);
- rows and columns darkened by known readout gains come back within 3 16-bit steps of 257
  (more than 20 without);
- numpy and pure Python give the same bytes at full and half size.

Four seeded faults each fail 5 to 14 of the tests: rounding down instead of half up, a table
index off by one, wrapping instead of clipping at the top, and the column pitch ignored. What is
not checked: no camera- or converter-written file carrying any of the three in `OpcodeList1`.
Details: `eval/list1-table-scale-2026-11-13.md`.

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
engine, so bilinear stayed the default until a faster cubic landed. Not checked: the kernel Adobe's
DNG SDK uses.

Later the same day the faster cubic landed and **cubic became the default**
(`eval/warp-kernel-fast-cubic-2026-11-13.md`). Each plane is edge-padded once, so the 16 taps are
fixed offsets read with one `take` each, and the warp's bands run on a thread pool
(`SHOOTFLOW_THREADS`, default every CPU). The output is byte-for-byte what it was, at any thread
count. On the Leica T frame the cubic warp now costs 8.4 s on one thread (was 15.7 s), 5.5 s on two
(what bilinear cost before) and 3.0 s on four, where the whole develop (5.2 s) beats the old bilinear
develop (7.3 s). `--warp-kernel bilinear` keeps the softer, slightly faster sampling.

## The whole develop on every core, and a 17x faster file read (2026-11-13)

The numpy engine's demosaic, colour and encode now run in 256-row bands on a thread pool, as the
warp already did (`SHOOTFLOW_THREADS`, default every CPU), and uncompressed DNGs packed 9 to 15
bits per sample (the Leica T writes 12-bit) unpack in numpy instead of a per-sample Python loop
(`eval/threaded-develop-2026-11-13.md`). Output is byte-for-byte what it was at every thread count
and band height; the tests compare it with the pure-Python engine at five band heights and three
thread counts. On the Leica T frame and four CPUs, reading the file takes 0.23 s (was 3.97 s) and
read plus full default develop takes 3.7 s (was 8.8 s); an unwarped develop takes 1.1 s (was 2.2 s).
Not yet threaded: the lossless-JPEG decode of compressed DNGs and CR2s.

Since 2026-11-14 the last serial stage, sensor normalisation (`_normalised_plane`: linearise, black,
scale, clamp, clip count), runs in the same bands too (`eval/normalised-plane-bands-2026-11-14.md`):
0.24 s to 0.05 s on four CPUs on the Leica T frame, same bytes, so an unwarped develop takes 0.70 s
(was 0.93 s) and the half-size review still 0.74 s (was 1.14 s). GainMap opcodes still run once on the
whole plane between two banded passes.

## A phone's lossless-JPEG DNG, sensel for sensel, and its tiles on every CPU (2026-11-13)

The first camera-written lossless-JPEG DNG ShootFlow has read: a Google Pixel 3 XL raw (4032 x
3024, 192 lossless-JPEG tiles, four GainMaps, a WarpRectilinear; MIT-licensed, from the tinydng
repository, downloaded at check time). All 12,192,768 sensels equal LibRaw's `raw_image`, and the
half-size render matches LibRaw's to a median 0.054 of an 8-bit step with opcodes off. With the
phone's lens shading map on, the two lit corners come to 110% and 85% of the phone's own preview
(41% and 33% without it). `tools/dng_camera_check.py --preview` now turns the embedded preview by
the file's Orientation before comparing corners; on this file it had been comparing the wrong ones.
Lossless-JPEG tiles and strips now decode on a thread pool (`SHOOTFLOW_THREADS`, default every
CPU), same samples at every thread count: the Pixel's read takes 0.21 s on four CPUs against
0.33 s on one, and read plus full develop 3.1 s against 6.5 s
(`eval/pixel3-lossless-tiles-2026-11-13.md`).
Later the same day the whole tile decode moved into the optional C reader: it reads the scan's
bytes directly (de-stuffing and restart intervals included), decodes through a 12-bit first table,
and runs the predictor in C, so a tile holds the GIL only to set up the call. Same sensels as
LibRaw; the Pixel read drops from 0.21 s to 0.10 s on four CPUs and from 0.33 s to 0.22 s on one.
Measuring first showed the Python de-stuffing was about 8% of a tile, not half, and that the
Pixel writes new Huffman tables for every tile (`eval/native-destuff-2026-11-13.md`).
Then tile placing moved onto the decode threads too: a tile the C reader returns is copied into
the sensor plane as one numpy assignment on the thread that decoded it, instead of 256 row copies on
the calling thread after the pool. Same sensels; the Pixel's four-thread read drops from a median
0.12-0.17 s to 0.09-0.14 s on a noisy shared host (paired runs 1.3-1.4 times faster); one thread and
installs without numpy are unchanged (`eval/parallel-tile-placing-2026-11-13.md`).

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
`--no-opcodes` turns them off. In `OpcodeList1` they stayed named, since no file had shown which
unit a stored raw value is in. Since 2026-11-13, `MapTable` and the two scales run there too. The
specification's integer range for that list settles them; the deltas still wait (see
"Value tables and row and column gains on the stored raw values" above).

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

### Which lensfun? Its SSE, 16-bit and SSE2 paths (2026-11-14)

The check above reached only lensfun's plain float32 loop, because lensfunpy takes 3-channel images.
Lensfun 0.3.4 picks its devignetting routine (plain, SSE or SSE2) from the pixel format, the component count and the
buffer's alignment. `tools/lensfun_vignetting_paths_check.py` drives the bundled liblensfun through
`ctypes` with RGBA rows, aligned and not, on 40,730 cases (474 lenses, 1,202 and 6,002 px wide):

- **float SSE** (what four-component float callers get) matches the plain loop to float rounding, but it
  also multiplies the alpha (`UNKNOWN`) channel, by up to 6.9x, which the plain loop leaves alone;
- **16-bit plain** truncates the gain to 1/1024: up to 8 steps low at 8,192, 4 on average (0.05% darker),
  matched by our model to the step;
- **16-bit SSE2** has two faults, still in lensfun's master branch. The four lanes' radii drift apart along
  the row, giving 4-pixel stripes: p99 4.2% at 1,202 px and 0.9% at 6,002 px, up to 25% on a 7.9x corner.
  And the last `w % 4` pixels of every row are computed as if far outside the frame. A numpy model of the
  loop with both faults matches the library on every sampled case; with them fixed it is within 0.12%.

ShootFlow corrects in float64 and rounds once when it writes the 16-bit master, so it matches lensfun's
float routines. Against lensfun's 16-bit ones the differences above are lensfun's. 8 tests
(`tests/test_lensfun_vignetting_paths.py`); five of six seeded faults caught. Details:
`eval/lensfun-vignetting-paths-2026-11-14.md`.

### Lens correction in the overnight pipeline (2026-11-13, latest)

Until now only `shootflow develop --lens-db` corrected lenses; the overnight pipeline's grade stage
did not, so a shoot's masters came out with the barrel, fringes and dark corners left in. Copy
lensfun's `data/db/*.xml` into the shoot workspace's `color/lens-profiles/` (beside
`color/camera-profiles/`) and the grade stage now corrects every DNG and CR2 it develops exactly as
`--lens-db` does: distortion, lateral colour and vignetting, lens and focal length from each file's
EXIF (or a Canon maker note), a file's own lens warp first. Beside each such master it writes
`<master>.lens.json`:

```json
{"kind": "lens_correction", "corrected": true, "lens": "Canon EF 50mm f/1.2L USM",
 "lens_database": "color/lens-profiles/ (56 XML files)",
 "notes": ["no vignetting correction: ... has no vignetting calibration near 50 mm f/1.2 ...",
           "lens correction from lensfun: Canon EF 50mm f/1.2L USM [slr-canon.xml], ptlens, ..."]}
```

A lens the database lacks still gets its master, uncorrected, with `"corrected": false` and the reason
in `notes`, so one unknown lens never holds up a shoot. An unreadable XML file stops the grade for
review naming the file. A symlinked folder is refused and symlinked files are skipped, as for
camera profiles. With no folder, or no XML in it, nothing changes. The database is parsed once per
process (0.27 s for lensfun's 56 files, 1,580 lenses) and read again only when a file's size or time
changes.

Checked on a real Canon 5D Mark II CR2 with lensfun's whole database (`tools/real_cr2_pipeline.py
FILE.CR2 WORKDIR --lens-db lensfun/data/db`, `eval/lens-pipeline-grade-2026-11-13.md`): the pipeline
master is bit-identical to `shootflow develop --dcp --lens-db` on the same file, and 92% of its
samples differ from the uncorrected master. The run took 14.1 s against 10.9 s without the
database. `tests/test_lens_pipeline.py` (8 tests): a synthetic CR2 with lens, focal length and
f-number tags through the whole pipeline (master equal to `develop --lens-db` and unequal to the
uncorrected develop, the note, notes beside raws only), an unknown lens, no folder, a broken XML, the
cache and the symlink rules. `shootflow develop`'s JSON now carries `lens` and `lens_notes` too.

### Canon lenses with no name: found from the maker note's focal range (2026-11-14)

A Canon 350D writes no lens name at all, and bodies write a third-party lens as "105mm" or
"10-17mm", so `--lens-db` refused those files. Their maker note still says the lens's focal range
and its widest f-number at the focal length shot (CameraSettings, read on five real bodies). When
the file names no lens, ShootFlow now looks for the lenses in lensfun whose names state that exact
range and an f-number range holding that aperture, on the body's mount or an adapted mount of the
same maker. If exactly one fits, it corrects with it and says so in the report ("pass --lens if it
is not"). If several fit, it refuses and lists them. A real name in the file, or `--lens`, wins.

On a real 70D frame named only "105mm" it now finds the Sigma 105mm f/2.8 EX DG OS HSM Macro and
corrects distortion, lateral colour and vignetting. The 350D's 28-200 mm and the 7D's 10-17 mm stay
refused, because lensfun has no Canon-mount lens with either range, and the note now says that.
Across lensfun's 366 Canon-mount lenses, the range alone picks one lens in 38% of cases. The rest
are ties, mostly versions of one lens (IS, IS II). The true lens is never dropped. "Alone" means
alone in lensfun, so a lens lensfun lacks can be taken for one it has with the same range; the note
names the lens it used. Details: `eval/canon-lens-from-range-2026-11-14.md`.

### Any maker: lenses found from LensSpecification, DNG LensInfo or Nikon's maker note (2026-11-14)

The same idea now works beyond Canon. Most bodies since EXIF 2.3 write the lens's focal range and its
widest f-number at each end in one standard tag, LensSpecification; DNG files carry the same four values as
LensInfo, and older Nikon bodies keep them in their maker note (tag 0x0084, read on seven real NEFs, D70 to
D810). When a file names no lens, ShootFlow matches those values against lensfun's names on the body's
mount, both f-numbers this time, so an f/4 zoom is no longer confused with an f/3.5-5.6 one of the same
range. One fit: corrected, with a note naming the tag. Several: refused, the candidates listed. The tag is
not used for a camera lensfun does not know (no mount to narrow the search) or for a fixed-lens camera
(its own entry wins).

On real Sony and Samsung files that also name their lens, the tag alone picked the same lens 3 times out
of 6 and refused the other 3; it never picked a different one. Across lensfun's 1,119 lenses whose names
state a range, the four values pick one lens in 50.0% of cases (one f-number, as Canon gives: 46.6%).
Details: `eval/lens-specification-2026-11-14.md`.

### Olympus: lenses found from the maker note's Equipment IFD (2026-11-14)

Olympus bodies of the Four Thirds and early Micro Four Thirds years (E-1 to E-600, the first PENs) write no
EXIF lens name or LensSpecification, so their files gave nothing to match. Their maker note has an Equipment
block with the lens's focal range, its widest f-number at each end and usually a name. ShootFlow now reads it
in all three layouts Olympus has used (the E-1's, the E-3-to-OM-D one and OM System's), and ORF files are
read for these facts (their header magic was refused before). The range picks a lens when one lensfun lens
fits; when several do, the maker note's own name ("OLYMPUS M.14-42mm F3.5-5.6 II R") breaks the tie among
them, and a generic one ("OLYMPUS 14-54mm Lens") leaves it refused with the list.

On 18 real ORFs and four Olympus JPEGs, eight frames from seven bodies that gave no lens before are now
identified, and every pick is the lens metadata-extractor's independent decoder names for the same file.
Develop still takes DNG or CR2, so this reaches ORF and JPEG shot facts and a future ORF developer.
Details: `eval/olympus-equipment-2026-11-14.md`.

### Sony and Samsung: lenses named from the maker note (2026-11-14)

The Sony DSLR-A500 and Samsung's Galaxy NX and NX20 write no EXIF lens name or LensSpecification, and E-mount
bodies that do write LensSpecification often fit several lensfun lenses with it (three 24 mm f/1.8 lenses,
four 24-70 mm f/2.8). Sony's maker note keeps LensSpec (tag 0xB02A): the range, the f-numbers and the
feature letters of Sony's lens names (DT, FE, E, PZ, ZA, G, SAM, SSM, OSS, II ...), so ShootFlow rebuilds
"DT 18-55mm F3.5-5.6 SAM" from it. Samsung's keeps the lens's number in its NX list (tag 0xA003), named from
metadata-extractor's Apache-licensed list. The range picks the lens when one fits, and the name breaks the
tie when several do, also beside a file's own LensSpecification.

On the ten real ARW and SRW files at hand, every frame now picks the lens its own EXIF name (or, for the
A500, ExifTool's reading of its lens number) gives, from maker-note and tag data alone; before, three gave
no hint and three were refused as ties. Details: `eval/sony-samsung-lens-2026-11-14.md`.

### Sony ARW: the lens's own correction tables (2026-11-15)

Sony E-mount bodies write the lens's distortion, lateral-colour and vignetting curves into every ARW (tags
0x7037, 0x7035, 0x7032 of the raw IFD), the curves the camera uses for its JPEGs. `shootflow develop` and the
grade stage now apply the distortion and lateral colour from them when no lensfun correction runs, so an A7
frame is corrected with no lens database at all (`--no-in-file-lens` to skip; a `--lens-db` match still wins).

Checked against lensfun's own calibration of the same lens at the same focal length on three real frames
(A5000 16 mm, A7 III 24 mm, A7 IV 42 mm): the distortion curves agree within 9 px on corrections of 84-411 px
at 6000 px wide; reading the knots on the raw radius instead fits worse on all three. Lateral colour agrees on
two of three. The vignetting table lifts the corners by 0.6-1.0 stops where lensfun lifts 2.6, so it is read
but not applied. Details: `eval/sony-in-file-corrections-2026-11-15.md`.

### Sony's vignetting table against the camera's own JPEG (2026-11-23)

The ARWs say the camera's vignetting correction was on ("Auto", maker note 0x2011), and each embeds a JPEG the
camera rendered, so comparing that JPEG with the raw pixel by pixel should show the gain the camera applied
without an evenly lit frame. `tools/sony_vignetting_preview_check.py` does that (tone curve fitted in the
centre, gain per radius band) and scores four readings of the table: ShootFlow's, squared (darktable's first
version), and both with darktable's knot positions. The JPEG is the camera's processed render: on the A7 III it
lines up with the raw through ShootFlow's reading of the distortion table to 0.41 preview pixels (3.06 without
it), and on the A7 IV, whose distortion correction was off, to 0.14 without the table (3.97 with it). But its
luminance shows no lift from the vignetting table: +0.02 stops at 0.9 of the corner distance on the A7 III and
+0.04 at 0.82 on the A7 IV, where the gentlest reading predicts +0.54 and +0.31. So the camera's own render
cannot judge the formula, and it gives no reason to apply the table by default; the open question still needs an
evenly lit frame. 6 tests (`tests/test_sony_vignetting_preview.py`, a planted gain recovered within 0.04
stops); three seeded faults caught. Details: `eval/sony-vignetting-preview-2026-11-23.md`.

### Converted DNGs: the camera's maker note from DNGPrivateData (2026-11-14)

Adobe DNG Converter drops the camera's EXIF maker note and keeps it in the DNG's private data instead, so the
Canon, Nikon and Olympus lens readers above reached the camera's own raw files but not the DNGs ShootFlow
develops. ShootFlow now reads Adobe's "MakN" record (layout as ExifTool reads it), puts Canon and old Olympus
notes back at their original offset so their file-relative pointers work, and uses the note when the DNG's own
tags give no lens or give the range with no f-numbers (`18-55mm f/?`). On ExifTool's real 350D DNG every value
read (18-55 mm, f/4 at the shot's 55 mm, lens type n/a) matches ExifTool's own decode; camera-native DNGs
read exactly as before. Details: `eval/dng-maker-note-2026-11-14.md`.

### Pentax lens numbers, and a lens memory (2026-11-14)

Pentax files name no lens in EXIF (not even the 2018 K-1 Mark II); the maker note holds only the number the
lens reports. ShootFlow now reads it from all four places a Pentax file keeps it ("AOC", "PENTAX" and "RICOH"
notes, a Pentax DNG's private data, a converted DNG's MakN record), with the lens's own focal length and
f-numbers: on ExifTool's K10D file every value matches ExifTool's decode, and on five more real Pentax files
each focal length matches EXIF. A number is not a name, and ShootFlow ships no table of them; instead
`--lens-memory FILE` remembers the lens you name once with `--lens` under the body's number (Pentax's, or
Canon's lens type with the range) and uses it on every later frame with that number:

```bash
shootflow develop IMGP0001.DNG --lens-db lensfun/ --lens-memory lens-memory.json \
  --lens "smc PENTAX DA* 60-250mm F4 [IF] SDM" --out masters/
shootflow develop IMGP*.DNG --lens-db lensfun/ --lens-memory lens-memory.json --out masters/
```

The overnight pipeline reads `color/lens-profiles/lens-memory.json`. Details:
`eval/pentax-lens-memory-2026-11-14.md`.

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
