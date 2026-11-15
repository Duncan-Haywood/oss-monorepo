---
title: "Why a synthetic chant choir lost a third of its m and n sounds"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, acoustics]
description: "Chant Forge's choir sang every opening m and n, yet an acoustic reader missed a third of them. Two causes, one fix each, checked on 60 held-out chants."
---

Chant Forge turns Gregorian chant into MIDI and a preview mix. Its preview
choir is a small singing synthesiser: five detuned men's voices through
formant filters, singing the Latin vowel and consonants of each syllable.
Nobody has listened to it yet, so every claim about what it sings is checked
from the rendered audio by a rule-based acoustic reader (`onsets.mjs`).

That reader kept missing nasals. On the openings of 60 Graduale pieces held
out for the purpose, 118 of the 404 sung m and n sounds read as no consonant
at all. This round looked at why.

## What the frames showed

The 60 held-out pieces stay unread, so the misses came from the five
development pieces (54 of 149 missed there). Printed frame by frame, the
misses fell into two groups, nearly all on the corpus's 0.24 s eighth notes:

1. **The vowel before covered the murmur.** Each sung note hands over to the
   next with a 50 ms cross-fade. Before a stop or a fricative that hand-over
   was already 15 ms, so the closure is silent. A nasal kept the 50 ms, and
   the tail of the previous vowel covered 50 of the murmur's 70 ms. Only
   20-30 ms of the murmur stayed dark. But an m or n closes the mouth just as
   a p or t does; the sound simply goes on through the nose. The renderer now
   hands over in 15 ms before a nasal too.
2. **The reader expected the murmur to be quiet, and it often wasn't.** The
   synthesiser sets a murmur 7 dB under its vowel, and with one voice it is.
   With five detuned voices the low harmonics beat against each other, so the
   murmur landed anywhere from 5 dB over to 17 dB under the vowel after it.
   How dark it is held steady, though: energy above 1 kHz sits 44-51 dB under
   the band below 500 Hz. The reader now marks a frame as a murmur when it is
   10 dB darker than both the vowel after it and the sound just before.
   Checking against both sides matters. Against the vowel after alone, every
   dark /u/ or /o/ followed by a bright vowel read as a nasal.

## The held-out check

Both changes and their three settings were chosen on the development sets
only. The predictions were written into the evaluation script and committed
before the held-out set was run:

| held-out set (60 Graduale pieces) | before | after | prediction |
|---|---|---|---|
| openings read exactly as written | 1,869 of 2,349 (79.6%) | 1,959 (83.4%) | no lower: holds |
| nasal openings read exactly | 278 of 404 (68.8%) | 347 (85.9%) | 320 or more: holds |
| vowel-only control read as a nasal | 135 | 44 | 30 or fewer: **fails** |

The final consonants and the vowels measured the same within a note or two.
The failed line is a real miss. On the development pieces the false nasals
fell from 73 to 6, so I expected about a fifth on the held-out set, and got a
third. A small unit test of m and n before five vowels on short notes shows
the gain is uneven too: 26 of 30 read correctly against 20 before, but on D3
alone 6 of 10 against 8.

## What is still open

The reader is a set of rules, not a listener. Whether a 15 ms hand-over into
an m sounds clipped is a question for a person with headphones. The same
beating that scattered the murmur's level also makes a short final *-um*
loud or quiet by chance, and that is next. The details, the ablations and
every number are in the [Chant Forge README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/chant-forge)
("Nasal openings: the mouth closes"), and the [studio page](https://marisstella.app/chant-forge/)
renders the sung preview in the browser.
