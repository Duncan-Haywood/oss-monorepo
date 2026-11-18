# The one-step cephalicus rule, read both ways

Written by `node eval/one-step-check.mjs` (scan reader: `scan.mjs`; the rule is `oneStepCephalicus`,
`ONE_STEP`, off with `readPage(img, { oneStep: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.
"One-step cephalici" are GABC liquescents whose note before, in the same group, is a punctum one step higher
(gf~, fe~ ...); "head too" counts those read whose head is also paired at its pitch.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents | one-step cephalici read (head too) |
|---|---|---|---|---|---|---|---|---|---|
| one-step-hollow-fresh-pages.json | 1 | 219 / 219 | 0 / 0 | 1 / 1 | 1 / 1 | 2 / 2 of 3 | 0 / 0 of 0 | 1 / 1 | 0 (0) / 0 (0) of 1 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

None.

## One-step cephalici still missed (rule on)

Where: the scan note paired with the head or the nearest paired neighbour. Head: the scan note paired with the GABC head. Read: the scan note paired with the small note.

| list | piece | syllable `group` (want) | where | head read as | small note read as |
|---|---|---|---|---|---|
| one-step-hollow-fresh-pages.json | GregoBase 3357 (Ecce oculi) | e `gf~` (gf~) | leaf 455, staff 2, x 1209 | g (liquescent) | nothing |
