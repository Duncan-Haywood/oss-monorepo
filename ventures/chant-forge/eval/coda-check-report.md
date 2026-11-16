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
| E2 | 29 of 30 (96.7%) | 30 of 30 (100.0%) |
| A2 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |
| D3 | 29 of 30 (96.7%) | 30 of 30 (100.0%) |
| G3 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |
| C4 | 29 of 30 (96.7%) | 30 of 30 (100.0%) |
| E4 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |

All pitches: 177 of 180 (98.3%) read exactly (class, voicing, place); 178 of 180 (98.9%) by class alone. The vowel-only choir on the same syllables reads as no consonant 180 of 180 (100.0%).

Misses:

- E2 *ad* (voiced alv stop) read as nasal
- D3 *ap* (voiceless lab stop) read as nasal
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
| gregobase-1908/3416 | 13 | 13 of 13 (100.0%) | 13 of 13 (100.0%) |
| gregobase-1908/3419 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3422 | 10 | 10 of 10 (100.0%) | 10 of 10 (100.0%) |
| gregobase-1908/3425 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3428 | 11 | 10 of 11 (90.9%) | 11 of 11 (100.0%) |
| gregobase-1908/3432 | 1 | 1 of 1 (100.0%) | 1 of 1 (100.0%) |
| gregobase-1908/3435 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3438 | 13 | 13 of 13 (100.0%) | 13 of 13 (100.0%) |
| gregobase-1908/3442 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3445 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3448 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3451 | 13 | 12 of 13 (92.3%) | 13 of 13 (100.0%) |
| gregobase-1908/3454 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3457 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3460 | 4 | 3 of 4 (75.0%) | 4 of 4 (100.0%) |
| all | 134 | 131 of 134 (97.8%) | 134 of 134 (100.0%) |

By class alone: 131 of 134 (97.8%). Before a syllable that opens on a consonant: 34 of 35 (97.1%); before a vowel or a rest: 97 of 99 (98.0%). Syllables that close on their vowel: 227 of 227 (100.0%) read as no consonant (vowel-only choir: 227 of 227 (100.0%)). Too short for a steady vowel before the coda, skipped: 640.

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
| voiced alv stop | 2 of 2 (100.0%) |
| voiceless vel stop | 1 of 1 (100.0%) |
| nasal (cluster n s) | 1 of 1 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 33 | 0 | 0 | 0 | 0 |
| fricative | 0 | 44 | 0 | 0 | 0 |
| nasal | 0 | 0 | 47 | 0 | 3 |
| tap | 0 | 0 | 0 | 7 | 0 |

Misses:

- gregobase-1908/3428 *gnum*, 242 ms: nasal read as none
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

78 files, none scored by this check before (the scan-check sets); same settings and filters as B. Pre-registered in this script's header before its first run: the murmur's own tilt (readCoda `murmurTilt`, 28 dB) against the same reader without it.

| final consonant | read with the tilt rule | without it |
|---|---|---|
| /l/ (should read as none) | none 6 of 6 (100.0%), nasal 0 of 6 (0.0%) | none 5 of 6 (83.3%), nasal 1 of 6 (16.7%) |
| m, n, gn (should read as nasal) | 195 of 215 (90.7%) | 195 of 215 (90.7%) |

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
- gregobase-1908-hook/3502 *non*: read as none
- gregobase-1908-hook/3505 *rum*: read as none
- gregobase-1908-hook/3512 *rum*: read as none
- gregobase-1908-stroke/3464 *runt*: read as voiced alv stop
- gregobase-1908-stroke/3481 *dum*: read as none
- gregobase-1908-stroke/3482 *plum*: read as none

## J. Cluster syllables (the set the eighth round's rule was tuned on)

Clusters: *unt*, *ant*, *ent*, *int*, *sunt*, *nunc*, *tunc*, *ens*, *mens*, *ans*, *ont*; others: *at*, *et*, *it*, *ut*, *ot*, *ost*, *ust*, *ad*, *ud*, *ab*, *ub*, *ac*, *uc*, *ap*, *up*, *as*, *us*, *os*, *es*, *ax*, *ux*, *um*, *am*, *un*, *em*, *a*, *u*, *o*. Quarter and eighth notes at 120 BPM, each followed by a rest, E2, A2, D3, G3, C4, E4.

