# ig-media-pipeline (`igmp`)

Turns an organised photo and video library into edited Instagram photos and 15-second vertical
reels, with no human steps. Code does the mechanical work the same way every time; Claude makes
the judgment calls against a written [style guide](style/STYLE_GUIDE.md).

```
library ──scan──> catalog ──prefilter──> candidates ──score──> keepers ──edit──> IG photos
                                                         └──────reels──> 15 s reels + captions
```

| Stage | What happens | Who decides |
|---|---|---|
| scan | Reads `YYYY-MM-DD_HHMMSS_Location[_Event]_Camera_Original.EXT` files and Insta360 folders with an `_index.csv`; groups RAW+JPG pairs, 360 INSP+DNG pairs, clips with their proxies | code |
| prefilter | Sharpness, exposure, near-duplicate bursts (dHash), usable video stretches | code, local, free |
| score | Each candidate is scored 0-10 with a role (hook, establishing, moment...), 9:16 and 4:5 crop centres, the best stretch of a clip, the best direction of a 360 shot | Claude |
| edit | Keepers (score >= 6.5) get RAW edit settings from Claude, are rendered by RawTherapee, and reviewed before/after: ship, revise once, or reject | Claude + RawTherapee |
| reels | Per event, Claude picks and orders 6-10 shots on a beat grid; ffmpeg renders 1080x1920; a critic watches a contact sheet of the render and revises up to twice | Claude + ffmpeg |

Every decision is stored, so a stopped run resumes where it left off and a re-render is exact.
Reels are exported without music (add a sound in Instagram, which avoids copyright muting).

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
because they name your drives. Outputs go to `output_dir`: `photos/<event>/`, `reels/<event>.mp4`
with a `.caption.txt`, and `state/` (database, previews, logs).

## Two ways to pay for Claude

- `backend = "claude-code"` (default) runs Claude Code headlessly (`claude -p`) on the Claude plan
  you are logged into. It uses the newest Claude Code on the machine (the desktop app's copy is
  found automatically), keeps any `ANTHROPIC_API_KEY` out of the child process so the plan login is
  used, and pauses until the reset time when the plan's usage limit is reached. This is for your
  own library on your own machine; plan limits are shared with your other Claude use.
- `backend = "api"` uses an Anthropic API key. Bulk scoring and edit direction go through the
  Message Batches API at half price; single calls opt into server-side refusal fallback.

Both send downscaled previews (about 1024 px), never the original files.

## Limits

- 360 photos are scored and reframed, but their dual-fisheye DNGs are not RAW-edited.
- 360 video is reframed per lens with ffmpeg `v360`, which avoids the stitch line; for
  calibrated stitching use Insta360 Studio.
- Captions and taste come from the style guide. Edit it to change the look.

## Commands

`igmp run` runs every stage. `igmp scan | prefilter | score | edit | reels | status` run one.

## Tests

```bash
.venv/bin/python -m pytest -q
```

Tests use synthetic fixtures and fake Claude backends; they never call Claude or touch real media.
