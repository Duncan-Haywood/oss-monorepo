---
title: "Why our synthetic tenor lost his high 'ee', and the one-line fix singers already use"
seo_title: "Formant tuning in a singing synthesiser: raising F1 on high notes"
date: 2026-11-15
tags: [chant-forge, music, audio, speech-synthesis, singing]
description: "A synthetic choir sang a tenor's high /i/ and /u/ 10-16 dB under /a/. Raising F1 to the pitch, as trained singers do, closed most of the gap."
---

Chant Forge turns Gregorian chant into backing tracks, scores and rehearsal
files. Its preview choir is a small source-filter synthesiser: five detuned
sawtooth voices through five formant resonators set to each Latin vowel, with
consonants added on the same filter. The vowel targets are the textbook men's
averages of Peterson and Barney (1952): /i/ has its first formant (F1) at
270 Hz, /u/ at 300 Hz.

That works for basses. It breaks for tenors. A tenor's G4 is 392 Hz and his A4
440 Hz, both above /i/'s and /u/'s first formant. Every harmonic of the note then
sits on the falling side of the first resonance, and the vowel loses most of
its strength. Measured from the synthesiser's own output, held 2-second notes,
five random seeds each:

| | E4 | G4 | A4 |
|---|---|---|---|
| /i/ against /a/, before | -9.1 dB | -16.5 dB | -14.8 dB |
| /i/ against /a/, after | -2.5 dB | -3.7 dB | +0.9 dB |
| /u/ against /a/, before | -3.6 dB | -11.6 dB | -9.8 dB |
| /u/ against /a/, after | -1.5 dB | -1.9 dB | +3.5 dB |

A 16 dB drop is a note that disappears under the band every time the words
land on an "i".

## What singers do

Trained singers do not let this happen. On high notes they open the jaw and
raise F1 so it stays at or above the pitch. Johan Sundberg calls it formant
tuning (*The Science of the Singing Voice*, 1987). The cost is that a high /i/
drifts a little toward /e/, which is the "vowel modification" voice teachers
talk about.

The fix in `sing.mjs` is the same rule: `tuneF1` raises a vowel's F1 to at least
1.1 times the note's pitch and leaves F2, F3 and any vowel whose F1 is already
higher alone. The 1.1 is our assumption (F1 just above the first harmonic). We
did not fit it to recordings of singers.

## Deciding before measuring

Before the first run we wrote down three lines the change had to pass, in the
header of `eval/f1-tune-check.mjs`:

1. at G4 and A4, /i/ and /u/ gain 2 dB or more against /a/ (it gained 12.9 dB
   on average);
2. the formant reader gets no fewer held vowels right from E2 to A4 (179 of 200
   before, 180 after);
3. the corpus checks at the default key stay within half a point: vowels and
   final consonants came out identical, and syllable openings went from 742 to
   743 of 934.

All three held, so tuning is now the default. Below B3 nothing changes, so
basses sound exactly as they did.

## What the measurement can't tell us

The second line is weaker than it looks. Above E4 our LPC formant reader finds
F1 at about the pitch whether or not the filter was tuned: with harmonics
400 Hz apart, there is nothing between them for it to see. It reads 1 of 5
G4 /i/ notes as /i/ before the change and 1 of 5 after. So the check shows the
change does no harm to what we can measure. It does not show that the tuned
high /i/ sounds like /i/ to a person. Nobody has listened to it yet. The same
goes for whether 1.1 is the right ratio. Both are open questions in the
project's README.

Report: `ventures/chant-forge/eval/f1-tune-check-report.md`. Code: `tuneF1` in
`ventures/chant-forge/sing.mjs`, MIT licensed.
