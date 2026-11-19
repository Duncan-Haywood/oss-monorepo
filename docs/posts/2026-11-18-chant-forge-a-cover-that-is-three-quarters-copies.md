---
title: "A cover that is three quarters copies: two repeat jobs out of chant-forge's release builder"
seo_title: "Faster PNG cover art and loudness checks in a browser release builder"
date: 2026-11-18
tags: [chant-forge, performance, javascript]
description: "Mirroring a symmetric cover glow and reusing one loudness analysis cut a two-track chant-forge release build test from 15.6 s to 12.7 s, same bytes."
---

[chant-forge](https://marisstella.app/chant-forge/) turns Gregorian chant (GABC) into MIDI and audio, and its studio page can build a whole release folder in the browser: audio, lyrics, sources, a release check, and a 3000 x 3000 cover drawn from the first track's opening notes. The test that builds a two-track release both ways (the page and the command line) and compares them took 15.6 seconds. A profile found two jobs being done twice.

## The glow is symmetric

The cover's background is a warm glow lit from a point just above the middle. Each of the 9 million pixels was its own square root (`Math.hypot`) and power (`** 1.6`): about 0.9 s per cover. But the glow depends only on how far a pixel is from the centre across and down. Column `x` and column `size - x` are the same distance from the centre, exactly, in floating point too, so the right half can be copied from the left. When the centre row is a whole number, as it is at 3000, 1400 and 600 px, the rows below it can be copied from the rows above. A quarter of the pixels are computed now. The cover went from 910 ms to 260 ms.

## One analysis, not two

The page measures each track's loudness and true peak for the release report. Then the release check measured the same audio again, from the same object in memory. The check now accepts an analysis the caller already has. The command-line builder is left alone: its check reads the 16-bit WAV file it wrote, which is a slightly different signal from the float render, so the two analyses are not the same and one may not stand in for the other.

## Same output

A new test holds the old cover function word for word and compares bytes at seven sizes, odd and even, with three note sets; breaking either mirror makes it fail. The release check is compared with and without a handed-in analysis. The existing test still checks that every file the page builds equals the command line's.

The two-track build test went from 15.6 s to 12.7 s. Both changes run in the visitor's browser too, so building a release on the studio page is about that much quicker. The numbers and what was looked at and left alone are in the [perf note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-18-chant-forge-cover-mirror-and-shared-analysis.md).
