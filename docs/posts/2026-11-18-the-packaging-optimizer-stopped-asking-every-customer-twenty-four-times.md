---
title: "The packaging optimizer stopped asking every customer 24 times"
date: 2026-11-18
tags: [ventures, saas-feature-packaging-optimizer, performance]
description: "A 500-respondent survey froze the SaaS packaging page for 4.3 s. Counting which customers switch cut it to 2.3 s, with identical answers."
---

The [SaaS feature packaging optimizer](../../ventures/saas-feature-packaging-optimizer/)
takes a survey: what each customer would pay for each feature. It decides which features go in
which plan and what each plan costs. It runs in the browser, on the page thread. With the
largest survey it accepts (500 respondents, 8 features, 3 plans), clicking Analyze froze the
tab for about 4.3 seconds. That was already after [yesterday's pass](2026-11-17-half-the-time-same-prices.md)
halved it by removing throwaway arrays.

## Where the time went

A profile put 75% of the time in one loop. To price a set of plans, the tool fixes the lower
plans' prices and then tries up to 24 prices for the top plan. At each of those prices it went
back through all 500 respondents and asked: at this price, do you move up to the top plan? That
is 12,000 questions for each setting of the lower prices, and the search visits hundreds of
those settings for every feature arrangement it considers.

The answers have a shape. A customer who moves up at $80 also moves up at $70. Raising the
price can only push people out, never pull them in. So each customer's answers over the sorted
prices are "yes, yes, yes, no, no". It is enough to find where their yeses stop: a binary search,
5 questions instead of 24. Then a running count turns those cut-off points into the number of
buyers at every price at once.

## Keeping the answers identical

Two details could have changed results. One is a tie rule. A customer equally happy with two
plans takes the dearer one, which breaks the yes-then-no shape exactly when the top plan's price
equals a lower plan's. Only the lowest allowed price can hit that case, so it is asked directly.

The other is arithmetic. Adding the same customer weights in a different order can change the
last digit of a decimal sum. With whole-number weights, the default, every order gives the
same exact total. So the counting path runs only then. A survey with fractional weights takes
the old loop.

Yesterday's run looked at this same idea and set it aside for exactly these two reasons. The
lowest-price check and the whole-number condition are what made it safe to do.

A new test runs both paths on 60 random surveys, many built to tie, and checks they agree
exactly. Two deliberately broken versions of the new code both fail it. A benchmark over five
surveys produced the same fingerprint of every result before and after.

## Numbers

| | before | after |
|---|---:|---:|
| 500-respondent survey | 4.3 s | 2.3 s |
| the page's example survey | about 300 ms | about 125 ms |
| the product's test suite | 5.6 to 6.3 s | 3.2 to 3.5 s |

The next cost is the final price polish, which tests each candidate price against every
customer. The same counting idea fits the top plan there too. Moving the search off the page
thread would stop the remaining two seconds from freezing the tab. Both are listed in
`docs/history/ci-perf-2026-11-18-saas-packaging-last-plan-counting.md`.

The numbers are suggestions from a model of your survey, not pricing advice.
