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
| E2 | 25 of 30 (83.3%) | 30 of 30 (100.0%) |
| A2 | 28 of 30 (93.3%) | 30 of 30 (100.0%) |
| D3 | 29 of 30 (96.7%) | 30 of 30 (100.0%) |
| G3 | 25 of 30 (83.3%) | 28 of 30 (93.3%) |
| C4 | 24 of 30 (80.0%) | 28 of 30 (93.3%) |
| E4 | 26 of 30 (86.7%) | 28 of 30 (93.3%) |

All pitches: 157 of 180 (87.2%) read exactly (class, voicing, place); 162 of 180 (90.0%) by class alone. The vowel-only choir on the same syllables reads as no consonant 174 of 180 (96.7%).

Misses:

- E2 *ad* (voiced alv stop) read as nasal
- E2 *ab* (voiced lab stop) read as nasal
- E2 *unt* (nasal) read as voiceless alv stop
- E2 *ant* (nasal) read as voiceless alv stop
- E2 *unc* (nasal) read as voiceless vel stop
- A2 *unt* (nasal) read as voiceless alv stop
- A2 *unc* (nasal) read as voiceless vel stop
- D3 *ap* (voiceless lab stop) read as nasal
- G3 *is* (fricative s) read as fricative voiced
- G3 *ab* (voiced lab stop) read as nasal
- G3 *unt* (nasal) read as voiceless alv stop
- G3 *unc* (nasal) read as voiceless vel stop
- G3 *i* (none) read as fricative voiced
- C4 *ad* (voiced alv stop) read as voiceless alv stop
- C4 *ab* (voiced lab stop) read as voiceless vel stop
- C4 *ap* (voiceless lab stop) read as voiceless vel stop
- C4 *unt* (nasal) read as voiceless alv stop
- C4 *unc* (nasal) read as voiceless vel stop
- C4 *i* (none) read as fricative voiced
- E4 *is* (fricative s) read as fricative voiced
- E4 *unt* (nasal) read as voiceless alv stop
- E4 *unc* (nasal) read as voiceless vel stop
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
| dies-irae | 75 | 69 of 75 (92.0%) | 75 of 75 (100.0%) |
| pange-lingua | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| veni-creator | 1 | 1 of 1 (100.0%) | 1 of 1 (100.0%) |
| te-deum | 65 | 54 of 65 (83.1%) | 64 of 65 (98.5%) |
| salve-regina | 16 | 13 of 16 (81.3%) | 15 of 16 (93.8%) |
| all | 162 | 142 of 162 (87.7%) | 160 of 162 (98.8%) |

By class alone: 143 of 162 (88.3%). Before a syllable that opens on a consonant: 67 of 79 (84.8%); before a vowel or a rest: 75 of 83 (90.4%). Syllables that close on their vowel: 210 of 220 (95.5%) read as no consonant (vowel-only choir: 207 of 220 (94.1%)). Too short for a steady vowel before the coda, skipped: 743.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 72 of 73 (98.6%) |
| nasal | 28 of 39 (71.8%) |
| voiceless alv stop | 17 of 17 (100.0%) |
| tap | 9 of 14 (64.3%) |
| voiceless vel stop (cluster k s) | 7 of 8 (87.5%) |
| voiceless vel stop | 5 of 5 (100.0%) |
| nasal (cluster n s) | 0 of 2 (0.0%) |
| none | 1 of 1 (100.0%) |
| voiced lab stop | 1 of 1 (100.0%) |
| nasal (cluster n t) | 1 of 1 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 30 | 1 | 0 | 0 | 0 |
| fricative | 0 | 74 | 0 | 0 | 0 |
| nasal | 0 | 3 | 29 | 0 | 10 |
| tap | 0 | 0 | 0 | 9 | 5 |
| none | 0 | 0 | 0 | 0 | 1 |

Misses:

- dies-irae *num,* (then Co), 242 ms: nasal read as none
- dies-irae *num.* (then Mors), 242 ms: nasal read as none
- dies-irae *tum* (then re), 242 ms: nasal read as none
- dies-irae *vix* (then ju), 242 ms: voiceless vel stop read as fricative s
- dies-irae *quam* (then re), 242 ms: nasal read as none
- dies-irae *ens*, 242 ms: nasal read as fricative s
- te-deum *ter* (then ra), 242 ms: tap read as none
- te-deum *ter* (then ra), 242 ms: tap read as none
- te-deum *per*, 242 ms: tap read as none
- te-deum *ter* (then rá), 242 ms: tap read as none
- te-deum *rum* (then san), 242 ms: nasal read as none
- te-deum *tum.* (then Tu), 242 ms: nasal read as none
- te-deum *in*, 242 ms: nasal read as fricative voiced
- te-deum *num.* (then Per), 242 ms: nasal read as none
- te-deum *um*, 242 ms: nasal read as none
- te-deum *dar*, 242 ms: tap read as none
- te-deum *num.*, 242 ms: nasal read as none
- salve-regina *bis* (then post), 484 ms: fricative s read as fricative voiced
- salve-regina *um*, 484 ms: nasal read as none
- salve-regina *mens :*, 484 ms: nasal read as fricative s

