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
| E2 | 34 of 35 (97.1%) | 35 of 35 (100.0%) |
| A2 | 35 of 35 (100.0%) | 35 of 35 (100.0%) |
| D3 | 33 of 35 (94.3%) | 35 of 35 (100.0%) |
| G3 | 34 of 35 (97.1%) | 35 of 35 (100.0%) |
| C4 | 27 of 35 (77.1%) | 35 of 35 (100.0%) |
| E4 | 32 of 35 (91.4%) | 35 of 35 (100.0%) |

All pitches: 195 of 210 (92.9%) read exactly (class, voicing, place); 202 of 210 (96.2%) by class alone. The vowel-only choir on the same syllables reads as no consonant 210 of 210 (100.0%): how often the reader finds a consonant where none is sung.

Misses:

- E2 *bi* (voiced lab stop) read as voiced vel stop
- D3 *pa* (voiceless lab stop) read as voiceless vel stop
- D3 *ba* (voiced lab stop) read as voiced vel stop
- G3 *nu* (nasal) read as none
- C4 *pa* (voiceless lab stop) read as voiceless vel stop
- C4 *ba* (voiced lab stop) read as voiced vel stop
- C4 *da* (voiced alv stop) read as none
- C4 *ge* (voiced affricate) read as fricative voiced
- C4 *va* (fricative voiced) read as none
- C4 *pe* (voiceless lab stop) read as voiceless vel stop
- C4 *bi* (voiced lab stop) read as voiced vel stop
- C4 *du* (voiced alv stop) read as fricative voiced
- E4 *da* (voiced alv stop) read as none
- E4 *nu* (nasal) read as none
- E4 *du* (voiced alv stop) read as none

## B. The corpus pieces (held out: final D3, fitted to 4/4 at 124 BPM)

The first note of every syllable that opens on a consonant, 0.2 s or more, after another note. The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| dies-irae | 387 | 332 of 387 (85.8%) | 351 of 387 (90.7%) |
| pange-lingua | 37 | 31 of 37 (83.8%) | 34 of 37 (91.9%) |
| veni-creator | 26 | 22 of 26 (84.6%) | 22 of 26 (84.6%) |
| te-deum | 391 | 339 of 391 (86.7%) | 312 of 391 (79.8%) |
| salve-regina | 93 | 88 of 93 (94.6%) | 87 of 93 (93.5%) |
| all | 934 | 812 of 934 (86.9%) | 806 of 934 (86.3%) |

By class alone: 842 of 934 (90.1%). The vowel-only control "reads" the written consonant exactly on 55 of 934 (5.9%) of the same notes (the chance level: what a pitch step or a vowel change at the beat looks like to the reader); its reads: stop 64, affricate 0, fricative 48, nasal 6, tap 10, none 806. Syllables that open on their vowel (after another note): 159 of 186 (85.5%) read as no consonant.

By written consonant:

| written | read exactly |
|---|---|
| nasal | 123 of 149 (82.6%) |
| voiceless alv stop | 134 of 135 (99.3%) |
| fricative s | 118 of 121 (97.5%) |
| voiceless vel stop | 97 of 103 (94.2%) |
| tap | 61 of 95 (64.2%) |
| voiced alv stop | 67 of 82 (81.7%) |
| none | 56 of 61 (91.8%) |
| voiceless lab stop | 46 of 49 (93.9%) |
| fricative voiced | 33 of 37 (89.2%) |
| voiced lab stop | 23 of 27 (85.2%) |
| fricative f | 14 of 26 (53.8%) |
| voiced vel stop | 14 of 18 (77.8%) |
| voiced affricate | 10 of 15 (66.7%) |
| voiceless affricate | 15 of 15 (100.0%) |
| fricative S | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | affricate | fricative | nasal | tap | none |
|---|---|---|---|---|---|---|
| stop | 400 | 1 | 5 | 5 | 0 | 3 |
| affricate | 0 | 25 | 3 | 0 | 0 | 2 |
| fricative | 2 | 2 | 177 | 1 | 0 | 3 |
| nasal | 3 | 0 | 1 | 123 | 2 | 20 |
| tap | 0 | 0 | 1 | 0 | 61 | 33 |
| none | 2 | 0 | 2 | 1 | 0 | 56 |

## G. Held out: the 60 Graduale pieces of corpus/gregobase-1908