| | with the cluster rule | without (`preObstruent: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 128 of 132 (97.0%) | 99 of 132 (75.0%) |
| other syllables read exactly | 321 of 336 (95.5%) | 321 of 336 (95.5%) |
| vowel-only control read as none | 453 of 468 (96.8%) | 453 of 468 (96.8%) |

Cluster misses with the rule:

- eighth 64 *sunt* read as voiceless alv stop
- eighth 64 *nunc* read as voiced lab stop
- eighth 64 *tunc* read as voiced lab stop
- eighth 64 *mens* read as fricative s

## K. Held-out cluster syllables (ninth round, pre-registered)

Clusters: *fons*, *dens*, *pons*, *mons*, *gens*, *hinc*, *runt*, *bunt*, *tent*, *cant*, *frons*, *sanct*, *lunt*, *quent*; others: *ep*, *ip*, *op*, *ec*, *ic*, *oc*, *eb*, *ib*, *ob*, *ef*, *of*, *ot*, *ux*, *ix*, *ox*, *im*, *om*, *on*, *in*, *e*, *i*, *u*. Quarter and eighth notes at 104 BPM, each followed by a rest, B2, F3, A3, B3, D4.

| | with the obstruent gap | without (`againGap: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 132 of 140 (94.3%) | 126 of 140 (90.0%) |
| other syllables read exactly | 193 of 220 (87.7%) | 193 of 220 (87.7%) |
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
- eighth 62 *lunt* read as voiceless alv stop

Other and vowel-only misses with the rule (count over the ten pitch and length cells):

ip as voiceless vel stop 4; op as voiceless vel stop 4; ep as voiceless vel stop 3; ef as fricative s 3; ob as nasal 2; eb as voiced vel stop 1; ib as voiced vel stop 1; fons (vowel only) as nasal 1; pons (vowel only) as nasal 1; mons (vowel only) as nasal 1; frons (vowel only) as nasal 1; op (vowel only) as nasal 1; oc (vowel only) as nasal 1; ob (vowel only) as nasal 1; of (vowel only) as nasal 1; ot (vowel only) as nasal 1; ox (vowel only) as nasal 1; om (vowel only) as nasal 1; on (vowel only) as nasal 1; u as nasal 1; runt (vowel only) as nasal 1; bunt (vowel only) as nasal 1; lunt (vowel only) as nasal 1; ux (vowel only) as nasal 1; u (vowel only) as nasal 1; op as nasal 1; oc as nasal 1; eb as none 1; of as nasal 1; ix as tap 1; ox as nasal 1; ib as voiceless lab stop 1; ib as none 1

## L. Held out: syllables on /i/ (tenth round, pre-registered)

On /i/: *vis*, *sit*, *dic*, *nis*, *mil*, *vir*, *fid*, *bis*, *rit*, *tim*, *lin*, *qui*, *tri*, *pi*, *li*, *di*; voiced fricatives: *iz*, *az*, *ev*, *uv*; others: *das*, *nos*, *mel*, *per*, *sub*, *cum*, *tet*, *rec*, *pa*, *te*, *ro*, *lu*. Half and quarter notes at 96 BPM, each followed by a rest, G2, C3, D#3, G#3, C#4.

| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |
|---|---|---|
| syllables on /i/ read exactly | 158 of 160 (98.8%) | 115 of 160 (71.9%) |
| voiced-fricative codas read as one | 39 of 40 (97.5%) | 39 of 40 (97.5%) |
| other syllables read exactly | 114 of 120 (95.0%) | 114 of 120 (95.0%) |
| vowel-only control on /i/ read as none | 160 of 160 (100.0%) | 128 of 160 (80.0%) |
| vowel-only control, the rest, read as none | 160 of 160 (100.0%) | 158 of 160 (98.8%) |

Misses with the test (count over the ten pitch and length cells):

vir as none 2; lu as nasal 2; cum as none 2; uv as none 1; sub as voiced vel stop 1; sub as none 1

## M. Out-of-sample check of the tenth round (a second session's /i/ set)

With /i/: *id*, *il*, *ir*, *if*, *ist*, *ins*, *li*, *di*, *ri*, *mi*; others: *ag*, *eg*, *og*, *ul*, *ol*, *ur*, *or*, *ed*, *od*, *uf*; synthetic z and v codas (none in the corpus): *iz*, *az*, *iv*, *ev*. Quarter and eighth notes at 96 BPM, each followed by a rest, G2, C3, E3, G#3, C#4, D#4.

| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |
|---|---|---|
| /i/ syllables read exactly | 109 of 120 (90.8%) | 65 of 120 (54.2%) |
| other syllables read exactly | 109 of 120 (90.8%) | 109 of 120 (90.8%) |
| z codas read as a voiced fricative | 24 of 24 (100.0%) | 24 of 24 (100.0%) |
| v codas read as a voiced fricative | 23 of 24 (95.8%) | 23 of 24 (95.8%) |
| vowel-only control read as none | 288 of 288 (100.0%) | 228 of 288 (79.2%) |
| vowel-only control read as a voiced fricative | 0 | 60 |

Misses with the rule (count over the twelve pitch and length cells):

if as fricative s 7; uf as fricative s 4; og as voiced lab stop 2; ir as none 2; ur as none 2; ag as voiced lab stop 1; iv as none 1; ins as voiced lab stop 1; or as none 1; il as nasal 1; og as nasal 1

## N. Deep murmurs (eleventh round; held out for the first registration, a development set for the second)

Clusters: *dant*, *lent*, *sint*, *gunt*, *hunc*, *rens*, *tens*, *fans*, *font*, *vint*; others: *nab*, *ped*, *lud*, *gab*, *rud*, *tob*, *vig*, *cod*, *pet*, *lac*, *sup*, *rot*, *tac*, *dum*, *ven*, *nam*, *pes*, *vos*, *ma*, *ne*. Quarter and eighth notes at 108 BPM, each followed by a rest, F#2, C#3, F#3, A#3, D#4, E4.

| | with the deep-murmur rule | without (`deepMurmur: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 118 of 120 (98.3%) | 115 of 120 (95.8%) |
| of them, eighth notes on D#4 and E4 | 20 of 20 (100.0%) | 20 of 20 (100.0%) |
| other syllables read exactly | 220 of 240 (91.7%) | 220 of 240 (91.7%) |
| voiced stops read as a nasal | 6 | 6 |
| vowel-only control read as none | 360 of 360 (100.0%) | 360 of 360 (100.0%) |

Misses with the rule (count over the twelve pitch and length cells):

tob as none 3; dum as none 3; nab as nasal 2; gab as nasal 2; tob as nasal 2; nab as none 2; gab as none 2; sup as voiceless vel stop 1; hunc as voiceless vel stop 1; vint as voiceless alv stop 1; vig as none 1; vig as voiced lab stop 1; vig as fricative f 1

## O. Held-out deep murmurs, second registration (eleventh round)

Clusters: *mant*, *rint*, *bant*, *tunt*, *vens*, *pens*, *lans*, *ment*, *punc*, *sons*; others: *mad*, *red*, *bod*, *dig*, *lab*, *nod*, *tud*, *reg*, *mat*, *bec*, *rap*, *nit*, *doc*, *lum*, *men*, *tam*, *mos*, *nes*, *so*, *fe*. Quarter and eighth notes at 126 BPM, each followed by a rest, F2, E3, A3, D4, D#4, E4.

| | with the deep-murmur rule | without (`deepMurmur: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 116 of 120 (96.7%) | 114 of 120 (95.0%) |
| of them, eighth notes on D4, D#4 and E4 | 28 of 30 (93.3%) | 28 of 30 (93.3%) |
| other syllables read exactly | 222 of 240 (92.5%) | 223 of 240 (92.9%) |
| voiced stops read as a nasal | 4 | 3 |
| vowel-only control read as none | 356 of 360 (98.9%) | 356 of 360 (98.9%) |

Misses with the rule (count over the twelve pitch and length cells):

lum as none 5; tud as voiceless alv stop 2; lab as nasal 2; so as nasal 2; mad as nasal 1; ment as voiceless alv stop 1; dig as voiceless vel stop 1; dig as voiced lab stop 1; punc as voiceless vel stop 1; dig as nasal 1; lab as voiced vel stop 1; rint as fricative f 1; sons as fricative s 1; tunt (vowel only) as nasal 1; punc (vowel only) as nasal 1; tud (vowel only) as nasal 1; lum (vowel only) as nasal 1; nod as none 1; lab as none 1

## P. Held out: murmurs louder than the dip before them (twelfth round)

Clusters: *cent*, *pint*, *dons*, *tans*, *munt*, *lint*, *sanc*, *genc*, *rons*, *fent*; others: *sad*, *ted*, *rob*, *lig*, *dub*, *mag*, *vid*, *nug*, *pat*, *fec*, *tip*, *lot*, *duc*, *sum*, *ten*, *gam*, *las*, *dos*, *me*, *tu*. Pulse-4 and pulse-2 notes (two pulses a beat) at 116 BPM, each followed by a rest, G2, D3, G#3, C#4, D4, F4.

| | the reader (PRE.hi 12) | `preOpts: { hi: 4 }` (before) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 114 of 120 (95.0%) | 113 of 120 (94.2%) |
| of them, pulse-2 notes on C#4, D4 and F4 | 28 of 30 (93.3%) | 28 of 30 (93.3%) |
| other syllables read exactly | 214 of 240 (89.2%) | 214 of 240 (89.2%) |
| voiced stops read as a nasal | 7 | 7 |
| vowel-only control read as none | 360 of 360 (100.0%) | 360 of 360 (100.0%) |

Misses (count over the twelve pitch and length cells):

sum as none 4; rob as none 4; sad as nasal 2; mag as nasal 2; munt as voiceless alv stop 2; dub as none 2; mag as none 2; rob as nasal 2; sanc as voiceless vel stop 1; tans as fricative f 1; fent as voiceless alv stop 1; ted as nasal 1; lint as voiceless alv stop 1; sad as none 1; lig as fricative f 1; tip as voiceless vel stop 1; lot as fricative f 1; lig as voiced lab stop 1; vid as none 1; las as fricative f 1

## Q. Held out: voice bars at one level (thirteenth round)

Voiced stops: *tub*, *mab*, *cib*, *reb*, *sed*, *quod*, *pud*, *lod*, *ug*, *fug*, *sub*, *ad*; others: *pot*, *lec*, *sap*, *rum*, *nem*, *fel*, *hic*, *ra*. Pulse-4 and pulse-2 notes at 100 BPM, each followed by a rest, A2, F3, A#3, C4, D#4.

| | voice bar VOICE_BAR_DB under the vowel | fixed gain (`--voice-bar off`) |
|---|---|---|
| voiced-stop codas read exactly | 106 of 120 (88.3%) | 102 of 120 (85.0%) |
| voiced-stop codas read as nothing | 6 | 4 |
| other syllables read exactly | 75 of 80 (93.8%) | 75 of 80 (93.8%) |
| vowel-only control read as none | 200 of 200 (100.0%) | 200 of 200 (100.0%) |

Misses (count over the ten pitch and length cells):

rum as none 4; mab as nasal 2; tub as none 1; tub as voiceless lab stop 1; ug as voiceless vel stop 1; pud as voiceless alv stop 1; sub as voiceless lab stop 1; sap as voiceless vel stop 1; quod as none 1; lod as none 1; reb as none 1; ad as nasal 1; quod as nasal 1; cib as none 1; sub as none 1

## R. Held out: closures against the vowel before them (fourteenth round)

Voiced stops: *rog*, *sib*, *teg*, *vad*, *pug*, *hob*, *ned*, *dib*, *meg*, *nob*; nasals: *sen*, *pin*, *gem*, *don*; others: *fac*, *mox*, *dit*, *sat*, *vel*, *tus*. Pulse-4 and pulse-2 notes at 112 BPM, each followed by a rest, A#2, G3, C#4, D4, E4, F4.

| | the reader (localRef) | `localRef: false` (before) | voice bar wall on |
|---|---|---|---|
| voiced-stop codas read exactly | 103 of 120 (85.8%) | 99 of 120 (82.5%) | 103 of 120 (85.8%) |
| voiced-stop codas read as nothing | 8 | 12 | 3 |
| voiced-stop codas read as a nasal | 7 | 7 | 13 |
| nasal codas read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| other syllables read exactly | 72 of 72 (100.0%) | 72 of 72 (100.0%) | 72 of 72 (100.0%) |
| vowel-only control read as none | 238 of 240 (99.2%) | 238 of 240 (99.2%) | 238 of 240 (99.2%) |

Misses with the reader (count over the twelve pitch and length cells):

nob as nasal 3; rog as nasal 2; hob as nasal 2; dib as none 2; sib as none 2; sib as voiceless lab stop 1; vad as fricative voiced 1; hob as none 1; nob as none 1; pug as none 1; vad as none 1; pug (vowel only) as nasal 1; tus (vowel only) as nasal 1

## S. Held out: the parallel rule's own set (fifteenth round)

Voiced stops: *beb*, *dib*, *gid*, *neg*, *mig*, *sab*, *feb*, *lid*, *ved*, *rag*, *heb*, *pug*; others: *dit*, *pec*, *lip*, *sut*, *min*, *fem*, *bas*, *fus*, *sent*, *punt*, *nom*, *vi*, *do*. Pulse-4 and pulse-2 notes at 112 BPM, each followed by a rest, G#2, A#2, E3, C4, F4.

| | default (`localRef`) | last vowel-like frames (`closeAnchor`) | reference only |
|---|---|---|---|
| voiced-stop codas read exactly | 108 of 120 (90.0%) | 108 of 120 (90.0%) | 101 of 120 (84.2%) |
| other syllables read exactly | 127 of 130 (97.7%) | 128 of 130 (98.5%) | 128 of 130 (98.5%) |
| vowel-only control read as none | 246 of 250 (98.4%) | 246 of 250 (98.4%) | 246 of 250 (98.4%) |
| other syllables read as a stop where none is written | 1 | 1 | 1 |

Misses with the default (count over the ten pitch and length cells):

dib as none 2; feb as voiceless lab stop 2; lid as voiced lab stop 1; rag as nasal 1; dib as voiceless lab stop 1; gid as voiceless alv stop 1; mig as fricative f 1; lid as none 1; rag as none 1; lip as tap 1; bas as fricative f 1; sent as voiceless alv stop 1; sab as none 1; pug (vowel only) as nasal 1; sut (vowel only) as nasal 1; fus (vowel only) as nasal 1; punt (vowel only) as nasal 1

## T. Held out: closeAnchor with the wall in codas (sixteenth round)

Voiced stops: *lub*, *tag*, *pob*, *sug*, *cad*, *mub*, *fod*, *rib*, *vob*, *tid*, *hag*, *peg*; nasals: *fun*, *ram*, *lim*, *ben*; others: *lut*, *mic*, *hep*, *gos*, *rax*, *lunc*, *hel*, *fa*. Pulse-4 and pulse-2 notes at 118 BPM, each followed by a rest, B2, F#3, B3, D4, D#4, E4.

| | default (`localRef`, no wall) | `closeAnchor` | coda wall | `closeAnchor` + coda wall |
|---|---|---|---|---|
| voiced-stop codas read exactly | 122 of 144 (84.7%) | 124 of 144 (86.1%) | 120 of 144 (83.3%) | 121 of 144 (84.0%) |
| voiced-stop codas read as nothing | 8 | 7 | 9 | 6 |
| voiced-stop codas read as a nasal | 11 | 9 | 13 | 14 |
| nasal codas read exactly | 45 of 48 (93.8%) | 45 of 48 (93.8%) | 45 of 48 (93.8%) | 45 of 48 (93.8%) |
| other syllables read exactly | 93 of 96 (96.9%) | 93 of 96 (96.9%) | 93 of 96 (96.9%) | 93 of 96 (96.9%) |
| vowel-only control read as none | 284 of 288 (98.6%) | 284 of 288 (98.6%) | 284 of 288 (98.6%) | 284 of 288 (98.6%) |

Misses with the default (count over the twelve pitch and length cells):

tag as nasal 3; pob as nasal 3; lub as none 2; fun as none 2; lunc as voiceless vel stop 2; hag as nasal 2; vob as nasal 2; fa as voiced lab stop 1; hag as voiced lab stop 1; mub as none 1; pob (vowel only) as nasal 1; fod (vowel only) as nasal 1; vob (vowel only) as nasal 1; gos (vowel only) as nasal 1; lim as none 1; sug as none 1; rib as none 1; hag as none 1; tag as voiceless vel stop 1; pob as none 1; cad as nasal 1; fod as none 1; tid as voiceless alv stop 1

Misses with `closeAnchor` + coda wall:

hag as nasal 4; vob as nasal 3; tag as nasal 3; rib as none 3; mub as none 2; lub as nasal 2; pob as nasal 2; fun as none 2; lunc as voiceless vel stop 2; fa as voiced lab stop 1; pob (vowel only) as nasal 1; fod (vowel only) as nasal 1; vob (vowel only) as nasal 1; gos (vowel only) as nasal 1; lim as none 1; vob as none 1; hag as voiced lab stop 1; tag as voiceless vel stop 1; tid as fricative f 1

## U. Held out: a voice bar read as a murmur (seventeenth round)

Voiced stops: *dag*, *bob*, *mod*, *sig*, *lag*, *tib*, *ceb*, *nud*, *hod*, *fig*, *gub*, *pid*; nasals: *bam*, *sun*, *tem*, *hon*; n-clusters: *dent*, *hens*, *sonc*, *tint*; others: *dut*, *sic*, *gep*, *bos*, *lex*, *bel*, *mo*, *vit*. Pulse-4 and pulse-2 notes at 110 BPM, each followed by a rest, A2, D3, G#3, A#3, C#4, D#4.

| | default | `barLead: 8` |
|---|---|---|
| voiced-stop codas read exactly | 127 of 144 (88.2%) | 128 of 144 (88.9%) |
| voiced-stop codas read as nothing | 5 | 5 |
| voiced-stop codas read as a nasal | 6 | 4 |
| nasal codas read exactly | 46 of 48 (95.8%) | 46 of 48 (95.8%) |
| n-cluster codas read as a nasal | 46 of 48 (95.8%) | 46 of 48 (95.8%) |
| other syllables read exactly | 93 of 96 (96.9%) | 93 of 96 (96.9%) |
| vowel-only control read as none | 332 of 336 (98.8%) | 332 of 336 (98.8%) |

Misses with the default (count over the twelve pitch and length cells):

bob as nasal 3; gub as none 3; gep as voiceless vel stop 2; lag as voiced lab stop 2; bob as none 2; lag as nasal 2; sun as none 2; nud (vowel only) as voiced lab stop 1; gub (vowel only) as voiced lab stop 1; sun (vowel only) as voiced lab stop 1; dut (vowel only) as voiced lab stop 1; pid as voiceless alv stop 1; bel as nasal 1; tib as voiceless lab stop 1; nud as voiceless alv stop 1; dent as voiceless alv stop 1; sonc as voiced lab stop 1; dag as nasal 1; lag as voiceless vel stop 1

Misses with `barLead: 8`:

bob as nasal 3; gub as none 3; gep as voiceless vel stop 2; lag as voiced lab stop 2; bob as none 2; sun as none 2; nud (vowel only) as voiced lab stop 1; gub (vowel only) as voiced lab stop 1; sun (vowel only) as voiced lab stop 1; dut (vowel only) as voiced lab stop 1; pid as voiceless alv stop 1; bel as nasal 1; tib as voiceless lab stop 1; nud as voiceless alv stop 1; lag as nasal 1; dent as voiceless alv stop 1; sonc as voiced lab stop 1; dag as voiced lab stop 1; lag as voiceless vel stop 1

## C. Closing consonants in the corpus

146 GABC files, 9903 sung syllables; 3634 of 9903 (36.7%) close on a consonant, 266 on a cluster. First phone: s 938, n 720, m 649, t 448, r 420, l 168, k 145, d 75, b 28, p 25, f 15, g 3.

