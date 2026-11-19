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
| E2 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |
| A2 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |
| D3 | 29 of 30 (96.7%) | 30 of 30 (100.0%) |
| G3 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |
| C4 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |
| E4 | 30 of 30 (100.0%) | 30 of 30 (100.0%) |

All pitches: 179 of 180 (99.4%) read exactly (class, voicing, place); 179 of 180 (99.4%) by class alone. The vowel-only choir on the same syllables reads as no consonant 180 of 180 (100.0%).

Misses:

- D3 *ap* (voiceless lab stop) read as nasal

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
| gregobase-1908/3400 | 14 | 14 of 14 (100.0%) | 14 of 14 (100.0%) |
| gregobase-1908/3406 | 9 | 9 of 9 (100.0%) | 9 of 9 (100.0%) |
| gregobase-1908/3412 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3418 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3424 | 8 | 8 of 8 (100.0%) | 8 of 8 (100.0%) |
| gregobase-1908/3430 | 10 | 10 of 10 (100.0%) | 10 of 10 (100.0%) |
| gregobase-1908/3437 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3444 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3450 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3456 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| all | 70 | 70 of 70 (100.0%) | 70 of 70 (100.0%) |

By class alone: 70 of 70 (100.0%). Before a syllable that opens on a consonant: 14 of 14 (100.0%); before a vowel or a rest: 56 of 56 (100.0%). Syllables that close on their vowel: 179 of 179 (100.0%) read as no consonant (vowel-only choir: 179 of 179 (100.0%)). Too short for a steady vowel before the coda, skipped: 367.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 29 of 29 (100.0%) |
| nasal | 12 of 12 (100.0%) |
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
| nasal | 0 | 0 | 13 | 0 | 0 |
| tap | 0 | 0 | 0 | 9 | 0 |

Misses:


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
| gregobase-1908/3438 | 13 | 12 of 13 (92.3%) | 13 of 13 (100.0%) |
| gregobase-1908/3442 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3445 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3448 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3451 | 13 | 12 of 13 (92.3%) | 13 of 13 (100.0%) |
| gregobase-1908/3454 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3457 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3460 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| all | 134 | 131 of 134 (97.8%) | 134 of 134 (100.0%) |

By class alone: 132 of 134 (98.5%). Before a syllable that opens on a consonant: 35 of 35 (100.0%); before a vowel or a rest: 96 of 99 (97.0%). Syllables that close on their vowel: 227 of 227 (100.0%) read as no consonant (vowel-only choir: 227 of 227 (100.0%)). Too short for a steady vowel before the coda, skipped: 640.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| nasal | 44 of 46 (95.7%) |
| fricative s | 43 of 43 (100.0%) |
| voiceless alv stop | 22 of 22 (100.0%) |
| tap | 7 of 7 (100.0%) |
| voiceless vel stop (cluster k s) | 5 of 5 (100.0%) |
| nasal (cluster n t) | 3 of 3 (100.0%) |
| voiced lab stop | 2 of 3 (66.7%) |
| voiced alv stop | 2 of 2 (100.0%) |
| voiceless vel stop | 1 of 1 (100.0%) |
| nasal (cluster n s) | 1 of 1 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 33 | 0 | 0 | 0 | 0 |
| fricative | 0 | 44 | 0 | 0 | 0 |
| nasal | 0 | 0 | 48 | 0 | 2 |
| tap | 0 | 0 | 0 | 7 | 0 |

Misses:

- gregobase-1908/3428 *gnum*, 242 ms: nasal read as none
- gregobase-1908/3438 *ab*, 242 ms: voiced lab stop read as voiced vel stop
- gregobase-1908/3451 *lum*, 242 ms: nasal read as none

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
| gregobase-1908/3455 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3458 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3670 | 13 | 11 of 13 (84.6%) | 13 of 13 (100.0%) |
| all | 142 | 140 of 142 (98.6%) | 142 of 142 (100.0%) |

By class alone: 140 of 142 (98.6%). Before a syllable that opens on a consonant: 43 of 44 (97.7%); before a vowel or a rest: 97 of 98 (99.0%). Syllables that close on their vowel: 252 of 252 (100.0%) read as no consonant (vowel-only choir: 252 of 252 (100.0%)). Too short for a steady vowel before the coda, skipped: 596.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 55 of 55 (100.0%) |
| nasal | 34 of 36 (94.4%) |
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
| nasal | 0 | 0 | 34 | 0 | 2 |
| tap | 0 | 0 | 0 | 10 | 0 |
| none | 0 | 0 | 0 | 0 | 1 |

Misses:

- gregobase-1908/3670 *men* (then Ja), 242 ms: nasal read as none
- gregobase-1908/3670 *men*, 242 ms: nasal read as none

## F. Final /l/ against the nasals: the 51 files of the other gregobase-1908-* folders

79 files, none scored by this check before (the scan-check sets); same settings and filters as B. Pre-registered in this script's header before its first run: the murmur's own tilt (readCoda `murmurTilt`, 28 dB) against the same reader without it.

| final consonant | read with the tilt rule | without it |
|---|---|---|
| /l/ (should read as none) | none 6 of 6 (100.0%), nasal 0 of 6 (0.0%) | none 5 of 6 (83.3%), nasal 1 of 6 (16.7%) |
| m, n, gn (should read as nasal) | 209 of 218 (95.9%) | 209 of 218 (95.9%) |

/l/ not read as none (with the rule):

- none

Nasals not read as nasal (with the rule):

- gregobase-1908-checked/3912 *non*: read as none
- gregobase-1908-clef/3461 *rum:*: read as none
- gregobase-1908-clef/3551 *rum*: read as none
- gregobase-1908-curl/3550 *sunt*: read as voiced alv stop
- gregobase-1908-hook/3492 *tam,*: read as voiced lab stop
- gregobase-1908-hook/3502 *non*: read as none
- gregobase-1908-hook/3505 *rum*: read as none
- gregobase-1908-stroke/3464 *runt*: read as voiced alv stop
- gregobase-1908-stroke/3482 *plum*: read as none

## J. Cluster syllables (the set the eighth round's rule was tuned on)

Clusters: *unt*, *ant*, *ent*, *int*, *sunt*, *nunc*, *tunc*, *ens*, *mens*, *ans*, *ont*; others: *at*, *et*, *it*, *ut*, *ot*, *ost*, *ust*, *ad*, *ud*, *ab*, *ub*, *ac*, *uc*, *ap*, *up*, *as*, *us*, *os*, *es*, *ax*, *ux*, *um*, *am*, *un*, *em*, *a*, *u*, *o*. Quarter and eighth notes at 120 BPM, each followed by a rest, E2, A2, D3, G3, C4, E4.

