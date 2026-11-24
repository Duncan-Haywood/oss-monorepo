---
title: "Date your own business cycle in the browser: peaks and troughs from several lines at once"
seo_title: "Date business cycle peaks and troughs in your browser"
date: 2026-11-24
tags: [ventures, changepoint-detector, business-cycles, product]
description: "The changepoint detector's page now dates peaks and troughs by Bry-Boschan's rule, on one series or a composite of several, with nothing uploaded."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/) gained a
`--turns` option in its command-line tool. On four public US indicators (payrolls, real income
less transfers, industrial production and real sales), a composite index dated by Bry and
Boschan's 1971 rule matched all 16 of NBER's recession peaks and troughs since 1969, each within
three months, with no false turn. Any one of those series alone missed between two and six.

A command-line flag reaches few of the people who would use it. A shop owner, a SaaS founder or
a finance lead who wants to know "when did our last slow stretch start and end?" is not going to
install Node. So the page now has the same thing, in a card called **Peaks and troughs**.

## What it does

Paste monthly (or quarterly) rows into the data box. With one column, it dates that column's
peaks and troughs. Choose "several columns" and list them, say orders, revenue, active customers
and hours billed, and it first builds a composite index by the Conference Board's published
method: each column's monthly percent change, weighted by one over its volatility, then added up.
A noisy line gets a small weight, so it cannot decide the dates on its own.

The rule is the one official daters use. A peak is the highest point within five months either
side, peaks and troughs alternate, every phase lasts at least six months and every full cycle at
least fifteen. A phase shorter than six months is kept when it moves 5% or more, which is what
keeps the two-month 2020 recession.

You get a one-line summary (how many turns, the latest one and what it implies), a chart on a log
scale with the contractions shaded, a table of turns, a table of phases with their length and
percent change, and a CSV with each row's turn. The example button loads the four FRED
indicators, so you can see the 16 recession turns come out before trying your own data.

Everything runs in the browser tab. Nothing is uploaded, and the only thing counted is a local
`turns_run` tally that never leaves the device.

## What to trust, and what not

The 16-of-16 result is on the series NBER's committee itself reads, so agreement is expected. It
is the known result of Harding and Pagan (2002), re-run on today's data. What it does not show is
how well the composite dates a business's own cycle, where no committee publishes dates to check
against. That is the next test: simulated shop and SaaS lines that share a cycle but lag and
differ in noise, scored on whether the composite beats the best single line. The last turn in any
series is also provisional: a peak needs months of decline after it before the rule can confirm
it.

A dated turn describes the data. It is not a forecast and not financial advice.

The code is MIT: `turning-points.mjs` (the rule), `composite-index.mjs` (the index),
`turns-view.mjs` (the page's chart and tables). The measurements are in the README sections
"A composite of NBER's monthly indicators dates every turn" and "Peaks and troughs on the page".
