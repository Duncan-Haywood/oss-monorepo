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
| E2 | 22 of 30 (73.3%) | 30 of 30 (100.0%) |
| A2 | 20 of 30 (66.7%) | 30 of 30 (100.0%) |
| D3 | 23 of 30 (76.7%) | 30 of 30 (100.0%) |
| G3 | 20 of 30 (66.7%) | 28 of 30 (93.3%) |
| C4 | 20 of 30 (66.7%) | 28 of 30 (93.3%) |
| E4 | 24 of 30 (80.0%) | 28 of 30 (93.3%) |

All pitches: 129 of 180 (71.7%) read exactly (class, voicing, place); 134 of 180 (74.4%) by class alone. The vowel-only choir on the same syllables reads as no consonant 174 of 180 (96.7%).

Misses:

- E2 *ad* (voiced alv stop) read as nasal
- E2 *ab* (voiced lab stop) read as nasal
- E2 *al* (none) read as nasal
- E2 *el* (none) read as nasal
- E2 *ax* (voiceless vel stop) read as fricative s
- E2 *ex* (voiceless vel stop) read as fricative s
- E2 *unt* (nasal) read as voiceless alv stop
- E2 *unc* (nasal) read as voiceless vel stop
- A2 *at* (voiceless alv stop) read as nasal
- A2 *ad* (voiced alv stop) read as nasal
- A2 *ab* (voiced lab stop) read as nasal
- A2 *ac* (voiceless vel stop) read as nasal
- A2 *al* (none) read as nasal
- A2 *el* (none) read as nasal
- A2 *ar* (tap) read as nasal
- A2 *ex* (voiceless vel stop) read as fricative s
- A2 *unt* (nasal) read as voiceless alv stop
- A2 *unc* (nasal) read as voiceless vel stop
- D3 *ab* (voiced lab stop) read as nasal
- D3 *ac* (voiceless vel stop) read as nasal
- D3 *ap* (voiceless lab stop) read as nasal
- D3 *um* (nasal) read as none
- D3 *al* (none) read as nasal
- D3 *unt* (nasal) read as voiceless alv stop
- D3 *unc* (nasal) read as voiceless vel stop
- G3 *is* (fricative s) read as fricative voiced
- G3 *ad* (voiced alv stop) read as nasal
- G3 *ab* (voiced lab stop) read as nasal
- G3 *ap* (voiceless lab stop) read as nasal
- G3 *um* (nasal) read as none
- G3 *al* (none) read as nasal
- G3 *ax* (voiceless vel stop) read as fricative s
- G3 *ex* (voiceless vel stop) read as fricative s
- G3 *unt* (nasal) read as voiceless alv stop
- G3 *i* (none) read as fricative voiced
- C4 *ad* (voiced alv stop) read as voiceless alv stop
- C4 *ab* (voiced lab stop) read as voiced vel stop
- C4 *ap* (voiceless lab stop) read as voiceless vel stop
- C4 *al* (none) read as nasal
- C4 *el* (none) read as nasal
- C4 *ax* (voiceless vel stop) read as nasal
- C4 *ex* (voiceless vel stop) read as fricative s
- C4 *unt* (nasal) read as voiceless alv stop
- C4 *unc* (nasal) read as voiceless vel stop
- C4 *i* (none) read as fricative voiced
- E4 *is* (fricative s) read as fricative voiced
- E4 *ab* (voiced lab stop) read as nasal
- E4 *al* (none) read as nasal
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

