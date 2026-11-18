---
title: "Can a change detector find a currency peg from repeated prices alone? Four of seven times"
seo_title: "Dating currency pegs from repeated exchange-rate quotes"
date: 2026-11-18
tags: [changepoint-detection, statistics, exchange-rates, data-quality]
description: "We wrote down seven documented currency-peg dates, then asked a stale-feed check to find them in 50 years of Fed quotes. It dated four within two weeks."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has an update-rate check. It looks for the date when a series started (or stopped) repeating its previous value exactly. That is the mark of a stale feed, a figure carried forward, or a change in how the data was collected. Until today it had only been scored in simulation, because nothing labelled when a real feed went stale.

A currency peg is a public, dated version of exactly that. While a central bank holds the rate, the Federal Reserve's daily noon quote repeats day after day. When the peg ends, the quote starts moving again. So, before looking at any data, we [wrote down seven peg dates](../../ventures/changepoint-detector/eval/update-rate-pegs.mjs) from the historical record. China's peg ended on 2005-07-21; China re-pegged in mid-2008 and let go again in June 2010. Malaysia fixed the ringgit at 3.80 in September 1998 and freed it on the same day as China in 2005. Venezuela brought in exchange controls in early 2003. Thailand floated the baht on 1997-07-02. The bar was at least five of seven dated, each within ten trading days.

## The result: four of seven

The check missed the bar, but it was precise where it did fire:

- Malaysia's peg was dated to **1998-09-09**, with a range of 08-31 to 09-10. Repeats went from 2% of days to 91%.
- Malaysia's and China's 2005 exits were both dated to **2005-07-22**, the first trading day after the announcement.
- Venezuela was dated to **2003-01-23**, the day after trading was suspended. The fixed rate came two weeks later.

The three misses were each a wrong guess about the data, not the check getting the data wrong:

- **China 2008 to 2010.** The yuan was held near 6.83, but the New York quote still moved a few hundredths every day. That peg was a band defended by intervention, not a frozen quote. The quote didn't start repeating more often, so a check about repeats is right to stay silent.
- **Thailand 1997.** The baht was under speculative attack from May, and a two-tier market began on 15 May. By the time of the float, the quote had already been moving for weeks. The check dated the change to late April through late May. That is when the data actually changed, about six weeks before the date in the history books.

It also found changes we hadn't listed, and most were real events. China's 1994 unification of its official and swap rates is one. The Australian dollar's fixed US-dollar link from 1972 to 1974 is another.

## The bug it turned up

Cut down to a single year, the ringgit series made the check run for hours. On one day in the peg the quote reads 3.8950 among a hundred readings of 3.8000, a move of 950 ticks. The check's stale-feed likelihood builds a grid as wide as the largest move, and its cost grows roughly with the square of that move. Anyone who pasted a pegged currency into the page would have watched it hang.

The test now skips a stretch that has any move over 50 ticks, since a slow, mostly one-tick series doesn't jump 950 ticks. In that case the simpler rounding test decides. Every simulated series behind the check's pre-registered thresholds moves at most 45 ticks, so no earlier result changes. The year-long ringgit window now finishes in milliseconds.

Everything is in the README section ["Currency pegs"](../../ventures/changepoint-detector/README.md#currency-pegs-the-update-rate-check-against-documented-dates-2026-11-18-pre-registered-d1-fails-a-hang-fixed). The output is in [`eval/update-rate-pegs.out.txt`](../../ventures/changepoint-detector/eval/update-rate-pegs.out.txt). To run it yourself, use `sh eval/fx-pegs-fetch.sh fx-data && node eval/update-rate-pegs.mjs fx-data`.
