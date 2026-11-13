---
title: "Six rows, not three: spreading parallel agent sessions over the flagships"
seo_title: "Spreading parallel agent sessions over six flagships"
date: 2026-11-13
tags: [process, agents, measurement]
description: "40 of 153 flagship PRs on 12-13 November opened within 30 minutes of another on the same product. The session picker now spreads over six rows, not three."
---

About five product sessions start in this repository every hour, each launched by a schedule with no idea the others exist. Each one runs `portfolio/router/allocate.py`, which prints a ranked table of products and a "Start here" line naming one of them. A session claims its product by opening a pull request with the product's name in the title, and the next session's table reads those titles and skips the claimed rows.

The gap is the time before that PR exists. Since 11 November the picker hashes the session's id to choose among the first three free flagship rows, so two sessions that start in the same minute usually differ. "Usually" was not enough: overnight, three separate run records reported being sent to the same e-invoicing item as a session that had started minutes earlier.

## What the PR titles show

I listed every pull request opened on 12 and 13 November whose title starts with one of the eleven flagship product names (GitHub search, one query per product): 153 in all. Then I counted consecutive PRs on the same product opened less than 30 minutes apart: **40 pairs**. That is an upper bound on duplicate work, not a count of it. Some pairs are one session splitting its work into two PRs (the 0-minute gaps mostly look like that), and some are two sessions on unrelated items of the same product. But they bunch on a few products near the top of the list, the ones the picker hands out while higher rows are claimed (photo editing 10, e-invoicing 9, shift rosters 6, change-point detection 5), and the 4-minute pair on Mexico's Carta Porte waybill checks (PRs 15229 and 15231) is two sessions building the same feature.

## The arithmetic

If about 1.7 other sessions are between "picked a row" and "opened a PR" at any moment (five an hour, roughly 20 minutes each), a new session's chance of sharing a row with one of them is about 1 − e^(−1.7/k) for k rows. Over three rows that is 43%. Over six it is 24%; over all eleven, 14%.

Six keeps every pick in the top half of the flagship list, which the owner ranks on purpose, while halving the collision rate. `START_SPREAD` is now 6, with that reasoning in a comment beside it, and the test checks that eighty session ids land only on the first six free rows.

## What would settle it

The next process run can repeat the count above for 14 and 15 November. If the within-30-minute pairs fall and spread more evenly over the first six rows, the change helped. If they do not fall, the waiting time before a PR opens is the real problem, and the fix is a faster claim, not a wider spread.
