# ig-media-pipeline (`igmp`)

Turns an organised photo and video library into edited Instagram photos and vertical reels
(short, medium and long), with no human steps. Code does the mechanical work the same way every time; Claude makes
the judgment calls against a written [style guide](style/STYLE_GUIDE.md).

```
library ──scan──> catalog ──prefilter──> candidates ──score──> keepers ──edit──> IG photos
                                                         └──────reels──> reels + captions + covers
```

| Stage | What happens | Who decides |
|---|---|---|
| scan | Reads `YYYY-MM-DD_HHMMSS_Location[_Event]_Camera_Original.EXT` files and Insta360 folders with an `_index.csv`; groups RAW+JPG pairs, 360 INSP+DNG pairs, clips with their proxies | code |
| geo | Matches shots to a phone's GPS track (Apple Photos, an exported folder, GPX/CSV, Google Timeline) by time; suggests place labels for unlabelled days | code |
| prefilter | Sharpness, exposure, dHash bursts, usable video stretches; on macOS a free Apple Vision pass (aesthetics, face capture quality incl. blinks in groups, feature prints for near-duplicates across cameras); intervalometer runs become one timelapse/stop-motion **sequence** | code, local, free |
| score | Each candidate is scored 0-10 with a role, 9:16 and feed crop centres, the best stretch of a clip, a 360 view direction, or (for sequences) timelapse vs stop-motion, fps and frame range | Claude |
| astro | Night-sky runs (night intervalometer sequences, and 3+ dark tripod frames close in time) with a long exposure are measured locally (exposure, stars, sky drift); Claude picks the outputs - a star-aligned **stack**, **star trails**, a **timelapse** or a **trail timelapse** - the frames to use and drop, the horizon, the foreground and the grade; code snaps Claude's horizon to the real skyline, has [Siril](https://siril.org) register the sky on its stars (homography, so wide-lens corners line up) and stack it with winsorized rejection (a built-in aligner and sigma-clip stack when Siril is not installed, or `astro_stacker = "builtin"`), holds the foreground still, and grades; a critic ships, revises (up to twice) or rejects each still | Claude + numpy |
| edit | A curator drops near-repeats per event; every frame >= 6.5 plus each event's best 15% get RAW edit settings and a feed shape (4:5, 1:1 or 1.91:1); RawTherapee renders; a checklist critic ships, revises (up to twice) or rejects | Claude + RawTherapee |
| reels | Per event (thin consecutive days merge into one trip) ONE creative pass plans the main edit and the cut-downs derived from it: a long recap (60 s-3 min, per trip), a medium arc (30-60 s), several shorts (7-15 s) each with its own hook, and a B version of the first short for an A/B trial. Code holds each plan to the hard rules (beat grid, length band, the first second moves, every still moves, at most one bordered shot); each shot renders once as a cached segment, a transition director picks the cuts from measurements of them; automatic checks (`qc`) send a faulty draft straight back for a fix; a per-class critic ships it or revises up to three times; shipped reels are rendered final with a 3:4-safe cover, the rest wait in `reels/_needs-attention/<event>/` | Claude + ffmpeg |
| tag | After every stage, XMP sidecars carry what was learned | code |

Every decision is stored, so a stopped run resumes where it left off and a re-render is exact.

**Music.** With `music = "auto"`, reels are cut to the beats of a track from your licensed library
(`music_dir`, one `<file>.license.json` per track; tracks without a usable license are never used),
mixed with the clips' natural sound and levelled to -14 LUFS. `music = "none"` exports silent reels
for adding a sound in the Instagram app (better reach for trending audio, but not hands-off).

**Metadata.** Every stage refreshes an XMP sidecar next to each shot: corrected local time with its
offset, place, event, keywords, star rating, colour label, and the pipeline's own fields. Camera
originals are never rewritten; edited exports carry the metadata embedded.

## Setup

```bash
brew install ffmpeg exiftool
brew install --cask rawtherapee
brew install siril          # optional: astro stacks are registered and stacked by Siril when present
cd ventures/ig-media-pipeline
uv venv && uv pip install -e '.[dev]'
.venv/bin/igmp init        # writes ~/.config/igmp/config.toml - edit the paths
.venv/bin/igmp run
```

