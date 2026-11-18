---
title: "Why our chant reader heard every sung /i/ as a z, and how we fixed it"
seo_title: "Synthetic choir consonant reader: /i/ misread as a voiced fricative"
date: 2026-11-16
tags: [chant-forge, music, audio, speech-synthesis]
description: "Chant Forge's consonant reader heard /i/ as a z. The cause was five synthetic voices beating out of phase. Held-out /i/ reads went from 69% to 96%."
---

Chant Forge turns Gregorian chant into MIDI, scores and a preview mix. It can
also have a synthetic men's choir sing the Latin (`--sing`): five slightly
detuned voices that sing the right vowel on every note and the consonants around
it. To check those consonants without anyone listening, the project reads them
back from the rendered audio with a rule-based reader (`onsets.mjs`). It looks for
the textbook cues: a closure and burst for a stop, noise for a fricative, a dark
murmur for a nasal. It never looks at what the synthesiser was told to sing.

The last round's held-out test (part K) showed one fault behind most of the
reader's mistakes. On 83 of its 119 misses, a syllable on /i/, like *ip*, *im*
or a bare *i*, was read as a **voiced fricative**, a z or a v. Latin has no
final z or v. Across the corpus's 8,085 sung syllables, not one ends on one.

## What the frames showed

A vowel-only /i/ on A3, no consonant at all, read 5 ms at a time: it holds its
level for about 100 ms. Then its energy below 500 Hz drops by 8 to 18 dB for a
quarter of a second, and comes back.

That is the five voices beating. They are detuned by -12, -4, 0, +5 and +13 cents.
They start almost in phase, and as they drift apart their fundamentals cancel for
a while. Every vowel does this. But /i/ keeps almost all of its energy in its
lowest harmonics (its first formant is at 270 Hz), so when the fundamentals
cancel, the vowel's whole level goes with them. What is left is its high second
and third formants.

The reader's voiced-fricative rule asked for more than 12% of the energy above
2.5 kHz, with voicing still underneath. A beating /i/ meets that rule. On a short
note's attack the share went past 50%, so the plain fricative rule fired too.

## The fix: frication is noise, and noise sits high

A real fricative adds noise high in the spectrum. The synthesiser centres /s/
and /z/ near 6.5 kHz and /f/ and /v/ near 5 kHz. A beating vowel adds nothing up
there. So now a frame only counts as frication, voiced or not, when it carries at
least 12 dB more energy above 5 kHz than the vowel did.

On synthetic test syllables the two groups were far apart. Sung z and v frames
sat 66 to 110 dB above the vowel in that band. The /i/ frames that had misread
sat between -13 and +3 dB. The 12 dB line was not tuned further.

## Checked on syllables nobody had looked at

Every older test set had already printed its misses, so we wrote a new one, part
L. It has 16 syllables on /i/, four real voiced-fricative endings (*iz*, *az*,
*ev*, *uv*, there to make sure a real one still reads) and 12 others. It uses five
pitches and a tempo no earlier part used. The predictions went into the script's
header and were committed before part L had ever run.

| part L | before | after |
|---|---|---|
| /i/ syllables read exactly | 110 of 160 (68.8%) | 153 of 160 (95.6%) |
| vowel-only /i/ read as no consonant | 128 of 160 | 160 of 160 |
| real z and v endings read as one | 39 of 40 | 39 of 40 |
| other syllables | 113 of 120 | 113 of 120 |

Every prediction held. Every older part improved too. On the corpus pieces, the
vowel-only choir now reads "no consonant" on every syllable that ends on its
vowel. One count nobody predicted got worse: part K's other syllables read as a
nasal went from 6 to 7.

## What it says about the sound

The trough is in the audio, not only in the reader. Every few hundred
milliseconds a held /i/ swells and sinks by up to 18 dB in its low band. A
listener may hear that as tremolo, or just as an ordinary choir. That question
now goes on the listening-test list, along with possible changes such as
random start phases for the voices. This round changed the reader, not the
singing, and nobody has listened to it yet.

The code, the test sets and the full report are in
`ventures/chant-forge/` (MIT): `onsets.mjs`, `eval/coda-check.mjs` and
`eval/coda-check-report.md`.