Same settings and rules as B. Their openings had never been scored; fixed before the "openings on the coda murmur" round (README) and scored on main with the misses hidden, then once after the change.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3400 | 41 | 35 of 41 (85.4%) | 36 of 41 (87.8%) |
| gregobase-1908/3401 | 36 | 34 of 36 (94.4%) | 32 of 36 (88.9%) |
| gregobase-1908/3402 | 61 | 50 of 61 (82.0%) | 56 of 61 (91.8%) |
| gregobase-1908/3403 | 46 | 41 of 46 (89.1%) | 38 of 46 (82.6%) |
| gregobase-1908/3404 | 24 | 20 of 24 (83.3%) | 21 of 24 (87.5%) |
| gregobase-1908/3405 | 45 | 34 of 45 (75.6%) | 38 of 45 (84.4%) |
| gregobase-1908/3406 | 45 | 38 of 45 (84.4%) | 34 of 45 (75.6%) |
| gregobase-1908/3407 | 26 | 23 of 26 (88.5%) | 23 of 26 (88.5%) |
| gregobase-1908/3408 | 47 | 45 of 47 (95.7%) | 47 of 47 (100.0%) |
| gregobase-1908/3409 | 29 | 25 of 29 (86.2%) | 27 of 29 (93.1%) |
| gregobase-1908/3410 | 46 | 42 of 46 (91.3%) | 37 of 46 (80.4%) |
| gregobase-1908/3411 | 41 | 37 of 41 (90.2%) | 38 of 41 (92.7%) |
| gregobase-1908/3412 | 54 | 48 of 54 (88.9%) | 46 of 54 (85.2%) |
| gregobase-1908/3413 | 15 | 12 of 15 (80.0%) | 14 of 15 (93.3%) |
| gregobase-1908/3414 | 15 | 12 of 15 (80.0%) | 11 of 15 (73.3%) |
| gregobase-1908/3415 | 50 | 43 of 50 (86.0%) | 47 of 50 (94.0%) |
| gregobase-1908/3416 | 45 | 44 of 45 (97.8%) | 39 of 45 (86.7%) |
| gregobase-1908/3417 | 74 | 61 of 74 (82.4%) | 65 of 74 (87.8%) |
| gregobase-1908/3418 | 59 | 51 of 59 (86.4%) | 50 of 59 (84.7%) |
| gregobase-1908/3419 | 75 | 68 of 75 (90.7%) | 66 of 75 (88.0%) |
| gregobase-1908/3420 | 58 | 52 of 58 (89.7%) | 50 of 58 (86.2%) |
| gregobase-1908/3421 | 61 | 54 of 61 (88.5%) | 56 of 61 (91.8%) |
| gregobase-1908/3422 | 48 | 45 of 48 (93.8%) | 43 of 48 (89.6%) |
| gregobase-1908/3423 | 14 | 13 of 14 (92.9%) | 11 of 14 (78.6%) |
| gregobase-1908/3424 | 38 | 35 of 38 (92.1%) | 37 of 38 (97.4%) |
| gregobase-1908/3425 | 51 | 44 of 51 (86.3%) | 41 of 51 (80.4%) |
| gregobase-1908/3426 | 25 | 22 of 25 (88.0%) | 24 of 25 (96.0%) |
| gregobase-1908/3427 | 20 | 15 of 20 (75.0%) | 16 of 20 (80.0%) |
| gregobase-1908/3428 | 54 | 48 of 54 (88.9%) | 51 of 54 (94.4%) |
| gregobase-1908/3429 | 31 | 27 of 31 (87.1%) | 28 of 31 (90.3%) |
| gregobase-1908/3430 | 55 | 48 of 55 (87.3%) | 52 of 55 (94.5%) |
| gregobase-1908/3432 | 31 | 27 of 31 (87.1%) | 26 of 31 (83.9%) |
| gregobase-1908/3433 | 68 | 60 of 68 (88.2%) | 54 of 68 (79.4%) |
| gregobase-1908/3434 | 61 | 54 of 61 (88.5%) | 55 of 61 (90.2%) |
| gregobase-1908/3435 | 24 | 21 of 24 (87.5%) | 22 of 24 (91.7%) |
| gregobase-1908/3436 | 24 | 19 of 24 (79.2%) | 20 of 24 (83.3%) |
| gregobase-1908/3437 | 30 | 23 of 30 (76.7%) | 26 of 30 (86.7%) |
| gregobase-1908/3438 | 50 | 46 of 50 (92.0%) | 49 of 50 (98.0%) |
| gregobase-1908/3439 | 23 | 20 of 23 (87.0%) | 20 of 23 (87.0%) |
| gregobase-1908/3440 | 56 | 52 of 56 (92.9%) | 49 of 56 (87.5%) |
| gregobase-1908/3442 | 36 | 33 of 36 (91.7%) | 30 of 36 (83.3%) |
| gregobase-1908/3443 | 21 | 15 of 21 (71.4%) | 19 of 21 (90.5%) |
| gregobase-1908/3444 | 46 | 40 of 46 (87.0%) | 39 of 46 (84.8%) |
| gregobase-1908/3445 | 46 | 41 of 46 (89.1%) | 44 of 46 (95.7%) |
| gregobase-1908/3446 | 28 | 24 of 28 (85.7%) | 26 of 28 (92.9%) |
| gregobase-1908/3447 | 24 | 21 of 24 (87.5%) | 20 of 24 (83.3%) |
| gregobase-1908/3448 | 21 | 19 of 21 (90.5%) | 17 of 21 (81.0%) |
| gregobase-1908/3449 | 33 | 29 of 33 (87.9%) | 31 of 33 (93.9%) |
| gregobase-1908/3450 | 40 | 37 of 40 (92.5%) | 36 of 40 (90.0%) |
| gregobase-1908/3451 | 58 | 50 of 58 (86.2%) | 51 of 58 (87.9%) |
| gregobase-1908/3452 | 20 | 13 of 20 (65.0%) | 18 of 20 (90.0%) |
| gregobase-1908/3453 | 48 | 43 of 48 (89.6%) | 44 of 48 (91.7%) |
| gregobase-1908/3454 | 15 | 14 of 15 (93.3%) | 15 of 15 (100.0%) |
| gregobase-1908/3455 | 18 | 17 of 18 (94.4%) | 17 of 18 (94.4%) |
| gregobase-1908/3456 | 27 | 21 of 27 (77.8%) | 22 of 27 (81.5%) |
| gregobase-1908/3457 | 25 | 24 of 25 (96.0%) | 22 of 25 (88.0%) |
| gregobase-1908/3458 | 30 | 29 of 30 (96.7%) | 27 of 30 (90.0%) |
| gregobase-1908/3459 | 53 | 45 of 53 (84.9%) | 46 of 53 (86.8%) |
| gregobase-1908/3460 | 19 | 16 of 19 (84.2%) | 18 of 19 (94.7%) |
| gregobase-1908/3670 | 45 | 36 of 45 (80.0%) | 37 of 45 (82.2%) |
| all | 2349 | 2055 of 2349 (87.5%) | 2074 of 2349 (88.3%) |

