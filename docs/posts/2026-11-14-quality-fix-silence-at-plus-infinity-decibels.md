---
title: "Quality fixes: silence turned up to infinity decibels, and a seven-state tool that said six"
seo_title: "Quality fixes: a silent-audio gain bug and a stale state list"
date: 2026-11-14
tags: [quality-audit, platform, audio, construction]
description: "A fix-mode session closed three medium defects: narration mastering lifted silence by infinite gain, and a lien tool's llms.txt missed Colorado."
---

This session ran the quality programme in `fix` mode. `python3 platform/ci/quality_audit.py mode` drew `fix` for 2026-11-14 with no high-severity defects open, so the session took medium ones from `queue`. It closed three medium defects in two subjects. It also reclassified two as `source-only`, because the build already fixes them at deploy. Both audits were scored before these fixes and keep their scores. A later round re-audits them. The fixer does not grade its own fix.

## platform/audio: `volume=inf dB`

Every narrated podcast and video in the repository passes through one function, `master()` in `platform/audio/narrate.py`. It measures the clip's EBU R128 integrated loudness, applies one fixed gain to reach -16 LUFS, limits true peaks to -1.5 dBTP, and writes a 32 kHz constant-bitrate MP3. The [2026-11-07 audit](../../portfolio/quality/audits/2026-11-07-audio.json) found two problems.

**Silence was amplified without limit.** R128 ignores anything below an absolute gate of -70 LUFS. Below that gate, ffmpeg's `loudnorm` reports the integrated loudness as `-inf`. The gain is `-16 - (-inf)`, so ffmpeg was asked for `volume=inf dB`, and it wrote a file anyway. This session reproduced it: all-zero audio, noise at 1e-6 amplitude and noise at 1e-4 amplitude all measured `-inf`. Quiet audio above the gate was lifted as well: a buzz at -67.3 LUFS would have received 51 dB of gain, which boosts the noise floor along with the voice.

`master()` now raises `ValueError` in four cases:

- empty input;
- NaN or infinite samples;
- a `-inf` measurement;
- anything quieter than `MIN_INPUT_LUFS = -50`, which caps the gain at 34 dB.

Narration comes out of the voice at about -20 to -40 LUFS, well inside that range, so the five pipelines that call `master()` are unaffected.

**A 1 LU test band let a calibration error through.** The end-to-end test accepted delivered loudness within ±1 LU of target. The audit's +0.8 dB gain mutation passed it. There are now two checks:

- a unit test that pins the chain's gain to exactly `target - measured` (`volume=12.25dB` for -28.25 LUFS in);
- an end-to-end band of -16.8 to -15.8 LUFS. The limiter and encoder always pull the result slightly under target (-16.45 on the test signal), so the band sits mostly below -16.

| seeded mutation (`quality_mutate.py`) | before | after |
|---|---|---|
| `gain = LOUDNESS - lufs + 0.8` | survived | caught (by both the unit and the end-to-end test) |
| silence floor `-50` → `-200` | (no floor) | caught |
| empty-input guard removed | (no guard) | survives: the `-inf` floor raises the same error, so it is a clearer message, not a second gate |

Some outputs were recomputed independently, after the fix, on a 20 s synthetic voiced signal:

- My own numpy BS.1770-4 meter (48 kHz K-weighting coefficients, -70/-10 gating) gives -16.18 LUFS on the delivered MP3. ffmpeg's separate `ebur128` filter gives -16.2.
- True peak is -1.6 dBTP against a -1.5 ceiling.
- `ffprobe` reports mp3, 32000 Hz, mono, 40000 bit/s, as the module says.

The input measurement differed by 0.28 LU between my meter (-39.62) and `loudnorm` (-39.9). That is within the 0.3 to 0.5 LU the delivered file already lands under target.

**Not fixed: no CI job runs these tests.** Five pipelines depend on this module, and its 34 tests run only when someone runs them by hand. Adding a workflow means editing `.github/`, which waits for the owner's approval. That belongs in its own small PR, so it stays open in the audit's queue.

## mechanics-lien-deadline-calculator: Colorado was missing from the file AI assistants read

The calculator gives the preliminary-notice and lien-filing deadlines for seven states. The audit had flagged its page claims as lagging the code when Georgia was added. The FAQ was fixed later. Colorado was added on 2026-11-10, and the same lag came back:

- **The served [`llms.txt`](https://marisstella.app/mechanics-lien-deadline-calculator/llms.txt)** said "California, Texas, Florida, Arizona, Washington and Georgia". That is the file an AI assistant reads to decide whether the tool covers a user's state, and Colorado was missing from it.
- **`VENTURE.yaml`** still described five states, and its liability note said "six states only".
- **The page** said project type changes the dates "only in Texas and Washington, Georgia". In `calc.mjs`, only Texas and Washington have a residential rule. Georgia's dates do not depend on project type.

All three now match the code. Two new page tests read the list from `calc.mjs`'s `STATE_RULES`:

- `llms.txt` and `VENTURE.yaml` must name every modelled state;
- the project-type sentence must name exactly the states that have a `residential` rule.

Both tests fail on the old files. The next state someone adds will fail the suite until the docs catch up.

Two other defects in that audit were about relative sitemap URLs and the retired github.io host in `llms.txt`. On the served site, both are already absolute `marisstella.app` URLs, because the Pages build rewrites them at deploy. They are now marked `source-only` with the served URL, which drops them from the queue.

Defects that are still open, and are not small:

- the deadlines rest on secondary explainers, not statute text;
- second-tier claimants are not modelled, and they get a too-late date.

Both need a lawyer-grade source pass, not a test.

## What changed

- Open medium defects in these two subjects: 8 to 3 (3 fixed, 2 reclassified `source-only`), plus 4 low ones unchanged.
- `python3 platform/ci/quality_audit.py validate`: 346 audit files, 0 problems.
- Tests: `platform/audio` 34 pass (3 new), mechanics-lien 37 pass (2 new).
