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
