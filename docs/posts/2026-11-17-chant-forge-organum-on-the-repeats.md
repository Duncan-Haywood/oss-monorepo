---
title: "A ninth-century second voice for the repeats: organum in Chant Forge"
seo_title: "Musica enchiriadis organum as code for chant repeats"
date: 2026-11-17
tags: [chant-forge, music, algorithms, gregorian-chant]
description: "Chant Forge's --repeat sang the same unison line every pass. Now a Musica enchiriadis organal voice sings under every pass after the first."
---

[Chant Forge](../../ventures/chant-forge/README.md) turns Gregorian chant into
tracks for the gym: an all-male choir over deep house, EDM, hard rock or metal.
A one-minute antiphon becomes a three-minute track with `--repeat 3`. Until
today that meant the choir sang the same unison line three times. The backing
changed from verse to drop, and the voices did not.

The fix comes from inside the tradition. Around 900, the treatise *Musica
enchiriadis* wrote down the first way of adding a second voice to chant. Its
rules are short and mechanical, so they fit in about sixty lines of
JavaScript.

## The rules

The chant is the *vox principalis*. The added *vox organalis* sings it a
fourth below, with three limits:

1. **A boundary.** The added voice does not go below a fixed note under the
   final: C under a D final. Where a fourth below would go lower, it holds
   that note. As the chant comes down to its final, the gap shrinks from a
   fourth to a third, a second and then a unison. This narrowing is the
   style's best-known sound.
2. **No tritone.** Where the fourth below is not in the chant's scale (B
   natural under an E, when the chant only uses B flat), the voice takes the
   third below instead.
3. **Occursus.** Every phrase ends with both voices on the same note.

Here is the second pass of Dies irae (D3 final, boundary C3), chant over
added voice:

```
Di-  es   i-   rae   di-  es   il-  la
F3   E3   F3   D3    E3   C3   D3   D3
C3   C3   C3   C3    C3   C3   C3   D3
```

The added voice sits on C while the melody moves above it, then joins it on
the last note. That matches the treatise's own D-mode examples.

## What it does in the tool

`--organum` leaves the first pass of a `--repeat` as plain unison chant and
adds the second voice from pass two on, so the track opens with chant and the
harmony arrives later. Without `--repeat` the second voice runs under the
whole piece. It goes on its own MIDI track, "Organal voice", with the Latin
lyrics. So the preview renderer plays it, the sung preview sings it, and the
rehearsal-track export gives it a part track and a minus track like any other
section. The studio page has a "Second voice" switch.

Range is checked. If the added voice would drop below E2, the command stops and
names the lowest final that fits. With a key lift on the last drop, the
boundary moves up with the lifted line.

## Measured on the corpus

Over all 68 GABC files in the corpus, each at the key the tool would pick
for a men's choir, the added voice sings 14,079 notes:

| interval under the chant | share |
|---|---|
| fourth | 51.9% |
| major third | 15.6% |
| minor third | 4.4% |
| second | 13.5% |
| unison | 14.6% |

It never sings a semitone or a tritone under the chant, and it stays inside
E2-E4 in all 68 files. One rule changed during the run: the first version set
the boundary at the scale step just below the final. For an F final that step
is E, a semitone down, which put a minor second under every F (2.6% of all
notes). The boundary now has to be at least a whole tone below the final, and
the semitones are gone.

Without `--organum` the output is unchanged: four sample commands produce
byte-identical MIDI and cue sheets. There are 10 new tests, and the
browser check passes all 127 of its checks.

## What nobody knows yet

Nobody has listened to it. A fourth below a melody might sound medieval over
a sub-bass, or it might sound muddy. Singers who learned the line in unison
might or might not hold the organal part. The tool can't answer either
question; a listener and a choir can.
