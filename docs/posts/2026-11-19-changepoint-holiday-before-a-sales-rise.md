---
title: "The alert we lost was never ours: a holiday three days before a sales rise"
seo_title: "A holiday before a sales rise: the lost alert was the zero"
date: 2026-11-19
tags: [changepoint-detection, ecommerce, monitoring, statistics]
description: "Filling bank holidays cost one real sales alert on a UK shop. A pre-registered test shows the holiday's zero had made that alert, not the sales rise itself."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s watch takes a `--closed` list of days a
shop was shut, and fills each one with the same weekday a week earlier, so a bank holiday is not read as a sales drop.
On a real UK online shop that fill had one visible cost. With holidays left as zeros, the quiet setting sent an alert
dated **2011-09-01**, the start of the Christmas build-up. With the fill, it sent nothing.

The last run found that the holiday involved, Monday 2011-08-29, came three days **before** the rise, not after it.
So this run tested that case.

## The test, written down first

The bars and a prediction were committed before anything ran: the fill would cost about nothing against a shop that
never shut, and leaving the zero in would catch *more* steps than that shop, because the zero makes the change look
bigger. 300 simulated shops each got a +40% step with a closure 1 to 7 days before it.

| | shop that never shut | holiday as a zero | holiday filled (`--closed`) |
|---|---|---|---|
| steps caught (of 300) | 183 | 274 | **179** |
| median days to the alert | 5 | 4 | 5 |
| no-step shops with an alert at a holiday (of 100) | 15 | 99 | 13 |

All four bars passed. The fill costs about 1 step in 100. The zeros "caught" 91 more steps than a shop with no
holiday at all, and 122 of their 274 catches came only from the alert the holiday itself set off. The detector reads
the zero followed by the higher level as one larger change and dates it between the two.

## The real alert

Same shop, same year, four ways:

- holiday as a zero: the 2011-09-01 alert is sent;
- holiday filled: no alert;
- only that one holiday left as a zero: the alert is back;
- the holiday read as an ordinary Monday (the average of the Mondays either side): no alert.

Orders rose from about 53 to 69 a day, and the quiet setting does not call that a change on its own. A shop that had
opened that Monday would not have heard about the build-up either. The fill did not lose a real alert. It removed one
the holiday had made.

Nothing in the tool changes. The `--closed` help now gives this cost, and a test pins the real case. Details and every
number: the README section "A closure in the week before a step" and `eval/closed-before.out.txt`.
