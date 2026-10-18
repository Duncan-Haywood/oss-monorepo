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
| astro | Night-sky runs (night intervalometer sequences, and 3+ dark tripod frames close in time) with a long exposure are measured locally (exposure, stars, sky drift); Claude picks the outputs - a star-aligned **stack**, **star trails**, a **timelapse** or a **trail timelapse** - the frames to use and drop, the horizon, the foreground and the grade; code aligns the sky on the stars and stacks it with sigma clipping, holds the foreground still, and grades; a critic ships, revises (up to twice) or rejects each still | Claude + numpy |
| edit | A curator drops near-repeats per event; every frame >= 6.5 plus each event's best 15% get RAW edit settings and a feed shape (4:5, 1:1 or 1.91:1); RawTherapee renders; a checklist critic ships, revises (up to twice) or rejects | Claude + RawTherapee |
| reels | Per event (thin consecutive days merge into one trip) ONE creative pass plans the main edit and the cut-downs derived from it: a long recap (60 s-3 min, per trip), a medium arc (30-60 s), several shorts (7-15 s) each with its own hook, and a B version of the first short for an A/B trial. Code holds each plan to the hard rules (beat grid, length band, the first second moves, every still moves, at most one bordered shot); each shot renders once as a cached segment, a transition director picks the cuts from measurements of them; automatic checks (`qc`) send a faulty draft straight back for a fix; a per-class critic ships it or revises up to three times; shipped reels are rendered final with a 3:4-safe cover, the rest wait in `reels/_needs-attention/` | Claude + ffmpeg |
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
cd ventures/ig-media-pipeline
uv venv && uv pip install -e '.[dev]'
.venv/bin/igmp init        # writes ~/.config/igmp/config.toml - edit the paths
.venv/bin/igmp run
```

Settings live in `~/.config/igmp/config.toml` (or `$IGMP_CONFIG`), outside this repository,
because they name your drives. Outputs go to `output_dir`: `photos/<event>/`,
`reels/{short,medium,long}/<event>__<class>-NN.mp4` with a `.caption.txt` (the caption, then the
track it was cut to) and a `.jpg` cover (reels of `review_events` wait in `reels/_review/` for your
approval), `ready/index.jpg` + `index.csv` (everything shipped, as a posting queue of about three a
week), and `state/` (database, previews, cached segments, logs). Every story plan and critic round is
saved as it happens, so a stopped run continues where it was.

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
`igmp music` lists the analysed music library. `igmp backup manifest | verify | copy --to DEST` keeps
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
