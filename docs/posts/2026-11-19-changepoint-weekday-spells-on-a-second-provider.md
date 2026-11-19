---
title: "The sharper spell search, rerun on a second provider: one fewer stray spell, still short of the bar"
seo_title: "Weekday spell search rerun on NYT's COVID-19 series"
date: 2026-11-19
tags: [changepoint-detection, data-quality, statistics, replication]
description: "A pre-registered rerun on The New York Times' state series: the line dates 3 of 4 documented spells, but 4 of 8 spells still have no documented cause."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/README.md)'s opt-in `--spells`
check got a new score. It counts only the weekdays whose publishing actually changed. In simulation that found
283 more short reporting spells out of 2,400, with no extra false alarms. The real-data evidence behind it was
data we had already looked at. The check had already failed one fresh test, on The New York Times' state COVID-19
series, so the obvious next step was to run the new score on that file.

## What was decided before the run

The script's header was committed before it ran
([`eval/update-rate-spells-weekdays-nyt.mjs`](../../ventures/changepoint-detector/eval/update-rate-spells-weekdays-nyt.mjs)).
It also lists what we already knew. On NYT's data Alaska's spell is dated by the default update-rate line, which
cuts its two edges, whatever the spell score does. Nebraska's documented Wednesdays-only spell does not appear in
either provider's numbers. So the old "search alone" bar could not pass, and the header restated it as the line a
user actually reads. That gave two bars:

- **W1:** the line ends a spell within 10 days of at least 3 of the 4 documented returns to the old schedule.
- **W2:** at most 3 of the search's spells across 35 states have no documented event near either end. The old
  search had 5 of 9.

## What happened

W1 passed, 3 of 4: Alaska through the edge restatement, and South Dakota and Arkansas through the new score.
W2 failed, with **4 of 8** spells unexplained. That is one better than before: a 95-day Nevada spell is gone,
and the other spells match the old search's to within four days. But the bar was 3, so the check stays an
opt-in, and nothing in the code changes.

## What the failures look like

Looked at afterwards, the four unexplained spells are the four longest the search reports: 105 to 372 days.
Each documented spell that ends in a return lasts 28 to 58 days. One of the four, Nebraska's
May-to-October 2022 spell, is a real schedule change that shows in both providers' series but is missing from
the label list. A cap on spell length is the tempting fix. The data we already have argue against it. A
120-day cap would remove all four here, but it would also drop an explained 126-day spell on NYT, and three of
the seven explained spells on Johns Hopkins' series. To settle the question we need a data provider that
documents its own schedule changes, the slow ones included, so the labels aren't borrowed from someone else.

The full table and reading are in the README section "The weekday spell score on NYT's state series". NYT's
file is fetched by a script and never committed. Its terms allow non-commercial use with attribution, so only
the derived verdicts are in the repository.
