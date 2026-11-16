# Does the singing choir sing the final consonants?

Written by `node eval/coda-check.mjs`. The last note of each syllable is read from the rendered choir stem by
`onsets.mjs` `readCoda`, from 60 ms of steady vowel on: a closure and then one short burst (a stop; voiced when a voice
bar sounds under the closure; place from the burst), noise above 2.5 kHz (a fricative), a deep murmur of 55 ms or more
before an obstruent or 30 ms otherwise (a nasal), a brief dip with voice after it (a tap). /l/ and a bare vowel should
read as none. A cluster is scored on its first phone (*nunc* on its /n/).

## A. Syllables before a rest (the set the reader was tuned on)

*as*, *es*, *is*, *os*, *us*, *at*, *et*, *ad*, *ab*, *ac*, *ap*, *am*, *an*, *em*, *um*, *al*, *el*, *ar*, *er*, *ax*, *ex*, *unt*, *ant*, *ost*, *unc*, *a*, *e*, *i*, *o*, *u*; quarter notes at 120 BPM, each followed by a quarter rest.

| pitch | singing: read exactly as written | vowel-only control: read as no consonant |
|---|---|---|
| E2 | 28 of 30 (93.3%) | 30 of 30 (100.0%) |
| A2 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |
| D3 | 29 of 30 (96.7%) | 30 of 30 (100.0%) |
| G3 | 29 of 30 (96.7%) | 30 of 30 (100.0%) |
| C4 | 27 of 30 (90.0%) | 30 of 30 (100.0%) |
| E4 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |

All pitches: 173 of 180 (96.1%) read exactly (class, voicing, place); 176 of 180 (97.8%) by class alone. The vowel-only choir on the same syllables reads as no consonant 180 of 180 (100.0%).

Misses:

- E2 *ad* (voiced alv stop) read as nasal
- E2 *ab* (voiced lab stop) read as nasal
- D3 *ap* (voiceless lab stop) read as nasal
- G3 *ab* (voiced lab stop) read as nasal
- C4 *ad* (voiced alv stop) read as voiceless alv stop
- C4 *ab* (voiced lab stop) read as voiceless vel stop
- C4 *ap* (voiceless lab stop) read as voiceless vel stop

Vowel-only control, read as a consonant:


## B. The corpus pieces (final D3, fitted to 4/4 at 124 BPM)

