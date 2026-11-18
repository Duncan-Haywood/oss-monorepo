# One voice at the chorus's level (sing.mjs `murmurSource: 'match'`), 2026-11-18

## Why the one-voice murmur lost part D's nasals: `node eval/murmur-one-diag.mjs`

eval/murmur-one-check.md left one question open: `murmurSource: 'one'` gained on the dark-vowel and cluster parts
but lost part D's D3 Graduale nasals (12 to 8 of 12). All four losses are 242 ms notes (eighths at 124 BPM):
3400 *um* (read as none), 3400 *non* (tap), 3430 *num* (none), 3450 *um:* before *lae* (voiced labial stop).

The diagnostic reads every final nasal of part D both ways, with the coda-check window and reference, and prints the
murmur's held level (median of the frames from 60 to 20 ms before the window's end) against the vowel:

| note | chorus | one voice | one minus chorus | read (chorus, one) |
|---|---|---|---|---|
| 3400 *um* | -15 | -5 | +10 | nasal, none |
| 3400 *um,* | -21 | -22 | -2 | nasal, nasal |
| 3400 *non* | -17 | -6 | +11 | nasal, tap |
| 3406 *in* | -10 | -3 | +7 | nasal, nasal |
| 3406 *am* | -16 | -18 | -2 | nasal, nasal |
| 3412 *am,* | -15 | -16 | -1 | nasal, nasal |
| 3418 *dent* | -11 | -5 | +6 | nasal, nasal |
| 3424 *nem* | -7 | -8 | -2 | nasal, nasal |
| 3424 *in* | -5 | -5 | +0 | nasal, nasal |
| 3430 *um.* | -21 | -22 | -2 | nasal, nasal |
| 3430 *num* | -9 | -2 | +7 | nasal, none |
| 3444 *ram:* | -30 | -20 | +10 | nasal, nasal |
| 3450 *um:* | -17 | -20 | -4 | nasal, stop |

The one voice's murmur is not at the chorus's level: it sits 4 dB under to 11 dB over it, note by note. The reader's
level rule wants a murmur more than 5 dB under the vowel, and *um*, *non* and *num* held at -5, -6 and -2 dB. The
frames (diagnostic output) show the rest: on *num* the one-voice murmur is only 18 dB darker than the vowel against
the chorus's 10-12, so the darkness test passes, but the level test does not.

Why: `murmurSource: 'one'` divides the one voice by the square root of five, the chorus's *average* (incoherent)
power. On D3 the five voices' detunes (-12 to +13 cents) are 0.6 to 2 Hz apart at the fundamental, so on a 242 ms
note their phases barely drift. Each note's chorus is frozen at one random alignment, its low band anywhere from
near nothing to five times the average, for the whole note. The vowel and the chorus's own murmur share that
alignment (both come from the same summed source), so their ratio is the one `nasalGain` sets. The one voice does
not share it. Where the note's chorus happened to be weak, the vowel was quiet and the one-voice murmur came out
almost as loud. 3450 *um:* is the opposite case: its window runs 250 ms past the note into the gap before *lae*,
and the steady one-voice murmur, then its fade, was read as a closure with a burst.

## The change: `murmurSource: 'match'` (opt-in)

The same single voice, its gain following the chorus: the chorus's and the one voice's low-passed source power
(the two 400 Hz low-passes the murmur already takes) are each averaged over 20 ms (`MATCH_TAU`), and the one voice
is scaled by the square root of their ratio. The gain follows until a coda's murmur starts and is held from there,
so the murmur starts at the level the chorus had at the closure and then holds, without the chorus's beats. An
opening's murmur follows throughout. Everything before the closure is the same samples.

On part D with the diagnostic (`--source match`), every final nasal reads as a nasal (13 of 13 in the diagnostic's
count, which includes the cluster *dent*); the held levels sit 10 dB under to 4 dB over the chorus's. Part D is
not held out: it was read for this diagnosis.

## Pre-registered, committed before any other part was run with `match`

Against the reader and synthesis on main (default chorus) and against `--murmur one` (eval/murmur-one-check.md's
table), full `node eval/coda-check.mjs --murmur match`:

1. The Graduale parts that `one` lost on recover to the default's score or better: D's nasals 12 of 12, F's m n gn
   read as nasal 209 of 218 or more, Z's nasal codas 46 of 48 or more, R's 48 of 48.
2. The dark-vowel parts keep at least half of `one`'s gain over the default: a 120 or more of 144 (default 116,
   one 124), c 127 or more (123, 131); b and d no lower than the lower of default and one (133).
