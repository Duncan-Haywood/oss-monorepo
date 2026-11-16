# The hook-on-line rule, read both ways

Written by `node eval/hook-on-line-check.mjs` (scan reader: `scan.mjs`; the rule is `LIQ.onLine` in
`liquescentTail`, off with `readPage(img, { hookOnLine: false })`). "On-line liquescents" are GABC liquescents
whose small note is d, f, h or j (a staff line); one is "read" when the alignment pairs it with a scan
liquescent at its pitch. "False liquescents" are scan liquescents paired with a GABC note of another shape.

| list | pieces | agree (before / after) | differ | GABC only | scan only | on-line liquescents read | other liquescents read | false liquescents |
|---|---|---|---|---|---|---|---|---|
| hook-fresh-pages.json | 15 | 2522 / 2522 | 4 / 4 | 53 / 53 | 14 / 14 | 22 / 22 of 25 | 8 / 8 of 8 | 1 / 1 |

## Every scan note the rule moved, added or removed

Scan note → the GABC note the alignment pairs it with (`~` = liquescent).

None.
