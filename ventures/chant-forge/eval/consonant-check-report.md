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
| A2 | 31 of 35 (88.6%) | 35 of 35 (100.0%) |
| D3 | 31 of 35 (88.6%) | 35 of 35 (100.0%) |
| G3 | 33 of 35 (94.3%) | 35 of 35 (100.0%) |
| C4 | 29 of 35 (82.9%) | 35 of 35 (100.0%) |
| E4 | 33 of 35 (94.3%) | 35 of 35 (100.0%) |

All pitches: 188 of 210 (89.5%) read exactly (class, voicing, place); 195 of 210 (92.9%) by class alone. The vowel-only choir on the same syllables reads as no consonant 210 of 210 (100.0%): how often the reader finds a consonant where none is sung.

Misses:

- E2 *ge* (voiced affricate) read as fricative voiced
- E2 *nu* (nasal) read as none
- E2 *bi* (voiced lab stop) read as none
- E2 *du* (voiced alv stop) read as fricative voiced
- A2 *ma* (nasal) read as none
- A2 *gna* (nasal) read as none
- A2 *nu* (nasal) read as none
- A2 *du* (voiced alv stop) read as none
- D3 *pa* (voiceless lab stop) read as voiceless vel stop
- D3 *ba* (voiced lab stop) read as voiced vel stop
- D3 *nu* (nasal) read as none
- D3 *du* (voiced alv stop) read as none
- G3 *mo* (nasal) read as none
- G3 *nu* (nasal) read as none
- C4 *pa* (voiceless lab stop) read as voiceless vel stop
- C4 *ba* (voiced lab stop) read as voiced vel stop
- C4 *va* (fricative voiced) read as none
- C4 *nu* (nasal) read as none
- C4 *pe* (voiceless lab stop) read as voiceless vel stop
- C4 *bi* (voiced lab stop) read as voiced vel stop
- E4 *nu* (nasal) read as none
- E4 *bi* (voiced lab stop) read as voiceless lab stop

## B. The corpus pieces (held out: final D3, fitted to 4/4 at 124 BPM)

The first note of every syllable that opens on a consonant, 0.2 s or more, after another note. The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| dies-irae | 387 | 308 of 387 (79.6%) | 318 of 387 (82.2%) |
| pange-lingua | 37 | 27 of 37 (73.0%) | 34 of 37 (91.9%) |
| veni-creator | 26 | 19 of 26 (73.1%) | 20 of 26 (76.9%) |
| te-deum | 391 | 318 of 391 (81.3%) | 288 of 391 (73.7%) |
| salve-regina | 93 | 81 of 93 (87.1%) | 83 of 93 (89.2%) |
| all | 934 | 753 of 934 (80.6%) | 743 of 934 (79.6%) |

By class alone: 786 of 934 (84.2%). The vowel-only control "reads" the written consonant exactly on 57 of 934 (6.1%) of the same notes (the chance level: what a pitch step or a vowel change at the beat looks like to the reader); its reads: stop 60, affricate 0, fricative 48, nasal 73, tap 10, none 743. Syllables that open on their vowel (after another note): 153 of 186 (82.3%) read as no consonant.

By written consonant:

| written | read exactly |
|---|---|
| nasal | 95 of 149 (63.8%) |
| voiceless alv stop | 133 of 135 (98.5%) |
| fricative s | 117 of 121 (96.7%) |
| voiceless vel stop | 97 of 103 (94.2%) |
| tap | 61 of 95 (64.2%) |
| voiced alv stop | 51 of 82 (62.2%) |
| none | 56 of 61 (91.8%) |
| voiceless lab stop | 43 of 49 (87.8%) |
| fricative voiced | 32 of 37 (86.5%) |
| voiced lab stop | 18 of 27 (66.7%) |
| fricative f | 14 of 26 (53.8%) |
| voiced vel stop | 11 of 18 (61.1%) |
| voiced affricate | 9 of 15 (60.0%) |
| voiceless affricate | 15 of 15 (100.0%) |
| fricative S | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | affricate | fricative | nasal | tap | none |
|---|---|---|---|---|---|---|
| stop | 375 | 1 | 6 | 5 | 1 | 26 |
| affricate | 0 | 24 | 4 | 2 | 0 | 0 |
| fricative | 2 | 2 | 175 | 2 | 0 | 4 |
| nasal | 1 | 0 | 3 | 95 | 0 | 50 |
| tap | 0 | 0 | 1 | 2 | 61 | 31 |
| none | 2 | 0 | 2 | 1 | 0 | 56 |

## G. Held out: the 60 Graduale pieces of corpus/gregobase-1908

