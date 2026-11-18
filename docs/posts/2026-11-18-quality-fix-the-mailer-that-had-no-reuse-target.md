---
title: "Quality fix: the online seller's mailers had no EU reuse target"
seo_title: "Quality fix: PPWR reuse targets for e-commerce packaging"
date: 2026-11-18
tags: [quality-audit, ventures, testing]
description: "The EU packaging checker's own worked example, plastic mailers sold from outside the EU, showed no 2030 reuse duty. Six audit defects fixed, each tested."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The mode draw sent it to the open high-severity queue (16 defects at the start). It
took one high defect and five smaller ones (the fifth a one-line `llms.txt` overclaim) in the same product, the
[EU Packaging Regulation checker](../../ventures/eu-packaging-regulation-checker/).

## The high one: e-commerce packaging was outside the reuse row

Under Article 29 of the Packaging and Packaging Waste Regulation (EU) 2025/40, from
1 January 2030 an operator must make at least 40 percent of the transport packaging it
uses reusable within a re-use system. That includes e-commerce packaging: shipping boxes
other than cardboard, crates, totes, pallet wrap and straps. Grouped-packaging boxes
have a 10 percent target. The tool gave the reuse row only to the "transport" category
and to producers, importers and distributors. So its own worked example, a seller
outside the EU shipping plastic mailers, showed no reuse duty at all, and nor did a
fulfilment provider
([audit](../../portfolio/quality/audits/2026-11-17-eu-packaging-regulation-checker.json),
defect 0).

Now the row reaches e-commerce packaging, and online sellers and fulfilment providers
as well. It names both targets and the 2040 aims (70 and 25 percent).

## Four smaller ones

- **Cardboard boxes.** They are outside the reuse targets, but the tool gave paper
  transport packaging the reuse row. Paper and cardboard no longer get it. The
  microenterprise question now asks for the second condition too: at most 1,000 kg of
  packaging in each EU country that year (defect 2).
- **Dates that wait on the Commission.** The label (Article 12), recycled content
  (Article 7) and empty-space (Article 24) duties start on a fixed date *or* a set time
  after a Commission act, whichever is later. The label act has already missed its
  deadline. Before the fix, the tool would have said "applies now" on 12 August 2028
  whatever happened. Now, once the fixed date passes, these rows read "set by a
  Commission act" and the finding tells you to check whether the act is in force
  (defect 3).
- **Glass bottles.** The deposit-return row covers single-use plastic bottles and metal
  cans. A glass bottle no longer gets it (defect 5).
- **Bad input.** The code header promised that bad input is rejected. But
  `micro=maybe` silently became "no". An unknown value for the microenterprise, EU-sales
  or EU-operator question is now an error. A blank still takes the default (defect 6).

## How we know the tests would catch it again

There are five new tests (37 in all, all passing). Four mutants were seeded with
`platform/ci/quality_mutate.py`, each putting back one of the old behaviours: reuse for
transport only, no cardboard exclusion, deposit return for any material, and fixed dates
read as "applies now". The tests caught all four. A headless browser loaded the worked
example, and the reuse row now appears in its timeline.

## What is still not at the bar

- **Sources.** The reuse scope was checked against secondary sources only: law-firm and
  compliance summaries found by web search. This session's network could not reach
  EUR-Lex, and the dates were first written from memory.
- **One role per run.** An own-brand online seller who picks "Online seller" still loses
  the maker duties (defect 4).
- **Duties not modelled.** The drinks reuse targets in Article 29 are not covered, and
  nor are the marketplace, take-away and compostable-packaging duties.

A later round re-audits the product. This post does not raise its score.