By class alone: 2146 of 2349 (91.4%). The vowel-only control "reads" the written consonant exactly on 270 of 2349 (11.5%) of the same notes (the chance level: what a pitch step or a vowel change at the beat looks like to the reader); its reads: stop 134, affricate 1, fricative 81, nasal 44, tap 15, none 2074. Syllables that open on their vowel (after another note): 747 of 833 (89.7%) read as no consonant.

By written consonant:

| written | read exactly |
|---|---|
| nasal | 347 of 404 (85.9%) |
| voiceless alv stop | 356 of 362 (98.3%) |
| none | 249 of 258 (96.5%) |
| voiced alv stop | 172 of 227 (75.8%) |
| voiceless vel stop | 187 of 202 (92.6%) |
| fricative s | 190 of 196 (96.9%) |
| tap | 115 of 159 (72.3%) |
| voiceless lab stop | 118 of 131 (90.1%) |
| voiced lab stop | 98 of 115 (85.2%) |
| fricative voiced | 74 of 87 (85.1%) |
| fricative f | 26 of 61 (42.6%) |
| voiceless affricate | 53 of 55 (96.4%) |
| voiced vel stop | 50 of 55 (90.9%) |
| voiced affricate | 17 of 33 (51.5%) |
| fricative S | 3 of 4 (75.0%) |

Class written (rows) against class read (columns):

| written | stop | affricate | fricative | nasal | tap | none |
|---|---|---|---|---|---|---|
| stop | 1035 | 14 | 7 | 30 | 4 | 2 |
| affricate | 0 | 73 | 6 | 1 | 0 | 8 |
| fricative | 1 | 8 | 327 | 2 | 0 | 10 |
| nasal | 9 | 0 | 1 | 347 | 5 | 42 |
| tap | 2 | 0 | 1 | 1 | 115 | 40 |
| none | 3 | 0 | 3 | 3 | 0 | 249 |

## C. Opening consonants in the corpus

146 GABC files, 9903 sung syllables; 7515 of 9903 (75.9%) open on a consonant, 945 on a cluster. First phone: t 1205, s 686, m 685, d 673, k 650, n 643, r 580, l 484, p 427, v 304, b 295, f 205, j 193, tS 180, g 157, dZ 103, N 26, S 15, z 4.

