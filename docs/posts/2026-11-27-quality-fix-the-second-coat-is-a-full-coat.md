---
title: "Quality fix: our sealcoat bid treated the second coat as a light one"
seo_title: "Sealcoat coverage per gallon: the second coat is a full coat"
date: 2026-11-27
tags: [quality-audit, asphalt-sealcoat-bid-calculator, for-customers, contractors, bidding]
description: "Our sealcoat bid priced the second coat at 110-125 sq ft per gallon with no field to change it. Manufacturer sheets use one rate per coat. Fixed."
---

How far a gallon of sealcoat goes decides how many gallons you order and
put on the bid. The [Asphalt Sealcoating Bid Calculator](../../ventures/asphalt-sealcoat-bid-calculator/)
got the second coat wrong. Each surface type started its first coat at a
common figure (90 sq ft per gallon for a driveway, 80 for a parking lot).
The second coat was then set thinner: 120 for a driveway, 110 for a lot,
and up to 125 for a walkway. The page had no field for it, so a
contractor could not fix it.

Manufacturer data sheets don't do that. SealMaster's PMCTS and PMM sheets,
for example, give one coverage rate for every coat: about 70 to 82 sq ft
per gallon of mixed material. The quality audit of 2026-11-26
([audit file](../../portfolio/quality/audits/2026-11-26-asphalt-sealcoat-bid-calculator.json))
found that on the default 800 sq ft two-coat driveway, the tool ordered
15.56 gallons. At the sheet's rates the job needs 19.5 to 22.9. That is 20
to 32% short, on the line a contractor buys sealer from.

## What changed

- **One rate per coat.** Every surface type now starts its later coats at
  the same figure as its first coat. Pavement condition still scales the
  first coat only, because the first coat is the one that fills oxidized
  texture.
- **A field for later coats.** Each surface row now has a "Later coats sq
  ft/gal" field next to the first-coat field. Choosing a different surface
  type no longer overwrites a figure you have typed into either field.
  Before this fix, the hidden second-coat figure could also go stale when
  the surface type changed.
- **The stencil add-on is a checkbox.** Before, the page added 0.3 hours
  and $18 of handicap stencils to every job with stalls, and you could not
  see or remove it. It is now a checkbox, off by default.
  This also brings the comparison page's worked example back in line with
  what the tool shows for the same lot.

## The new numbers

On the default driveway (800 sq ft, two coats, oxidized, $4.25 per
gallon, 25% margin), the tool now orders 17.78 gallons and prices the job
at $386.41, up from $371.93. The cost to run it is $289.80. The hard
800 sq ft parking lot on the [flat-price comparison](../../ventures/asphalt-sealcoat-bid-calculator/vs-a-flat-per-square-foot-price.html)
now prices at $1,006.77, on a cost of $755.07. Both figures are pinned by
tests that run `calc.mjs`.

The starting figures (80 to 95 sq ft per gallon) are still higher than the
70 to 82 on SealMaster's sheets, which are for mixed material. Real
coverage depends on the sealer, the dilution and the pavement. The tool
still has no field for concentrate versus mixed material or for dilution,
and that gap is listed in the README. So take both coverage figures from
your own sealer's data sheet. The gallons line shows the result straight
away.

## How we know

- `node --test '*.test.mjs'` in the venture: 126 pass. The new tests check
  that every preset uses the same coverage on every coat, at or below
  100 sq ft per gallon, and they pin the default driveway at 17.78 gal and
  $386.41.
- Seeded mutant: setting the driveway's second coat back to 120 makes the
  tests fail (`platform/ci/quality_mutate.py`).
- We loaded the page in Chromium and checked these results. The default
  job showed $386.41 and 17.8 gal. With 24 stalls it showed $608.47, and
  with the stencil box ticked, $650.65. With later coats set to 75 sq ft
  per gallon it showed 19.6 gal. Choosing a different surface type kept the
  typed figure. The page had no horizontal scroll at 390 px wide.

A later quality round re-audits the tool. This post does not raise its
score.

*This calculator does arithmetic on your inputs. It is not a manufacturer
yield, a specification or a pavement assessment. Check your sealer's data
sheet and local VOC rules.*
