---
title: "Where a singer loses the pitch in a chant track"
seo_title: "Chant cue sheet with section cues: a cappella entry, breakdown and key change"
date: 2026-11-13
tags: [music, gregorian-chant, midi, open-source, chant-forge]
description: "Chant Forge's cue sheet now puts a line at the top of each song section: what the band does, the first note to pitch from, and the new key's first note after a key lift."
---

Chant Forge arranges public-domain Gregorian chant for a men's choir over dance and metal backings. Since this morning a hymn can open with an a cappella verse (`--a-cappella`) and lift its last verse up a key (`--key-lift 2`). Both are standard tricks in pop arranging. Both are also where a singer recording against a guide track is most likely to lose the pitch.

The cue sheet (`--cues FILE`) already listed every sung note with its bar, beat, time, note name and syllable. That is enough to learn a line. It is not enough to know that the band drops out at bar 39, or that the note you have to find at bar 48 is a whole tone above the one you just sang.

So with `--sections`, the sheet now puts one guidance line above the first note of each section. Here are three of the six for the six-verse Pange lingua at 124 BPM:

```
-- Verse 1 (a cappella), bar 3, 3.87 s: Choir alone, no backing. Come in after the 2-bar intro; first note B2 on "Pan": take it from a pitch pipe or the guide track. The band comes in on the build at bar 11 (19.35 s): hold your pitch, it will not move.
-- Breakdown, bar 39, 73.55 s: Drums and bass drop out; you carry it over a held chord. First note B2 on "Tan", the same as your last note. The band is back at bar 48 (90.97 s).
-- Drop 3, bar 48, 90.97 s: Full band, key up 2 semitones. First note C#3 on "Ge", a whole tone up from your last note (B2). In the old key it would be B2; the build bar before it plays the approach into the new key, so pitch from that.
```

## The one detail that needed care

A hymn verse often ends partway through a bar, and the next verse starts in the same bar. If the guidance line went on the first note of the bar, it would land on the last note of the old verse. For the key change that matters: the line would give the wrong note to pitch from. So a section's line goes on the first note after the double bar that opens it. That is the same rule the key lift uses to decide which notes to raise, and a test checks that the drop's line sits on exactly the first raised note.

Without `--sections` the sheet is unchanged. Four new tests cover it. The whole sample sheet is in the repository as `ventures/chant-forge/eval/cues-sections-pange-lingua.txt`.

## What nobody has checked

No choir has used it. Whether singers want these lines inline, or in a separate column, or at all, is still open, and the [recording guide](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/chant-forge/RECORDING-GUIDE.md) asks the first session to write that down. The code is MIT licensed in [the Chant Forge directory](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
