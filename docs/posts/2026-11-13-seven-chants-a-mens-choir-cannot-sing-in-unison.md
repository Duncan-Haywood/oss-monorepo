---
title: "Seven chants a men's choir cannot sing in unison, and the one-phrase fix"
seo_title: "Gregorian chant for men's choir: tenor and bass range, split by phrase"
date: 2026-11-13
tags: [music, gregorian-chant, midi, open-source, chant-forge]
description: "Of 67 Gregorian chants in Chant Forge's corpus, 7 span one semitone more than tenors and basses can both sing. Giving one phrase to one section fixes every one."
---

Chant Forge arranges public-domain Gregorian chant for a men's choir over dance and metal backings. Its range check has always asked one question: does the whole chant fit E2 to E4 at some transposition? Every one of the 67 files in the corpus does, so the planned option for chants wider than the range looked unneeded.

That question was too easy. E2 to E4 is the textbook range of a **bass**. A tenor's textbook range is C3 to A4. When a whole men's choir sings in unison, every note has to be one both sections can sing, and that band is C3 to E4: 16 semitones.

Measured against that band, 60 of the 67 files fit and **7 do not**. Each of the seven spans exactly 17 semitones, one more than the band. They include two of the most familiar pieces in the corpus, the Dies irae and the Salve Regina, and five Graduals and Alleluias from the 1908 Vatican Graduale.

## The fix: give one phrase to one section

Choirs have long split chant between two half-choirs that trade phrases (*alternatim*). The new `--split-voices` option does the same with tenors and basses. For each phrase (the notes between two bars), it picks who sings: the full choir if every note is in C3-E4, otherwise the tenors or the basses alone. It searches every transposition and keeps the one that leaves the most notes to the full choir, then the one with the fewest changes of singer.

On all seven files the answer has the same shape. One phrase goes to one section, and the full choir sings everything else:

| piece | full choir | alone |
|---|---|---|
| Dies irae | 600 of 613 notes | tenors, 13 notes up to F4 |
| Salve Regina | 227 of 231 | basses, 4 notes down to B2 |
| Confiteantur tibi | 243 of 254 | tenors, 11 notes |
| Sapientia aedificavit | 199 of 215 | basses, 16 notes |
| Constitues eos principes | 214 of 236 | basses, 22 notes |
| Benedictus Dominus | 198 of 219 | basses, 21 notes |
| Solemnitas | 184 of 216 | tenors, 15 notes |

So 85 to 98 percent of each piece is still sung by everyone. The split always falls at a bar, where singers breathe. The other usual fixes, a falsetto top note or a basses-only low note inside a phrase, put the handover in the middle of a line.

```
node cli.mjs corpus/dies-irae.gabc --split-voices --fit 8 --cues dies.txt -o dies.mid
voices: full choir on 600 of 613 notes (C3-E4); tenors alone on phrase 54 (13 notes); final F3
```

The MIDI file gets a Tenors track and a Basses track, each complete on its own, with lyrics. The cue sheet gets a column saying who sings each note. The [studio page](https://marisstella.app/chant-forge/) has the same option under "Final note", and a headless-browser check finds its downloads byte-for-byte equal to the command line's.

## A small bug found on the way

The command line checked "does the final match the mode?" after transposing. So the Dies irae, moved to end on F3 instead of D, was flagged with "check the transcription" when nothing was wrong with it. The check now looks at the final as written, which is what the studio page already did.

## What nobody has checked

The ranges come from textbooks, not from real singers. A gym-track choir could be lower or higher than that, and `--tenor` and `--bass` let you change them. In the preview audio, full-choir phrases come out about 6 dB louder than one-section phrases, because the two tracks add up exactly. Real singers would add about 3 dB. Nobody has listened to any of it yet. The code is MIT licensed in [the Chant Forge directory](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
