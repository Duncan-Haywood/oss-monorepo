# Does the level-matched murmur read as a voiced labial stop? (part h, 2026-11-23)

`murmurSource: 'match'` (eval/murmur-match-check.md) read 2,220 nasals exactly against the default's 2,141, but its
five new misses (R's *pin*, Z's *fen* and *gim*, A's E2 *am* and *an*) were mostly low or front-vowel nasals, and four
of the five read as a voiced labial stop. The hypothesis (H): a murmur held at the chorus's level that fades with the
note's release looks to the reader like a voice bar with a burst after it. Those misses had been read, so H needed
fresh cells.

## Registration

Written in the header of `eval/coda-check.mjs` ("Thirty-second round") and committed as 1882658eb before part h was
run with anything. Part h: 16 nasals after /a/, /e/ or /i/, 6 voiced labial stops, 2 voiceless labial stops and 2
others, none sung in any other part, at 80 BPM (no other part's tempo), on E2-E4 (13 pitches), quarters and eighths,
sung and vowel-only. The choir rendered twice (default murmur, `match`), the default reader on both. N = nasal cells
the default reads exactly and `match` does not.

- (0) test condition: N is 4 or more of 416;
- (1) at least half of N read as a voiced labial stop under `match`;
- (2) nasals read as a voiced labial stop: under `match` at least 3 more than, and at least twice, the default's.

## Result (`node eval/coda-check.mjs --parts h`, 1 min 42 s)

| part h | default murmur | `match` |
|---|---|---|
| nasals after /a/, /e/ or /i/ read exactly (of 416) | 412 | 407 |
| of them read as a voiced labial stop | 3 | 9 |
| voiced labial stops read exactly (of 156) | 145 | 145 |
| voiceless labial stops, others (of 52 each) | 52, 52 | 52, 52 |
| vowel-only control read as none (of 676) | 676 | 676 |

N = 9, and all 9 read as a voiced labial stop: *pam* (eighth E2, quarter B2), *flan*, *gren*, *spen* (eighth E2),
*vam*, *drin* (quarter B2), *clin* (eighth B2), *pan* (quarter A2). `match` also cleared the default's 4 nasal misses
(*fam* eighth E2 and D4, *pam* eighth A2, *pan* quarter B2), so the net on this part is 412 to 407.

- (0) **holds**: N = 9.
- (1) **holds**: 9 of 9.
- (2) **holds**: 9 against 3 (needed 6 or more).

**H is supported.** Two things the registration did not predict: every one of the 9 is on E2 to B2 (none from D3
up), and the default murmur makes the same confusion, less often (3 of its 4 nasal misses are /b/ too, also E2-B2).
So the fault is the low notes' reading of a murmur's end, and `match` makes it more common, not new.

The 11 voiced labial stops missed on both columns are place errors (read as velar: *crib*, *plab*, *smeb*, *vib*,
*glab* on A3-D4), the same with either murmur; not part of H.

## What the reader called a burst: `node eval/labial-burst-diag.mjs`

The diagnostic re-reads the four losing cells (eighth E2, quarter B2, eighth B2, quarter A2) and prints readCoda's
full result for every nasal not read as a nasal (`eval/labial-burst-diag-nasals.txt`, 11 rows), and with `VB=1` the
same cells' 48 real voiced labial stops (`eval/labial-burst-diag-vb.txt`).

| | false /b/ (nasals, 11) | real /b/ (48) |
|---|---|---|
| burst power above 1 kHz, share of the burst's total (`hi1R`) | 4e-7 to 4.1e-5 | 0.11 to 0.79 |
| burst centroid | 1,166-1,428 Hz | 1,835-2,249 Hz |

The "burst" in every false /b/ has almost nothing above 1 kHz: a hundred-thousandth of its power or less, against at
least a tenth for every real /b/ here. It is the low-passed murmur stopping, not a release. A real stop's burst is
broadband noise.

## Next

A burst needs some energy above 1 kHz (for example `hi1R` of 1e-3 or more: a gap of 3.4 orders of magnitude on these
cells). That threshold was read off part h's own misses, so it has to be tried on the development parts and then
registered on a fresh part (new syllables and tempo, low pitches E2-B2 weighted) before it can ship, and every part's
real voiced stops checked for how low their `hi1R` goes. If it holds, `match` can be registered again for the default.

Synthesised audio read by a program; nobody has listened to it.

## Rerun

    node eval/coda-check.mjs --parts h --out report.md
    node eval/labial-burst-diag.mjs; VB=1 node eval/labial-burst-diag.mjs
