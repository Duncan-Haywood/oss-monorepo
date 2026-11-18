---
title: "Quality fix: an hourly quote with a break-even minimum for movers, and a sunset promise the guide now keeps"
seo_title: "Quality fix: hourly moving quotes and honest sunset portraits"
date: 2026-11-16
tags: [quality-audit, ventures, testing]
description: "Movers get an hourly quote with a break-even minimum and a valuation line; the wedding timeline now says when sunset portraits miss golden hour."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It worked three open medium defects from two venture audits of 2026-11-07. Neither
product's scores change here: a later round re-audits them.

## Moving bid calculator: the bid stopped where the quote starts

The [audit](../../portfolio/quality/audits/2026-11-07-moving-bid-calculator.json)
found the arithmetic right (four outputs recomputed by hand) but the product too narrow.
It gave a lump-sum price, and most local moves are sold as "$X an hour for a crew and truck,
N-hour minimum", with a valuation option on the order form.

The [tool](https://marisstella.app/moving-bid-calculator/) now turns the same job into an
hourly quote. The point is that the costs split in two. The truck day, fuel and materials
are fixed per job, and only labor scales with the clock, so a rate that earns the margin
on the estimated hours loses money on a short job. For the sample job (1,100 cu ft, three
movers at $22 with 25% burden, $225 of truck, fuel and materials, 15% overhead, 20% margin):

| | worked by hand |
|---|---|
| cost per crew hour | 22 × 1.25 × 3 × 1.15 = $94.88 |
| fixed per job | (150 + 40 + 35) × 1.15 = $258.75 |
| suggested rate | $1,061.09 ÷ 6.22 h = $170.59, posted at $175 |
| breaks even at | 258.75 ÷ (175 − 94.875) = 3.23 h, so a **3.5-hour minimum** |
| earns the 20% margin from | 258.75 ÷ (175 × 0.8 − 94.875) = 5.73 h |

A table runs the day 25% short, on estimate and 25% long. On the long day the hourly quote
keeps $364 and the flat price $65. On the short day it is the other way round, $115 against
$360. That is the decision a mover is really making: who carries the risk of a long day. A
rate below the crew's loaded labor gets no minimum, and the page says why: every extra hour
loses more.

The valuation line converts volume to weight (7 lb per cubic foot, an editable rule of
thumb) and shows the released-value cap at 60 cents per pound per article. That is the
federal interstate figure (49 CFR 375.201, the "Waiver of Full Value Protection" option).
Local moves follow state rules, so it is an input, not a constant. For a declared value
the page also shows the full value protection charge at the mover's own rate per $1,000,
plus the exposure above released value. The page has no rate of its own, and it says so.
Every figure in the table above is pinned in `calc.test.mjs`. Two seeded bugs in the new
code are caught: the minimum taken from the margin hours instead of the break-even, and
the released rate changed to 50 cents.

## Wedding day timeline: "about 30 minutes before sunset" was 65

The [audit](../../portfolio/quality/audits/2026-11-07-wedding-day-timeline-builder.json)
found that the guide's own worked example contradicted its FAQ. The FAQ promised sunset
portraits about 30 minutes before sunset. In the example, though, the engine placed them
at 5:41 PM for a 6:46 PM sunset, 65 minutes early, and nothing on the page said so. The
reason is ordinary: at 6:16 PM the couple is at the parent dances. The slot search accepted
the miss without saying anything.

Now:

- the engine warns whenever the slot is more than 10 minutes off the 30-minute mark, and
  names the event in the way ("because "Parent dances" occupies the two of you at 6:16 PM");
- the summary card says how many minutes before sunset the portraits are;
- the [guide](https://marisstella.app/wedding-day-timeline-builder/wedding-photography-timeline.html)
  states 5:41 PM and 65 minutes, and the two changes that fix it. A 90-minute cocktail hour
  or a 5:00 PM ceremony each give 6:11 PM, 35 minutes before sunset. All of these figures
  are computed by the engine and asserted in the tests.

The audit also found that two of three seeded changes to portrait durations (family setup
+5 → +0, couple portraits 30 → 25) left every test green. Tests now pin the 15 / 30 / 26 /
35-minute blocks and the guide's 106-minute sum, and both mutations fail them. The
third defect, semicolons in calendar text, had already been fixed by PR #15047 with nothing
recorded. The audit now records that, and a test pins it.

## Not done

The wedding builder's relative sitemap and canonical URLs are rewritten to absolute ones
at deploy, so the served copy is clean (`served-copy.mjs`: no retired origin left). The
33-city preset list is still a limit. The moving calculator's proposal still prints the
lump sum only; an hourly proposal is the next step.
