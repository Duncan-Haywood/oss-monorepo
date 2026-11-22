---
title: "A weekly watch beside the daily one: hearing a season build in a shop's revenue"
seo_title: "Detecting a slow revenue climb: a weekly watch beside the daily"
date: 2026-11-22
tags: [changepoint-detection, ecommerce, monitoring, pre-registration]
description: "On 150 fresh simulated shops, a drift watch on weekly totals beside the daily watch heard 131 big climbs within 8 weeks, against 92 for the daily watch alone."
---

A daily alert on a shop's revenue is built to hear a sudden step: a checkout that breaks, a price change that lands
badly, a big customer who stops ordering. It is bad at a slow climb. When the autumn season builds over six weeks,
each day looks much like the day before, and the daily watch answers the question it was asked: did today break
from the last few weeks? Mostly, no.

Yesterday's round in the [changepoint detector](../../ventures/changepoint-detector/README.md) tried three checks
built for slow climbs. None passed on its own. One reading stood out, though: the drift watch run on **weekly
totals**, next to the daily watch, heard far more of the big climbs. That reading was taken on the same simulated
shops the round had already looked at, so it proved nothing. Today's round tested it properly.

## The test

The bars were written and committed before any shop was simulated (`eval/weekly-beside.prereg.md`). The shops were
built differently from every earlier round, so a pass could not come from one generator's quirks. Each shop drew its
own size, its own weekday pattern, and in half the shops one weekday shut every week. Its day-to-day noise had
heavier tails than before (a Student t with 5 degrees of freedom). There were 150 unchanged shops, 150 that climbed
to 1.3 times their level and 150 that climbed to 1.9 times, each over four to eight weeks. Both watches ran exactly
as shipped, with nothing tuned.

| | daily watch alone | daily plus weekly |
|---|---|---|
| x1.9 climbs heard within 8 weeks (of 150) | 92 | **131** |
| x1.3 climbs heard within 8 weeks (of 150) | 65 | 87 |
| false alerts per 100 days, unchanged shops | 0.94 | 1.07 |

All three bars passed: at least 15 more big climbs heard, at most 0.15 more false alerts per 100 days, and a gain in
both the calmer and the noisier half of the shops. The cost is about half a false alert a year.

The gain was largest in shops that shut one weekday (+23 of 68). A weekly total does not see the shut day at all.

## What it is not

A weekly watch is late by design. Among the climbs heard, the first alert came a median of 27 days in, against 21
for the daily watch, because the climbs only the weekly watch hears are heard weeks into the climb. It tells you the
season is building. It will not tell you the checkout broke this morning; that is still the daily watch's job.

On the one real shop in the repository, a UK online retailer's public order history, the weekly watch dated the
autumn build-up in revenue to the week of 12 September 2011 and sent it on 10 October. The daily watch on revenue sent
nothing after mid-August that year. In the previous year's file the weekly watch heard the build-up five weeks before
the daily one. That is one shop over two years: an illustration, not a measurement.

## How to use it

The watch now takes `--weekly`. It sums the daily rows into whole Monday-to-Sunday weeks before watching, and leaves
out the unfinished current week so a week's total never changes between runs. Run it as a second watch with its own
state file:

```
node watch.mjs daily.csv --state daily.json --period 7
node watch.mjs daily.csv --state weekly.json --weekly --detector drift
```

It reads the same export, so a shop already feeding the daily watch from Stripe or Shopify needs one more line in
its scheduled job. It runs in your own account, like the rest of the tool, and it is MIT licensed.

The results are statistical analysis of data you supply, not financial advice. The full tables, the pre-registration
and the script are in the venture's README under "Round 7".
