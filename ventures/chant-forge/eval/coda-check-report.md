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
| G3 | 27 of 30 (90.0%) | 28 of 30 (93.3%) |
| C4 | 26 of 30 (86.7%) | 28 of 30 (93.3%) |
| E4 | 28 of 30 (93.3%) | 28 of 30 (93.3%) |

All pitches: 168 of 180 (93.3%) read exactly (class, voicing, place); 173 of 180 (96.1%) by class alone. The vowel-only choir on the same syllables reads as no consonant 174 of 180 (96.7%).

Misses:

- E2 *ad* (voiced alv stop) read as nasal
- E2 *ab* (voiced lab stop) read as nasal
- D3 *ap* (voiceless lab stop) read as nasal
- G3 *is* (fricative s) read as fricative voiced
- G3 *ab* (voiced lab stop) read as nasal
- G3 *i* (none) read as fricative voiced
- C4 *ad* (voiced alv stop) read as voiceless alv stop
- C4 *ab* (voiced lab stop) read as voiceless vel stop
- C4 *ap* (voiceless lab stop) read as voiceless vel stop
- C4 *i* (none) read as fricative voiced
- E4 *is* (fricative s) read as fricative voiced
- E4 *i* (none) read as fricative voiced

Vowel-only control, read as a consonant:

- G3 *is* read as fricative voiced
- G3 *i* read as fricative voiced
- C4 *is* read as fricative voiced
- C4 *i* read as fricative voiced
- E4 *is* read as fricative voiced
- E4 *i* read as fricative voiced

## B. The corpus pieces (final D3, fitted to 4/4 at 124 BPM)

