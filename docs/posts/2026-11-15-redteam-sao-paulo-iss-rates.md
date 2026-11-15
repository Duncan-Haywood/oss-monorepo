---
title: "Red-teaming São Paulo's ISS rate table: 11 of 17 seeded faults caught, 6 holes closed"
seo_title: "Mutation testing an NFS-e ISS rate checker: 11 of 17 faults caught"
date: 2026-11-15
tags: [testing, mutation-testing, brazil, nfs-e, e-invoicing, javascript, redteam]
description: "18 faults seeded into the NFS-e checker's ISS rate code, written on main the same day. The suite caught 11 of 17 real ones; six new tests catch all of them now."
---

Today's red-team run aimed at code that landed on `main` a few hours
earlier: [e-invoice preflight](https://marisstella.app/einvoice-preflight/)'s
São Paulo ISS table (`iss-city-rates.mjs`), which checks that an NFS-e's
service tax rate is one São Paulo's own law (Lei 13.701/2003, art. 16) sets for
that service, and its sibling `iss-rate.mjs`, which checks the national 2% to 5%
band and reads the service item code.

## Seeded faults

`redteam.py campaign` changed one operator or constant at a time and ran the
venture's 2,541 tests after each change (about 15 s a run).

| File | Seeded | Caught | Escaped | Equivalent |
|---|---|---|---|---|
| `iss-city-rates.mjs` | 8 | 4 | 3 | 1 |
| `iss-rate.mjs` | 10 | 7 | 3 | 0 |

Before the fix the suite caught 11 of the 17 faults that could change an
answer (65%). Each of the six that got through now has a test, and
`redteam.py rerun` confirms that test fails with the fault applied (17 of 17).

What got through:

- **The "São Paulo numbers it differently" note.** The city's service list
  closed four gaps that LC 116 left where items were vetoed, so four runs of
  subitems carry different numbers (São Paulo's 17.24 is LC 17.25). The
  checker says so in its message, but only 17.25 was tested, so faults moving
  the edge of the 3.x and 13.x runs went unnoticed. The new test takes the
  first and last subitem of every run and checks that the São Paulo number in
  the message maps back through `spToLc`, and that the subitems on either side
  get no note.
- **Reading the item code.** Nothing tested that a city's own breakdown after
  the subitem (`14.0101`) still reads as LC 14.01. Nothing tested that a
  five-digit code such as São Paulo's own `02919` is refused rather than read
  as an LC item either.
- **The benefit check's guards.** `issBurdenProblem` had no test with no band
  (2033 on, once ISS is replaced) or with a zero or negative base. With `||`
  turned into `&&`, a 2033 file would crash the checker.

The fault left untested changes the tolerance for float error from `1e-6` to
`1e-7`. Rates in these files have at most a few decimals and the table's
rates have one, so the only error in play is `0.029 * 100` landing
4 × 10⁻¹⁶ off. No input the schemas allow gives a different answer.

## Real defects

None found. Reading the code as an attacker (rates with commas, a `%` sign,
fractions, whitespace in the city code, years at the edges of 2024 to 2028)
found nothing wrong: unreadable rates are skipped rather than flagged, and the
callers trim and normalise the item code first.

A third campaign on the league scheduler's `nights.mjs` was stopped after one
fault: its suite takes 250 s a run, so eight faults would have taken 33
minutes.

The checker is an offline observation, not tax advice. Run record:
`prompts/runs/2026-11-15-session_01E5sJKnp8sgjv4bu1hc1mDU.json`.
