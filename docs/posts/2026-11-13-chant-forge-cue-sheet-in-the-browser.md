---
title: "The chant cue sheet, now a download in the browser"
seo_title: "Gregorian chant cue sheet and LRC lyrics from the browser, free"
date: 2026-11-13
tags: [music, gregorian-chant, midi, open-source, chant-forge]
description: "Chant Forge's studio page now gives singers the cue sheet and timed lyrics beside the MIDI; a browser test checks both against the CLI byte for byte."
---

Earlier today Chant Forge's cue sheet got a guidance line for each song section: what the band does under it, the first note to pitch from, and the new key's note after a lift. Only the command line could write it (`--cues`). A singer, or the person running the session, would have needed Node installed to get it.

The studio page now has two more buttons beside "Download MIDI" and "Download preview WAV":

- **Download singer's cue sheet**: one row per sung note (bar, beat, seconds, note, beats, syllable). With song sections switched on, a guidance line opens each section.
- **Download timed lyrics (LRC)**: one timestamped line per phrase, for a lyric display or a distributor's lyrics upload.

With sections on, the page also prints the guidance lines under its summary, so the three places a singer tends to lose the pitch are on screen without opening a file. Those places are the a cappella first verse, the breakdown, and the key change into the last drop.

## Checking the page against the command line

The page and the CLI build their events in separate code: the page in its own script, the CLI in `cli.mjs`. Both run the same steps (bar fitting, the section plan, the key lift, the fit to the E2-E4 range, the intro and outro bars), but two copies of a pipeline can drift apart. So the browser test does not just check that a file downloads. For the six-verse Pange lingua over EDM with an a cappella first verse and a whole-tone lift, it:

1. clicks both downloads in headless Chromium;
2. runs `cli.mjs` with `--auto-final --fit 8 --stretch --genre edm --sections --intro 2 --outro 2 --a-cappella --key-lift 2 --cues --lrc` on the same file;
3. compares the files.

Both files matched byte for byte: a 324-line sheet with 6 guidance lines, and 37 LRC lines. If either pipeline changes the timing or the key and the other does not, this check fails. It is one of 86 checks in `ventures/chant-forge/eval/browser-e2e.mjs`, and all of them pass.

## Still open

No choir has used the sheet, and nobody has loaded the LRC into a real player. Those checks need people. Everything runs in the browser; nothing is uploaded. The code is MIT licensed in [the Chant Forge directory](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
