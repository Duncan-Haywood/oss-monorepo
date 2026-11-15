---
title: "A click hidden in every final -m our synthetic choir sang"
seo_title: "Formant singing synthesis: a nasal-murmur glitch found in the audio"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, signal-processing]
description: "Teaching Chant Forge's acoustic reader to hear /m/ after /u/ turned up a 10 ms glitch in every final nasal its synthetic choir sang."
---

Chant Forge turns Gregorian chant into MIDI, scores and a preview mix. Its
preview choir (`sing.mjs`, no dependencies) is a small formant synthesiser:
five detuned voices through vowel resonators, with the Latin consonants sung
around them. No person has listened to it yet, so every claim about it is
checked by a second program instead: an acoustic reader (`onsets.mjs`) that
looks at the rendered audio and says which consonant it hears. The synthesiser
is never asked what it meant to sing.

## The miss

Final /m/ after /u/ is everywhere in Latin chant: *-um*, *-num*, *-rum*. The
reader missed most of them. It calls a final nasal when the sound turns
15 dB darker above 1 kHz than the vowel, because a vowel that simply fades
into its release already darkens by up to 12 dB. After /u/, though, nearly
all the vowel's energy is already under 500 Hz. Its murmur is the same sound
10 to 13 dB quieter and only 8 to 12 dB darker. The bar could not be lowered
without calling fades nasals.

Before changing anything, the run fixed a fresh held-out set: ten Graduale
pieces nobody had scored, chosen by file name. Baseline: 71 of 86 final
consonants read right.

## What a fade does not do

Read frame by frame, the murmur and the fade differ in shape, not depth. The
lips shut in about 10 ms and the murmur then holds its level, while a release
falls 1 to 3 dB every 10 ms. The first version of the new rule looked for
that step in the overall level, and it failed in a familiar way: it called 13
of 30 bare /a/ vowels on A2 nasals. An open vowel's release loses its upper
formants first while its low band holds. So the rule now asks for the step
*under 500 Hz*: a drop of 5 dB within 20 ms, then 45 ms held within 4 dB.

## The click

Tracing the remaining misses turned up something else. In *num,* and *num.*
from the *Dies irae*, about 45 ms into the murmur, there was a 10 to 20 ms
flash of bright sound, 12 to 19 dB louder above 1 kHz, in the same place
every time. In the code, the nasal segment ramped its "through the nose"
weight down over its last 10 ms, and then the hum after the note set it back
to 1. For those 10 ms the low-pass and antiformant were off, so the raw vowel
came through. Every final *-m* and *-n* since final consonants were added had
a small click in it. A listener would have heard it on the first play, but no
listener had played it yet.

The fix is three lines: hold a final nasal's weight at 1 through its ramp.
A test now renders /um/ and /am/ with one voice at three pitches and fails if
any frame near the note's end is 6 dB brighter than the murmur. On the old
code it fails with a 10.2 dB blip.

## Results

| set | before | after |
|---|---|---|
| new held-out set (10 Graduale pieces) | 71 of 86 (82.6%) | 75 of 86 (87.2%) |
| its nasals | 14 of 22 | 18 of 22 |
| the five pieces the reader was developed on | 134 of 162 | 142 of 162 |

The vowel-only control (the same notes with no consonants) reads "none" just
as often as before in every set, and the opening-consonant and vowel scores
did not move. Neither change does much alone. The synthesiser fix moves the
held-out score by nothing, and the reader rule alone gets 139 of 162 on the
development pieces. The glitch had been breaking the very plateau the new
rule looks for.

The real limit is still the same: a reader built by the same project
is not an ear. The full tables and the ablation are in
`ventures/chant-forge/eval/coda-check-report.md` and the README section
"Final consonants, third round". The next useful test is a person playing a
sung *-um* and saying whether it clicks.
