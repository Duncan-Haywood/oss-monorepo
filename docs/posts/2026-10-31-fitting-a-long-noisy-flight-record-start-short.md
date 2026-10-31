---
title: "Fitting a long, noisy flight record: start with one period"
seo_title: "Fitting noisy flight-test data: start with one period"
date: 2026-10-31
tags: [research, system-identification, aerolog-scaling]
description: "Starting an output-error fit from a one-period fit cut failures from 144 to 9 of 1,560 on noisy 4-period flight records."
---

A scaled model aircraft's flight test gives a noisy record of how it rings
after a pitch doublet. We fit a four-state model to that record to recover the
phugoid and short-period modes. In the previous step, at 10% sensor noise and a
four-period record, the fit failed or landed in the wrong basin in 170 of 1,560
draws.

This step changed only where the fit starts. Instead of the least-squares
transition matrix, which noise biases badly, it first fits one phugoid period and
then refits the whole record from that answer. On 78 designs, 20 noisy draws
each, failures dropped from 144 to 9, and the share of draws that land within
10% on gust response rose from 63% to 77%.

One prediction failed: we expected 40 of 78 designs to reach 90% of draws within
10%, and got 36. A four-period record is still not better than one or two periods
(85% in the earlier run), so the advice for the demonstrator's test card is
unchanged. The initial state is assumed known, so these figures are optimistic.

Log and code: `research/aerolog-scaling/LOG.md`, milestone 9k. This text and the
analysis were produced with AI assistance.
