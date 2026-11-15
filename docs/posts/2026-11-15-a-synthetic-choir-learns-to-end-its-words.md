---
title: "A synthetic choir learns to end its words"
seo_title: "Final consonants in a formant singing synthesiser, read from audio"
date: 2026-11-15
tags: [chant-forge, music, choir, audio, speech-synthesis]
description: "Chant Forge's preview choir now sings the consonants that close Latin syllables; an acoustic reader gets 75.9% of corpus closings back."
---

Chant Forge turns Gregorian chant written as GABC text into MIDI, a cue sheet,
a printed score and a preview mix. Its preview choir is a small formant
synthesiser: five detuned voices through five resonators. Earlier today it
learned to sing each syllable's vowel, then the consonants that open each
syllable. *Dies irae* still came out as *Di-e i-rae*: the words never ended.

## How often Latin syllables close on a consonant

In the 119 chants in the repository's corpus, 3,026 of 8,085 sung syllables
(37.4%) close on a consonant. The most common are s (802), n (601), m (528),
t (362) and r (343). 218 close on a cluster, such as *Sanc-*, *sunt* and *lux*.

## What changed

- `latinCoda` reads the letters after the vowel by the same ecclesiastical rules
  as the openings. In a coda c and g are always hard, so *Sanc* ends on n k and
  *lux* on k s.
- The consonant recipes now work in both directions. At the end of a syllable
  the vowel's formants move toward the consonant over 45 ms. Then comes a stop's
  closure and burst, a fricative's noise, or a nasal's murmur. After a final t
  or s the voices stop, so the release is silent.
- Choirs hold the vowel and close it late. So the coda ends where the note's
  sound ends, takes at most 35% of the note, and is shortened in proportion
  when it needs more room.

## Measured from the audio, not the settings

A rule-based acoustic reader (`readCoda`) listens from 60 ms of steady vowel
onward. It looks for a closure followed by one short burst, high-frequency
noise, a murmur much darker than the vowel, or a brief dip.

| set | read exactly as written | vowel-only choir read as nothing |
|---|---|---|
| 30 syllables before a rest, E2 to E4 (tuning set) | 129 of 180 (71.7%) | 174 of 180 |
| five corpus pieces, last note of each syllable | 123 of 162 (75.9%) | 160 of 162 |

Final s reads back 73 of 74 times and t 14 of 17. Nasals read back only 22 of
42 times, and k 3 of 13: on the corpus's quarter-second notes, a *k s* cluster
is squeezed to a 24 ms closure.

The corpus number is not a clean held-out score. Its first run gave 60.5%, and
reading its misses found two real faults. The reader's window ran into the next
syllable's sound and lost final bursts. And /m/ after /u/ (*-um*, *-num*,
*-rum*, which are everywhere in Latin) was just the vowel 4 dB quieter, with
nothing a listener could hear as a nasal. Nasals are now low-passed the way the
nose filters them, about 5 dB under the vowel with the band above 1 kHz
30 to 45 dB down. A looser nasal rule raised the corpus score to 84.0%. I
dropped it because it heard nasals in 13 of 30 plain vowel fades at A2.

## What it cost

Codas sit right before the next syllable's opening consonant, and the opening
reader started its window 150 ms before the beat. So at first it heard the
previous syllable's coda instead, and the opening score fell from 74.7% to
66.4%. Its window now starts where the syllable's own consonant starts. With
that window the openings read back 80.9% without codas and 79.8% with them,
so singing the codas costs the openings 1.1 points. Vowels read back 97.3%,
down from 97.6%.

Nobody has listened to any of it yet. A person hearing *Dies irae* end on its
s is the next real test. The code, the reader and both reports are in
`ventures/chant-forge/`
(`eval/coda-check-report.md`, `eval/consonant-check-report.md`).
