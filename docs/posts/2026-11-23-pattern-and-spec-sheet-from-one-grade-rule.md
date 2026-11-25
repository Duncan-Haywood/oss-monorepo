---
title: "A sample sewn from our own pattern failed our own spec sheet: one grade rule fixes it, plus a neckband"
seo_title: "Pattern and spec sheet from one grade rule, plus a neckband"
date: 2026-11-23
tags: [fashion, pattern-making, tech-pack, grading, clothing-design-studio]
description: "Clothing Design Studio's pattern and tech-pack spec disagreed on shoulder and neck in 5 of 6 sizes. Both now read one grade rule, and tees get a neckband."
---

[Clothing Design Studio](../../ventures/clothing-design-studio/) drafts tee,
long sleeve, crewneck and hoodie patterns and prints a measurement spec sheet
in the tech pack the designer sends to a factory. A factory measures the first
sample against that sheet. On 2026-11-22 a quality audit, written from the
checks a technical designer would make first, found that the two disagreed. A
garment sewn exactly to the studio's pattern would have failed the studio's
spec on across-shoulder in 5 of 6 sizes and on neck width in 5 of 6. The
pattern drew 40.0 to 58.2 cm across the shoulder from XS to XXL, and the spec
asked for 39.4 to 55.8. The pattern's neck went from 15.1 to 22.3 cm, and the
spec held 18 cm in every size.

The cause was ordinary: two files typed their own figures. The pattern took
every point as a share of each size's chest, so the neck and shoulder grew as
fast as the chest did, about twice the steps of a menswear grade chart. The
spec took the shoulder as 41% of the finished chest and gave one neck for all
sizes.

## One rule, read by both

A new module, `grade.mjs`, is now the only place these numbers live. Size M
keeps the block's drafting ratios: an 18 cm neck opening and 47.4 cm across
the shoulder on a regular tee for a 100 cm chest. Other sizes move from M by a
grade per centimetre of chest. The neck moves 0.64 cm and the across-shoulder
1.76 cm per 8 cm chest step, against 1.44 and 3.6 before. The pattern draws its
block from the rule and the spec sheet reads the drafted block, so the two
can't drift apart again. If the factory has its own grade rule, one option
replaces ours in both places.

| tee, regular | XS | S | M | L | XL | XXL |
|---|---|---|---|---|---|---|
| Across shoulder, pattern = spec (cm) | 40.0* | 44.0* | 47.4 | 49.2 | 50.9 | 52.7 |
| Neck opening, pattern = spec (cm) | 16.7 | 17.4 | 18.0 | 18.6 | 19.3 | 19.9 |

\* At regular fit the two smallest sizes run into the block's 4 cm minimum
armhole width, so the shoulder there comes from the armhole, not the grade.
The pattern page says so in plain words. The spec prints the same figure, so
the sample still passes. A pattern maker would narrow the shoulder or add
chest ease there. We haven't tuned that yet.

The test doesn't trust the block's own numbers. For every garment, fit and
size (96 cases) it reads the shoulder point and the neck corner off the drafted
front piece's stitch line. It turns those into a "sewn sample", runs it through
the same sample check a designer uses on a factory's measurements, and all 96
pass.

## The missing neckband

The audit also noted that a tee pattern had no neckband piece. Tees, long
sleeves and crewnecks now get one: a rib strip cut double width and folded (2
cm finished, 2.5 on the crewneck). Its length is 85% of the whole neck seam,
measured along the drafted neck curves of front and back. On an M tee that's a
39.3 cm band for a 46.3 cm neck. The band appears in the SVG and DXF downloads,
the tiled PDF, the nesting marker (counted as rib, which usually comes off a
separate roll) and the rectangle cutting plan, which had typed its own band
length before.

## Update 2026-11-25: the fabric estimate used a third set of sleeves

The pattern and the spec sheet agreed after this fix, but the cutting
marker (`marker.mjs`, which estimates how many metres to buy) kept its own
sleeve table: tee 22 cm, hoodie 62 cm, the same in every size. The spec sheet
says 21 cm and 64 cm at M, plus or minus 1 cm per size. The marker now
takes each size's sleeve from the drafted pattern, as it already did the
neckband, and a test checks it against the spec sheet in every garment and
size. Re-checked the same day: 72 of 72 sleeve, shoulder and neck points
across tee, long sleeve, crewneck and hoodie are within the spec's
tolerance.

For a run of 143 tees (S30, M70, L40, XXL3) on 150 cm cloth, the quote moves
from 135.74 m to 132.06 m, about 2.7% less cloth. The marker still adds a
1.5 cm seam allowance where the pattern adds 1 cm, so it stays on the
cautious side. A factory's own marker figure always wins.

## What is still unproven

The grade steps and the 85% band ratio are typical trade figures written from
general knowledge. They don't come from a factory's grade rule or a sewn
sample. A firmer rib wants nearer 90%. Armhole depth still grades 1.88 cm per
step, which the audit also called steep. The next real test is a factory's
grade rule, or a sample sewn from these pieces and put on a tape measure.

Try it: [pattern pieces, graded](https://marisstella.app/clothing-design-studio/pattern.html)
and the [measurement spec and sample check](https://marisstella.app/clothing-design-studio/spec.html).
Free, MIT licensed, and nothing leaves the browser. These are starting blocks,
not a fitted pattern or professional advice. Cut a test garment first.