Same settings and rules as B. Their openings had never been scored; fixed before the "openings on the coda murmur" round (README) and scored on main with the misses hidden, then once after the change.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3400 | 41 | 32 of 41 (78.0%) | 35 of 41 (85.4%) |
| gregobase-1908/3401 | 36 | 33 of 36 (91.7%) | 32 of 36 (88.9%) |
| gregobase-1908/3402 | 61 | 42 of 61 (68.9%) | 54 of 61 (88.5%) |
| gregobase-1908/3403 | 46 | 34 of 46 (73.9%) | 37 of 46 (80.4%) |
| gregobase-1908/3404 | 24 | 17 of 24 (70.8%) | 19 of 24 (79.2%) |
| gregobase-1908/3405 | 45 | 32 of 45 (71.1%) | 37 of 45 (82.2%) |
| gregobase-1908/3406 | 45 | 37 of 45 (82.2%) | 34 of 45 (75.6%) |
| gregobase-1908/3407 | 26 | 19 of 26 (73.1%) | 21 of 26 (80.8%) |
| gregobase-1908/3408 | 47 | 40 of 47 (85.1%) | 46 of 47 (97.9%) |
| gregobase-1908/3409 | 29 | 20 of 29 (69.0%) | 27 of 29 (93.1%) |
| gregobase-1908/3410 | 46 | 33 of 46 (71.7%) | 33 of 46 (71.7%) |
| gregobase-1908/3411 | 41 | 36 of 41 (87.8%) | 39 of 41 (95.1%) |
| gregobase-1908/3412 | 54 | 43 of 54 (79.6%) | 44 of 54 (81.5%) |
| gregobase-1908/3413 | 15 | 10 of 15 (66.7%) | 12 of 15 (80.0%) |
| gregobase-1908/3414 | 15 | 11 of 15 (73.3%) | 10 of 15 (66.7%) |
| gregobase-1908/3415 | 50 | 42 of 50 (84.0%) | 45 of 50 (90.0%) |
| gregobase-1908/3416 | 45 | 39 of 45 (86.7%) | 37 of 45 (82.2%) |
| gregobase-1908/3417 | 74 | 57 of 74 (77.0%) | 65 of 74 (87.8%) |
| gregobase-1908/3418 | 59 | 44 of 59 (74.6%) | 48 of 59 (81.4%) |
| gregobase-1908/3419 | 75 | 58 of 75 (77.3%) | 61 of 75 (81.3%) |
| gregobase-1908/3420 | 58 | 45 of 58 (77.6%) | 50 of 58 (86.2%) |
| gregobase-1908/3421 | 61 | 46 of 61 (75.4%) | 49 of 61 (80.3%) |
| gregobase-1908/3422 | 48 | 41 of 48 (85.4%) | 43 of 48 (89.6%) |
| gregobase-1908/3423 | 14 | 11 of 14 (78.6%) | 10 of 14 (71.4%) |
| gregobase-1908/3424 | 38 | 31 of 38 (81.6%) | 34 of 38 (89.5%) |
| gregobase-1908/3425 | 51 | 40 of 51 (78.4%) | 40 of 51 (78.4%) |
| gregobase-1908/3426 | 25 | 23 of 25 (92.0%) | 23 of 25 (92.0%) |
| gregobase-1908/3427 | 20 | 16 of 20 (80.0%) | 16 of 20 (80.0%) |
| gregobase-1908/3428 | 54 | 47 of 54 (87.0%) | 50 of 54 (92.6%) |
| gregobase-1908/3429 | 31 | 25 of 31 (80.6%) | 29 of 31 (93.5%) |
| gregobase-1908/3430 | 55 | 45 of 55 (81.8%) | 48 of 55 (87.3%) |
| gregobase-1908/3432 | 31 | 26 of 31 (83.9%) | 24 of 31 (77.4%) |
| gregobase-1908/3433 | 68 | 60 of 68 (88.2%) | 52 of 68 (76.5%) |
| gregobase-1908/3434 | 61 | 52 of 61 (85.2%) | 54 of 61 (88.5%) |
| gregobase-1908/3435 | 24 | 20 of 24 (83.3%) | 20 of 24 (83.3%) |
| gregobase-1908/3436 | 24 | 15 of 24 (62.5%) | 22 of 24 (91.7%) |
| gregobase-1908/3437 | 30 | 22 of 30 (73.3%) | 27 of 30 (90.0%) |
| gregobase-1908/3438 | 50 | 41 of 50 (82.0%) | 46 of 50 (92.0%) |
| gregobase-1908/3439 | 23 | 18 of 23 (78.3%) | 19 of 23 (82.6%) |
| gregobase-1908/3440 | 56 | 44 of 56 (78.6%) | 45 of 56 (80.4%) |
| gregobase-1908/3442 | 36 | 32 of 36 (88.9%) | 29 of 36 (80.6%) |
| gregobase-1908/3443 | 21 | 15 of 21 (71.4%) | 17 of 21 (81.0%) |
| gregobase-1908/3444 | 46 | 40 of 46 (87.0%) | 40 of 46 (87.0%) |
| gregobase-1908/3445 | 46 | 38 of 46 (82.6%) | 39 of 46 (84.8%) |
| gregobase-1908/3446 | 28 | 25 of 28 (89.3%) | 27 of 28 (96.4%) |
| gregobase-1908/3447 | 24 | 19 of 24 (79.2%) | 18 of 24 (75.0%) |
| gregobase-1908/3448 | 21 | 13 of 21 (61.9%) | 15 of 21 (71.4%) |
| gregobase-1908/3449 | 33 | 23 of 33 (69.7%) | 31 of 33 (93.9%) |
| gregobase-1908/3450 | 40 | 36 of 40 (90.0%) | 33 of 40 (82.5%) |
| gregobase-1908/3451 | 58 | 45 of 58 (77.6%) | 50 of 58 (86.2%) |
| gregobase-1908/3452 | 20 | 10 of 20 (50.0%) | 17 of 20 (85.0%) |
| gregobase-1908/3453 | 48 | 41 of 48 (85.4%) | 42 of 48 (87.5%) |
| gregobase-1908/3454 | 15 | 13 of 15 (86.7%) | 14 of 15 (93.3%) |
| gregobase-1908/3455 | 18 | 13 of 18 (72.2%) | 16 of 18 (88.9%) |
| gregobase-1908/3456 | 27 | 24 of 27 (88.9%) | 21 of 27 (77.8%) |
| gregobase-1908/3457 | 25 | 19 of 25 (76.0%) | 21 of 25 (84.0%) |
| gregobase-1908/3458 | 30 | 29 of 30 (96.7%) | 26 of 30 (86.7%) |
| gregobase-1908/3459 | 53 | 38 of 53 (71.7%) | 46 of 53 (86.8%) |
| gregobase-1908/3460 | 19 | 16 of 19 (84.2%) | 16 of 19 (84.2%) |
| gregobase-1908/3670 | 45 | 33 of 45 (73.3%) | 37 of 45 (82.2%) |
| all | 2349 | 1869 of 2349 (79.6%) | 1992 of 2349 (84.8%) |

