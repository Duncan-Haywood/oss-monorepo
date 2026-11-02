---
title: "Starting daily and weekly usage and income reports: the first reading is 95 page loads and $0"
seo_title: "Daily and weekly usage and income reports start"
date: 2026-11-02
tags: [usage-report, usage, monetization, measurement]
description: "From today the blog carries a daily and a weekly report on site usage and income. Ten days of counting so far: 95 page loads, 29,000 crawler beacons and $0."
---

From today this blog carries two recurring posts: a **daily report** on the
previous UTC day and a **weekly report** on the seven days before each
Monday. Both answer the same two questions: are people using what gets built
here, and is any money coming in? The first two are out: [Sunday, November
1](2026-11-02-usage-and-income-2026-11-01.md) and [the week to November
1](2026-11-02-usage-and-income-week-to-2026-11-01.md).

A script writes them (`platform/daily/usage-report-build.mjs`), not an agent typing
numbers. It reads only files committed to the repository, so every figure in a
report can be checked against the tree at that commit, and it is built to
understate rather than overstate: a day before the counter started reads "not
counted", never zero; a breakdown that started late says how many loads it
covers; a week is only compared with a fully counted week before it.

## What ten days of counting show

The site's cookieless counter started recording on October 24. Up to and
including today it has counted:

- **95 page loads**, about 10 a day. A page load is one browser opening one
  page, not a person, and browsers sending Do Not Track or Global Privacy
  Control are not counted at all.
- **The busiest pages** are the catalogue (27), Ask (18), the
  [shed designer](https://marisstella.app/shed-designer/) (18) and About (15).
  The shed designer is the only tool page with more than a handful; most tool
  pages have been opened once or never.
- **Since country and device were split out** (October 30): 52 loads from the
  US and one each from Poland and Cameroon; 53 on desktop and one on a phone.
- **29,268 crawler beacons**, almost all from headless browsers, against 65
  human page loads over the same four days. Crawlers are far busier on this
  site than people are. They are kept out of every page-load figure.
- **No feedback-form messages** other than one test message on October 24.

## Income

**$0.** Everything in the catalogue is free and full-featured, and the ways
to pay are a GitHub Sponsors link and a Buy Me a Coffee link. Neither balance
is readable from the repository, so the reports will say "no income
recorded" until a payment is written into `portfolio/usage/income.json`. The
October ledger's 209 entries all record zero recurring revenue.

That is the honest starting line: a small trickle of visitors, no income and
a lot of machines. The point of reporting it every day is that the next
change, up or down, is seen the day it happens.

## A broken pipe found on the way

The reports read `portfolio/usage/site-visits.json`, which a scheduled job
refreshes every morning. Writing the first report showed that the file
stopped on October 30 while the counter itself kept counting. Since October
31 the job has failed at its last step: it pushes straight to `main`, and the
repository now requires every change to go through a pull request. This PR
refreshes the file by hand; the job itself needs a change only the owner can
approve, and that change also lets the job write these reports each day
instead of a session doing it.
