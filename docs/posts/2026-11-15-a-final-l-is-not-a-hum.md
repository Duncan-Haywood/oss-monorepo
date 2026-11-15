---
title: "A final l is not a hum: teaching a consonant reader to look at the coda itself"
seo_title: "Telling a sung /l/ from a nasal: a murmur rule for a synthetic choir"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, phonetics]
description: "Chant Forge's acoustic checker heard every final al as a nasal. Comparing the coda with itself, not its vowel, fixed it; the same rule failed on openings."
---

Chant Forge can preview a Gregorian chant with a synthetic men's choir that
sings the Latin: vowels, opening consonants and, since this week, the consonants
that close each syllable. Nobody has listened to that choir yet, so every change
is checked by a small rule-based reader (`onsets.mjs`) that listens to the
rendered audio and says which consonant it hears.

## The miss

After three rounds of work on final consonants, one thing was still wrong in
every run: the syllable *al* read as a nasal at all six test pitches, and *el* at
four. The reader's nasal rules compare the coda with the vowel just before it.
A nasal murmur is quieter than its vowel and much darker above 1 kHz. A sung /l/
pulls the first formant down under 500 Hz, which makes the low band louder
than in /a/, so the *difference* between coda and vowel looked like a murmur's.
The /l/ itself still had its upper formants.

## The measurement

We measured the coda on its own, not against the vowel: energy above 1 kHz
against energy under 500 Hz, in the coda's steady part, for *al el ol ul* and
*am an em um* (and the other nasals) at six pitches from E2 to E4.

- /l/: 12 to 25 dB darker on top.
- /m/ and /n/: 38 to 54 dB darker, after every vowel and at every pitch.

The nose passes very little above a few hundred hertz, so a murmur is dark in
itself. The two ranges sit 13 dB apart.

## The rule, written down first

The new rule says a coda only counts as a nasal when that internal gap is 28 dB
or more. The threshold and four predictions went into the check script's
header and were committed before the first run with the rule. Results:

| | before | after |
|---|---|---|
| *al*, *el* read as no consonant | 2 of 12 | 12 of 12 |
| tuning set, all codas | 137 of 180 | 157 of 180 |
| held-out set E (10 Graduale pieces) | 75 of 86 | 76 of 86 |
| new set F (51 files): nasals read right | 96 of 137 | 96 of 137 |

Every prediction held. One result was not predicted: ten stops and taps that
used to read as nasals stopped doing so. When the mouth closes for a /t/ or /b/
the first formant also falls, which looks like a murmur against the vowel but
is not dark in itself.

## The same rule on openings failed

The same rule went on the reader for opening consonants, with its own written
prediction: nasal openings should not drop. They dropped from 96 to 64 of 149.
Openings still use an older, brighter murmur in the synthesiser. So, as the
prediction said, the rule stays off for openings. It removed 100 false nasals
from the vowel-only control, so it may come back once the two murmurs match.

## What we found on the way

Measuring the /l/ showed that the synthesiser sings it louder than the vowel
in front of it, by up to 8 dB. A real /l/ is weaker than the vowels around it,
so a listener would probably hear a swell on every final *-l*. That is the next
change. It needs a target level from the literature, because tuning it to
please the reader would prove nothing.

None of this has been heard by a person. The reader is a check on the
synthesiser, not a listener. The numbers are in
`ventures/chant-forge/eval/coda-check-report.md`, and the full write-up is in
the README under "Final consonants, fourth round".