Settings live in `~/.config/igmp/config.toml` (or `$IGMP_CONFIG`), outside this repository,
because they name your drives. `state_dir` (default `<output_dir>/state`) moves the database and
caches to a disk that stays connected, so a run survives an external drive dropping off. Outputs go to `output_dir`: `photos/<event>/`,
`reels/<event>/<event>__<class>-NN.mp4` with a `.caption.txt` (the caption, then the
track it was cut to) and a `.jpg` cover (reels of `review_events` wait in `reels/_review/<event>/` for your
approval), `ready/index.jpg` + `index.csv` (everything shipped, as a posting queue of about three a
week), and `state/` (database, previews, cached segments, logs). Every story plan and critic round is
saved as it happens, so a stopped run continues where it was.

## When the drives are away

The photo drives and the output drive drop off often. The pipeline keeps making reels without them.

**Staging.** `igmp stage` writes a reel-resolution proxy of every file reels may draw on: each
keeper of every event with enough of them (exactly the reels pool), plus the shipped RAW edits of
those photos. Stills become upright sRGB JPEGs (q90) just big enough for a 1080x1920 crop at 1.2x
zoom (about 3630 px on the long edge for 3:2), RAW-only stills are developed as the reels do it
(camera white balance, half size), Insta360 `.insp` stills are kept full size (they are reframed),
clips become H.264 at 1920 px (360 clips: 1920 px per lens, both lens streams kept). Frame rate,
length and sound are kept. Of a clip only the stretches reels can use are kept: the score's best
window and the prefilter's usable segments, padded by 1.5 s and merged, at most 60 s a clip (best
window first; settings `proxy_pad_s`, `proxy_clip_seconds`). The rest of the clip is black and
silent but keeps its place, so the proxy has the clip's own timeline and every planned time lands
on the same frame; a shot planned outside the staged stretches fails with a clear error (the reel
is retried once the drive is back) instead of rendering black. Staging is incremental: a `manifest.json` next to the proxies records
each source's size and mtime, so a re-run makes only what is new or changed, and a stopped run
resumes. Run it while the drives are connected (`--only TEXT` and `--limit N` narrow it; the
setting `stage_workers` bounds the parallel decoders, default a quarter of the cores up to 4).

**`proxy_dir`.** Proxies go to `<state_dir>/proxies` unless `proxy_dir` says otherwise. To keep them
in cloud storage, point it at a cloud-synced folder, for example
`proxy_dir = "~/Library/Mobile Documents/com~apple~CloudDocs/igmp-proxies"` (iCloud Drive), a
Google Drive or Dropbox folder under `~/Library/CloudStorage/`. Keep that folder downloaded
("Keep Downloaded" / "Available offline"): a proxy evicted to the cloud is treated as missing.

**Offline behaviour.** A drive that is not connected never removes anything: `scan` keeps every
asset it knew, with its scores, edits and previews. Reels are planned from the catalog and the
cached previews as usual (a missing preview is made from the proxy, and a clip's size, frame rate
and length come from what staging recorded), and when a file's original path is missing the
renderer is handed its proxy instead. Only stages that need the originals (prefilter measurements, RAW edits, astro)
skip those shots until the drive is back.

**The outbox.** When the volume holding `output_dir` is not mounted, finished reels, carousels,
photos, astro outputs and `ready/` go to `<state_dir>/outbox/` under the same relative paths.
`igmp sync-outputs`, which also runs at the start of every command, moves them onto `output_dir`
once it is back (copied beside the destination, size-checked, then renamed into place) and
rewrites the stored records to the new paths. Nothing is ever created under a missing
`/Volumes/<drive>`.

## Running in the cloud

Nothing here is built, but this is what a cloud runner would need:

- **The state**: `state_dir` (the database, previews, caches), copied up or synced.
- **The proxies**: `proxy_dir` in cloud storage, so the runner reads the same paths through the
  manifest. Reels can then be planned and rendered without the original library.
