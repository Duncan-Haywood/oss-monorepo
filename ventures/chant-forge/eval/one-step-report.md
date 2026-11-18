# The one-step cephalicus rule, read both ways

Written by `node eval/one-step-check.mjs` (scan reader: `scan.mjs`; the rule is `oneStepCephalicus`,
`ONE_STEP`, off with `readPage(img, { oneStep: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.
"One-step cephalici" are GABC liquescents whose note before, in the same group, is a punctum one step higher
(gf~, fe~ ...); "head too" counts those read whose head is also paired at its pitch.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents | one-step cephalici read (head too) |
|---|---|---|---|---|---|---|---|---|---|
| one-step-fresh-pages.json | 12 | 2062 / 2063 | 0 / 0 | 35 / 34 | 4 / 3 | 10 / 10 of 11 | 19 / 20 of 22 | 1 / 1 | 16 (16) / 17 (17) of 17 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

| list | piece | where | before | after |
|---|---|---|---|---|
| one-step-fresh-pages.json | GregoBase 3573 (Ego autem cum) | leaf 467, staff 6, x 1742 | e → no GABC note | not read |
| one-step-fresh-pages.json | GregoBase 3573 (Ego autem cum) | leaf 467, staff 6, x 1743 | not read | e~ → no GABC note |
| one-step-fresh-pages.json | GregoBase 3580 (Calix benedictionis) | leaf 500, staff 9, x 207 | c → no GABC note | not read |
| one-step-fresh-pages.json | GregoBase 3580 (Calix benedictionis) | leaf 500, staff 9, x 207 | not read | c~ → no GABC note |
| one-step-fresh-pages.json | GregoBase 3642 (Christo confixus sum) | leaf 441, staff 4, x 1684 | g → g~ (in `hg~`) | not read |
| one-step-fresh-pages.json | GregoBase 3642 (Christo confixus sum) | leaf 441, staff 4, x 1684 | not read | g~ → g~ (in `hg~`) |
