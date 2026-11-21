---
title: "Subtitles that drift four minutes: a free resync tool that aligns by rhythm, not words"
seo_title: "Fix out-of-sync subtitles free: shift, frame rate or auto-align"
date: 2026-11-21
tags: [ventures, subtitle-resync, subtitles, video, algorithms]
description: "A free tool fixes SRT and WebVTT timing, even aligning to a subtitle in another language by timing alone. 200 of 200 synthetic tests landed within 0.5 s."
---

A subtitle file that is two seconds late is a nuisance. One that starts in sync and ends four minutes behind is a different problem, and no amount of shifting fixes it. That second kind is nearly always a frame-rate mismatch: the file was timed against a European PAL copy, which plays a 23.976 fps film at 25 fps, about 4.3% fast. On a streaming copy the subtitles fall further behind with every minute.

[Subtitle Resync](https://marisstella.app/subtitle-resync/) is a new free tool for both. It runs in the browser with nothing uploaded, and the same engine runs as a Node script with no dependencies. It finds the right timing four ways:

- **Shift** by a typed amount.
- **Frame-rate fix**: multiply every time by `from / to`. For PAL to film rate that is 25 × 1001 / 24000 = 1.0427083.
- **Two sync points**: play a line near the start and one near the end, type when each is spoken, and the two points fix the stretch and the shift exactly.
- **Align to a reference**: give it a correctly timed subtitle for the same copy, in any language, and it works out the stretch and the shift from timing alone.

## Aligning without reading a word

Dialogue has a rhythm that survives translation. A Spanish and an English subtitle for the same cut start and stop lines at nearly the same moments, even though they share no words. So the aligner never reads text. For each candidate stretch (1, and every ratio between 23.976, 24, 25, 29.97 and 30 fps), every pair of (your line, reference line) within 15 minutes of each other votes for the shift that would put one on the other. Pairs that really correspond all vote for the same shift; the rest scatter across the histogram. The stretch whose best half-second window gets the most votes wins. A least-squares line through the lines that then land within a shrinking tolerance (1 s, then 0.6 s, then 0.4 s) of a reference line refines both numbers, which also absorbs a stretch that isn't exactly one of the standard ratios.

The tool then says how far to trust it: **high** when at least 60% of lines land within 0.4 s of a reference line with a median error of 0.25 s or less, **medium** at 35% or more, **low** otherwise.

## How well it works, on generated tracks

`node sweep.mjs` in the [source](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/subtitle-resync) builds 200 reference tracks of 600 to 1,800 lines with irregular gaps, and from each a "translation" with a random frame-rate ratio, a shift of up to five minutes either way, a quarter of the lines removed, a fifth extra lines added, and every line jittered by up to 0.3 s. Run on 2026-11-21:

| Noise | Within 0.5 s at first and last line | Confidence | Unrelated pairs rated high |
|---|---|---|---|
| ±0.3 s jitter, 25% missing, 20% extra | 200 / 200 (worst 38 ms) | 200 high | 0 / 50 |
| ±0.6 s jitter, 50% missing, 50% extra | 200 / 200 | 200 medium | 0 / 50 |

Each alignment took about 50 ms. These are synthetic tracks, not real films, so they show the search finds the right answer when one straight line fits. They do not show how real translations, which merge and split lines, behave. That is the next thing to measure.

## Where it stops

One straight line fits one cut. An extended edition with added scenes needs the file cut into pieces and each aligned, which [alass](https://github.com/kaegi/alass) does; this tool rates such pairs low rather than guessing. With no reference subtitle and no wish to scrub the video, an audio aligner such as [ffsubsync](https://github.com/smacke/ffsubsync) listens for speech instead. Neither tool's code is used here.

The [guide page](https://marisstella.app/subtitle-resync/fix-subtitles-out-of-sync.html) walks through telling a shift from a drift with two lines, and a worked example with the arithmetic: a line at 00:45:00,000 on a PAL-timed file with a 2-second longer logo lands at 2,700 × 1.0427083 + 2 = 00:46:57,313.