- **A Claude backend**: `backend = "claude-code"` uses the Claude plan this Mac is signed into
  and cannot move to another machine. A cloud machine would use `backend = "api"` with an
  Anthropic API key, billed per token (batches at half price).
- **Tools**: ffmpeg, exiftool and Python with this package. RawTherapee is only needed for RAW
  edits, which need the originals anyway.
- **Outputs**: written to the runner's `output_dir` (or its outbox) and synced back.

## Two ways to pay for Claude

- `backend = "claude-code"` (default) runs Claude Code headlessly (`claude -p`) on the Claude plan
  you are logged into. It uses the newest Claude Code on the machine (the desktop app's copy is
  found automatically), keeps any `ANTHROPIC_API_KEY` out of the child process so the plan login is
  used, and pauses until the reset time when the plan's usage limit is reached. This is for your
  own library on your own machine; plan limits are shared with your other Claude use.
  The CLI keeps its own login, separate from the desktop app's: if it was ever signed in with
  `claude auth login --console`, print mode bills that Console API key per token. So before any
  call the pipeline checks `claude auth status` and refuses to start unless `authMethod` is
  `"claude.ai"`; `claude auth login --claudeai` switches it to the plan.
- `backend = "api"` uses an Anthropic API key. Bulk scoring and edit direction go through the
  Message Batches API at half price; single calls opt into server-side refusal fallback.

Both send downscaled previews (about 1024 px), never the original files.

## Limits

- 360 photos are scored and reframed, but their dual-fisheye DNGs are not RAW-edited.
- 360 video is reframed per lens with ffmpeg `v360`, which avoids the stitch line; for
  calibrated stitching use Insta360 Studio.
- Captions and taste come from the style guide. Edit it to change the look.

## Commands

`igmp run` runs every stage. `igmp scan | geo | prefilter | score | astro | edit | reels | tag | status` run one.
`igmp stage` writes the proxy working set and `igmp sync-outputs` empties the outbox (see "When the drives are away").
`igmp organize` files loose library shots into `<root>/<event>/RAW` (with each RAW's `.xmp` beside it, where
Lightroom and Capture One read it), `JPG` and `VIDEO`; it shows the plan, `--apply` moves (same-drive
renames, never overwriting, each logged to `<root>/_organize/*.jsonl` first), `--undo MANIFEST` moves
them back. Catalog ids do not change, so scores and edits stay attached. `igmp music` lists the analysed music library. `igmp backup manifest | verify | copy --to DEST` keeps
checksums for the library and makes verified copies. `--only TEXT` limits a run to matching events;
`--limit N` scores at most N new candidates (`reels`: makes at most N reels); `--mix short=3,medium=1,long=1`
sets how many reels of each length an event gets (default: scaled by its keepers).

## Reel QC

`igmp.qc` runs objective checks on a rendered reel, so a reel with a mechanical fault can be
revised before a critic call is spent on it. Instagram says it is less likely to recommend reels
that are "muted or contain borders", low-resolution, or over 3 minutes. The checks cover format
(1080x1920, 29.97-60 fps, yuv420p, H.264/HEVC, 6-25 Mb/s), sound (an audio stream that is not
silent, -14 LUFS, at most -1 dBTP), letterbox and pillarbox bars (a starry night sky does not
count as a bar), real motion or a cut in the first second, no stretch over 1.5 s without visible
change, the length (5-180 s, plus an optional band), and how well the last frame loops to the
first. `check_plan` also checks the plan: fit-layout shots take at most 20% of the runtime and
none starts before 3 s. Each reel is decoded once. The renderer calls `check_plan(plan)` and
`check_reel(path, cfg, band=None, draft=True)` on its draft. In a draft, the encoder settings are
informational only. `report.summary_for_llm()` lists only what failed or warned, as facts for the
revision prompt. The method and the calibration numbers are in the module docstring.

```bash
.venv/bin/python -m igmp.qc reels/ [--band short|medium|long] [--allow-silent] [--draft] [--json]
```

## Tests

```bash
.venv/bin/python -m pytest -q
```

Tests use synthetic fixtures and fake Claude backends; they never call Claude or touch real media.