Not a clean held-out set: no threshold was set on it, but its first run (60.5%) was read for misses, which showed the window cutting off bursts at the next sound and /m/ after /u/ barely a murmur; both were fixed (in the reader's window and in sing.mjs) before this run. One looser nasal rule was also tried and dropped: it read 136 of 162 here (84.0%) but called 13 of 30 vowel-only A2 fades in part A nasals. Its misses were read again for the second round (README "Final consonants, second round") and the third, which found the blip of bare vowel at the end of every final nasal's murmur (README "Final consonants, third round").

The last note of every syllable that closes on a consonant, 0.2 s or more, with 60 ms of steady vowel before the coda's room. The window ends where the next sound starts (the next beat, less its opening consonant sung before it). The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| dies-irae | 75 | 72 of 75 (96.0%) | 75 of 75 (100.0%) |
| pange-lingua | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| veni-creator | 1 | 1 of 1 (100.0%) | 1 of 1 (100.0%) |
| te-deum | 65 | 64 of 65 (98.5%) | 64 of 65 (98.5%) |
| salve-regina | 16 | 15 of 16 (93.8%) | 15 of 16 (93.8%) |
| all | 162 | 157 of 162 (96.9%) | 160 of 162 (98.8%) |

By class alone: 158 of 162 (97.5%). Before a syllable that opens on a consonant: 75 of 79 (94.9%); before a vowel or a rest: 82 of 83 (98.8%). Syllables that close on their vowel: 211 of 220 (95.9%) read as no consonant (vowel-only choir: 207 of 220 (94.1%)). Too short for a steady vowel before the coda, skipped: 743.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 72 of 73 (98.6%) |
| nasal | 36 of 39 (92.3%) |
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
| nasal | 0 | 1 | 39 | 0 | 2 |
| tap | 0 | 0 | 0 | 14 | 0 |
| none | 0 | 0 | 0 | 0 | 1 |

Misses:

- dies-irae *tum* (then re), 242 ms: nasal read as none
- dies-irae *vix* (then ju), 242 ms: voiceless vel stop read as fricative s
- dies-irae *quam* (then re), 242 ms: nasal read as none
- te-deum *in*, 242 ms: nasal read as fricative voiced
- salve-regina *bis* (then post), 484 ms: fricative s read as fricative voiced

## D. Held out: ten Graduale pieces (every sixth file of corpus/gregobase-1908)

3400, 3406, 3412, 3418, 3424, 3430, 3437, 3444, 3450, 3456; same settings and rules as B. Chosen by file name before the second round's changes, and scored before and after them without its misses being read in between; scored again after the third round (README "Final consonants, third round"), when E below is the clean set.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3400 | 14 | 13 of 14 (92.9%) | 14 of 14 (100.0%) |
| gregobase-1908/3406 | 9 | 8 of 9 (88.9%) | 8 of 9 (88.9%) |
| gregobase-1908/3412 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3418 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3424 | 8 | 8 of 8 (100.0%) | 8 of 8 (100.0%) |
| gregobase-1908/3430 | 10 | 10 of 10 (100.0%) | 10 of 10 (100.0%) |
| gregobase-1908/3437 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3444 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3450 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3456 | 3 | 3 of 3 (100.0%) | 2 of 3 (66.7%) |
| all | 70 | 68 of 70 (97.1%) | 68 of 70 (97.1%) |

By class alone: 68 of 70 (97.1%). Before a syllable that opens on a consonant: 14 of 14 (100.0%); before a vowel or a rest: 54 of 56 (96.4%). Syllables that close on their vowel: 172 of 179 (96.1%) read as no consonant (vowel-only choir: 169 of 179 (94.4%)). Too short for a steady vowel before the coda, skipped: 367.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 29 of 29 (100.0%) |
| nasal | 11 of 12 (91.7%) |
| voiceless alv stop | 11 of 12 (91.7%) |
| tap | 9 of 9 (100.0%) |
| voiceless vel stop (cluster k s) | 3 of 3 (100.0%) |
| voiced alv stop | 2 of 2 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |
| voiced lab stop | 1 of 1 (100.0%) |
| nasal (cluster n t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 17 | 1 | 0 | 0 | 0 |
| fricative | 0 | 30 | 0 | 0 | 0 |
| nasal | 0 | 0 | 12 | 0 | 1 |
| tap | 0 | 0 | 0 | 9 | 0 |

Misses:

- gregobase-1908/3400 *um*, 242 ms: nasal read as none
- gregobase-1908/3406 *bit*, 242 ms: voiceless alv stop read as fricative voiced

## E. Held out, second set: ten more Graduale pieces (every sixth file from the fourth)

3403, 3409, 3415, 3421, 3427, 3434, 3440, 3447, 3453, 3459; same settings and rules as B. Chosen by file name and scored before the third round's changes (README "Final consonants, third round"), then once after them; its misses were not read in between.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3403 | 9 | 9 of 9 (100.0%) | 8 of 9 (88.9%) |
| gregobase-1908/3409 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3415 | 12 | 9 of 12 (75.0%) | 12 of 12 (100.0%) |
| gregobase-1908/3421 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3427 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3434 | 19 | 19 of 19 (100.0%) | 19 of 19 (100.0%) |
| gregobase-1908/3440 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3447 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3453 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3459 | 15 | 14 of 15 (93.3%) | 14 of 15 (93.3%) |
| all | 86 | 82 of 86 (95.3%) | 84 of 86 (97.7%) |

By class alone: 82 of 86 (95.3%). Before a syllable that opens on a consonant: 32 of 32 (100.0%); before a vowel or a rest: 50 of 54 (92.6%). Syllables that close on their vowel: 180 of 190 (94.7%) read as no consonant (vowel-only choir: 183 of 190 (96.3%)). Too short for a steady vowel before the coda, skipped: 359.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 32 of 32 (100.0%) |
| nasal | 19 of 22 (86.4%) |
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
| nasal | 0 | 1 | 22 | 0 | 2 |
| tap | 0 | 0 | 0 | 10 | 1 |

Misses:

- gregobase-1908/3415 *er,*, 242 ms: tap read as none
- gregobase-1908/3415 *lum*, 242 ms: nasal read as none
- gregobase-1908/3415 *tem:*, 242 ms: nasal read as none
- gregobase-1908/3459 *in*, 242 ms: nasal read as fricative voiced

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
| gregobase-1908/3448 | 5 | 5 of 5 (100.0%) | 4 of 5 (80.0%) |
| gregobase-1908/3451 | 13 | 11 of 13 (84.6%) | 11 of 13 (84.6%) |
| gregobase-1908/3454 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3457 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3460 | 4 | 3 of 4 (75.0%) | 4 of 4 (100.0%) |
| all | 134 | 128 of 134 (95.5%) | 131 of 134 (97.8%) |

By class alone: 129 of 134 (96.3%). Before a syllable that opens on a consonant: 34 of 35 (97.1%); before a vowel or a rest: 94 of 99 (94.9%). Syllables that close on their vowel: 216 of 227 (95.2%) read as no consonant (vowel-only choir: 217 of 227 (95.6%)). Too short for a steady vowel before the coda, skipped: 640.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| nasal | 43 of 46 (93.5%) |
| fricative s | 42 of 43 (97.7%) |
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
- gregobase-1908/3451 *lis*, 242 ms: fricative s read as fricative voiced
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
| gregobase-1908/3414 | 6 | 6 of 6 (100.0%) | 5 of 6 (83.3%) |
| gregobase-1908/3417 | 18 | 18 of 18 (100.0%) | 17 of 18 (94.4%) |
| gregobase-1908/3420 | 8 | 8 of 8 (100.0%) | 8 of 8 (100.0%) |
| gregobase-1908/3423 | 1 | 1 of 1 (100.0%) | 1 of 1 (100.0%) |
| gregobase-1908/3426 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3429 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3433 | 14 | 14 of 14 (100.0%) | 14 of 14 (100.0%) |
| gregobase-1908/3436 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3439 | 4 | 4 of 4 (100.0%) | 3 of 4 (75.0%) |
| gregobase-1908/3443 | 2 | 2 of 2 (100.0%) | 2 of 2 (100.0%) |
| gregobase-1908/3446 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3449 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3452 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3455 | 4 | 3 of 4 (75.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3458 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3670 | 13 | 10 of 13 (76.9%) | 13 of 13 (100.0%) |
| all | 142 | 138 of 142 (97.2%) | 139 of 142 (97.9%) |

By class alone: 138 of 142 (97.2%). Before a syllable that opens on a consonant: 43 of 44 (97.7%); before a vowel or a rest: 95 of 98 (96.9%). Syllables that close on their vowel: 246 of 252 (97.6%) read as no consonant (vowel-only choir: 246 of 252 (97.6%)). Too short for a steady vowel before the coda, skipped: 596.

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
| m, n, gn (should read as nasal) | 116 of 137 (84.7%) | 116 of 137 (84.7%) |

/l/ not read as none (with the rule):

- none

Nasals not read as nasal (with the rule):

- gregobase-1908-checked/3650 *num*: read as none
- gregobase-1908-checked/3912 *non*: read as none
- gregobase-1908-checked/3912 *in*: read as fricative voiced
- gregobase-1908-checked/3912 *in*: read as fricative voiced
- gregobase-1908-checked/3949 *lum*: read as none
- gregobase-1908-clef/3461 *rum:*: read as none
- gregobase-1908-clef/3551 *rum*: read as none
- gregobase-1908-clef/3679 *cum,*: read as none
- gregobase-1908-clef/3762 *sum*: read as none
- gregobase-1908-clef/3775 *sum*: read as none
- gregobase-1908-curl/3483 *trum*: read as none
- gregobase-1908-curl/3483 *lum*: read as none
- gregobase-1908-curl/3533 *in*: read as fricative voiced
- gregobase-1908-curl/3545 *um*: read as none
- gregobase-1908-curl/3545 *um*: read as none
- gregobase-1908-curl/3550 *sunt*: read as voiced alv stop
- gregobase-1908-curl/3704 *bum*: read as none
- gregobase-1908-stroke/3464 *in*: read as fricative voiced
- gregobase-1908-stroke/3464 *runt*: read as none
- gregobase-1908-stroke/3481 *dum*: read as none
- gregobase-1908-stroke/3482 *plum*: read as none

## J. Cluster syllables (the set the eighth round's rule was tuned on)

Clusters: *unt*, *ant*, *ent*, *int*, *sunt*, *nunc*, *tunc*, *ens*, *mens*, *ans*, *ont*; others: *at*, *et*, *it*, *ut*, *ot*, *ost*, *ust*, *ad*, *ud*, *ab*, *ub*, *ac*, *uc*, *ap*, *up*, *as*, *us*, *os*, *es*, *ax*, *ux*, *um*, *am*, *un*, *em*, *a*, *u*, *o*. Quarter and eighth notes at 120 BPM, each followed by a rest, E2, A2, D3, G3, C4, E4.

| | with the cluster rule | without (`preObstruent: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 127 of 132 (96.2%) | 98 of 132 (74.2%) |
| other syllables read exactly | 304 of 336 (90.5%) | 304 of 336 (90.5%) |
| vowel-only control read as none | 445 of 468 (95.1%) | 445 of 468 (95.1%) |

Cluster misses with the rule:

- quarter 55 *int* read as fricative voiced
- eighth 64 *sunt* read as voiceless alv stop
- eighth 64 *nunc* read as voiced lab stop
- eighth 64 *tunc* read as voiced lab stop
- eighth 64 *mens* read as voiced lab stop

## K. Held-out cluster syllables (ninth round, pre-registered)

Clusters: *fons*, *dens*, *pons*, *mons*, *gens*, *hinc*, *runt*, *bunt*, *tent*, *cant*, *frons*, *sanct*, *lunt*, *quent*; others: *ep*, *ip*, *op*, *ec*, *ic*, *oc*, *eb*, *ib*, *ob*, *ef*, *of*, *ot*, *ux*, *ix*, *ox*, *im*, *om*, *on*, *in*, *e*, *i*, *u*. Quarter and eighth notes at 104 BPM, each followed by a rest, B2, F3, A3, B3, D4.

| | with the obstruent gap | without (`againGap: false`) |
|---|---|---|
| cluster syllables read exactly (on their nasal) | 127 of 140 (90.7%) | 121 of 140 (86.4%) |
| other syllables read exactly | 166 of 220 (75.5%) | 166 of 220 (75.5%) |
| other syllables read as a nasal | 6 | 6 |
| vowel-only control read as none | 295 of 360 (81.9%) | 295 of 360 (81.9%) |

Cluster misses with the rule:

- quarter 53 *hinc* read as fricative voiced
- quarter 57 *lunt* read as voiceless alv stop
- quarter 59 *hinc* read as fricative voiced
- eighth 47 *fons* read as none
- eighth 53 *fons* read as none
- eighth 53 *hinc* read as fricative voiced
- eighth 57 *fons* read as none
- eighth 57 *hinc* read as fricative voiced
- eighth 59 *fons* read as none
- eighth 62 *fons* read as none
- eighth 62 *pons* read as fricative s
- eighth 62 *hinc* read as voiceless vel stop
- eighth 62 *lunt* read as voiceless alv stop

Other and vowel-only misses with the rule (count over the ten pitch and length cells):

i as fricative voiced 6; hinc (vowel only) as fricative voiced 6; ip (vowel only) as fricative voiced 6; ic (vowel only) as fricative voiced 6; ib (vowel only) as fricative voiced 6; ix (vowel only) as fricative voiced 6; im (vowel only) as fricative voiced 6; in (vowel only) as fricative voiced 6; i (vowel only) as fricative voiced 6; ip as fricative voiced 5; ic as fricative voiced 5; ib as fricative voiced 5; im as fricative voiced 5; in as fricative voiced 5; ix as fricative voiced 4; ep as voiceless vel stop 3; ip as voiceless vel stop 3; op as voiceless vel stop 3; ef as fricative s 3; fons (vowel only) as nasal 1; pons (vowel only) as nasal 1; mons (vowel only) as nasal 1; frons (vowel only) as nasal 1; op (vowel only) as nasal 1; oc (vowel only) as nasal 1; ob (vowel only) as nasal 1; of (vowel only) as nasal 1; ot (vowel only) as nasal 1; ox (vowel only) as nasal 1; om (vowel only) as nasal 1; on (vowel only) as nasal 1; u as nasal 1; runt (vowel only) as nasal 1; bunt (vowel only) as nasal 1; lunt (vowel only) as nasal 1; ux (vowel only) as nasal 1; u (vowel only) as nasal 1; op as nasal 1; oc as nasal 1; ob as nasal 1; of as nasal 1; ix as tap 1; ox as nasal 1

## C. Closing consonants in the corpus

119 GABC files, 8085 sung syllables; 3026 of 8085 (37.4%) close on a consonant, 218 on a cluster. First phone: s 802, n 601, m 528, t 362, r 343, l 134, k 130, d 63, b 26, p 21, f 13, g 3.

