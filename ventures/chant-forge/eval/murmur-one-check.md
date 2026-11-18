# A murmur sung from one voice (sing.mjs `murmurSource: 'one'`), 2026-11-18

The fault (eval/cluster-um-report.md): a final nasal's murmur is the five detuned voices low-passed, and those voices
beat. Where the closure falls in the beating decides how dark the murmur is. The option takes the murmur (and a
final nasal's hum) from one voice, at the chorus's average power (that voice divided by the square root of five).
Everything before the closure is the same samples (`murmur-one.test.mjs`).

## The murmur itself: `node eval/murmur-phase.mjs`

*bum*, *brum* and *bun* on A#3, D4 and E4, quarters and eighths at 88 BPM, the onset's lead swept 40-200 ms in 10 ms
steps (306 notes). *brum* sings the same as *bum* here: the onset only moves the closure through its lead.

```
opts {}
all: n 306, coda - vowel -18 / -11 / -4 dB, range -26 to 1, 15 dB or darker 61; murmur's brightest 40 ms -39 median, -19 worst dB; low-band dip -5 median, -23 worst dB
bum quarter: n 51, coda - vowel -16 / -10 / -3 dB, range -23 to 1, 15 dB or darker 9; murmur's brightest 40 ms -38 median, -19 worst dB; low-band dip -5 median, -23 worst dB
bum eighth: n 51, coda - vowel -16 / -12 / -5 dB, range -21 to 1, 15 dB or darker 10; murmur's brightest 40 ms -40 median, -22 worst dB; low-band dip -4 median, -14 worst dB
bun quarter: n 51, coda - vowel -19 / -12 / -4 dB, range -26 to -1, 15 dB or darker 12; murmur's brightest 40 ms -39 median, -20 worst dB; low-band dip -5 median, -23 worst dB
bun eighth: n 51, coda - vowel -19 / -13 / -7 dB, range -26 to -0, 15 dB or darker 11; murmur's brightest 40 ms -41 median, -21 worst dB; low-band dip -4 median, -14 worst dB

opts {"murmurSource":"one"}
all: n 306, coda - vowel -13 / -10 / -5 dB, range -16 to -1, 15 dB or darker 4; murmur's brightest 40 ms -42 median, -42 worst dB; low-band dip -3 median, -3 worst dB
bum quarter: n 51, coda - vowel -12 / -10 / -5 dB, range -16 to -3, 15 dB or darker 1; murmur's brightest 40 ms -42 median, -42 worst dB; low-band dip -3 median, -3 worst dB
bum eighth: n 51, coda - vowel -13 / -8 / -4 dB, range -16 to -1, 15 dB or darker 1; murmur's brightest 40 ms -42 median, -42 worst dB; low-band dip -3 median, -3 worst dB
bun quarter: n 51, coda - vowel -13 / -11 / -6 dB, range -15 to -4, 15 dB or darker 0; murmur's brightest 40 ms -44 median, -42 worst dB; low-band dip -3 median, -3 worst dB
bun eighth: n 51, coda - vowel -13 / -9 / -5 dB, range -15 to -2, 15 dB or darker 0; murmur's brightest 40 ms -44 median, -42 worst dB; low-band dip -3 median, -3 worst dB
```

With one voice the murmur's brightest 40 ms is -42 dB at every lead (the chorus: -19 dB at worst), and its low band
never dips more than 3 dB (the chorus: 23 dB, a hum that drops out). It is not darker against its vowel: the coda's
darkest 40 ms is 10 dB under the /u/ at the median either way. The chorus reached 15 dB on 61 of 306 notes by
landing in a dark beat; one voice reaches it on 4. /u/ is itself dark (-30 to -48 dB on these notes).

## Read back: `node eval/coda-check.mjs --murmur one` against the default (13 min each)

Rows that moved, singing read exactly (the vowel-only controls did not move in any part):

| part | default | murmurSource one |
|---|---|---|
| A (tuned set) | 179 of 180 | 178 of 180 |
| B corpus, nasals | 37 of 39 | 38 of 39 |
| D held out, nasals | 12 of 12 | 8 of 12 |
| E held out, nasals | 20 of 22 | 19 of 22 |
| H held out, nasals | 44 of 46 | 45 of 46 |
| F, m n gn read as nasal | 209 of 218 | 200 of 218 |
| R nasal codas | 48 of 48 | 46 of 48 |
| X n-clusters as their nasal | 54 of 60 | 58 of 60 |
| Y n-clusters | 42 of 48 | 44 of 48 |
| Z nasal codas / n-clusters | 46 of 48 / 68 of 72 | 43 of 48 / 67 of 72 |
| a dark-vowel nasals | 116 of 144 | 124 of 144 |
| b dark-vowel nasals | 133 of 144 | 134 of 144 |
| c dark-vowel nasals | 123 of 144 | 131 of 144 |
| d dark-vowel nasals | 136 of 144 | 133 of 144 |
| J, K, N, O, P cluster syllables | 128, 133, 118, 116, 114 | 129, 134, 119, 119, 119 |

So the dark-vowel and cluster parts gain (c +8, a +8, P +5) and the Graduale corpus pieces at final D3 lose (D -4, F
-9, Z -3). Nothing here was pre-registered, and every one of these parts has been read before, so none of it is a
held-out result. The option stays opt-in.

A second level was tried and dropped: the one voice at the chorus's coherent level (no division, the level
`nasalGain` assumes). Read on parts B, D, E, H, F, R, Z, a-d it was far worse: B's nasals 15 of 39, F's 108 of 218, a-d's
dark-vowel nasals 91-95 of 144. The reader's level rule needs the murmur well under the vowel.