## D. Held out: ten Graduale pieces (every sixth file of corpus/gregobase-1908)

3400, 3406, 3412, 3418, 3424, 3430, 3437, 3444, 3450, 3456; same settings and rules as B. Chosen by file name before the second round's changes, and scored before and after them without its misses being read in between; scored again after the third round (README "Final consonants, third round"), when E below is the clean set.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3400 | 14 | 13 of 14 (92.9%) | 14 of 14 (100.0%) |
| gregobase-1908/3406 | 9 | 7 of 9 (77.8%) | 8 of 9 (88.9%) |
| gregobase-1908/3412 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3418 | 6 | 6 of 6 (100.0%) | 6 of 6 (100.0%) |
| gregobase-1908/3424 | 8 | 8 of 8 (100.0%) | 8 of 8 (100.0%) |
| gregobase-1908/3430 | 10 | 10 of 10 (100.0%) | 10 of 10 (100.0%) |
| gregobase-1908/3437 | 3 | 3 of 3 (100.0%) | 3 of 3 (100.0%) |
| gregobase-1908/3444 | 7 | 6 of 7 (85.7%) | 7 of 7 (100.0%) |
| gregobase-1908/3450 | 5 | 5 of 5 (100.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3456 | 3 | 3 of 3 (100.0%) | 2 of 3 (66.7%) |
| all | 70 | 66 of 70 (94.3%) | 68 of 70 (97.1%) |

By class alone: 66 of 70 (94.3%). Before a syllable that opens on a consonant: 12 of 14 (85.7%); before a vowel or a rest: 54 of 56 (96.4%). Syllables that close on their vowel: 172 of 179 (96.1%) read as no consonant (vowel-only choir: 169 of 179 (94.4%)). Too short for a steady vowel before the coda, skipped: 367.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 29 of 29 (100.0%) |
| nasal | 11 of 12 (91.7%) |
| voiceless alv stop | 11 of 12 (91.7%) |
| tap | 7 of 9 (77.8%) |
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
| tap | 0 | 0 | 0 | 7 | 2 |

Misses:

- gregobase-1908/3400 *um*, 242 ms: nasal read as none
- gregobase-1908/3406 *TUR* (then ju), 242 ms: tap read as none
- gregobase-1908/3406 *bit*, 242 ms: voiceless alv stop read as fricative voiced
- gregobase-1908/3444 *ter* (then ram:), 242 ms: tap read as none

## E. Held out, second set: ten more Graduale pieces (every sixth file from the fourth)

3403, 3409, 3415, 3421, 3427, 3434, 3440, 3447, 3453, 3459; same settings and rules as B. Chosen by file name and scored before the third round's changes (README "Final consonants, third round"), then once after them; its misses were not read in between.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| gregobase-1908/3403 | 9 | 9 of 9 (100.0%) | 8 of 9 (88.9%) |
| gregobase-1908/3409 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3415 | 12 | 8 of 12 (66.7%) | 12 of 12 (100.0%) |
| gregobase-1908/3421 | 7 | 6 of 7 (85.7%) | 7 of 7 (100.0%) |
| gregobase-1908/3427 | 4 | 4 of 4 (100.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3434 | 19 | 18 of 19 (94.7%) | 19 of 19 (100.0%) |
| gregobase-1908/3440 | 7 | 7 of 7 (100.0%) | 7 of 7 (100.0%) |
| gregobase-1908/3447 | 4 | 3 of 4 (75.0%) | 4 of 4 (100.0%) |
| gregobase-1908/3453 | 5 | 4 of 5 (80.0%) | 5 of 5 (100.0%) |
| gregobase-1908/3459 | 15 | 13 of 15 (86.7%) | 14 of 15 (93.3%) |
| all | 86 | 76 of 86 (88.4%) | 84 of 86 (97.7%) |

By class alone: 76 of 86 (88.4%). Before a syllable that opens on a consonant: 27 of 32 (84.4%); before a vowel or a rest: 49 of 54 (90.7%). Syllables that close on their vowel: 180 of 190 (94.7%) read as no consonant (vowel-only choir: 183 of 190 (96.3%)). Too short for a steady vowel before the coda, skipped: 359.

By written consonant (a cluster scored on its first phone is listed apart):

| written | read exactly |
|---|---|
| fricative s | 32 of 32 (100.0%) |
| nasal | 18 of 22 (81.8%) |
| voiceless alv stop | 13 of 13 (100.0%) |
| tap | 5 of 11 (45.5%) |
| nasal (cluster n t) | 3 of 3 (100.0%) |
| voiceless vel stop (cluster k s) | 3 of 3 (100.0%) |
| voiced lab stop | 1 of 1 (100.0%) |
| fricative s (cluster s t) | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 17 | 0 | 0 | 0 | 0 |
| fricative | 0 | 33 | 0 | 0 | 0 |
| nasal | 0 | 1 | 21 | 0 | 3 |
| tap | 0 | 0 | 0 | 5 | 6 |

Misses:

- gregobase-1908/3415 *sor* (then ror), 242 ms: tap read as none
- gregobase-1908/3415 *er,*, 242 ms: tap read as none
- gregobase-1908/3415 *lum*, 242 ms: nasal read as none
- gregobase-1908/3415 *tem:*, 242 ms: nasal read as none
- gregobase-1908/3421 *NAR* (then RA), 242 ms: tap read as none
- gregobase-1908/3434 *ter* (then ra), 242 ms: tap read as none
- gregobase-1908/3447 *num,*, 242 ms: nasal read as none
- gregobase-1908/3453 *ter* (then ra.), 242 ms: tap read as none
- gregobase-1908/3459 *ter* (then rae.), 242 ms: tap read as none
- gregobase-1908/3459 *in*, 242 ms: nasal read as fricative voiced

## F. Final /l/ against the nasals: the 51 files of the other gregobase-1908-* folders

51 files, none scored by this check before (the scan-check sets); same settings and filters as B. Pre-registered in this script's header before its first run: the murmur's own tilt (readCoda `murmurTilt`, 28 dB) against the same reader without it.

| final consonant | read with the tilt rule | without it |
|---|---|---|
| /l/ (should read as none) | none 4 of 4 (100.0%), nasal 0 of 4 (0.0%) | none 3 of 4 (75.0%), nasal 1 of 4 (25.0%) |
| m, n, gn (should read as nasal) | 96 of 137 (70.1%) | 96 of 137 (70.1%) |

/l/ not read as none (with the rule):

- none

Nasals not read as nasal (with the rule):

- gregobase-1908-checked/3650 *num*: read as none
- gregobase-1908-checked/3727 *num.*: read as none
- gregobase-1908-checked/3831 *sunt*: read as voiced alv stop
- gregobase-1908-checked/3912 *non*: read as none
- gregobase-1908-checked/3912 *in*: read as fricative voiced
- gregobase-1908-checked/3912 *lum,*: read as none
- gregobase-1908-checked/3912 *in*: read as fricative voiced
- gregobase-1908-checked/3912 *sunt.*: read as voiced alv stop
- gregobase-1908-checked/3912 *sunt.*: read as voiceless alv stop
- gregobase-1908-checked/3949 *lum*: read as none
- gregobase-1908-checked/3949 *sunt*: read as voiceless alv stop
- gregobase-1908-clef/3461 *rum:*: read as none
- gregobase-1908-clef/3461 *tem,*: read as none
- gregobase-1908-clef/3551 *bunt*: read as voiceless alv stop
- gregobase-1908-clef/3551 *rum*: read as none
- gregobase-1908-clef/3551 *sunt*: read as voiced alv stop
- gregobase-1908-clef/3562 *plum*: read as none
- gregobase-1908-clef/3679 *cum,*: read as none
- gregobase-1908-clef/3762 *non*: read as none
- gregobase-1908-clef/3762 *sum*: read as none
- gregobase-1908-clef/3775 *sum*: read as none
- gregobase-1908-curl/3483 *trum*: read as none
- gregobase-1908-curl/3483 *lum*: read as none
- gregobase-1908-curl/3533 *in*: read as fricative voiced
- gregobase-1908-curl/3533 *num.*: read as none
- gregobase-1908-curl/3545 *um*: read as none
- gregobase-1908-curl/3545 *um*: read as none
- gregobase-1908-curl/3550 *sunt*: read as voiced alv stop
- gregobase-1908-curl/3704 *bum*: read as none
- gregobase-1908-stroke/3464 *plum*: read as none
- gregobase-1908-stroke/3464 *in*: read as fricative voiced
- gregobase-1908-stroke/3464 *runt*: read as none
- gregobase-1908-stroke/3465 *sunt*: read as voiceless alv stop
- gregobase-1908-stroke/3468 *runt,*: read as voiced alv stop
- gregobase-1908-stroke/3470 *tent.*: read as voiceless alv stop
- gregobase-1908-stroke/3477 *runt*: read as voiceless alv stop
- gregobase-1908-stroke/3478 *bum*: read as none
- gregobase-1908-stroke/3481 *num,*: read as none
- gregobase-1908-stroke/3481 *dum*: read as none
- gregobase-1908-stroke/3482 *plum*: read as none
- gregobase-1908-stroke/3482 *tam*: read as none

## C. Closing consonants in the corpus

119 GABC files, 8085 sung syllables; 3026 of 8085 (37.4%) close on a consonant, 218 on a cluster. First phone: s 802, n 601, m 528, t 362, r 343, l 134, k 130, d 63, b 26, p 21, f 13, g 3.

