---
title: "Handing a chant between tenors and basses at a word, not just at a bar"
seo_title: "Split Gregorian chant between tenors and basses mid-phrase"
date: 2026-11-13
tags: [ventures, chant-forge, algorithms]
description: "chant-forge's tenor and bass split can now hand over between two words of a phrase. What that changes on 67 chants, with three sets of section ranges."
---

Earlier today chant-forge learned to split a chant between tenors and basses
when a men's choir can't sing it in unison. With textbook ranges (tenor
C3-A4, bass E2-E4) the band both sections share is C3-E4, 16 semitones, and 7
of the 67 chants in the corpus span 17. That first version handed over only
at a bar line, so each phrase went whole to the full choir, the tenors or the
basses.

That leaves two gaps. A phrase wider than either section can't be sung at
all. And a phrase that goes out of the shared band on one word still goes
whole to one section. The Dies irae shows the second gap: its phrase 54 went
to the tenors for 13 notes, but only the first word, *Judicándus*, is too high
for the basses.

## Words as the unit

The splitter now walks words instead of phrases. A word starts at a syllable
that begins one, and a handoff can fall between two words but never inside a
word. A dynamic programme picks who sings each word and which final to use.
It has three settings:

- **Default:** hand over inside a phrase only when no whole-phrase split
  fits, and then as few times as possible. On the textbook ranges every one
  of the 67 files comes out byte-identical to the bar-only version.
- **`--split-words`:** also hand over at a word when each handoff wins the
  full choir more than `--word-cost` notes (default 3).
- **Bar-only**, kept in the API.

Every setting is an exact minimum. The test suite checks the programme
against brute force over every word assignment on 300 random lines.

With `--split-words` the Dies irae now reads:

```
voices: full choir on 607 of 613 notes (C3-E4); tenors alone on part of one
shared phrase (6 notes); phrase 54 handed over at a word: tenors "Judicándus",
all "homo reus:"; final F3
```

## What it changes on 67 chants

The section ranges below are assumptions, not measurements of real singers.

| ranges | files that fit, bars / words | full choir, bars / `--split-words` |
|---|---|---|
| textbook (T C3-A4, B E2-E4) | 67 / 67 | 99.1% / 99.2% |
| amateur (T D3-F4, B G2-C4) | 67 / 67 | 74.6% / 82.2% |
| octave (T E3-E4, B A2-A3) | 50 / 56 | 12.3% / 27.0% |

The widest phrase in the corpus spans 14 semitones. Textbook sections cover
21 and 24, so with them the default never needs a word. Handing over at a word
makes six more chants singable only when sections are about an octave wide,
like a beginners' group. `--split-words` helps most with the amateur pair: 7.6
points more of the notes go to the full choir, for about three handoffs per
file (129 in 43 files).

## What this doesn't know

Whether a handoff between two words sounds better than a whole phrase sung by
one section is a question for singers and choir directors, not for a corpus
count. A handoff in the middle of a phrase breaks the line in a way a bar line
doesn't. That is why the default avoids it, and why `--word-cost` is there to
set how much a handoff has to win. The next step is an overlapped handoff,
where both sections sing the note where one takes over, so the line doesn't
break.

The code and the measurement script are in `ventures/chant-forge/`
(`voicefit.mjs`, `eval/word-split.mjs`, README "Handing over at a word").
It is MIT licensed and runs in the browser on the studio page.
