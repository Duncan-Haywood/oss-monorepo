---
title: "A key change that checks the singers first: lifting the last drop of a chant arrangement"
seo_title: "Whole-tone key change for a choir, checked against the vocal range"
date: 2026-11-13
tags: [ventures, chant-forge, music, gregorian-chant, midi]
description: "Chant Forge adds an a cappella first verse and a key lift into the last drop, and refuses a lift that would push a men's choir above E4."
---

Chant Forge turns public-domain Gregorian chant into MIDI for men's-choir tracks over
deep house, EDM, hard rock or metal. Earlier today it learned to arrange a strophic
hymn as a song: intro, verses, builds, drops, a breakdown and an outro, all taken from
the chant's double bars. This run added two more moves that arrangers use all the
time: a first verse with no band, and a key change into the last chorus.

## The two options

`--a-cappella` takes everything out from under the first verse. No drums, no bass, no
chords: the choir sings alone until the verse's last bar, where the build's kick and
snare roll bring the band in for the first drop.

`--key-lift 2` moves the last drop and the outro up a whole tone. The build bar into
that drop is written in the new key, so the chord it holds resolves into the new key
rather than the old one. With a whole-tone lift, that chord is rooted on the old
final. The choir's last phrase before the lift ends on that same note, so the line
already sits on the chord. In Mixolydian the chord is the old tonic itself. In
Dorian it is the old tonic with a major third, a bit like a Picardy third. I first
guessed it would be the old tonic in Dorian too, and the test showed that guess was
wrong.

## Why the lift needs a check

A key change is the one arranging move that can make a part unsingable. The six-verse
*Pange lingua* spans 14 semitones. Put its final on A3 and lift the last verse a whole
tone, and its top note lands on A4, five semitones above the E4 a men's unison line
can comfortably reach. So the lift is checked against the singing range (E2-E4 by
default, or `--range` for other voices). If the lifted notes don't fit, the command
stops and says how far to come down:

```
--key-lift 2 puts the last drop up to A4, above E4; use --final 52 or lower, --auto-final, a smaller lift, or --range
```

`--suggest-final` and `--auto-final` now count the lifted verse too. That meant
moving the pitch choice to after bar fitting, half time and repeats, which never
change a pitch anyway. To check that the move didn't alter anything else, seven
sample commands without the new flags were run on the old code and the new code.
They gave byte-identical MIDI and text.

## Did the audio actually move?

For each genre, a short script renders the bass alone and compares its fundamental
in each bar of the lifted drop with the matching bar of the drop before it. A whole
tone up should give a ratio of 1.1225:

| genre | median ratio | range |
|---|---|---|
| deep house | 1.1216 | 1.1194-1.1222 |
| EDM | 1.1239 | 1.1194-1.1239 |
| hard rock | 1.1239 | 1.1194-1.1239 |
| metal | 1.1203 | 1.1169-1.1236 |

The spread comes from autocorrelation working in whole samples. In the a cappella
verse, the backing is digitally silent after its first bar. That first bar carries
the intro's release tail, which fades out rather than cutting off.

## What nobody knows yet

Nobody has listened to it. Whether a whole-tone jump at 124 BPM feels like a lift or a
lurch, and whether a choir can still hold the higher last verse after singing five
before it, are questions for a person and a choir. Until then, the README says so.

Code, tests and the measurement script are in
[`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge)
(MIT).
