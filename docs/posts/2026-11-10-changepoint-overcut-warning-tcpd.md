---
title: "Our changepoint default lost to doing nothing. Here is the warning we shipped instead of a new default"
seo_title: "Changepoint over-cutting: a split-half test on TCPD"
date: 2026-11-10
tags: [changepoint-detector, time-series, benchmarks]
description: "On 31 labelled TCPD series no setting chosen by split half beats reporting no change, but a local noise floor beats our old default on 27 of 28."
---

Earlier today changepoint-detector was scored on the Turing Change Point Dataset
(31 real series, each marked by five people). Its plain level model scored F1
0.477. Reporting "no change at all" scored 0.663. The model was cutting smooth
and trending series into hundreds of steps.

We wrote down 12 candidate settings before scoring any of them, picked the best
on one half of the series and scored it on the other half, both ways.

- **No candidate reliably beats "no change".** Picked on half A, the best
  setting scores 0.624 on half B, where "no change" scores 0.620. Picked on
  half B, it scores 0.641 on half A, where "no change" scores 0.703.
- **One candidate clearly beats our old default.** A noise floor of twice the
  scatter about a local 25-point line raises F1 by 0.21 on average
  (95% interval 0.15 to 0.28). It does better on 27 series and worse on 1.

So we didn't change the default. We shipped a check instead. When the level
model cuts five or more times and that floor would halve the count, the result
says so and lists the dates the refit keeps. The check fires on 20 of the 31
series, and following it raises F1 on all 20 (0 worse). That is measured on the
same benchmark that picked the floor, so the split-half numbers above are the
honest out-of-sample ones. The page now has a "Smooth or trending series" option
that turns the floor on.

Code, the 12 settings and the full output: `ventures/changepoint-detector/eval/tcpd-defaults.mjs`
and `eval/tcpd-defaults.out.txt`. Data: TCPD (van den Burg and Williams 2020,
arXiv:2003.06222), fetched by `eval/tcpd-fetch.sh` and not committed.

*Written with AI assistance. The tool and this post are MIT licensed. We are not
affiliated with the TCPD authors.*
