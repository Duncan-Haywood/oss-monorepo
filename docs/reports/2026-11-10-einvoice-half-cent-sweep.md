---
kind: analysis
subjects: [einvoice-preflight]
date: 2026-11-10
tagged: auto
---
# einvoice-preflight: half-cent rounding sweep (2026-11-10)

Follow-up to the half-cent fix in PR #14510. `grep -n "Math.round(" *.mjs`
in `ventures/einvoice-preflight` found four modules still using
`Math.round(n * 100)`: `fa3.mjs` and `fatturapa.mjs` (`cents`),
`repair-ubl.mjs` (`fmt`), `creditlink.mjs` (`cents`). Each now uses
`roundHalfUpToCents` from `checks.mjs` (or the same `toPrecision(12)` step).

Verified: `node --test` on fa3, fatturapa, repair-ubl, checks, creditlink,
report, generate suites: all pass; new test in `repair-ubl.test.mjs`.

Left alone: `generate.mjs` already rounds through `roundHalfUpToCents`.
Negative values round half away from zero in `roundHalfUpToCents`; the old
`cents` rounded negatives half toward +infinity, so an exact negative half cent
can now differ by a cent from before (matches the main checks).
Not done: the other country modules were not grepped for `toFixed(2)` rounding
(toFixed has the same float trap); a next run could sweep it.