Not a clean held-out set: no threshold was set on it, but its first run (60.5%) was read for misses, which showed the window cutting off bursts at the next sound and /m/ after /u/ barely a murmur; both were fixed (in the reader's window and in sing.mjs) before this run. One looser nasal rule was also tried and dropped: it read 136 of 162 here (84.0%) but called 13 of the 30 vowel-only A2 fades in part A nasals.

The last note of every syllable that closes on a consonant, 0.2 s or more, with 60 ms of steady vowel before the coda's room. The window ends where the next sound starts (the next beat, less its opening consonant sung before it). The vowel-only control column is the same notes from the choir with no consonants: how often the reader (rightly) finds none.

| piece | syllables | singing: read exactly as written | vowel-only control: read as none |
|---|---|---|---|
| dies-irae | 75 | 61 of 75 (81.3%) | 75 of 75 (100.0%) |
| pange-lingua | 5 | 3 of 5 (60.0%) | 5 of 5 (100.0%) |
| veni-creator | 1 | 1 of 1 (100.0%) | 1 of 1 (100.0%) |
| te-deum | 65 | 46 of 65 (70.8%) | 64 of 65 (98.5%) |
| salve-regina | 16 | 12 of 16 (75.0%) | 15 of 16 (93.8%) |
| all | 162 | 123 of 162 (75.9%) | 160 of 162 (98.8%) |

By class alone: 129 of 162 (79.6%). Before a syllable that opens on a consonant: 59 of 79 (74.7%); before a vowel or a rest: 64 of 83 (77.1%). Syllables that close on their vowel: 209 of 220 (95.0%) read as no consonant (vowel-only choir: 207 of 220 (94.1%)). Too short for a steady vowel before the coda, skipped: 743.

By written consonant:

| written | read exactly |
|---|---|
| fricative s | 73 of 74 (98.6%) |
| nasal | 22 of 42 (52.4%) |
| voiceless alv stop | 14 of 17 (82.4%) |
| tap | 9 of 14 (64.3%) |
| voiceless vel stop | 3 of 13 (23.1%) |
| none | 1 of 1 (100.0%) |
| voiced lab stop | 1 of 1 (100.0%) |

Class written (rows) against class read (columns):

| written | stop | fricative | nasal | tap | none |
|---|---|---|---|---|---|
| stop | 23 | 8 | 0 | 0 | 0 |
| fricative | 0 | 74 | 0 | 0 | 0 |
| nasal | 0 | 3 | 22 | 0 | 17 |
| tap | 0 | 0 | 0 | 9 | 5 |
| none | 0 | 0 | 0 | 0 | 1 |

Misses:

- dies-irae *clum*, 242 ms: nasal read as none
- dies-irae *dex*, 242 ms: voiceless vel stop read as fricative s
- dies-irae *num,* (then Co), 242 ms: nasal read as none
- dies-irae *num.* (then Mors), 242 ms: nasal read as none
- dies-irae *Cum* (then re), 242 ms: nasal read as none
- dies-irae *dex*, 242 ms: voiceless vel stop read as fricative s
- dies-irae *tum* (then re), 242 ms: nasal read as none
- dies-irae *num* (then ro), 242 ms: nasal read as none
- dies-irae *vix* (then ju), 242 ms: voiceless vel stop read as fricative voiced
- dies-irae *dex*, 242 ms: voiceless vel stop read as fricative s
- dies-irae *fac* (then re), 242 ms: voiceless vel stop read as voiced vel stop
- dies-irae *ex*, 242 ms: voiceless vel stop read as fricative s
- dies-irae *ens*, 242 ms: nasal read as fricative s
- dies-irae *plex*, 242 ms: voiceless vel stop read as fricative s
- pange-lingua *Rex*, 242 ms: voiceless vel stop read as fricative s
- pange-lingua *um.*, 242 ms: nasal read as none
- te-deum *ter* (then ra), 242 ms: tap read as none
- te-deum *bim*, 242 ms: nasal read as none
- te-deum *ter* (then ra), 242 ms: tap read as none
- te-deum *rum* (then lau), 242 ms: nasal read as none
- te-deum *dat*, 242 ms: voiceless alv stop read as voiced alv stop
- te-deum *ex*, 242 ms: voiceless vel stop read as fricative s
- te-deum *per*, 242 ms: tap read as none
- te-deum *ter* (then rá), 242 ms: tap read as none
- te-deum *rum* (then san), 242 ms: nasal read as none
- te-deum *tum.* (then Tu), 242 ms: nasal read as none
- te-deum *rum.* (then Tu), 242 ms: nasal read as none
- te-deum *rum.* (then Tu), 242 ms: nasal read as none
- te-deum *fac* (then cum), 242 ms: voiceless vel stop read as voiced vel stop
- te-deum *Et* (then re), 242 ms: voiceless alv stop read as voiced alv stop
- te-deum *in*, 242 ms: nasal read as fricative voiced
- te-deum *num.* (then Per), 242 ms: nasal read as none
- te-deum *um*, 242 ms: nasal read as none
- te-deum *dar*, 242 ms: tap read as none
- te-deum *num.*, 242 ms: nasal read as none
- salve-regina *Et* (then Je), 242 ms: voiceless alv stop read as voiced alv stop
- salve-regina *bis* (then post), 484 ms: fricative s read as fricative voiced
- salve-regina *um*, 484 ms: nasal read as none
- salve-regina *mens :*, 484 ms: nasal read as fricative s

## C. Closing consonants in the corpus

119 GABC files, 8085 sung syllables; 3026 of 8085 (37.4%) close on a consonant, 218 on a cluster. First phone: s 802, n 601, m 528, t 362, r 343, l 134, k 130, d 63, b 26, p 21, f 13, g 3.