| | with the cluster rule | without (`preObstruent: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 128 of 132 (97.0%) | 113 of 132 (85.6%) |
| other syllables read exactly | 332 of 336 (98.8%) | 332 of 336 (98.8%) |
| vowel-only control read as none | 453 of 468 (96.8%) | 453 of 468 (96.8%) |

Cluster misses with the rule:

- eighth 64 *sunt* read as voiceless alv stop
- eighth 64 *nunc* read as voiced lab stop
- eighth 64 *tunc* read as voiced lab stop
- eighth 64 *mens* read as voiced alv stop

## K. Held-out cluster syllables (ninth round, pre-registered)

Clusters: *fons*, *dens*, *pons*, *mons*, *gens*, *hinc*, *runt*, *bunt*, *tent*, *cant*, *frons*, *sanct*, *lunt*, *quent*; others: *ep*, *ip*, *op*, *ec*, *ic*, *oc*, *eb*, *ib*, *ob*, *ef*, *of*, *ot*, *ux*, *ix*, *ox*, *im*, *om*, *on*, *in*, *e*, *i*, *u*. Quarter and eighth notes at 104 BPM, each followed by a rest, B2, F3, A3, B3, D4.

| | with the obstruent gap | without (`againGap: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 133 of 140 (95.0%) | 126 of 140 (90.0%) |
| other syllables read exactly | 208 of 220 (94.5%) | 208 of 220 (94.5%) |
| other syllables read as a nasal | 5 | 5 |
| vowel-only control read as none | 343 of 360 (95.3%) | 343 of 360 (95.3%) |

Cluster misses with the rule:

- eighth 47 *fons* read as none
- eighth 53 *fons* read as none
- eighth 57 *fons* read as none
- eighth 59 *fons* read as none
- eighth 62 *fons* read as none
- eighth 62 *pons* read as fricative s
- eighth 62 *lunt* read as voiceless alv stop

Other and vowel-only misses with the rule (count over the ten pitch and length cells):

ef as fricative s 3; eb as voiced vel stop 1; ib as voiced vel stop 1; fons (vowel only) as nasal 1; pons (vowel only) as nasal 1; mons (vowel only) as nasal 1; frons (vowel only) as nasal 1; op (vowel only) as nasal 1; oc (vowel only) as nasal 1; ob (vowel only) as nasal 1; of (vowel only) as nasal 1; ot (vowel only) as nasal 1; ox (vowel only) as nasal 1; om (vowel only) as nasal 1; on (vowel only) as nasal 1; u as nasal 1; runt (vowel only) as nasal 1; bunt (vowel only) as nasal 1; lunt (vowel only) as nasal 1; ux (vowel only) as nasal 1; u (vowel only) as nasal 1; op as nasal 1; oc as nasal 1; of as nasal 1; ix as tap 1; ox as nasal 1; ib as voiceless lab stop 1

## L. Held out: syllables on /i/ (tenth round, pre-registered)

On /i/: *vis*, *sit*, *dic*, *nis*, *mil*, *vir*, *fid*, *bis*, *rit*, *tim*, *lin*, *qui*, *tri*, *pi*, *li*, *di*; voiced fricatives: *iz*, *az*, *ev*, *uv*; others: *das*, *nos*, *mel*, *per*, *sub*, *cum*, *tet*, *rec*, *pa*, *te*, *ro*, *lu*. Half and quarter notes at 96 BPM, each followed by a rest, G2, C3, D#3, G#3, C#4.

| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |
|---|---|---|
| syllables on /i/ read exactly | 158 of 160 (98.8%) | 115 of 160 (71.9%) |
| voiced-fricative codas read as one | 39 of 40 (97.5%) | 39 of 40 (97.5%) |
| other syllables read exactly | 117 of 120 (97.5%) | 117 of 120 (97.5%) |
| vowel-only control on /i/ read as none | 160 of 160 (100.0%) | 128 of 160 (80.0%) |
| vowel-only control, the rest, read as none | 160 of 160 (100.0%) | 158 of 160 (98.8%) |

Misses with the test (count over the ten pitch and length cells):

vir as none 2; lu as nasal 2; uv as none 1; cum as none 1

## M. Out-of-sample check of the tenth round (a second session's /i/ set)

With /i/: *id*, *il*, *ir*, *if*, *ist*, *ins*, *li*, *di*, *ri*, *mi*; others: *ag*, *eg*, *og*, *ul*, *ol*, *ur*, *or*, *ed*, *od*, *uf*; synthetic z and v codas (none in the corpus): *iz*, *az*, *iv*, *ev*. Quarter and eighth notes at 96 BPM, each followed by a rest, G2, C3, E3, G#3, C#4, D#4.

| | with the noise-above-5-kHz test | without (`vfricHi5: false`) |
|---|---|---|
| /i/ syllables read exactly | 109 of 120 (90.8%) | 65 of 120 (54.2%) |
| other syllables read exactly | 110 of 120 (91.7%) | 110 of 120 (91.7%) |
| z codas read as a voiced fricative | 24 of 24 (100.0%) | 24 of 24 (100.0%) |
| v codas read as a voiced fricative | 23 of 24 (95.8%) | 23 of 24 (95.8%) |
| vowel-only control read as none | 288 of 288 (100.0%) | 228 of 288 (79.2%) |
| vowel-only control read as a voiced fricative | 0 | 60 |

Misses with the rule (count over the twelve pitch and length cells):

if as fricative s 7; uf as fricative s 4; og as voiced lab stop 2; ir as none 2; ur as none 2; ag as voiced lab stop 1; iv as none 1; ins as voiced lab stop 1; or as none 1; il as nasal 1

## N. Deep murmurs (eleventh round; held out for the first registration, a development set for the second)

Clusters: *dant*, *lent*, *sint*, *gunt*, *hunc*, *rens*, *tens*, *fans*, *font*, *vint*; others: *nab*, *ped*, *lud*, *gab*, *rud*, *tob*, *vig*, *cod*, *pet*, *lac*, *sup*, *rot*, *tac*, *dum*, *ven*, *nam*, *pes*, *vos*, *ma*, *ne*. Quarter and eighth notes at 108 BPM, each followed by a rest, F#2, C#3, F#3, A#3, D#4, E4.

| | with the deep-murmur rule | without (`deepMurmur: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 118 of 120 (98.3%) | 115 of 120 (95.8%) |
| of them, eighth notes on D#4 and E4 | 20 of 20 (100.0%) | 20 of 20 (100.0%) |
| other syllables read exactly | 231 of 240 (96.3%) | 231 of 240 (96.3%) |
| voiced stops read as a nasal | 3 | 3 |
| vowel-only control read as none | 360 of 360 (100.0%) | 360 of 360 (100.0%) |

Misses with the rule (count over the twelve pitch and length cells):

dum as none 2; nab as nasal 1; gab as nasal 1; tob as nasal 1; hunc as voiceless vel stop 1; vint as voiceless alv stop 1; vig as none 1; tob as voiceless lab stop 1; vig as voiced lab stop 1; vig as fricative f 1

## O. Held-out deep murmurs, second registration (eleventh round)

Clusters: *mant*, *rint*, *bant*, *tunt*, *vens*, *pens*, *lans*, *ment*, *punc*, *sons*; others: *mad*, *red*, *bod*, *dig*, *lab*, *nod*, *tud*, *reg*, *mat*, *bec*, *rap*, *nit*, *doc*, *lum*, *men*, *tam*, *mos*, *nes*, *so*, *fe*. Quarter and eighth notes at 126 BPM, each followed by a rest, F2, E3, A3, D4, D#4, E4.

| | with the deep-murmur rule | without (`deepMurmur: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 116 of 120 (96.7%) | 115 of 120 (95.8%) |
| of them, eighth notes on D4, D#4 and E4 | 28 of 30 (93.3%) | 28 of 30 (93.3%) |
| other syllables read exactly | 227 of 240 (94.6%) | 228 of 240 (95.0%) |
| voiced stops read as a nasal | 1 | 0 |
| vowel-only control read as none | 356 of 360 (98.9%) | 356 of 360 (98.9%) |

Misses with the rule (count over the twelve pitch and length cells):

lum as none 4; tud as voiceless alv stop 2; so as nasal 2; ment as voiceless alv stop 1; dig as voiceless vel stop 1; dig as voiced lab stop 1; punc as voiceless vel stop 1; dig as nasal 1; lab as voiced vel stop 1; rint as voiced alv stop 1; sons as fricative s 1; tunt (vowel only) as nasal 1; punc (vowel only) as nasal 1; tud (vowel only) as nasal 1; lum (vowel only) as nasal 1; nod as none 1

## P. Held out: murmurs louder than the dip before them (twelfth round)

Clusters: *cent*, *pint*, *dons*, *tans*, *munt*, *lint*, *sanc*, *genc*, *rons*, *fent*; others: *sad*, *ted*, *rob*, *lig*, *dub*, *mag*, *vid*, *nug*, *pat*, *fec*, *tip*, *lot*, *duc*, *sum*, *ten*, *gam*, *las*, *dos*, *me*, *tu*. Pulse-4 and pulse-2 notes (two pulses a beat) at 116 BPM, each followed by a rest, G2, D3, G#3, C#4, D4, F4.

| | the reader (PRE.hi 12) | `preOpts: { hi: 4 }` (before) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 114 of 120 (95.0%) | 113 of 120 (94.2%) |
| of them, pulse-2 notes on C#4, D4 and F4 | 28 of 30 (93.3%) | 28 of 30 (93.3%) |
| other syllables read exactly | 233 of 240 (97.1%) | 233 of 240 (97.1%) |
| voiced stops read as a nasal | 0 | 0 |
| vowel-only control read as none | 360 of 360 (100.0%) | 360 of 360 (100.0%) |

Misses (count over the twelve pitch and length cells):

sum as none 3; munt as voiceless alv stop 2; mag as voiced lab stop 2; sanc as voiceless vel stop 1; tans as fricative f 1; fent as voiceless alv stop 1; lint as voiceless alv stop 1; lig as voiced lab stop 1; las as fricative f 1

## Q. Held out: voice bars at one level (thirteenth round)

Voiced stops: *tub*, *mab*, *cib*, *reb*, *sed*, *quod*, *pud*, *lod*, *ug*, *fug*, *sub*, *ad*; others: *pot*, *lec*, *sap*, *rum*, *nem*, *fel*, *hic*, *ra*. Pulse-4 and pulse-2 notes at 100 BPM, each followed by a rest, A2, F3, A#3, C4, D#4.

| | voice bar VOICE_BAR_DB under the vowel | fixed gain (`--voice-bar off`) |
|---|---|---|
| voiced-stop codas read exactly | 113 of 120 (94.2%) | 107 of 120 (89.2%) |
| voiced-stop codas read as nothing | 2 | 2 |
| other syllables read exactly | 77 of 80 (96.3%) | 77 of 80 (96.3%) |
| vowel-only control read as none | 200 of 200 (100.0%) | 200 of 200 (100.0%) |

Misses (count over the ten pitch and length cells):

rum as none 3; tub as voiceless lab stop 1; ug as voiceless vel stop 1; pud as voiceless alv stop 1; sub as voiceless lab stop 1; quod as none 1; lod as none 1; quod as nasal 1

## R. Held out: closures against the vowel before them (fourteenth round)

Voiced stops: *rog*, *sib*, *teg*, *vad*, *pug*, *hob*, *ned*, *dib*, *meg*, *nob*; nasals: *sen*, *pin*, *gem*, *don*; others: *fac*, *mox*, *dit*, *sat*, *vel*, *tus*. Pulse-4 and pulse-2 notes at 112 BPM, each followed by a rest, A#2, G3, C#4, D4, E4, F4.

| | the reader (localRef) | `localRef: false` (before) | voice bar wall on |
|---|---|---|---|
| voiced-stop codas read exactly | 114 of 120 (95.0%) | 112 of 120 (93.3%) | 117 of 120 (97.5%) |
| voiced-stop codas read as nothing | 0 | 2 | 0 |
| voiced-stop codas read as a nasal | 4 | 4 | 1 |
| nasal codas read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| other syllables read exactly | 72 of 72 (100.0%) | 72 of 72 (100.0%) | 72 of 72 (100.0%) |
| vowel-only control read as none | 238 of 240 (99.2%) | 238 of 240 (99.2%) | 238 of 240 (99.2%) |

Misses with the reader (count over the twelve pitch and length cells):

hob as nasal 2; rog as nasal 1; sib as voiceless lab stop 1; rog as voiced lab stop 1; nob as nasal 1; pug (vowel only) as nasal 1; tus (vowel only) as nasal 1

## S. Held out: the parallel rule's own set (fifteenth round)

Voiced stops: *beb*, *dib*, *gid*, *neg*, *mig*, *sab*, *feb*, *lid*, *ved*, *rag*, *heb*, *pug*; others: *dit*, *pec*, *lip*, *sut*, *min*, *fem*, *bas*, *fus*, *sent*, *punt*, *nom*, *vi*, *do*. Pulse-4 and pulse-2 notes at 112 BPM, each followed by a rest, G#2, A#2, E3, C4, F4.

| | default (`localRef`) | last vowel-like frames (`closeAnchor`) | reference only |
|---|---|---|---|
| voiced-stop codas read exactly | 114 of 120 (95.0%) | 114 of 120 (95.0%) | 111 of 120 (92.5%) |
| other syllables read exactly | 128 of 130 (98.5%) | 128 of 130 (98.5%) | 128 of 130 (98.5%) |
| vowel-only control read as none | 246 of 250 (98.4%) | 246 of 250 (98.4%) | 246 of 250 (98.4%) |
| other syllables read as a stop where none is written | 1 | 1 | 1 |

Misses with the default (count over the ten pitch and length cells):

feb as voiceless lab stop 2; lid as voiced lab stop 1; dib as voiceless lab stop 1; gid as voiceless alv stop 1; rag as none 1; bas as fricative f 1; sent as voiceless alv stop 1; pug (vowel only) as nasal 1; sut (vowel only) as nasal 1; fus (vowel only) as nasal 1; punt (vowel only) as nasal 1

## T. Held out: closeAnchor with the wall in codas (sixteenth round)

Voiced stops: *lub*, *tag*, *pob*, *sug*, *cad*, *mub*, *fod*, *rib*, *vob*, *tid*, *hag*, *peg*; nasals: *fun*, *ram*, *lim*, *ben*; others: *lut*, *mic*, *hep*, *gos*, *rax*, *lunc*, *hel*, *fa*. Pulse-4 and pulse-2 notes at 118 BPM, each followed by a rest, B2, F#3, B3, D4, D#4, E4.

| | default (`localRef`, no wall) | `closeAnchor` | coda wall | `closeAnchor` + coda wall |
|---|---|---|---|---|
| voiced-stop codas read exactly | 133 of 144 (92.4%) | 135 of 144 (93.8%) | 135 of 144 (93.8%) | 136 of 144 (94.4%) |
| voiced-stop codas read as nothing | 2 | 0 | 1 | 0 |
| voiced-stop codas read as a nasal | 3 | 2 | 2 | 2 |
| nasal codas read exactly | 47 of 48 (97.9%) | 47 of 48 (97.9%) | 47 of 48 (97.9%) | 47 of 48 (97.9%) |
| other syllables read exactly | 93 of 96 (96.9%) | 93 of 96 (96.9%) | 93 of 96 (96.9%) | 93 of 96 (96.9%) |
| vowel-only control read as none | 284 of 288 (98.6%) | 284 of 288 (98.6%) | 284 of 288 (98.6%) | 284 of 288 (98.6%) |

Misses with the default (count over the twelve pitch and length cells):

tag as voiced lab stop 2; hag as voiced lab stop 2; lunc as voiceless vel stop 2; fa as voiced lab stop 1; pob (vowel only) as nasal 1; fod (vowel only) as nasal 1; vob (vowel only) as nasal 1; gos (vowel only) as nasal 1; pob as nasal 1; hag as none 1; vob as nasal 1; fun as none 1; tag as voiceless vel stop 1; cad as nasal 1; fod as none 1; tid as voiceless alv stop 1

Misses with `closeAnchor` + coda wall:

hag as voiced lab stop 3; lunc as voiceless vel stop 2; fa as voiced lab stop 1; tag as voiced lab stop 1; pob (vowel only) as nasal 1; fod (vowel only) as nasal 1; vob (vowel only) as nasal 1; gos (vowel only) as nasal 1; pob as nasal 1; vob as nasal 1; fun as none 1; tag as voiceless vel stop 1; tid as voiceless alv stop 1

## U. Held out: a voice bar read as a murmur (seventeenth round)

Voiced stops: *dag*, *bob*, *mod*, *sig*, *lag*, *tib*, *ceb*, *nud*, *hod*, *fig*, *gub*, *pid*; nasals: *bam*, *sun*, *tem*, *hon*; n-clusters: *dent*, *hens*, *sonc*, *tint*; others: *dut*, *sic*, *gep*, *bos*, *lex*, *bel*, *mo*, *vit*. Pulse-4 and pulse-2 notes at 110 BPM, each followed by a rest, A2, D3, G#3, A#3, C#4, D#4.

| | default | `barLead: 8` |
|---|---|---|
| voiced-stop codas read exactly | 136 of 144 (94.4%) | 136 of 144 (94.4%) |
| voiced-stop codas read as nothing | 0 | 0 |
| voiced-stop codas read as a nasal | 1 | 0 |
| nasal codas read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| n-cluster codas read as a nasal | 46 of 48 (95.8%) | 46 of 48 (95.8%) |
| other syllables read exactly | 95 of 96 (99.0%) | 95 of 96 (99.0%) |
| vowel-only control read as none | 332 of 336 (98.8%) | 332 of 336 (98.8%) |

Misses with the default (count over the twelve pitch and length cells):

lag as voiced lab stop 2; nud (vowel only) as voiced lab stop 1; gub (vowel only) as voiced lab stop 1; sun (vowel only) as voiced lab stop 1; dut (vowel only) as voiced lab stop 1; pid as voiceless alv stop 1; bel as nasal 1; tib as voiceless lab stop 1; nud as voiceless alv stop 1; gub as voiceless lab stop 1; dent as voiceless alv stop 1; sonc as voiced lab stop 1; dag as nasal 1; lag as voiceless vel stop 1

Misses with `barLead: 8`:

lag as voiced lab stop 2; nud (vowel only) as voiced lab stop 1; gub (vowel only) as voiced lab stop 1; sun (vowel only) as voiced lab stop 1; dut (vowel only) as voiced lab stop 1; pid as voiceless alv stop 1; bel as nasal 1; tib as voiceless lab stop 1; nud as voiceless alv stop 1; gub as voiceless lab stop 1; dent as voiceless alv stop 1; sonc as voiced lab stop 1; dag as voiced lab stop 1; lag as voiceless vel stop 1

## V. Held out: a velar burst read as labial (eighteenth round)

Velar: *dog*, *bag*, *tog*, *gig*, *vag*, *nig*, *sog*, *leg*, *hug*, *cag*, *dac*, *roc*, *puc*, *nac*, *tuc*, *lic*; labial: *gob*, *dab*, *rub*, *lap*, *rup*, *sep*, *fip*, *mop*, *dap*; alveolar: *nid*, *led*, *sud*, *rad*, *tod*; others: *gum*, *ron*, *lis*, *tas*, *mu*. Pulse-4 and pulse-2 notes at 114 BPM, each followed by a rest, G2, F3, G3, A3, B3, D4.

| | default | `compactVelar` |
|---|---|---|
| velar codas read exactly | 186 of 192 (96.9%) | 190 of 192 (99.0%) |
| velar codas read as a labial stop | 5 | 1 |
| labial codas read exactly | 103 of 108 (95.4%) | 100 of 108 (92.6%) |
| labial codas read as a velar stop | 2 | 5 |
| alveolar codas read exactly | 59 of 60 (98.3%) | 59 of 60 (98.3%) |
| other syllables read exactly | 59 of 60 (98.3%) | 59 of 60 (98.3%) |
| vowel-only control read as none | 420 of 420 (100.0%) | 420 of 420 (100.0%) |

Misses with the default (count over the twelve pitch and length cells):

dog as voiced lab stop 3; rub as voiceless lab stop 2; rub as voiced vel stop 1; lap as nasal 1; tog as voiced lab stop 1; sog as voiced lab stop 1; tod as nasal 1; roc as nasal 1; gob as voiced vel stop 1; gum as none 1

Misses with `compactVelar`:

rub as voiceless lab stop 2; dog as voiced lab stop 1; rub as voiced vel stop 1; lap as nasal 1; tod as nasal 1; roc as nasal 1; gob as voiced vel stop 1; rup as voiceless vel stop 1; fip as voiceless vel stop 1; mop as voiceless vel stop 1; gum as none 1

## W. Held out: a p's burst read as a k (nineteenth round)

Voiceless labial: *tep*, *cap*, *nup*, *bip*, *hop*, *vep*, *lop*, *gap*, *rip*, *hup*; voiceless velar: *tic*, *mac*, *sec*, *voc*, *ric*, *hac*, *buc*, *nec*; voiced stops: *pab*, *teb*, *nog*, *tig*, *rug*, *dob*, *mug*; alveolar: *fed*, *nut*; others: *hos*, *pum*, *fu*. Pulse-4 and pulse-2 notes at 122 BPM, each followed by a rest, A2, E3, G#3, A#3, B3, C#4.

| | before (`voicelessLow: false`) | `voicelessLow` (the default since this round) |
|---|---|---|
| voiceless labial codas read exactly | 101 of 120 (84.2%) | 119 of 120 (99.2%) |
| voiceless labials read as a velar stop | 18 | 0 |
| voiceless velar codas read exactly | 95 of 96 (99.0%) | 95 of 96 (99.0%) |
| voiceless velars read as a labial stop | 0 | 0 |
| voiced stop codas read exactly | 78 of 84 (92.9%) | 78 of 84 (92.9%) |
| alveolar codas read exactly | 23 of 24 (95.8%) | 23 of 24 (95.8%) |
| other syllables read exactly | 32 of 36 (88.9%) | 32 of 36 (88.9%) |
| vowel-only control read as none | 338 of 360 (93.9%) | 338 of 360 (93.9%) |

Misses before (count over the twelve pitch and length cells):

tep as voiceless vel stop 2; nup as voiceless vel stop 2; bip as voiceless vel stop 2; hop as voiceless vel stop 2; vep as voiceless vel stop 2; gap as voiceless vel stop 2; rip as voiceless vel stop 2; hup as voiceless vel stop 2; teb as voiced vel stop 2; fu as nasal 2; nup (vowel only) as nasal 2; hup (vowel only) as nasal 2; buc (vowel only) as nasal 2; rug (vowel only) as nasal 2; mug (vowel only) as nasal 2; nut (vowel only) as nasal 2; pum (vowel only) as nasal 2; fu (vowel only) as nasal 2; cap as voiceless vel stop 1; lop as voiceless vel stop 1; pab as voiceless lab stop 1; nog as voiced lab stop 1; dob as nasal 1; mug as voiced lab stop 1; fu as voiced lab stop 1; hop (vowel only) as nasal 1; lop (vowel only) as nasal 1; voc (vowel only) as nasal 1; nog (vowel only) as nasal 1; dob (vowel only) as nasal 1; hos (vowel only) as nasal 1; hop as nasal 1; pum as none 1; mac as nasal 1; fed as voiceless alv stop 1

Misses with `voicelessLow`:

teb as voiced vel stop 2; fu as nasal 2; nup (vowel only) as nasal 2; hup (vowel only) as nasal 2; buc (vowel only) as nasal 2; rug (vowel only) as nasal 2; mug (vowel only) as nasal 2; nut (vowel only) as nasal 2; pum (vowel only) as nasal 2; fu (vowel only) as nasal 2; pab as voiceless lab stop 1; nog as voiced lab stop 1; dob as nasal 1; mug as voiced lab stop 1; fu as voiced lab stop 1; hop (vowel only) as nasal 1; lop (vowel only) as nasal 1; voc (vowel only) as nasal 1; nog (vowel only) as nasal 1; dob (vowel only) as nasal 1; hos (vowel only) as nasal 1; hop as nasal 1; pum as none 1; mac as nasal 1; fed as voiceless alv stop 1

## X. Held out: no burst on C#4-E4 (twentieth round)

Voiced stops: *lob*, *fub*, *nib*, *peb*, *fab*, *cub*, *fag*, *cog*, *bug*, *hud*, *rid*, *mud*; nasal codas: *fen*, *gim*, *lan*, *tum*; n-clusters: *lens*, *sunc*, *fant*, *gonc*, *rins*; voiceless stops: *nep*, *ruc*; others: *sol*, *fos*. Pulse-4 and pulse-2 notes at 106 BPM, each followed by a rest, A#2, G3, C#4, D4, D#4, E4.

| | before (`barBurst: false`) | `barBurst` (the default since this round) |
|---|---|---|
| voiced stop codas read exactly | 102 of 144 (70.8%) | 134 of 144 (93.1%) |
| of them, on C#4-E4 | 60 of 96 (62.5%) | 86 of 96 (89.6%) |
| voiced stops on C#4-E4 read as a nasal or nothing | 30 | 3 |
| nasal codas read exactly | 43 of 48 (89.6%) | 43 of 48 (89.6%) |
| n-clusters read as their nasal | 54 of 60 (90.0%) | 54 of 60 (90.0%) |
| n-clusters read as a stop | 6 | 6 |
| voiceless stop codas read exactly | 23 of 24 (95.8%) | 23 of 24 (95.8%) |
| other syllables read exactly | 23 of 24 (95.8%) | 23 of 24 (95.8%) |
| vowel-only control read as none | 292 of 300 (97.3%) | 292 of 300 (97.3%) |

Misses before (count over the twelve pitch and length cells):

fab as nasal 6; lob as nasal 5; cog as nasal 5; tum as none 5; fub as none 4; cub as none 4; nib as none 4; fag as nasal 3; gonc as voiceless vel stop 2; fab as none 2; fant as voiceless alv stop 2; fub (vowel only) as nasal 1; cub (vowel only) as nasal 1; bug (vowel only) as nasal 1; hud (vowel only) as nasal 1; mud (vowel only) as nasal 1; tum (vowel only) as nasal 1; sunc (vowel only) as nasal 1; ruc (vowel only) as nasal 1; hud as voiceless alv stop 1; cog as voiced lab stop 1; ruc as tap 1; fub as tap 1; cub as tap 1; sunc as voiceless vel stop 1; peb as none 1; rid as voiceless alv stop 1; lob as none 1; fos as fricative f 1; hud as fricative voiced 1; rins as voiced alv stop 1; fag as none 1

Misses with `barBurst`:

tum as none 5; cog as voiced lab stop 2; gonc as voiceless vel stop 2; fant as voiceless alv stop 2; fub (vowel only) as nasal 1; cub (vowel only) as nasal 1; bug (vowel only) as nasal 1; hud (vowel only) as nasal 1; mud (vowel only) as nasal 1; tum (vowel only) as nasal 1; sunc (vowel only) as nasal 1; ruc (vowel only) as nasal 1; lob as nasal 1; fag as nasal 1; hud as voiceless alv stop 1; fag as voiced lab stop 1; ruc as tap 1; fub as tap 1; cub as tap 1; sunc as voiceless vel stop 1; rid as voiceless alv stop 1; cog as nasal 1; fos as fricative f 1; rins as voiced alv stop 1

## Y. Held out: a voiced stop's lead read as a nasal (twenty-first round)

Voiced stops: *mog*, *fog*, *hog*, *tug*, *dug*, *lug*, *sob*, *cob*, *nub*, *pod*, *gud*, *gad*, *bed*, *beg*, *bid*, *rig*; nasal codas: *gom*, *hun*, *son*, *tun*; n-clusters: *ponc*, *runc*, *ront*, *hont*; voiceless stops: *dop*, *hut*, *bic*; others: *pof*, *mus*. Pulse-4 and pulse-2 notes at 102 BPM, each followed by a rest, G#2, A3, C4, C#4, D4, E4.

| | default | `voicedLead` |
|---|---|---|
| voiced stop codas read exactly | 173 of 192 (90.1%) | 174 of 192 (90.6%) |
| voiced stops read as a nasal | 10 | 9 |
| nasal codas read exactly | 46 of 48 (95.8%) | 46 of 48 (95.8%) |
| n-clusters read as their nasal | 42 of 48 (87.5%) | 42 of 48 (87.5%) |
| nasal codas and n-clusters read as a voiced stop | 0 | 0 |
| voiceless stop codas read exactly | 36 of 36 (100.0%) | 36 of 36 (100.0%) |
| other syllables read exactly | 23 of 24 (95.8%) | 23 of 24 (95.8%) |
| vowel-only control read as none | 335 of 348 (96.3%) | 335 of 348 (96.3%) |

Misses, default (count over the twelve pitch and length cells):

sob as nasal 3; hog as nasal 2; hont as voiceless alv stop 2; mog as voiced lab stop 2; runc as voiceless vel stop 2; hun as none 2; cob as nasal 2; ponc as voiceless vel stop 2; beg as voiceless vel stop 1; pof as fricative s 1; beg as voiced lab stop 1; mog as nasal 1; fog as voiced lab stop 1; hog as voiced lab stop 1; rig as voiced lab stop 1; mog (vowel only) as nasal 1; fog (vowel only) as nasal 1; hog (vowel only) as nasal 1; sob (vowel only) as nasal 1; cob (vowel only) as nasal 1; pod (vowel only) as nasal 1; gom (vowel only) as nasal 1; son (vowel only) as nasal 1; ponc (vowel only) as nasal 1; ront (vowel only) as nasal 1; hont (vowel only) as nasal 1; dop (vowel only) as nasal 1; pof (vowel only) as nasal 1; lug as voiceless vel stop 1; pod as nasal 1; fog as nasal 1; dug as voiceless vel stop 1

Misses with `voicedLead`:

sob as nasal 3; hog as nasal 2; hont as voiceless alv stop 2; mog as voiced lab stop 2; runc as voiceless vel stop 2; hun as none 2; ponc as voiceless vel stop 2; beg as voiceless vel stop 1; pof as fricative s 1; beg as voiced lab stop 1; mog as nasal 1; fog as voiced lab stop 1; hog as voiced lab stop 1; rig as voiced lab stop 1; mog (vowel only) as nasal 1; fog (vowel only) as nasal 1; hog (vowel only) as nasal 1; sob (vowel only) as nasal 1; cob (vowel only) as nasal 1; pod (vowel only) as nasal 1; gom (vowel only) as nasal 1; son (vowel only) as nasal 1; ponc (vowel only) as nasal 1; ront (vowel only) as nasal 1; hont (vowel only) as nasal 1; dop (vowel only) as nasal 1; pof (vowel only) as nasal 1; lug as voiceless vel stop 1; pod as nasal 1; fog as nasal 1; cob as nasal 1; dug as voiceless vel stop 1

## Z. Held out: a voiced closure that holds to its burst (twenty-second round)

Voiced stops: *log*, *pog*, *gog*, *mob*, *rod*, *vod*, *cug*, *hub*, *cud*, *bub*, *fud*, *lib*, *heg*, *rab*, *neb*, *sid*; nasal codas: *lum*, *bon*, *com*, *dun*; n-clusters: *bont*, *lonc*, *dunt*, *sant*, *hunt*, *conc*; voiceless stops: *bot*, *luc*, *pap*; others: *rol*, *hus*. Pulse-4 and pulse-2 notes at 98 BPM, each followed by a rest, A2, F#3, B3, C#4, D#4, E4.

| | default | `voicedLead` (bar form) | `voicedLead: { hold: true }` |
|---|---|---|---|
| voiced stop codas read exactly | 171 of 192 (89.1%) | 172 of 192 (89.6%) | 177 of 192 (92.2%) |
| voiced stops read as a nasal | 9 | 8 | 2 |
| nasal codas read exactly | 46 of 48 (95.8%) | 46 of 48 (95.8%) | 46 of 48 (95.8%) |
| n-clusters read as their nasal | 68 of 72 (94.4%) | 68 of 72 (94.4%) | 68 of 72 (94.4%) |
| nasal codas and n-clusters read as a stop | 3 | 3 | 3 |
| voiceless stop codas read exactly | 36 of 36 (100.0%) | 36 of 36 (100.0%) | 36 of 36 (100.0%) |
| other syllables read exactly | 24 of 24 (100.0%) | 24 of 24 (100.0%) | 24 of 24 (100.0%) |
| vowel-only control read as none | 359 of 372 (96.5%) | 359 of 372 (96.5%) | 359 of 372 (96.5%) |

Misses, default (count over the twelve pitch and length cells):

mob as nasal 3; pog as nasal 2; dunt as voiceless alv stop 2; log as nasal 2; gog as nasal 2; neb as voiced vel stop 2; pog as voiced lab stop 1; heg as voiced lab stop 1; cug as voiced lab stop 1; hub as none 1; log as voiced lab stop 1; hunt as voiceless alv stop 1; mob as voiced vel stop 1; hub as voiced vel stop 1; bub as voiced vel stop 1; bub as voiceless lab stop 1; dun as none 1; rab as voiced vel stop 1; log (vowel only) as nasal 1; pog (vowel only) as nasal 1; gog (vowel only) as nasal 1; mob (vowel only) as nasal 1; rod (vowel only) as nasal 1; vod (vowel only) as nasal 1; bon (vowel only) as nasal 1; com (vowel only) as nasal 1; bont (vowel only) as nasal 1; lonc (vowel only) as nasal 1; conc (vowel only) as nasal 1; bot (vowel only) as nasal 1; rol (vowel only) as nasal 1; lum as none 1; lonc as tap 1

Misses, bar form:

pog as nasal 2; dunt as voiceless alv stop 2; log as nasal 2; gog as nasal 2; mob as nasal 2; neb as voiced vel stop 2; pog as voiced lab stop 1; heg as voiced lab stop 1; cug as voiced lab stop 1; hub as none 1; log as voiced lab stop 1; hunt as voiceless alv stop 1; mob as voiced vel stop 1; hub as voiced vel stop 1; bub as voiced vel stop 1; bub as voiceless lab stop 1; dun as none 1; rab as voiced vel stop 1; log (vowel only) as nasal 1; pog (vowel only) as nasal 1; gog (vowel only) as nasal 1; mob (vowel only) as nasal 1; rod (vowel only) as nasal 1; vod (vowel only) as nasal 1; bon (vowel only) as nasal 1; com (vowel only) as nasal 1; bont (vowel only) as nasal 1; lonc (vowel only) as nasal 1; conc (vowel only) as nasal 1; bot (vowel only) as nasal 1; rol (vowel only) as nasal 1; lum as none 1; lonc as tap 1

Misses, hold form:

dunt as voiceless alv stop 2; log as nasal 2; neb as voiced vel stop 2; pog as voiced lab stop 1; heg as voiced lab stop 1; gog as voiced lab stop 1; cug as voiced lab stop 1; hub as none 1; log as voiced lab stop 1; hunt as voiceless alv stop 1; mob as voiced vel stop 1; hub as voiced vel stop 1; bub as voiced vel stop 1; bub as voiceless lab stop 1; dun as none 1; rab as voiced vel stop 1; log (vowel only) as nasal 1; pog (vowel only) as nasal 1; gog (vowel only) as nasal 1; mob (vowel only) as nasal 1; rod (vowel only) as nasal 1; vod (vowel only) as nasal 1; bon (vowel only) as nasal 1; com (vowel only) as nasal 1; bont (vowel only) as nasal 1; lonc (vowel only) as nasal 1; conc (vowel only) as nasal 1; bot (vowel only) as nasal 1; rol (vowel only) as nasal 1; lum as none 1; lonc as tap 1

## a. Held out: a dark-vowel nasal's lip closure (twenty-third round)

Nasals after /u/ or /o/: *bum*, *vum*, *fum*, *hum*, *mun*, *pun*, *gun*, *lun*, *tom*, *pom*, *mon*, *gon*; voiced stops: *bog*, *dod*, *vud*, *gug*, *fob*; nasals after a bright vowel: *dem*, *ren*, *sim*, *ham*; n-clusters: *munc*, *gont*, *bunc*, *funt*; voiceless stops: *nuc*, *tup*, *bup*; others: *gul*, *tur*, *bu*, *po*. Pulse-4 and pulse-2 notes at 94 BPM, each followed by a rest, D3, G#3, C4, D4, D#4, E4.

| | default | `lipShut` |
|---|---|---|
| nasals after /u/ or /o/ read exactly | 116 of 144 (80.6%) | 121 of 144 (84.0%) |
| of them, on D4-E4 | 48 of 72 (66.7%) | 51 of 72 (70.8%) |
| nasals after a bright vowel read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| n-clusters read as their nasal | 42 of 48 (87.5%) | 43 of 48 (89.6%) |
| voiced stop codas read exactly | 54 of 60 (90.0%) | 54 of 60 (90.0%) |
| voiceless stop codas read exactly | 36 of 36 (100.0%) | 36 of 36 (100.0%) |
| other syllables read exactly | 44 of 48 (91.7%) | 44 of 48 (91.7%) |
| vowel-only control read as none | 384 of 384 (100.0%) | 384 of 384 (100.0%) |
| stops, others and vowel-only control read as a nasal | 3 | 3 |

Misses, default (count over the twelve pitch and length cells):

fum as none 6; bum as none 5; hum as none 5; mun as none 4; gun as none 4; tur as none 3; vum as none 3; funt as voiceless alv stop 2; fob as nasal 2; bog as voiced lab stop 1; po as nasal 1; vud as voiceless alv stop 1; bunc as voiceless vel stop 1; lun as none 1; munc as voiceless vel stop 1; dod as none 1; munc as voiced lab stop 1; gont as voiceless alv stop 1; gug as voiceless vel stop 1

Misses with `lipShut`:

bum as none 5; hum as none 5; fum as none 3; mun as none 3; gun as none 3; tur as none 3; vum as none 3; fob as nasal 2; bog as voiced lab stop 1; po as nasal 1; vud as voiceless alv stop 1; bunc as voiceless vel stop 1; lun as none 1; munc as voiceless vel stop 1; dod as none 1; munc as voiced lab stop 1; gont as voiceless alv stop 1; gug as voiceless vel stop 1; funt as voiceless alv stop 1

## b. Held out: a dark-vowel m that holds level (twenty-fourth round)

Nasals after /u/ or /o/: *mum*, *num*, *bun*, *cun*, *run*, *vun*, *dom*, *fom*, *hom*, *som*, *lon*, *ton*; voiced stops: *bud*, *dud*, *god*, *sod*, *vug*; nasals after a bright vowel: *pem*, *fim*, *lam*, *rem*; n-clusters: *donc*, *tonc*, *nunt*, *vont*; voiceless stops: *dup*, *loc*, *hoc*; others: *mul*, *bor*, *dul*, *fo*. Pulse-4 and pulse-2 notes at 90 BPM, each followed by a rest, C#3, A3, C#4, D4, D#4, E4.

| | default | `lipHold` |
|---|---|---|
| nasals after /u/ or /o/ read exactly | 133 of 144 (92.4%) | 135 of 144 (93.8%) |
| of them, on D4-E4 | 64 of 72 (88.9%) | 65 of 72 (90.3%) |
| nasals after a bright vowel read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| n-clusters read as their nasal | 47 of 48 (97.9%) | 47 of 48 (97.9%) |
| voiced stop codas read exactly | 57 of 60 (95.0%) | 57 of 60 (95.0%) |
| voiceless stop codas read exactly | 33 of 36 (91.7%) | 33 of 36 (91.7%) |
| other syllables read exactly | 47 of 48 (97.9%) | 47 of 48 (97.9%) |
| vowel-only control read as none | 384 of 384 (100.0%) | 384 of 384 (100.0%) |
| stops, others and vowel-only control read as a nasal | 3 | 3 |

Misses, default (count over the twelve pitch and length cells):

num as none 3; hoc as nasal 2; cun as none 2; mum as none 2; bun as none 2; vun as none 1; bor as none 1; god as none 1; loc as nasal 1; bud as voiceless alv stop 1; run as none 1; tonc as voiceless vel stop 1; sod as none 1

Misses with `lipHold`:

num as none 3; hoc as nasal 2; mum as none 2; bun as none 2; bor as none 1; god as none 1; loc as nasal 1; bud as voiceless alv stop 1; run as none 1; tonc as voiceless vel stop 1; sod as none 1; cun as none 1

## c. Held out: a dark-vowel m with a slow closure (twenty-fifth round)

Nasals after /u/ or /o/: *nun*, *brum*, *glum*, *stum*, *flum*, *prun*, *non*, *mom*, *bom*, *pon*, *vom*, *lom*; voiced stops: *brud*, *glub*, *drog*, *plod*, *stug*; nasals after a bright vowel: *mem*, *nim*, *ban*, *trem*; n-clusters: *nant*, *bonc*, *frunt*, *plons*; voiceless stops: *mut*, *mup*, *trop*; others: *nus*, *mur*, *bo*, *nul*. Pulse-4 and pulse-2 notes at 88 BPM, each followed by a rest, C3, A#3, C4, D4, D#4, E4.

| | default | `lipShut: { span: 4, settle: 2, rise: 4 }` |
|---|---|---|
| nasals after /u/ or /o/ read exactly | 123 of 144 (85.4%) | 125 of 144 (86.8%) |
| of them, on D4-E4 | 57 of 72 (79.2%) | 57 of 72 (79.2%) |
| nasals after a bright vowel read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| n-clusters read as their nasal | 44 of 48 (91.7%) | 45 of 48 (93.8%) |
| voiced stop codas read exactly | 60 of 60 (100.0%) | 60 of 60 (100.0%) |
| voiceless stop codas read exactly | 36 of 36 (100.0%) | 36 of 36 (100.0%) |
| other syllables read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| vowel-only control read as none | 369 of 384 (96.1%) | 369 of 384 (96.1%) |
| stops, others and vowel-only control read as a nasal | 15 | 15 |

Misses, default (count over the twelve pitch and length cells):

brum as none 6; glum as none 5; stum as none 4; prun as none 3; flum as none 3; frunt as voiceless alv stop 2; nun (vowel only) as nasal 1; brum (vowel only) as nasal 1; glum (vowel only) as nasal 1; stum (vowel only) as nasal 1; flum (vowel only) as nasal 1; prun (vowel only) as nasal 1; brud (vowel only) as nasal 1; glub (vowel only) as nasal 1; stug (vowel only) as nasal 1; frunt (vowel only) as nasal 1; mut (vowel only) as nasal 1; mup (vowel only) as nasal 1; nus (vowel only) as nasal 1; mur (vowel only) as nasal 1; nul (vowel only) as nasal 1; nant as voiceless alv stop 1; plons as voiced alv stop 1

Misses with `lipShut: { span: 4, settle: 2, rise: 4 }`:

brum as none 6; glum as none 5; stum as none 4; prun as none 2; flum as none 2; nun (vowel only) as nasal 1; brum (vowel only) as nasal 1; glum (vowel only) as nasal 1; stum (vowel only) as nasal 1; flum (vowel only) as nasal 1; prun (vowel only) as nasal 1; brud (vowel only) as nasal 1; glub (vowel only) as nasal 1; stug (vowel only) as nasal 1; frunt (vowel only) as nasal 1; mut (vowel only) as nasal 1; mup (vowel only) as nasal 1; nus (vowel only) as nasal 1; mur (vowel only) as nasal 1; nul (vowel only) as nasal 1; frunt as voiceless alv stop 1; nant as voiceless alv stop 1; plons as voiced alv stop 1

## d. Held out: a release read as a nasal (twenty-sixth round)

Nasals after /u/ or /o/: *rom*, *trun*, *crum*, *plun*, *grun*, *snum*, *drum*, *prom*, *clun*, *slom*, *tron*, *bron*; voiced stops: *clud*, *trub*, *prog*, *grod*, *blog*; nasals after a bright vowel: *hem*, *tin*, *dim*, *cram*; n-clusters: *pont*, *tont*, *cont*, *tanc*; voiceless stops: *lup*, *cup*, *rop*; others: *rus*, *tul*, *su*, *lo*. Pulse-4 and pulse-2 notes at 92 BPM, each followed by a rest, D#3, E3, A3, A#3, B3, C#4.

| | default | `levelFade: { tail: 6 }` |
|---|---|---|
| nasals after /u/ or /o/ read exactly | 136 of 144 (94.4%) | 136 of 144 (94.4%) |
| nasals after a bright vowel read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| n-clusters read as their nasal | 47 of 48 (97.9%) | 47 of 48 (97.9%) |
| voiced stop codas read exactly | 56 of 60 (93.3%) | 56 of 60 (93.3%) |
| voiceless stop codas read exactly | 36 of 36 (100.0%) | 36 of 36 (100.0%) |
| other syllables read exactly | 47 of 48 (97.9%) | 47 of 48 (97.9%) |
| vowel-only control read as none | 384 of 384 (100.0%) | 384 of 384 (100.0%) |
| stops, others and vowel-only control read as a nasal | 1 | 1 |

Misses, default (count over the twelve pitch and length cells):

crum as none 2; snum as none 2; drum as none 2; lo as nasal 1; trun as none 1; clun as none 1; trub as voiced vel stop 1; pont as voiceless alv stop 1; prog as voiced lab stop 1; prog as voiceless vel stop 1; blog as voiceless vel stop 1

Misses with `levelFade`:

crum as none 2; snum as none 2; drum as none 2; lo as nasal 1; trun as none 1; clun as none 1; trub as voiced vel stop 1; pont as voiceless alv stop 1; prog as voiced lab stop 1; prog as voiceless vel stop 1; blog as voiceless vel stop 1

## e. Held out: where the release lands (twenty-ninth round)

Nasals after /u/ or /o/: *grom*, *crom*, *trom*, *frum*, *drun*, *prum*, *blum*, *clum*, *spum*, *flon*, *plom*, *brom*; voiced stops: *trog*, *brub*, *frod*, *clog*, *crud*; nasals after a bright vowel: *dram*, *flem*, *brin*, *glen*; n-clusters: *brant*, *clonc*, *plunt*, *grons*; voiceless stops: *frup*, *clot*, *drup*; others: *brus*, *frul*, *clu*, *dro*. 84 BPM, each followed by a rest: quarters on B2, G3, C4, D4 and eighths on G2, B2, D3, E3, F3, A3, B3, E4 (eval/release-cells-report.md's 84 BPM cells that land 4 or more of 8).

| | default | `levelFade: { tail: 6 }` | `longTilt: { span: 0.3, gap: 0.45 }` |
|---|---|---|---|
| nasals after /u/ or /o/ read exactly | 139 of 144 (96.5%) | 139 of 144 (96.5%) | 137 of 144 (95.1%) |
| nasals after a bright vowel read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| n-clusters read as their nasal | 47 of 48 (97.9%) | 47 of 48 (97.9%) | 47 of 48 (97.9%) |
| voiced stop codas read exactly | 55 of 60 (91.7%) | 55 of 60 (91.7%) | 55 of 60 (91.7%) |
| voiceless stop codas read exactly | 36 of 36 (100.0%) | 36 of 36 (100.0%) | 36 of 36 (100.0%) |
| other syllables read exactly | 48 of 48 (100.0%) | 48 of 48 (100.0%) | 48 of 48 (100.0%) |
| vowel-only control read as none | 370 of 384 (96.4%) | 370 of 384 (96.4%) | 370 of 384 (96.4%) |
| stops, others and vowel-only control read as a nasal | 14 | 14 | 14 |
| vowel-only misses on the four 8-of-8 eighth cells | 0 | 0 | 0 |

Vowel-only misses by cell:

- def: eighth E4 14
- fade: eighth E4 14
- tilt: eighth E4 14

Misses, default (count over the twelve cells):

clog as voiced lab stop 2; frum as none 2; prum as none 1; trog as voiced lab stop 1; clum as none 1; brub as voiceless lab stop 1; plunt as voiceless alv stop 1; blum as none 1; crud as voiceless alv stop 1; frum (vowel only) as nasal 1; drun (vowel only) as nasal 1; prum (vowel only) as nasal 1; blum (vowel only) as nasal 1; clum (vowel only) as nasal 1; spum (vowel only) as nasal 1; brub (vowel only) as nasal 1; crud (vowel only) as nasal 1; plunt (vowel only) as nasal 1; frup (vowel only) as nasal 1; drup (vowel only) as nasal 1; brus (vowel only) as nasal 1; frul (vowel only) as nasal 1; clu (vowel only) as nasal 1

Misses with `levelFade`:

clog as voiced lab stop 2; frum as none 2; prum as none 1; trog as voiced lab stop 1; clum as none 1; brub as voiceless lab stop 1; plunt as voiceless alv stop 1; blum as none 1; crud as voiceless alv stop 1; frum (vowel only) as nasal 1; drun (vowel only) as nasal 1; prum (vowel only) as nasal 1; blum (vowel only) as nasal 1; clum (vowel only) as nasal 1; spum (vowel only) as nasal 1; brub (vowel only) as nasal 1; crud (vowel only) as nasal 1; plunt (vowel only) as nasal 1; frup (vowel only) as nasal 1; drup (vowel only) as nasal 1; brus (vowel only) as nasal 1; frul (vowel only) as nasal 1; clu (vowel only) as nasal 1

Misses with `longTilt`:

frum as none 3; clog as voiced lab stop 2; clum as none 2; prum as none 1; trog as voiced lab stop 1; brub as voiceless lab stop 1; plunt as voiceless alv stop 1; blum as none 1; crud as voiceless alv stop 1; frum (vowel only) as nasal 1; drun (vowel only) as nasal 1; prum (vowel only) as nasal 1; blum (vowel only) as nasal 1; clum (vowel only) as nasal 1; spum (vowel only) as nasal 1; brub (vowel only) as nasal 1; crud (vowel only) as nasal 1; plunt (vowel only) as nasal 1; frup (vowel only) as nasal 1; drup (vowel only) as nasal 1; brus (vowel only) as nasal 1; frul (vowel only) as nasal 1; clu (vowel only) as nasal 1

## f. Held out: a near-rule murmur after the note's end (thirtieth round)

Nasals after /u/ or /o/: *fon*, *blon*, *cron*, *con*, *glun*, *snom*, *clon*, *smum*, *crun*, *plon*, *frun*, *slun*; voiced stops: *snug*, *frub*, *plud*, *glob*, *crod*; nasals after a bright vowel: *pren*, *len*, *gran*, *clen*; n-clusters: *banc*, *flont*, *spant*, *snons*; voiceless stops: *glop*, *gluc*, *brop*; others: *dor*, *snor*, *pu*, *stur*. Quarters and eighths at 86 BPM, each followed by a rest, on E2, G2, A2, B2, D3, E3, F3, G3, A3, B3, C4, D4, E4.

| | default | `nearRelease` |
|---|---|---|
| nasals after /u/ or /o/ read exactly | 300 of 312 (96.2%) | 298 of 312 (95.5%) |
| nasals after a bright vowel read exactly | 102 of 104 (98.1%) | 102 of 104 (98.1%) |
| n-clusters read as their nasal | 102 of 104 (98.1%) | 102 of 104 (98.1%) |
| voiced stop codas read exactly | 128 of 130 (98.5%) | 128 of 130 (98.5%) |
| voiceless stop codas read exactly | 78 of 78 (100.0%) | 78 of 78 (100.0%) |
| other syllables read exactly | 84 of 104 (80.8%) | 84 of 104 (80.8%) |
| vowel-only control read as none | 806 of 832 (96.9%) | 821 of 832 (98.7%) |
| vowel-only control read as a nasal | 26 | 11 |
| of them, by the near rule | 15 | 0 |
| stops and others read as a nasal | 1 | 1 |

Vowel-only near-rule nasals by cell:

- def: quarter D3 15
- rel: none

Misses, default (count over the 26 cells):

stur as none 9; dor as none 6; glun as none 4; snor as none 3; plud as voiceless alv stop 2; slun as none 2; smum as none 2; len as voiced lab stop 1; cron as voiced lab stop 1; fon (vowel only) as nasal 1; blon (vowel only) as nasal 1; cron (vowel only) as nasal 1; con (vowel only) as nasal 1; snom (vowel only) as nasal 1; clon (vowel only) as nasal 1; plon (vowel only) as nasal 1; glob (vowel only) as nasal 1; crod (vowel only) as nasal 1; flont (vowel only) as nasal 1; snons (vowel only) as nasal 1; glop (vowel only) as nasal 1; brop (vowel only) as nasal 1; dor (vowel only) as nasal 1; snor (vowel only) as nasal 1; banc as voiceless vel stop 1; glun (vowel only) as nasal 1; smum (vowel only) as nasal 1; crun (vowel only) as nasal 1; frun (vowel only) as nasal 1; slun (vowel only) as nasal 1; snug (vowel only) as nasal 1; frub (vowel only) as nasal 1; plud (vowel only) as nasal 1; gluc (vowel only) as nasal 1; pu (vowel only) as nasal 1; stur (vowel only) as nasal 1; crun as none 1; frun as none 1; pren as voiced lab stop 1; spant as voiceless alv stop 1; pu as nasal 1; stur as voiced lab stop 1; con as tap 1

Misses with `nearRelease`:

stur as none 9; dor as none 6; glun as none 4; snor as none 3; plud as voiceless alv stop 2; slun as none 2; smum as none 2; crun as none 2; frun as none 2; len as voiced lab stop 1; cron as voiced lab stop 1; banc as voiceless vel stop 1; glun (vowel only) as nasal 1; smum (vowel only) as nasal 1; crun (vowel only) as nasal 1; frun (vowel only) as nasal 1; slun (vowel only) as nasal 1; snug (vowel only) as nasal 1; frub (vowel only) as nasal 1; plud (vowel only) as nasal 1; gluc (vowel only) as nasal 1; pu (vowel only) as nasal 1; stur (vowel only) as nasal 1; pren as voiced lab stop 1; spant as voiceless alv stop 1; pu as nasal 1; stur as voiced lab stop 1; con as tap 1

## C. Closing consonants in the corpus

147 GABC files, 9999 sung syllables; 3665 of 9999 (36.7%) close on a consonant, 268 on a cluster. First phone: s 944, n 724, m 652, t 452, r 426, l 173, k 147, d 76, b 28, p 25, f 15, g 3.

