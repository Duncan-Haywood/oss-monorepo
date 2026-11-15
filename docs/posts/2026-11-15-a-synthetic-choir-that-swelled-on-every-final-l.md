---
title: "A synthetic choir that swelled on every final l, and the prediction we got wrong"
seo_title: "Formant synthesis: setting a sung /l/ under its vowel"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, audio]
description: "Chant Forge's preview choir sang final /l/ up to 8 dB louder than its vowel. A per-note gain fixed it; the pre-registered one-seed check still failed, and why."
---

Chant Forge turns Gregorian chant written as GABC text into MIDI, scores and a
preview mix. The preview has a small formant-synthesis choir (`sing.mjs`, no
dependencies) that sings the Latin: vowels, opening consonants and, since this
week, the consonants that close each syllable. An acoustic reader
(`onsets.mjs`) listens to the rendered audio and checks what was sung.

## The fault

An earlier run found that the sung /l/ was louder than the vowel before it. A
fixed voicing gain of 1.4 put the /l/'s steady part between 1 dB under and
8 dB over its vowel. It was loudest after *e*, *i* and *u*, because the /l/'s
first two resonances (400 Hz and 1250 Hz) pass those vowels' harmonics better
than the vowels' own resonances do. Real /l/s are weaker than the vowels
around them, so every *-el* or *-ul* would have come out as a small swell.

## The change

Final nasals already had a per-note gain. It sums the power of the source's
harmonics through the vowel's resonators and through the murmur's, then sets
the murmur 7 dB under. The /l/ now gets the same treatment, with a target 4 dB
under its vowel. That 4 dB is an assumption, picked to sit between a vowel and
a nasal. Nobody fitted it to recordings, and nobody has listened to the result
yet. With one voice and no vibrato the /l/ now measures 3.8 to 4.0 dB under its
vowel, at four pitches and after all five vowels.

## The prediction that failed

Before the first run, the check script's header wrote down four predictions.
The first said that, measured on one seed, every /l/ would sit 1 to 7 dB under
its vowel. That held on 20 of 30 notes, up from 9 of 30 before the change. As
registered, it fails.

The failure came from the measurement, not the gain. The /l/'s steady middle
lasts only 25 ms. Over a span that short, the choir's five slightly detuned
voices beat against each other, so one seed's reading swings about 5 dB either
way from note to note. With the power summed over twelve seeds, the old gain
put the /l/ anywhere from 5.4 dB under to 8.6 dB over its vowel. The new gain
puts it 2.4 to 5.0 dB under, with a mean of 3.7. We tried a gain that also
averaged over the detuned voices and the vibrato. It moved nothing by more
than 0.2 dB, so it was dropped.

The other predictions:

- The /l/'s spectral shape is unchanged.
- The final-consonant reader's results are identical on every set, including
  three held-out sets.
- The opening reader lost one read of 934: in the Dies irae, a syllable
  opening on its vowel now reads as a nasal.

The full tables are in `ventures/chant-forge/eval/lateral-level-check.md`.

*Chant Forge is MIT licensed. Its preview choir is a sketch for arranging, not
a recording, and nobody has yet heard this change.*