Not a clean held-out set: no threshold was set on it, but its first run (60.5%) was read for misses, which showed the window cutting off bursts at the next sound and /m/ after /u/ barely a murmur; both were fixed (in the reader's window and in sing.mjs) before this run. One looser nasal rule was also tried and dropped: it read 136 of 162 here (84.0%) but called 13 of 30 vowel-only A2 fades in part A nasals. Its misses were read again for the second round (README "Final consonants, second round") and the third, which found the blip of bare vowel at the end of every final nasal's murmur (README "Final consonants, third round").

The last note of every syllable that closes on a consonant, 0.2 s or more, with 60 ms of steady vowel before the coda's room. The window ends where the next sound starts (the next beat, less its opening consonant sung before it). The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| dies-irae | 75 | 72 of 75 (96.0%) | 75 of 75 (100.0%) |
| pange-lingua | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| veni-creator | 1 | 1 of 1 (100.0%) | 1 of 1 (100.0%) |
| te-deum | 65 | 65 of 65 (100.0%) | 65 of 65 (100.0%) |
| salve-regina | 16 | 16 of 16 (100.0%) | 16 of 16 (100.0%) |
| all | 162 | 159 of 162 (98.1%) | 162 of 162 (100.0%) |

By class alone: 159 of 162 (98.1%). Before a syllable that opens on a consonant: 76 of 79 (96.2%); before a vowel or a rest: 83 of 83 (100.0%). Syllables that close on their vowel: 220 of 220 (100.0%) read as no consonant (vowel-only choir: 220 of 220 (100.0%)). Too short for a steady vowel before the coda, skipped: 743.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 73 of 73 (100.0%) |
| nasal | 37 of 39 (94.9%) |
| voiceless alv stop | 17 of 17 (100.0%) |
| tap | 14 of 14 (100.0%) |
| voiceless vel stop (cluster k s) | 7 of 8 (87.5%) |
| voiceless vel stop | 5 of 5 (100.0%) |
| nasal (cluster n s) | 2 of 2 (100.0%) |
| none | 1 of 1 (100.0%) |
| voiced lab stop | 1 of 1 (100.0%) |
| nasal (cluster n t) | 1 of 1 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 30 | 1 | 0 | 0 | 0 |
| fricative | 0 | 74 | 0 | 0 | 0 |
| nasal | 0 | 0 | 40 | 0 | 2 |
| tap | 0 | 0 | 0 | 14 | 0 |
| none | 0 | 0 | 0 | 0 | 1 |

Misses:

- dies-irae *tum* (then re), 242 ms: nasal read as none
- dies-irae *vix* (then ju), 242 ms: voiceless vel stop read as fricative s
- dies-irae *quam* (then re), 242 ms: nasal read as none

## D. Held out: ten Graduale pieces (every sixth file of corpus/gregobase-1908)

3400, 3406, 3412, 3418, 3424, 3430, 3437, 3444, 3450, 3456; same settings and rules as B. Chosen by file name before the second round's changes, and scored before and after them without its misses being read in between; scored again after the third round (README "Final consonants, third round"), when E below is the clean set.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3400 | 14 | 13 of 14 (92.9%) | 14 of 14 (100.0%) |
| gregobase-1908/3406 | 9 | 9 of 9 (100.0%) | 9 of 9 (100.0%) |
| gregobase-1908/3412 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3418 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3424 | 8 | 8 of 8 (100.0%) | 8 of 8 (100.0%) |
| gregobase-1908/3430 | 10 | 10 of 10 (100.0%) | 10 of 10 (100.0%) |
| gregobase-1908/3437 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3444 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3450 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3456 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| all | 70 | 69 of 70 (98.6%) | 70 of 70 (100.0%) |

By class alone: 69 of 70 (98.6%). Before a syllable that opens on a consonant: 14 of 14 (100.0%); before a vowel or a rest: 55 of 56 (98.2%). Syllables that close on their vowel: 179 of 179 (100.0%) read as no consonant (vowel-only choir: 179 of 179 (100.0%)). Too short for a steady vowel before the coda, skipped: 367.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 29 of 29 (100.0%) |
| nasal | 11 of 12 (91.7%) |
| voiceless alv stop | 12 of 12 (100.0%) |
| tap | 9 of 9 (100.0%) |
| voiceless vel stop (cluster k s) | 3 of 3 (100.0%) |
| voiced alv stop | 2 of 2 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |
| voiced lab stop | 1 of 1 (100.0%) |
| nasal (cluster n t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 18 | 0 | 0 | 0 | 0 |
| fricative | 0 | 30 | 0 | 0 | 0 |
| nasal | 0 | 0 | 12 | 0 | 1 |
| tap | 0 | 0 | 0 | 9 | 0 |

Misses:

- gregobase-1908/3400 *um*, 242 ms: nasal read as none

## E. Held out, second set: ten more Graduale pieces (every sixth file from the fourth)

3403, 3409, 3415, 3421, 3427, 3434, 3440, 3447, 3453, 3459; same settings and rules as B. Chosen by file name and scored before the third round's changes (README "Final consonants, third round"), then once after them; its misses were not read in between.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3403 | 9 | 9 of 9 (100.0%) | 9 of 9 (100.0%) |
| gregobase-1908/3409 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3415 | 12 | 9 of 12 (75.0%) | 12 of 12 (100.0%) |
| gregobase-1908/3421 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3427 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3434 | 19 | 19 of 19 (100.0%) | 19 of 19 (100.0%) |
| gregobase-1908/3440 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3447 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3453 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3459 | 15 | 15 of 15 (100.0%) | 15 of 15 (100.0%) |
| all | 86 | 83 of 86 (96.5%) | 86 of 86 (100.0%) |

By class alone: 83 of 86 (96.5%). Before a syllable that opens on a consonant: 32 of 32 (100.0%); before a vowel or a rest: 51 of 54 (94.4%). Syllables that close on their vowel: 190 of 190 (100.0%) read as no consonant (vowel-only choir: 190 of 190 (100.0%)). Too short for a steady vowel before the coda, skipped: 359.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 32 of 32 (100.0%) |
| nasal | 20 of 22 (90.9%) |
| voiceless alv stop | 13 of 13 (100.0%) |
| tap | 10 of 11 (90.9%) |
| nasal (cluster n t) | 3 of 3 (100.0%) |
| voiceless vel stop (cluster k s) | 3 of 3 (100.0%) |
| voiced lab stop | 1 of 1 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 17 | 0 | 0 | 0 | 0 |
| fricative | 0 | 33 | 0 | 0 | 0 |
| nasal | 0 | 0 | 23 | 0 | 2 |
| tap | 0 | 0 | 0 | 10 | 1 |

Misses:

- gregobase-1908/3415 *er,*, 242 ms: tap read as none
- gregobase-1908/3415 *lum*, 242 ms: nasal read as none
- gregobase-1908/3415 *tem:*, 242 ms: nasal read as none

## H. Held out, third set: twenty more Graduale pieces (files 1 and 4 of every six)

3401, 3404, 3407, 3410, 3413, 3416, 3419, 3422, 3425, 3428, 3432, 3435, 3438, 3442, 3445, 3448, 3451, 3454, 3457, 3460; same settings and rules as B. Chosen by file name and scored before the fifth round's changes (README "Final consonants, fifth round") with its misses hidden.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3401 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3404 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3407 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3410 | 10 | 10 of 10 (100.0%) | 10 of 10 (100.0%) |
| gregobase-1908/3413 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3416 | 13 | 12 of 13 (92.3%) | 13 of 13 (100.0%) |
| gregobase-1908/3419 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3422 | 10 | 10 of 10 (100.0%) | 10 of 10 (100.0%) |
| gregobase-1908/3425 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3428 | 11 | 10 of 11 (90.9%) | 11 of 11 (100.0%) |
| gregobase-1908/3432 | 1 | 0 of 1 (0.0%) | 1 of 1 (100.0%) |
| gregobase-1908/3435 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3438 | 13 | 13 of 13 (100.0%) | 13 of 13 (100.0%) |
| gregobase-1908/3442 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3445 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3448 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3451 | 13 | 12 of 13 (92.3%) | 13 of 13 (100.0%) |
| gregobase-1908/3454 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3457 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3460 | 4 | 3 of 4 (75.0%) | 4 of 4 (100.0%) |
| all | 134 | 129 of 134 (96.3%) | 134 of 134 (100.0%) |

By class alone: 129 of 134 (96.3%). Before a syllable that opens on a consonant: 34 of 35 (97.1%); before a vowel or a rest: 95 of 99 (96.0%). Syllables that close on their vowel: 227 of 227 (100.0%) read as no consonant (vowel-only choir: 227 of 227 (100.0%)). Too short for a steady vowel before the coda, skipped: 640.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| nasal | 43 of 46 (93.5%) |
| fricative s | 43 of 43 (100.0%) |
| voiceless alv stop | 22 of 22 (100.0%) |
| tap | 7 of 7 (100.0%) |
| voiceless vel stop (cluster k s) | 5 of 5 (100.0%) |
| nasal (cluster n t) | 3 of 3 (100.0%) |
| voiced lab stop | 3 of 3 (100.0%) |
| voiced alv stop | 0 of 2 (0.0%) |
| voiceless vel stop | 1 of 1 (100.0%) |
| nasal (cluster n s) | 1 of 1 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 31 | 1 | 0 | 0 | 1 |
| fricative | 0 | 44 | 0 | 0 | 0 |
| nasal | 0 | 0 | 47 | 0 | 3 |
| tap | 0 | 0 | 0 | 7 | 0 |

Misses:

- gregobase-1908/3416 *vid:*, 242 ms: voiced alv stop read as none
- gregobase-1908/3428 *gnum*, 242 ms: nasal read as none
- gregobase-1908/3432 *vid.*, 242 ms: voiced alv stop read as fricative voiced
- gregobase-1908/3451 *lum*, 242 ms: nasal read as none
- gregobase-1908/3460 *sum,* (then dén), 242 ms: nasal read as none

## I. Development set: the other twenty Graduale pieces (files 2 and 5 of every six)

3402, 3405, 3408, 3411, 3414, 3417, 3420, 3423, 3426, 3429, 3433, 3436, 3439, 3443, 3446, 3449, 3452, 3455, 3458, 3670; same settings and rules as B. Read for misses while tuning the fifth round (final r); not held out.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3402 | 11 | 11 of 11 (100.0%) | 11 of 11 (100.0%) |
| gregobase-1908/3405 | 11 | 11 of 11 (100.0%) | 11 of 11 (100.0%) |
| gregobase-1908/3408 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3411 | 9 | 9 of 9 (100.0%) | 9 of 9 (100.0%) |
| gregobase-1908/3414 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3417 | 18 | 18 of 18 (100.0%) | 18 of 18 (100.0%) |
| gregobase-1908/3420 | 8 | 8 of 8 (100.0%) | 8 of 8 (100.0%) |
| gregobase-1908/3423 | 1 | 1 of 1 (100.0%) | 1 of 1 (100.0%) |
| gregobase-1908/3426 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3429 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3433 | 14 | 14 of 14 (100.0%) | 14 of 14 (100.0%) |
| gregobase-1908/3436 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3439 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3443 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3446 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3449 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3452 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3455 | 4 | 3 of 4 (75.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3458 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3670 | 13 | 10 of 13 (76.9%) | 13 of 13 (100.0%) |
| all | 142 | 138 of 142 (97.2%) | 142 of 142 (100.0%) |

By class alone: 138 of 142 (97.2%). Before a syllable that opens on a consonant: 43 of 44 (97.7%); before a vowel or a rest: 95 of 98 (96.9%). Syllables that close on their vowel: 252 of 252 (100.0%) read as no consonant (vowel-only choir: 252 of 252 (100.0%)). Too short for a steady vowel before the coda, skipped: 596.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 55 of 55 (100.0%) |
| nasal | 32 of 36 (88.9%) |
| voiceless alv stop | 25 of 25 (100.0%) |
| tap | 9 of 9 (100.0%) |
| fricative s (cluster s t) | 6 of 6 (100.0%) |
| voiced lab stop | 3 of 3 (100.0%) |
| voiced alv stop | 3 of 3 (100.0%) |
| voiceless vel stop (cluster k s) | 3 of 3 (100.0%) |
| tap (cluster r k) | 1 of 1 (100.0%) |
| none | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 34 | 0 | 0 | 0 | 0 |
| fricative | 0 | 61 | 0 | 0 | 0 |
| nasal | 0 | 0 | 32 | 0 | 4 |
| tap | 0 | 0 | 0 | 10 | 0 |
| none | 0 | 0 | 0 | 0 | 1 |

Misses:

- gregobase-1908/3455 *in*, 242 ms: nasal read as none
- gregobase-1908/3670 *men* (then Ja), 242 ms: nasal read as none
- gregobase-1908/3670 *um*, 242 ms: nasal read as none
- gregobase-1908/3670 *men*, 242 ms: nasal read as none

## F. Final /l/ against the nasals: the 51 files of the other gregobase-1908-* folders

51 files, none scored by this check before (the scan-check sets); same settings and filters as B. Pre-registered in this script's header before its first run: the murmur's own tilt (readCoda `murmurTilt`, 28 dB) against the same reader without it.

| final consonant | read with the tilt rule | without it |
|---|---|---|
| /l/ (should read as none) | none 4 of 4 (100.0%), nasal 0 of 4 (0.0%) | none 3 of 4 (75.0%), nasal 1 of 4 (25.0%) |
| m, n, gn (should read as nasal) | 120 of 137 (87.6%) | 120 of 137 (87.6%) |

/l/ not read as none (with the rule):

- none

Nasals not read as nasal (with the rule):

- gregobase-1908-checked/3650 *num*: read as none
- gregobase-1908-checked/3912 *non*: read as none
- gregobase-1908-checked/3949 *lum*: read as none
- gregobase-1908-clef/3461 *rum:*: read as none
- gregobase-1908-clef/3551 *rum*: read as none
- gregobase-1908-clef/3679 *cum,*: read as none
- gregobase-1908-clef/3762 *sum*: read as none
- gregobase-1908-clef/3775 *sum*: read as none
- gregobase-1908-curl/3483 *trum*: read as none
- gregobase-1908-curl/3483 *lum*: read as none
- gregobase-1908-curl/3545 *um*: read as none
- gregobase-1908-curl/3545 *um*: read as none
- gregobase-1908-curl/3550 *sunt*: read as voiced alv stop
- gregobase-1908-curl/3704 *bum*: read as none
- gregobase-1908-stroke/3464 *runt*: read as none
- gregobase-1908-stroke/3481 *dum*: read as none
- gregobase-1908-stroke/3482 *plum*: read as none

## J. Cluster syllables (the set the eighth round's rule was tuned on)

Clusters: *unt*, *ant*, *ent*, *int*, *sunt*, *nunc*, *tunc*, *ens*, *mens*, *ans*, *ont*; others: *at*, *et*, *it*, *ut*, *ot*, *ost*, *ust*, *ad*, *ud*, *ab*, *ub*, *ac*, *uc*, *ap*, *up*, *as*, *us*, *os*, *es*, *ax*, *ux*, *um*, *am*, *un*, *em*, *a*, *u*, *o*. Quarter and eighth notes at 120 BPM, each followed by a rest, E2, A2, D3, G3, C4, E4.

| | with the cluster rule | without (`preObstruent: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 128 of 132 (97.0%) | 99 of 132 (75.0%) |
| other syllables read exactly | 306 of 336 (91.1%) | 306 of 336 (91.1%) |
| vowel-only control read as none | 453 of 468 (96.8%) | 453 of 468 (96.8%) |

Cluster misses with the rule:

- eighth 64 *sunt* read as voiceless alv stop
- eighth 64 *nunc* read as voiced lab stop
- eighth 64 *tunc* read as voiced lab stop
- eighth 64 *mens* read as voiced lab stop

## K. Held-out cluster syllables (ninth round, pre-registered)

Clusters: *fons*, *dens*, *pons*, *mons*, *gens*, *hinc*, *runt*, *bunt*, *tent*, *cant*, *frons*, *sanct*, *lunt*, *quent*; others: *ep*, *ip*, *op*, *ec*, *ic*, *oc*, *eb*, *ib*, *ob*, *ef*, *of*, *ot*, *ux*, *ix*, *ox*, *im*, *om*, *on*, *in*, *e*, *i*, *u*. Quarter and eighth notes at 104 BPM, each followed by a rest, B2, F3, A3, B3, D4.

| | with the obstruent gap | without (`againGap: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 131 of 140 (93.6%) | 125 of 140 (89.3%) |
| other syllables read exactly | 198 of 220 (90.0%) | 198 of 220 (90.0%) |
| other syllables read as a nasal | 7 | 7 |
| vowel-only control read as none | 343 of 360 (95.3%) | 343 of 360 (95.3%) |

Cluster misses with the rule:

- quarter 57 *lunt* read as voiceless alv stop
- eighth 47 *fons* read as none
- eighth 53 *fons* read as none
- eighth 57 *fons* read as none
- eighth 59 *fons* read as none
- eighth 62 *fons* read as none
- eighth 62 *pons* read as fricative s
- eighth 62 *hinc* read as voiceless vel stop
- eighth 62 *lunt* read as voiceless alv stop

Other and vowel-only misses with the rule (count over the ten pitch and length cells):

ip as voiceless vel stop 4; ep as voiceless vel stop 3; op as voiceless vel stop 3; ef as fricative s 3; ib as none 1; fons (vowel only) as nasal 1; pons (vowel only) as nasal 1; mons (vowel only) as nasal 1; frons (vowel only) as nasal 1; op (vowel only) as nasal 1; oc (vowel only) as nasal 1; ob (vowel only) as nasal 1; of (vowel only) as nasal 1; ot (vowel only) as nasal 1; ox (vowel only) as nasal 1; om (vowel only) as nasal 1; on (vowel only) as nasal 1; u as nasal 1; runt (vowel only) as nasal 1; bunt (vowel only) as nasal 1; lunt (vowel only) as nasal 1; ux (vowel only) as nasal 1; u (vowel only) as nasal 1; op as nasal 1; oc as nasal 1; ob as nasal 1; of as nasal 1; ix as tap 1; ox as nasal 1; ib as nasal 1

## L. Held out: syllables on /i/ (tenth round, pre-registered)

On /i/: *vis*, *sit*, *dic*, *nis*, *mil*, *vir*, *fid*, *bis*, *rit*, *tim*, *lin*, *qui*, *tri*, *pi*, *li*, *di*; voiced fricatives: *iz*, *az*, *ev*, *uv*; others: *das*, *nos*, *mel*, *per*, *sub*, *cum*, *tet*, *rec*, *pa*, *te*, *ro*, *lu*. Half and quarter notes at 96 BPM, each followed by a rest, G2, C3, D#3, G#3, C#4.

| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |
|---|---|---|
| syllables on /i/ read exactly | 153 of 160 (95.6%) | 110 of 160 (68.8%) |
| voiced-fricative codas read as one | 39 of 40 (97.5%) | 39 of 40 (97.5%) |
| other syllables read exactly | 113 of 120 (94.2%) | 113 of 120 (94.2%) |
| vowel-only control on /i/ read as none | 160 of 160 (100.0%) | 128 of 160 (80.0%) |
| vowel-only control, the rest, read as none | 160 of 160 (100.0%) | 158 of 160 (98.8%) |

Misses with the test (count over the ten pitch and length cells):

sub as none 3; vir as none 2; fid as fricative voiced 2; lu as nasal 2; cum as none 2; fid as none 1; uv as none 1; fid as voiceless alv stop 1; fid as nasal 1

## M. Out-of-sample check of the tenth round (a second session's /i/ set)

With /i/: *id*, *il*, *ir*, *if*, *ist*, *ins*, *li*, *di*, *ri*, *mi*; others: *ag*, *eg*, *og*, *ul*, *ol*, *ur*, *or*, *ed*, *od*, *uf*; synthetic z and v codas (none in the corpus): *iz*, *az*, *iv*, *ev*. Quarter and eighth notes at 96 BPM, each followed by a rest, G2, C3, E3, G#3, C#4, D#4.

| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |
|---|---|---|
| /i/ syllables read exactly | 105 of 120 (87.5%) | 62 of 120 (51.7%) |
| other syllables read exactly | 106 of 120 (88.3%) | 106 of 120 (88.3%) |
| z codas read as a voiced fricative | 24 of 24 (100.0%) | 24 of 24 (100.0%) |
| v codas read as a voiced fricative | 23 of 24 (95.8%) | 23 of 24 (95.8%) |
| vowel-only control read as none | 288 of 288 (100.0%) | 228 of 288 (79.2%) |
| vowel-only control read as a voiced fricative | 0 | 60 |

Misses with the rule (count over the twelve pitch and length cells):

if as fricative s 7; uf as fricative s 4; id as none 2; ed as nasal 2; ir as none 2; ur as none 2; id as nasal 1; ag as nasal 1; eg as nasal 1; og as nasal 1; od as nasal 1; id as fricative voiced 1; iv as none 1; ins as voiced lab stop 1; or as none 1; eg as none 1; il as nasal 1

## C. Closing consonants in the corpus

119 GABC files, 8085 sung syllables; 3026 of 8085 (37.4%) close on a consonant, 218 on a cluster. First phone: s 802, n 601, m 528, t 362, r 343, l 134, k 130, d 63, b 26, p 21, f 13, g 3.

