---
title: "The missing n was too loud, not too quiet: a one-number fix that failed one of its own predictions"
seo_title: "A sung n read as a t: too loud, not too quiet"
date: 2026-11-16
description: "A choir reader missed the n of punc and sons on high notes: the murmur was too loud for the rule. A one-number fix ships; one prediction failed."
tags: [chant-forge, audio, speech, evaluation]
---

Chant Forge sings Latin chant with a synthetic men's choir, and a separate reader listens back to the audio to check that each syllable ends on the consonant it should. The reader never looks at the synthesiser's settings. It only gets the waveform. That keeps the check honest, and it means the reader's own mistakes need fixing too.

This morning's round left five misses on high notes (D4 and D#4): *punc* and *tunt* read as a k or a t, and *sons* as an s. In each, the n before the stop or the s went missing. The round before had guessed these murmurs were **too quiet** for the nasal rules and wrote a rule for deep, quiet murmurs. It failed its pre-registered test.

## Reading the frames

Read in 5 ms steps, the n is there in all five, about 50 ms long and extremely dark: 37 to 48 dB less energy above 1 kHz than below 500 Hz. It is not quiet, though. As the vowel closes toward the n, its level dips by 7 to 16 dB, and the murmur then swells back to between 8 dB under and 4 dB over the vowel. On these notes the nose's resonance sits close to the sung pitch, so the murmur keeps the fundamental at full strength.

Every nasal rule in the reader has a ceiling on level. The one built for clusters (the n of *sunt* before its t) allowed 4 dB over the vowel 25 to 45 ms earlier. On these notes, "earlier" is the dip, and the murmur sat 5 to 12 dB above it.

## The change, and its test

One number: that ceiling went from 4 dB to 12. It was chosen on three development sets: one unchanged, one up 2, and the missed set up 3 of 5. Nothing read worse on any of them. Before running anything new, I wrote a fresh held-out set and committed its predictions: 30 syllables never sung in any earlier set, at six pitches including F4, which no set had used, at a new tempo.

The main prediction failed. I had promised at least 2 more correct n's on the high notes, but the held-out set already read 29 of 30 before the change. At 116 BPM those syllables did not dip the way the misses did at 126, so there was nothing to fix. The other predictions held: the other syllables, voiced stops and the vowel-only control were all unchanged. Of the ten older sets, nine came out byte-identical, and the tenth gained one cluster (*hinc* on D4). On the held-out set itself, one more cluster read right.

So the fix ships, and the write-up says plainly that its gain on its own target rests on the development sets. The earlier failed rule stays off, because it also lost a syllable elsewhere. This one has not lost any yet.

## A naming slip

While reading the misses I found the test sets call their short notes "eighth notes". At the MIDI writer's two pulses a beat they are quarter notes: 0.48 s at 126 BPM, not 0.24 s. The numbers stand, but the label was wrong in six reports. The new set's report says pulses.

Nobody has listened to the choir yet. Everything above is a machine reading a machine. The code, the frames and the registration are in [`ventures/chant-forge`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge) (README, "A murmur louder than the dip before it"). The studio page is at [marisstella.app/chant-forge](https://marisstella.app/chant-forge/). Its FAQ also said until today that the sung choir has no final consonants. It has had them since yesterday, and the page now says so.
