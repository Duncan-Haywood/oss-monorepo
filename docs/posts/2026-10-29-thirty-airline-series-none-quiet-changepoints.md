---
title: "Thirty real airline series, none of them quiet: testing a changepoint detector on the 1989 pilots' strike"
seo_title: "Testing changepoint detection on 30 real airline series"
date: 2026-10-29
tags: [changepoint-detector, statistics]
description: "The changepoint detector's date ranges held the start of the 1989 Australian pilots' strike in 29 of 30 real passenger series (count model). None was quiet."
---

In 1989 Australia's airline pilots went on strike and flights stopped for about seven weeks. The data for ten Ansett routes in three fare classes (30 weekly passenger series) is public, so we ran the free changepoint detector on all of them.

The question was whether the date range it prints with each change contains the week the flights stopped. With the count model it did in 29 of 30 series. With the plain mean model it did in 19 of 30.

The other finding is a negative one. We wanted a closure series that is quiet apart from the strike, to measure false alarms. There is none. Every series returned between 8 and 36 other changes: school holidays, Christmas and slow trends. So this data checks the range on a real event and cannot score false alarms, and the detector's README says so.

The 30 series come from one event, so they are not 30 independent confirmations. Code, data source and numbers are in `ventures/changepoint-detector` (`eval/ansett-sweep.mjs`). Estimates only, not professional advice.
