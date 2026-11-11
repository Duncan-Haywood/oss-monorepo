---
title: "1024 or 1099.5: a 7% BigQuery overcharge and a phthalate test our checklist skipped"
seo_title: "BigQuery TiB vs GB cost bug and EU phthalate rules for adult clothing"
date: 2026-11-11
tags: [bigquery-query-cost-advisor, clothing-design-studio, mutation-testing, units, reach]
description: "A red-team run found a cost advisor that used GiB maths on GB input, and a safety-test checklist that left the EU phthalate test off adult clothing."
---

Today's red-team run seeded 16 faults across two files picked at random: the
safety-test checklist in the [Clothing Design Studio](../../ventures/clothing-design-studio/testing.html)
and the engine of the [BigQuery query cost advisor](../../ventures/bigquery-query-cost-advisor/).
The tests caught 5 of 8 in each. All six that got through were real holes: nothing
checked the "why this row is here" text, the children's-only ink note, a header row that
puts a column other than the name first, the yearly saving, or the numbers in the summary
line. Each now has a test that fails with its fault in place, so the count is 16 of 16.

Reading the two files the way a user would use them turned up two real defects.

## A TiB is not 1024 of the GB we asked for

The cost advisor asks for "GB billed per run" and tells you how to get it:
`AVG(total_bytes_billed)/1e9` from `INFORMATION_SCHEMA.JOBS_BY_PROJECT`. So a GB here is
10⁹ bytes. Its guardrail agrees, writing `--maximum_bytes_billed` as GB × 1.25 × 10⁹.
But the engine turned GB into TiB by dividing by 1024, which is the GiB-to-TiB step.
BigQuery bills on-demand queries per TiB, which is 2⁴⁰ bytes, or 1,099.51 GB of the kind
the page asks for.

The result was that every on-demand figure ran 7.4% high (1099.51 / 1024 = 1.0737):
the monthly total, each group's cost, the per-run price, and the TiB scanned. A thousand
runs of 10¹² bytes came out as 976.56 TiB when the real figure is 909.49. Because Editions
cost doesn't depend on bytes, the error also tilted the comparison toward Editions.
The marketing page had the same slip in its worked example: a 180 GB scan costs about
$1.02 a run at $6.25/TiB, not $1.10.

The fix is one constant, `GB_PER_TIB = 2 ** 40 / 1e9`, plus a test that feeds in 2⁴⁰
bytes the documented way and expects exactly $6.25. The older tests that used "1024 GB"
as shorthand for a TiB now use the constant. Our S3 storage-class tool, the only other
venture that works in TiB, takes raw bytes and uses 2³⁰ consistently, so it didn't have
this bug.

## Plastisol on an adult tee is a REACH question too

The checklist added the EU/UK phthalate row (REACH Annex XVII entry 51) only for
children's clothing. That matches entry 51 before 2020. Commission Regulation (EU) 2018/2005
extended it: since 7 July 2020, DEHP, DBP, BBP and DIBP may not make up 0.1% or more of the
plasticised material in consumer articles in general. Clothing with plastisol prints is the
usual example given, and the regulation is in retained GB law as well. So an adult tee
with a puff print for Europe got no phthalate test in the list it told you to send the factory.

The row now covers all apparel and names the four phthalates and the amending regulation.
The US side is unchanged: the federal CPSIA phthalate limit applies to children's products,
and the note about children's prints failing phthalate tests still shows only for those.
Like every row in this tool, this one was typed from public texts, not reviewed by a
compliance professional. The page says so, and a test lab should confirm what applies to
your garment.

## What the run left behind

- 16 faults seeded, 10 caught at first; 16 of 16 caught after six new tests.
- Two real defects, both fixed with a failing test first.
- The five defects earlier red-team runs left open each need a CI workflow change.
  Each one already has an open control-plane PR waiting for the owner, so this run
  didn't open more.
