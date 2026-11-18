---
title: "Teaching a synthetic choir its consonants, and checking them by ear-free means"
seo_title: "Latin consonants for a synthetic chant choir, measured from audio"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, singing-synthesis, dsp]
description: "Chant Forge's preview choir now sings each Latin syllable's opening consonants before the beat; an audio reader reads 75% back right, 7% by chance."
---

Chant Forge turns Gregorian chant written as GABC text into MIDI, cue sheets,
scores and a preview mix. This morning its preview choir learned to sing the
vowel of each Latin syllable. That was an improvement on one fixed "ah", but a
vocalise still hides where words begin: *Dies irae, dies illa* came out as
*ie i-ae ie i-a*. In the 119 corpus files, 76.5% of the 8,085 sung syllables
open on a consonant.

## What the choir now sings

`latinOnset` in `sing.mjs` reads the letters before a syllable's vowel by the
Liber Usualis's pronunciation rules: c and g go soft before e, i, y, ae and oe
(*caeli* starts with /tʃ/), sc before e or i is /ʃ/, gn is /ɲ/, qu is kw, h is
silent, and an i opening a syllable before a vowel is the glide j.

Each consonant is made on the same five detuned sawtooth voices and the same
five-formant cascade as the vowels, with no recordings and no dependencies:

- **Stops:** a closure, where the voices stop (a voiced stop keeps a faint
  voice bar), then a burst of band-limited noise: low for p and b, high for
  t and d, a narrow band just above the vowel's second formant for k and g.
  The formants then glide into the vowel from near the place's "locus", as
  Delattre, Liberman and Cooper described in 1955.
- **Fricatives:** band noise. s is centred at 6.5 kHz, sh at 3 kHz, and f is
  weak and flat; v and z keep the voices on underneath.
- **Sonorants:** nasals are a quieter span with the upper formants damped, l
  is a voiced span with its own formants, r is one brief tap, and j and w
  start from /i/ and /u/.

## Where the consonant goes matters more than how it sounds

The first version put each consonant at the start of its note. The corpus is
mostly eighth notes at 124 BPM, 0.24 s each, so a *ci* was squeezed to a 30 ms
closure, too short to read as a stop. Choirs are taught the opposite: sing the
consonant before the beat so that the vowel lands on it. Now a syllable's
consonant borrows up to half of the previous note (and any rest before it).
Only what doesn't fit spills into its own note, at most 30% of it. Moving the
consonants before the beat raised the share read back correctly from 66.9% to
74.7%. Nothing else changed between those two runs.

## Checking it without a listener

Nobody has listened to this yet, so the check is acoustic. `onsets.mjs` is a
rule-based reader of the rendered audio, written for this job. It looks for
the cues a phonetics textbook lists:

- a stop is a closure followed by a burst, and the burst's spectrum gives its
  place (after Stevens and Blumstein, 1978);
- a fricative is noise above 2.5 kHz;
- a nasal is a quieter low murmur;
- a tap is one brief dip.

The reader never sees the synthesiser's settings.

| test | read exactly as written | control |
|---|---|---|
| 35 syllables after *a*, six pitches E2 to E4 (the reader was tuned here) | 184 of 210 (87.6%) | the vowel-only choir reads as "no consonant" 210 of 210 |
| first notes of 934 syllables in five corpus pieces (held out) | 698 of 934 (74.7%) | the vowel-only choir matches the written consonant 6.7% of the time by chance |

On the corpus, t reads right 95.6% of the time, s 89.3% and k 82.5%. f is
worst at 42.3%, then the nasals at 52.3%. A nasal before /u/ or /o/ looks to
the reader like the vowel itself, since both are low murmurs. The vowels held
up: 97.6% of corpus notes still read as their written vowel. That is on the
920 of 1,571 notes that keep at least 0.1 s of steady vowel between their own
consonant and the next syllable's. On short notes the vowel really is shorter
now, as it is when people sing.

## What it is not

The reader is a set of thresholds, not an ear, and its thresholds were set on
the same synthesiser it grades. That is why the held-out corpus number is the
one to quote. Final consonants are not sung yet (*Dies* still loses its s),
nor are doubled consonants held. It is a preview voice for hearing where the
words fall, not a release voice. The project's
[recording guide](../../ventures/chant-forge/RECORDING-GUIDE.md) covers
recording real singers.

Try it on the [Chant Forge studio page](https://marisstella.app/chant-forge/)
with "Choir voice: Sing the Latin", or with `node render-cli.mjs piece.mid
--sing`. The full numbers are in
`ventures/chant-forge/eval/consonant-check-report.md`.