By class alone: 1965 of 2349 (83.7%). The vowel-only control "reads" the written consonant exactly on 247 of 2349 (10.5%) of the same notes (the chance level: what a pitch step or a vowel change at the beat looks like to the reader); its reads: stop 125, affricate 1, fricative 81, nasal 135, tap 15, none 1992. Syllables that open on their vowel (after another note): 686 of 833 (82.4%) read as no consonant.

By written consonant:

| written | read exactly |
|---|---|
| nasal | 278 of 404 (68.8%) |
| voiceless alv stop | 360 of 362 (99.4%) |
| none | 216 of 258 (83.7%) |
| voiced alv stop | 120 of 227 (52.9%) |
| voiceless vel stop | 187 of 202 (92.6%) |
| fricative s | 190 of 196 (96.9%) |
| tap | 114 of 159 (71.7%) |
| voiceless lab stop | 120 of 131 (91.6%) |
| voiced lab stop | 66 of 115 (57.4%) |
| fricative voiced | 75 of 87 (86.2%) |
| fricative f | 26 of 61 (42.6%) |
| voiceless affricate | 52 of 55 (94.5%) |
| voiced vel stop | 47 of 55 (85.5%) |
| voiced affricate | 15 of 33 (45.5%) |
| fricative S | 3 of 4 (75.0%) |

Class written (rows) against class read (columns):

| written | stop | affricate | fricative | nasal | tap | none |
|---|---|---|---|---|---|---|
| stop | 962 | 14 | 10 | 14 | 6 | 86 |
| affricate | 0 | 67 | 12 | 7 | 0 | 2 |
| fricative | 1 | 8 | 328 | 1 | 0 | 10 |
| nasal | 5 | 0 | 3 | 278 | 0 | 118 |
| tap | 2 | 0 | 1 | 0 | 114 | 42 |
| none | 3 | 0 | 3 | 36 | 0 | 216 |

Misses: 480, not printed (held out).

## C. Opening consonants in the corpus

119 GABC files, 8085 sung syllables; 6188 of 8085 (76.5%) open on a consonant, 778 on a cluster. First phone: t 1013, s 576, d 564, m 546, n 536, k 535, r 472, l 390, p 353, v 242, b 241, f 169, j 153, tS 144, g 127, dZ 89, N 22, S 13, z 3.

