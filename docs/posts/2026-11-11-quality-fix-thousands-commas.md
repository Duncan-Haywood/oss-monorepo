---
title: "Quality fixes: one comma, 21 calculators, and a $1,200 price read as $1"
seo_title: "Thousands commas broke 21 calculators: the quality fix"
date: 2026-11-11
tags: [quality-audit, testing, input-handling]
description: "Three audits found the same bug: a pasted $1,200 split at the comma and shifted every field. 21 calculators now read it right; 6 still don't."
---

Method: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in
mode `fix` (`python3 platform/ci/quality_audit.py mode`), which works the open-defect queue
instead of drawing new subjects. No scores change here: the audits keep the scores from before
the fix, and a later round re-audits.

## The number

The high-severity queue went from **37 open defects to 34**. The three were one bug, in three
tools that three different audits looked at on three different days. They were fixed in
[PR #14663](https://github.com/Duncan-Haywood/oss-monorepo/pull/14663). The same pattern turned
up in 18 more calculators no audit had drawn yet. Those got the half of the fix that needs no
per-tool knowledge. Six more calculators split in a different way and are not fixed yet.

## The bug

Most of these calculators take a box of pasted lines, one item per line: `Tire set, 720, 520, 50, 100`.
Each one split the line on every comma. A tire set over $1,000 is the main line for a tire shop,
and a spreadsheet's CSV export writes that price as `"$1,200"`, quotes included. Split on the
comma, that becomes `"$1` and `200"`. The tool then stripped the quotes and read on: price $1,
parts $200, 800 labor minutes, 60% attach rate. The answer looked like a normal answer, with
no warning, and all of it was wrong.

The audits recorded it like this:

- **Tire shop ticket margin** (audited 2026-11-10): `Tires,$1,200,800,60,100` came out as a
  $1 tire set.
- **Handyman minimum job** (2026-11-09): materials 1,200 and price 1,500 came out as materials 1
  and price 200.
- **Med spa treatment profit** (2026-11-07): a $1,200 treatment came out as a $1 one, with a
  contribution of −$705.70.

## What changed

In those three tools, a pasted line now goes through a small CSV reader. A cell that starts with
a double quote keeps its commas, and a doubled `""` inside it is a literal quote. A quote later in
a cell is just text, so `17" rims` still works as a name. A line with a tab is read as a
spreadsheet paste and split on tabs only. When a bare comma inside a number does split it, the
tool now refuses the line and says why ("a comma inside a number such as $1,200: type 1200, or
put the number in quotes"). There are two signs of that: more cells than the tool has columns,
or a `$1` or `$12` cell followed by a three-digit cell.

I tried a looser rule first: any dollar amount followed by a three-digit cell. The tire shop's
own test suite rejected it, because `Tires,$720,520,50,100` is an ordinary line (a $720 price,
a $520 cost). So the kept rule is the narrower one. One case is still out of reach. An unquoted
`1,200` with no dollar sign, on a line that still fits the column count because a field was left
blank, reads the same as two numbers. Nothing can tell those apart. For that case each input
label now says to write `1200` or quote it.

Each fix has a test that fails on the old code. I seeded three bugs to check the tests bite
(no column check, no quote handling, and dropping `(1 − fee)` from the tire-shop discount). A
test failed every time. The last one was a separate medium-severity finding from the tire-shop
audit: its discount test ran only at a 0% card fee, so that mutation used to pass. The new test
recomputes the loss by hand at 3%: $100 × 10% × 0.97 = $9.70.

## The 18 the audits had not reached

The audit samples are random, so three hits on the same pattern suggested many more. A search of
`ventures/*/calc.mjs` found 18 more calculators with the same split expression, character for
character. Among them: auction car flips, dog grooming, house cleaning quotes, NSA IDR offers, a
shift roster and a container load planner. All 18 now use the same quote-aware reader, and
each has a test pinning it in its own suite. That fixes the spreadsheet-export case, which is the
common one. A bare `1,200` with no quotes still splits in those 18, because refusing the line
needs each tool's own column count. That is listed as follow-up work.

## Not fixed

Six calculators split on tabs *and* commas at once (`/\t|,/`). In those, even a tab paste of
`1,200` breaks: chiropractor new-patient ROI, fractional executive rate, grant writer proposal
price, service van stock, tile layout and timber sale offer. They are listed with line numbers
in [`docs/reports/quality-thousands-comma-sweep.md`](../reports/quality-thousands-comma-sweep.md).
Only `calc.mjs` files were searched.

## What this says about the process

The bug was copied, not invented 21 times. One parser line went into a template, and each new
calculator inherited it. Each audit found it in one tool and filed it as that tool's defect.
[The last reflection](../../portfolio/quality/reflections/2026-11-10-where-quality-drops-off.md)
said `input-handling` defects come from the implementation stage. This round adds a narrower
point: when the implementation is a copied line, the fix should be a sweep, and the next audit
that finds a defect should grep for its siblings before filing it as a one-off.

*These are free, MIT-licensed estimators, not financial or professional advice; check your own
numbers.*
