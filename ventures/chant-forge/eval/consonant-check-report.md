# Does the singing choir sing the consonants?

Written by `node eval/consonant-check.mjs`. Each syllable's first note is read from the rendered choir stem by
`onsets.mjs`: a closure then a burst (a stop; voiced when a voice bar sounds under the closure; place from the burst
spectrum after Stevens and Blumstein 1978), a closure then 50 ms of noise (an affricate), noise above 2.5 kHz (a
fricative, /s/ or /ʃ/ by centroid, weak and flat for /f/, voiced when the low band carries on under it), a low
murmur (a nasal), one brief contact (a tap). /l/, /j/, /w/ and a bare vowel should read as none.

## A. Vowel-consonant-vowel pairs (the set the reader was tuned on)

*a* then each of: *pa*, *ba*, *ta*, *da*, *ka*, *ga*, *ki*, *ci*, *ge*, *sa*, *sce*, *fa*, *va*, *za*, *ma*, *na*, *gna*, *la*, *ra*, *ia*, *qua*, *a*, *i*, *u*, *tri*, *spi*, *stu*, *mo*, *nu*, *lo*, *re*, *pe*, *to*, *bi*, *du*; quarter notes at 120 BPM.

| pitch | singing: read exactly as written | vowel-only control: read as no consonant |
|---|---|---|
| E2 | 31 of 35 (88.6%) | 35 of 35 (100.0%) |
| A2 | 32 of 35 (91.4%) | 35 of 35 (100.0%) |
| D3 | 29 of 35 (82.9%) | 35 of 35 (100.0%) |
| G3 | 31 of 35 (88.6%) | 35 of 35 (100.0%) |
| C4 | 27 of 35 (77.1%) | 35 of 35 (100.0%) |
| E4 | 33 of 35 (94.3%) | 35 of 35 (100.0%) |

All pitches: 183 of 210 (87.1%) read exactly (class, voicing, place); 189 of 210 (90.0%) by class alone. The vowel-only choir on the same syllables reads as no consonant 210 of 210 (100.0%): how often the reader finds a consonant where none is sung.

Misses:

- E2 *ge* (voiced affricate) read as fricative voiced
- E2 *nu* (nasal) read as none
- E2 *bi* (voiced lab stop) read as none
- E2 *du* (voiced alv stop) read as fricative voiced
- A2 *va* (fricative voiced) read as nasal
- A2 *nu* (nasal) read as none
- A2 *du* (voiced alv stop) read as none
- D3 *pa* (voiceless lab stop) read as nasal
- D3 *ba* (voiced lab stop) read as voiced vel stop
- D3 *la* (none) read as nasal
- D3 *ia* (none) read as nasal
- D3 *nu* (nasal) read as none
- D3 *du* (voiced alv stop) read as none
- G3 *gna* (nasal) read as voiced lab stop
- G3 *ia* (none) read as nasal
- G3 *mo* (nasal) read as voiced lab stop
- G3 *nu* (nasal) read as none
- C4 *pa* (voiceless lab stop) read as voiceless vel stop
- C4 *ba* (voiced lab stop) read as voiced vel stop
- C4 *va* (fricative voiced) read as nasal
- C4 *za* (fricative voiced) read as nasal
- C4 *la* (none) read as nasal
- C4 *nu* (nasal) read as none
- C4 *pe* (voiceless lab stop) read as voiceless vel stop
- C4 *bi* (voiced lab stop) read as voiced vel stop
- E4 *nu* (nasal) read as none
- E4 *bi* (voiced lab stop) read as voiceless lab stop

## B. The corpus pieces (held out: final D3, fitted to 4/4 at 124 BPM)

The first note of every syllable that opens on a consonant, 0.2 s or more, after another note. The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| dies-irae | 387 | 301 of 387 (77.8%) | 290 of 387 (74.9%) |
| pange-lingua | 37 | 27 of 37 (73.0%) | 32 of 37 (86.5%) |
| veni-creator | 26 | 21 of 26 (80.8%) | 21 of 26 (80.8%) |
| te-deum | 391 | 312 of 391 (79.8%) | 276 of 391 (70.6%) |
| salve-regina | 93 | 82 of 93 (88.2%) | 80 of 93 (86.0%) |
| all | 934 | 743 of 934 (79.6%) | 699 of 934 (74.8%) |

By class alone: 776 of 934 (83.1%). The vowel-only control "reads" the written consonant exactly on 64 of 934 (6.9%) of the same notes (the chance level: what a pitch step or a vowel change at the beat looks like to the reader); its reads: stop 58, affricate 0, fricative 44, nasal 123, tap 10, none 699. Syllables that open on their vowel (after another note): 140 of 186 (75.3%) read as no consonant.

By written consonant:

| written | read exactly |
|---|---|
| nasal | 96 of 149 (64.4%) |
| voiceless alv stop | 133 of 135 (98.5%) |
| fricative s | 116 of 121 (95.9%) |
| voiceless vel stop | 94 of 103 (91.3%) |
| tap | 61 of 95 (64.2%) |
| voiced alv stop | 49 of 82 (59.8%) |
| none | 51 of 61 (83.6%) |
| voiceless lab stop | 44 of 49 (89.8%) |
| fricative voiced | 32 of 37 (86.5%) |
| voiced lab stop | 17 of 27 (63.0%) |
| fricative f | 14 of 26 (53.8%) |
| voiced vel stop | 11 of 18 (61.1%) |
| voiced affricate | 9 of 15 (60.0%) |
| voiceless affricate | 15 of 15 (100.0%) |
| fricative S | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | affricate | fricative | nasal | tap | none |
|---|---|---|---|---|---|---|
| stop | 370 | 1 | 6 | 12 | 1 | 24 |
| affricate | 0 | 24 | 4 | 2 | 0 | 0 |
| fricative | 2 | 2 | 174 | 4 | 0 | 3 |
| nasal | 2 | 0 | 4 | 96 | 0 | 47 |
| tap | 0 | 0 | 1 | 11 | 61 | 22 |
| none | 2 | 0 | 2 | 6 | 0 | 51 |

## C. Opening consonants in the corpus

119 GABC files, 8085 sung syllables; 6188 of 8085 (76.5%) open on a consonant, 778 on a cluster. First phone: t 1013, s 576, d 564, m 546, n 536, k 535, r 472, l 390, p 353, v 242, b 241, f 169, j 153, tS 144, g 127, dZ 89, N 22, S 13, z 3.

