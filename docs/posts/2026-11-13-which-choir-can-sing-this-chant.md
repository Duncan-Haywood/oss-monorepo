---
title: "Which choir can sing this chant? Unison, two, three or four sections"
seo_title: "Gregorian chant for amateur men's choirs: which voicing fits"
date: 2026-11-13
tags: [music, gregorian-chant, choir, open-source, chant-forge]
description: "One option names a choir's section ranges and the fewest sections that can sing a chant. On 67 chants, a textbook choir sings 60 in unison, a beginners' none."
---

Chant Forge turns public-domain Gregorian chant (GABC files) into MIDI for a men's choir, with lyrics, a cue sheet and an optional dance or metal backing. Over the last day it learned to divide a chant between sections when one unison line is too wide: tenors and basses, then baritones between them, then first and second tenors. Each of those options wanted section ranges, four flags of two MIDI numbers each. Nobody running a parish choir thinks in MIDI numbers.

So there is now one option, `--choir`, with three named sets of ranges (also a "Choir ranges" choice on the [studio page](https://marisstella.app/chant-forge/)):

| `--choir` | tenors | basses | band every section reaches |
|---|---|---|---|
| `textbook` | C3-A4 | E2-E4 | C3-E4 |
| `amateur` | D3-F4 | G2-C4 | D3-C4 |
| `octave` (beginners) | E3-E4 | A2-A3 | E3-A3 |

These are rules of thumb, not measurements of real choirs. Any single section can still be overridden.

## The fewest sections that work

The more useful part is the question a director actually has: *can my choir sing this, and how?* Without `--split-voices`, `--choir` checks the chant against the band every section can reach. If it does not fit, the tool tries two, three and four sections and says which is the smallest that works:

```
$ node cli.mjs corpus/dies-irae.gabc --choir octave --suggest-final
ambitus 17 semitones is 12 wider than E3-A3; the octave choir can sing it as tenors, baritones and basses: add --split-voices --baritones
```

## What 67 chants say

Run over the project's 67-file corpus (`eval/choir-presets-report.md`):

| choir | unison | tenors + basses | three sections | four (TTBB) | none fits |
|---|---|---|---|---|---|
| textbook | 60 | 7 | 0 | 0 | 0 |
| amateur | 12 | 55 | 0 | 0 | 0 |
| octave | 0 | 56 | 8 | 1 | 2 |

Three things came out of it:

1. **The old default was optimistic.** Chant Forge's unison range has always been E2-E4, and every one of the 67 files fits it. But E2-E4 is the bass range. The band tenors and basses both reach is C3-E4, and that fits 60. The default still applies when you don't name a choir; with `--choir textbook` you get the stricter answer.
2. **An amateur choir splits almost everything, but two sections are always enough.** The shared band shrinks to ten semitones, so only 12 chants stay in unison, and tenors and basses taking turns covers the rest.
3. **A beginners' choir never sings in unison.** With five shared semitones, every chant needs at least two sections. Eight need a third, one needs four, and two 1908 hymns fit no voicing tried. These numbers match the earlier three- and four-section reports, which is a useful check that the new code agrees with the old.

## What is not known

Whether these three presets describe any real choir. The next step on the roadmap is to replace the presets with your own singers: a CSV of each singer's lowest and highest comfortable note, turned into section ranges. Until then the presets are a starting point, and the code, tests and report are MIT licensed in `ventures/chant-forge/`.
