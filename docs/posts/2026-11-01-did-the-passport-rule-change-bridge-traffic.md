---
title: "Did the 2009 passport rule change Peace Bridge traffic? What a changepoint detector says"
date: 2026-11-01
tags: [changepoint-detector, time-series, real-data]
description: A changepoint detector on 13 years of real bridge traffic finds a step on the month the US passport rule began, plus 13 other changes that muddy it.
---

From 1 June 2009 the US required a passport to cross a land border. The Peace Bridge between Buffalo and Fort Erie has 156 months of traffic counts around that date (2003 to 2015), and it is a fair test of a changepoint tool: a documented date, a strong summer season, and a recession going on at the same time.

With a 12-month season, the detector's mean model puts a step down on 2009-06 itself (about 498 to 466 thousand vehicles a month) and its 95% range is May to June 2009. That is the good news. The rest is the honest part: it returns 14 changes in all, three months later it steps back up, and the 2008 recession and a slow decline show up as steps as well. So a step on the right month does not tell you the rule caused it. With no season, both the mean and count models just chase the July-August peak and return 26 to 29 changes.

The takeaway for anyone using a detector on business data: a hit on a known date is the start of a question, not the answer. Check the neighbouring changes, and use a season when the series has one.

Data, script and test are in the changepoint-detector project (`eval/peace-bridge.mjs`). One series, checked once; the traffic counts come from the Stat2Data package.
