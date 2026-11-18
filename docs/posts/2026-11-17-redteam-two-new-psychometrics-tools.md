---
title: "Red-teaming two new psychometrics tools on their first day"
seo_title: "Red-teaming a Cronbach's alpha and IRT calculator"
date: 2026-11-17
tags: [redteam, scale-reliability, item-response-theory, testing, psychometrics]
description: "A red-team run seeded 20 faults into two new survey tools: tests caught 9 of the 16 that matter, and a billion-resample bootstrap never ended."
---

Two tools for people who build tests and questionnaires shipped yesterday.
[Scale Reliability](https://marisstella.app/scale-reliability/) gives Cronbach's alpha, McDonald's omega
and an item analysis. [Item Response Theory](https://marisstella.app/item-response-theory/) fits Rasch and
2PL models to right/wrong answers. Both were already checked against reference software (pingouin,
factor_analyzer, R's ltm), so today's red-team run asked a different question: if a later change broke
something, would the tests notice?

## Seeded faults

The run made 20 small edits to the two engines, one at a time, and ran each tool's tests after each edit.
Four edits could not change any answer: for example, a loop that reads one slot past the end of an array,
where the extra slot always holds `undefined` and is skipped. Of the other 16, the tests caught 9.

The seven that got through:

- **2PL standard errors.** The Rasch standard errors were checked against ltm's published numbers, but the
  2PL ones weren't checked at all. An edit that mixed up the two parameters per item went through. The new
  test works out the standard errors a second way, from the curvature of the likelihood itself, and
  compares the two.
- **Quoted headers.** In the IRT parser, an edit that stopped a closing quote from ending the field made `"Item, one",q2` read as one
  column. Nothing tested a quoted header.
- **Empty input.** With `null` as input, the parser could give a raw `TypeError` instead of "No data".
- **The last line of a paste.** In Scale Reliability, a CSV with no final newline could lose its last row
  when the table was one column wide or ended in an empty cell.
- **Reversing on a zero-width scale.** With the scale minimum equal to the maximum, reversing an item
  maps every answer to itself. The tool refuses that, but no test checked that it does.
- **The "more than one factor" warning.** The warning fires when the second eigenvalue is above 1 and the
  first is less than three times it. A threshold of 4 went through. The new test builds 400 random two-factor
  tables and checks that the warning appears exactly when the rule says it should.
- **The random number generator.** Swapping one `+` for a `-` still gives good random numbers, but every
  seeded bootstrap interval would change from one release to the next. A test now pins the first draw.

A rerun of all seven with the new tests in place catches every one: 16 of 16.

## One real defect

Scale Reliability accepted any number of bootstrap resamples. The page only offers 300 to 2,000, but the
command line and anyone calling the engine directly could ask for a billion. The run had no end in sight:
the test written to show the bug was killed by its 60-second timeout. Negative counts and words were
quietly treated as zero. The engine now takes a whole number from 0 to 20,000, the same cap as our
inter-rater agreement tool, and otherwise says what it expects.

The run record, with every fault and the line it touched, is
`prompts/runs/2026-11-17-session_01EhTJVLA9W2ZVEyVc91TrGK.json`.
