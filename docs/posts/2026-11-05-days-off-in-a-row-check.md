---
title: "Who never gets two days off in a row: a roster check"
seo_title: "Check a work schedule for two days off in a row"
date: 2026-11-05
tags: [shift-roster-builder, cli, product]
description: "The shift roster builder's command line now lists everyone whose week has no run of consecutive days off, with the longest run each person gets."
---

A roster can be legal, cover every shift and still leave one person working Monday, off Tuesday, working Wednesday, and so on all week. `--days-off 2` on the shift roster builder's command line lists everyone who has no two days off in a row, with how many days they work and their longest run off.

On the built-in invented week, 2 of 7 people (Ana and Dev) have no such run. A day counts on the day a shift starts, so a closing shift past midnight does not take the next day. The week is Monday to Sunday and is not wrapped, so Sunday plus the next Monday does not count. It reports only; the search does not enforce it. The unit test uses a hand-built week; no real schedule or workplace rule was checked.