3. Every vowel-only control and every bare-vowel row identical to the default (no nasal is sung in them).
4. Summed over every part's nasal rows in the table above, more read exactly than with the default and than with
   `one`.
5. `node eval/murmur-phase.mjs` with `match`: the murmur's brightest 40 ms at -38 dB or darker on every note and
   its low band dipping 6 dB or less (one's -42 and -3): the gain is held, so the one voice still does not beat.

If 1 to 4 hold, `match` replaces `one` as the candidate for the default; it stays opt-in in this PR either way.

## Results: full `node eval/coda-check.mjs`, default, `--murmur one` and `--murmur match` (run after the commit above)

The three runs were on the same tree (the corpus now has 147 files; F has 79 files, 218 nasals). The default's
report is eval/coda-check-report.md (refreshed: one corpus file had been added since its last run), `match`'s is
eval/coda-check-match-report.md. Every row that reads nasals, singing read exactly:

| part | default | one | match |
|---|---|---|---|
| B corpus, nasals | 37 of 39 | 38 | 38 |
| D held out, nasals | 12 of 12 | 8 | **12** |
| E held out, nasals | 20 of 22 | 19 | **22** |
| H held out, nasals | 44 of 46 | 45 | 45 |
| I development, nasals | 34 of 36 | 34 | 35 |
| F, m n gn read as nasal | 209 of 218 | 200 | **213** |
| J, K, N, O, P cluster syllables (of 132, 140, 120, 120, 120) | 128, 133, 118, 116, 114 | 129, 134, 119, 119, 119 | 132, 133, 120, 119, 118 |
| R nasal codas | 48 of 48 | 46 | 47 |
| T nasal codas | 47 of 48 | 47 | 47 |
| U nasal codas / n-cluster codas | 48 / 46 of 48 | 47 / 48 | 48 / 48 |
| X nasal codas / n-clusters | 43 of 48 / 54 of 60 | 43 / 58 | **46 / 60** |
| Y nasal codas / n-clusters | 46 of 48 / 42 of 48 | 46 / 44 | 48 / 43 |
| Z nasal codas / n-clusters | 46 of 48 / 68 of 72 | 43 / 67 | 44 / 71 |
| a dark-vowel nasals / n-clusters | 116 of 144 / 42 of 48 | 124 / 46 | **134** / 43 |
| b dark-vowel nasals / n-clusters | 133 of 144 / 47 of 48 | 134 / 47 | 137 / 47 |
| c dark-vowel nasals / n-clusters | 123 of 144 / 44 of 48 | 131 / 47 | **135** / 47 |
| d dark-vowel nasals / n-clusters | 136 of 144 / 47 of 48 | 133 / 48 | **141** / 47 |
| all of the above | 2,141 | 2,163 | **2,220** |
| A (tuned set, every class) | 179 of 180 | 178 | 177 |

The registration, prediction by prediction:

1. **Partly fails.** D 12 of 12 and F 213 of 218 hold; R's nasal codas 47 of 48 (wanted 48) and Z's 44 of 48
   (wanted 46 or more) do not.
2. **Holds.** a 134 (wanted 120), c 135 (127), b 137 (133), d 141 (133): more than `one`'s gain on every one.
3. **Holds.** All 108 vowel-only control and bare-vowel cells are identical to the default's.
4. **Holds.** 2,220 nasals read exactly against the default's 2,141 (+79) and `one`'s 2,163.
5. **Holds, but says nothing new.** `eval/murmur-phase.mjs` reads tilts only, and a gain does not change a tilt, so
   its output with `match` is identical to `one`'s (brightest 40 ms -42 dB at worst, low band dips 3 dB at most).

So `match` stays opt-in: the registration said both 1 and 4 had to hold. It is better than `one` on almost every row,
and better than the default on 2,220 to 2,141 nasals overall, but it is not a clean win.

Where it loses, one pattern runs through the new misses. A's E2 *am* and *an*, Z's *fen* and *gim* and R's *pin*
(a nasal read as none) are low or front-vowel nasals, and four of the five read as a voiced labial stop. A
held-level murmur that fades with the note's release can look like a voice bar with a burst after it. That is a
hypothesis, not a finding: those misses have been read, so the next test needs fresh cells (eval/release-cells.mjs
builds them without running the reader).

Other non-nasal rows moved by 1 to 3 either way: J's others 332 to 331 of 336, Q's 77 to 80 of 80, W's 32 to 33 of 36,
T's 93 to 95 of 96.
