# Does the singing choir sing the written vowels?

Written by `node eval/vowel-check.mjs`. Formants are measured from the rendered audio by
linear prediction (`formants.mjs`: decimate to 11 kHz, order 12, median of the frames), and the vowel is
the nearest of the five targets in log F1 and log F2. Targets: Peterson and Barney (1952), men, Table II
(/ɑ/ 730/1090/2440, /ɛ/ 530/1840/2480, /i/ 270/2290/3010, /ɔ/ 570/840/2410, /u/ 300/870/2240 Hz).

## A. The estimator on signals it did not make

Harmonics of a -6 dB/octave source weighted by the analytic magnitude of the target cascade.

| pitch | /a/ F1, F2 (vowel read) | /e/ F1, F2 (vowel read) | /i/ F1, F2 (vowel read) | /o/ F1, F2 (vowel read) | /u/ F1, F2 (vowel read) |
|---|---|---|---|---|---|
| E2 | 735, 1091 (a) | 533, 1830 (e) | 268, 2291 (i) | 573, 842 (o) | 305, 874 (u) |
| A2 | 740, 1096 (a) | 540, 1843 (e) | 268, 2298 (i) | 565, 853 (o) | 306, 865 (u) |
| D3 | 733, 1087 (a) | 541, 1845 (e) | 287, 2303 (i) | 585, 869 (o) | 297, 871 (u) |
| G3 | 773, 1117 (a) | 557, 1825 (e) | 261, 2316 (i) | 585, 823 (o) | 312, 847 (u) |
| C4 | 763, 1058 (a) | 524, 1832 (e) | 268, 2350 (i) | 528, 810 (o) | 277, 829 (u) |
| E4 | 657, 1018 (a) | 588, 1887 (e) | 339, 2308 (i) | 652, 1006 (a) | 336, 931 (u) |

Vowel read right: 29 of 30 (96.7%).

## B. Held vowels through the MIDI path (2 s notes on la, le, li, lo, lu)

Singing (`sing: true`):

| pitch | /a/ F1, F2 (read) | /e/ F1, F2 (read) | /i/ F1, F2 (read) | /o/ F1, F2 (read) | /u/ F1, F2 (read) |
|---|---|---|---|---|---|
| E2 | 740, 1083 (a) | 533, 1850 (e) | 266, 2302 (i) | 568, 846 (o) | 296, 864 (u) |
| A2 | 698, 1089 (a) | 536, 1840 (e) | 261, 2293 (i) | 569, 867 (o) | 310, 875 (u) |
| D3 | 734, 1091 (a) | 539, 1845 (e) | 294, 2273 (i) | 584, 892 (o) | 295, 875 (u) |
| G3 | 756, 1079 (a) | 575, 1797 (e) | 237, 2327 (i) | 589, 853 (o) | 306, 839 (u) |
| C4 | 750, 1061 (a) | 527, 1836 (e) | 290, 2334 (i) | 536, 811 (o) | 314, 833 (u) |
| E4 | 659, 1022 (a) | 639, 1952 (e) | 344, 2306 (i) | 654, 989 (a) | 351, 951 (u) |

Vowel read right: 29 of 30 (96.7%). E2 to C4 (25 notes): F1 off by 3.4% on average (worst 12.1%), F2 1.5% (worst 6.2%), F3 1.1% (worst 3.1%).

The pad (`sing` off, the control):

