# Subtitle Resync

Fix an SRT or WebVTT subtitle file that is early, late, or drifting off the
picture. Four ways to find the right timing:

- **Shift** every line by a typed amount.
- **Frame-rate fix**: subtitles timed for a 25 fps PAL release on a 23.976 fps
  copy (or any pair of 23.976, 24, 25, 29.97, 30): `t' = t × from / to`.
- **Two sync points**: two lines and the times they are actually spoken fix
  the shift and the stretch exactly.
- **Align to a reference**: a correctly timed subtitle for the same video, in
  any language. Only timing is compared: every (line, reference line) pair
  votes for an offset at each frame-rate ratio, the strongest peak wins, and a
  least-squares fit over the lines that then land within 0.4 s refines it.
  A confidence rating (high / medium / low) says how many lines agreed.

**Live tool:** https://marisstella.app/subtitle-resync/ ·
guide: [How to fix out-of-sync subtitles](fix-subtitles-out-of-sync.html)

Runs in the browser with no upload, or as a zero-dependency Node 18+ CLI:

```
node resync.mjs movie.srt --offset -2.5 -o fixed.srt
node resync.mjs movie.srt --fps 25:23.976 -o fixed.srt
node resync.mjs movie.srt --sync 00:02:00,000=00:02:07,125 --sync 01:30:00,000=01:33:52,625
node resync.mjs movie.es.srt --reference movie.en.srt -o movie.es.fixed.srt
node resync.mjs movie.srt --offset 1 --to vtt --json
cat movie.srt | node resync.mjs - --offset 1.2 > fixed.srt   # "-" reads standard input
```

Exit codes: 0 written; 1 a reference alignment came back low confidence (the
file is still written); 2 usage or input error.

## What it keeps and drops

- SRT lines are renumbered 1..n on output. WebVTT cue ids, cue settings and the
  header blocks before the first cue (`WEBVTT`, `STYLE`, `REGION`, `NOTE`) are
  kept; `NOTE` blocks after the first cue are dropped and counted.
- A line that would end before 0:00 is dropped; one that would start before
  0:00 starts at 0:00. Both are reported.
- A timing line it cannot read is reported and skipped, never treated as text.

## Limits

- One straight line per file. Versions that differ by **cut scenes** (an
  extended edition, a TV edit) need a piecewise aligner such as
  [alass](https://github.com/kaegi/alass); the tool reports those as low
  confidence rather than guessing.
- It does not listen to audio. With no reference subtitle and no time to read
  two lines off the video, an audio aligner such as
  [ffsubsync](https://github.com/smacke/ffsubsync) fits better.
- Reference alignment searches offsets up to 15 minutes either way.

## Accuracy, measured

`node sweep.mjs` generates 200 reference tracks of 600 to 1,800 lines and a
target for each with a random frame-rate ratio, a shift of up to ±5 minutes,
25% of lines missing, 20% extra, and ±0.3 s jitter. On 2026-11-21 all 200 came
back within 500 ms at the first and last line (worst 38 ms), all rated high
confidence, at about 50 ms per alignment; 0 of 50 unrelated pairs were rated
high. With harsher noise (`node sweep.mjs 600 0.5 0.5`: ±0.6 s, half missing,
half extra) all 200 were still within 500 ms, rated medium. These are
synthetic tracks, not real films.

## Spec sources

The professional who would sign this off is a subtitle/post-production
technician. Timestamp syntax follows the W3C WebVTT specification
(`hh:mm:ss.ttt`, hours optional) and the SubRip convention (`hh:mm:ss,ttt`).
NTSC film rate is exactly 24000/1001 fps and 29.97 is 30000/1001 (SMPTE
convention); PAL plays film frames at 25 fps, so the PAL-to-film scale is
25 × 1001 / 24000 = 1.0427083. `engine.test.mjs` checks this against a
hand calculation (PAL 01:00:00.000 is frame 90,000, shown at 3753.75 s on a
23.976 copy) and checks the two-point fit against a worked example computed by
hand.

Prior art: alass (GPL-3.0) aligns to a reference subtitle with split handling,
and ffsubsync (MIT) aligns to audio. No code from either is used; the voting
and fit here are an original implementation of a standard robust-registration
idea.

## Privacy and usage counting

Files are read and rewritten in the browser; nothing is uploaded. The page
counts anonymous events (`resync_run`, `example_loaded`, `file_downloaded`)
in the visitor's own local storage only, honours Do Not Track and Global
Privacy Control, and has an opt-out checkbox in the footer.

## Disclaimer

> **No warranty.** This tool is provided free and as-is, without warranty of
> any kind, express or implied. It is not legal or professional advice, and it
> does not replace a qualified professional. You are responsible for
> reviewing and verifying its output before relying on it. To the maximum
> extent permitted by law, the authors accept no liability for any loss or
> damage arising from its use.

Use subtitle files you have the right to use.

## Files

`engine.mjs` (pure logic), `resync.mjs` (CLI), `index.html` (browser tool),
`fix-subtitles-out-of-sync.html` (guide), `usage.mjs` (local counts),
`sweep.mjs` (accuracy sweep), tests in `*.test.mjs`
(`node --test '*.test.mjs'`). FSL-1.1-MIT licensed.

Support is optional: https://github.com/sponsors/Duncan-Haywood
