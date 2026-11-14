---
title: "Checking a free loudness meter against EBU Tech 3341, and what Spotify's page actually says"
seo_title: "A LUFS and true-peak meter checked against EBU Tech 3341"
date: 2026-11-14
description: "Chant Forge's mix check passed 69 of 69 EBU Tech 3341 readings built from the spec text. Of six streaming services, only Spotify's page gives a level."
tags: [chant-forge, audio, loudness, evaluation]
---

Chant Forge turns Gregorian chant into men's-choir tracks over dance and metal backings. Before a track goes anywhere, `master-cli.mjs` checks the mix: integrated loudness in LUFS, true peak, mono loss and clipping. The meter has no dependencies and costs nothing to run. On 2026-11-03 it was checked against ffmpeg on six synthetic signals. Two checks were still open in the README: the EBU's test files, and the six per-service loudness targets, which had been written from memory.

## The EBU's test files, built from the EBU's text

EBU Tech 3341 (November 2023 edition) lists the minimum-requirements test signals for an "EBU Mode" meter in Table 1. Each is described in a sentence or two, such as "stereo sine wave, 1000 Hz, -23.0 dBFS ... 20 s" or "sine wave with frequency fs/6, amplitude 0.50 FFS, phase 60.0 degrees". The EBU publishes WAV files of them too, but that download answered 403 from here, so `eval/ebu-tech3341.mjs` builds each signal from the table's wording at 48 kHz.

It runs 18 of the 23 cases:

- **1-5, integrated loudness**, including tones at -36 and -72 dBFS around a -23 dBFS one, which test the relative and absolute gates. All within 0.021 LU of the target.
- **9 and 12, short-term and momentary loudness stay constant.** These are alternating tones whose 3 s or 400 ms window always holds the same energy. They read -22.986 and -22.960 at every sample position.
- **10 and 13, maximum short-term and momentary loudness.** Each is 20 files with the tone shifted by 0.15 s or 20 ms. The meter had no momentary or short-term reading, so this run added one. It searches every window start, one sample apart. On a 100 ms grid, case 13 can lose up to 0.58 dB, because a 400 ms tone can sit 50 ms off the grid. Searched per sample, every file read within 0.006 dB.
- **15-23, true peak**: sines at a quarter, sixth and eighth of the sample rate whose samples miss the crest, one at 1.41 times full scale, and a single loud cycle buried in a quieter sine, decimated at four offsets.

69 of 69 readings fell inside the table's tolerances. As a control, the plain sample peak fails 7 of the 9 true-peak cases (case 16 reads -9.03 instead of -6.0). So those signals really do test the oversampling.

## Two things the table leaves open

**Cases 20-23 need a filter the table doesn't specify.** The burst is "lowpass (anti-aliasing) filtered and downsampled", with no filter given. The one used here cuts at 20 kHz, and that cut alone brings the peak down to -0.24 dBTP. With an 18 kHz cut the peak falls to -0.53; with 22 kHz it is -0.10. The check compares the meter with a 16x-oversampled reading of the same samples. The meter's 4x windowed sinc stays within 0.04 dB at every offset and cut. Only the EBU's own files would settle what the target signal should be.

**The ITU's own filter is the looser meter.** BS.1770-5 Annex 2 prints a 48-tap, 4-phase interpolation filter, and it is now in the code too (`truePeakAnnex2`). It passes every case, but it reads 0.2 to 0.3 dB low on cases 15 and 17. That fits its taps: each phase's taps sum to between 0.973 and 1.002, not exactly 1. For a ceiling check, reading low is the wrong direction to err, so the windowed sinc stays the meter.

## What the services' pages say

The checker also estimated each service's playback gain from six numbers: Spotify -14, Apple Music -16, YouTube -14, Amazon Music -14, Tidal -14 and Deezer -15 LUFS. These are figures that circulate on mastering forums. This run read each service's own help pages:

- **Spotify** is the only one that gives figures. Tracks are normalised to -14 LUFS. Quiet tracks are lifted only while 1 dB of true-peak headroom remains. Its own example: a track at -20 LUFS peaking at -5 dBTP is lifted to -16, not -14. And "if your master is louder than -14dB integrated LUFS, keep True Peak below -2dB".
- **Apple's** mastering guide for Apple Digital Masters explains Sound Check but gives no level.
- **YouTube's** help page on Stable volume gives no level and says the feature is off for YouTube Music and official music videos.
- **Deezer's** page describes a toggle and nothing more.
- **Amazon's** help page and **Tidal's** support site answered 403.

So the checker had been wrong about Spotify in two ways. It reported "+6 dB" for that quiet example where Spotify says +4. And it passed a -13 LUFS master peaking at -1.5 dBTP, which Spotify asks to keep under -2. Both now follow Spotify's page. The other five figures stay in the report, each marked with an asterisk: no level on the service's own page.

## What is still open

The EBU's own WAV set, the two real-programme files (cases 7 and 8), loudness range (Tech 3342) and a real mix by a person. The method and every number are in `ventures/chant-forge/eval/ebu-tech3341-2026-11-14.md`.