| pitch | /a/ F1, F2 (read) | /e/ F1, F2 (read) | /i/ F1, F2 (read) | /o/ F1, F2 (read) | /u/ F1, F2 (read) |
|---|---|---|---|---|---|
| E2 | 589, 1023 (o) | 589, 1023 (o) | 589, 1023 (o) | 589, 1023 (o) | 589, 1023 (o) |
| A2 | 563, 972 (o) | 563, 972 (o) | 563, 972 (o) | 563, 972 (o) | 563, 972 (o) |
| D3 | 535, 1147 (a) | 535, 1147 (a) | 535, 1147 (a) | 535, 1147 (a) | 535, 1147 (a) |
| G3 | 592, 1288 (a) | 592, 1288 (a) | 592, 1288 (a) | 592, 1288 (a) | 592, 1288 (a) |
| C4 | 756, 1464 (a) | 756, 1464 (a) | 756, 1464 (a) | 756, 1464 (a) | 756, 1464 (a) |
| E4 | 767, 1835 (e) | 767, 1835 (e) | 767, 1835 (e) | 767, 1835 (e) | 767, 1835 (e) |

Vowel read right: 6 of 30 (20.0%).

## C. The corpus pieces (final D3, fitted to 4/4 at 124 BPM, every choir note of 0.2 s or more)

The window is the note from 60 ms in to 10 ms before its end (a diphthong's last note: up to where the glide starts), so the previous note's 50 ms legato crossfade has ended. On a syllable's first note the window starts later by the part of its consonant sung after the beat plus the 45 ms formant transition (the consonant goes before the beat where the previous note has room; `eval/consonant-check-report.md`), and it ends where the next syllable's consonant starts (up to half the note before the next beat). Notes left with under 0.1 s are skipped.

| piece | notes measured | singing: vowel read right | pad (control): read right | pad reads everything as |
|---|---|---|---|---|
| dies-irae | 335 | 317 of 335 (94.6%) | 103 of 611 (16.9%) | /a/ 428, /o/ 143, /e/ 40 |
| pange-lingua | 20 | 19 of 20 (95.0%) | 4 of 53 (7.5%) | /a/ 46, /o/ 6, /e/ 1 |
| veni-creator | 24 | 23 of 24 (95.8%) | 5 of 43 (11.6%) | /a/ 34, /o/ 7, /e/ 2 |
| te-deum | 367 | 345 of 367 (94.0%) | 127 of 633 (20.1%) | /a/ 599, /o/ 24, /e/ 10 |
| salve-regina | 174 | 161 of 174 (92.5%) | 41 of 231 (17.7%) | /a/ 160, /o/ 56, /e/ 15 |
| all | 920 | 865 of 920 (94.0%) | 280 of 1571 (17.8%) | |

This window runs on into a syllable's final consonant, which since the second round of codas (per-phone floors, up to half a short note; README "Final consonants, second round") takes more of a short note: with the first round's codas it read 895 of 920. Ending the window where the final consonant's formant transition starts (`codaPlan`), on the 715 notes left with 0.1 s or more: 698 of 715 (97.6%).

Singing, written vowel (rows) against vowel read (columns):

| written | /a/ | /e/ | /i/ | /o/ | /u/ |
|---|---|---|---|---|---|
| /a/ | 168 | 3 | 0 | 1 | 7 |
| /e/ | 0 | 262 | 7 | 0 | 0 |
| /i/ | 1 | 13 | 168 | 0 | 0 |
| /o/ | 0 | 5 | 0 | 120 | 5 |
| /u/ | 0 | 5 | 1 | 7 | 147 |

## E. The short /i/ on G3 (0.24 s, the corpus's eighth note at 124 BPM)

The waveform the corpus renders for it: F1 411, F2 2310, read as /e/. The same note with 20 other seeds (each voice's vibrato rate, phase and onset): 17 of 20 read /i/, F1 218 to 449 Hz. One voice instead of five, same 20 seeds: 20 of 20, F1 258 to 267 Hz. So the F1 reading of a short note moves with the beating of the five detuned voices near the first harmonics (196 and 392 Hz around a 270 Hz F1), and the cache repeats one unlucky draw.

## D. Every sung syllable in the corpus

119 GABC files, 8085 syllables with a note. Vowel read: 8085 of 8085 (100.0%); /a/ 1426, /e/ 2250, /i/ 2068, /o/ 1030, /u/ 1311; 78 diphthongs. No vowel (sung on the pad's /a/): none.

