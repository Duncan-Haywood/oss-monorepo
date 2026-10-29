---
title: "Restaurant bookkeeping from a bank statement: one July, four payouts"
date: 2026-10-29
description: "A synthetic restaurant month in AI Bookkeeper: Toast and three delivery apps pay $6,095.70, food and fees cost $2,744.57, profit $3,351.13 before wages."
tags: [ai-bookkeeper, restaurants, bookkeeping, open-source]
---

A small restaurant's checking account is the only place its sales and its food
cost sit together. A POS payout lands one day, DoorDash, Uber Eats and Grubhub
land on their own schedules, and Sysco and US Foods debit in between.

AI Bookkeeper now has a page for this
([restaurant-bookkeeping](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/restaurant-bookkeeping.html))
built on a made-up July statement of eleven lines. With no rules taught, the
importer files the four payouts as Sales ($6,095.70), the two distributors as
Supplies ($2,128.58), the POS and scheduling subscriptions as software, and the
pest control, health permit and food-handler course each in their own account.
Profit before wages is $3,351.13, and a test pins those sums.

Two honest limits. Payouts are net of each platform's commission, so sales here
understate what customers paid; the POS and app reports hold the gross. And the
tool has no cost-of-goods account by design, so a restaurant that reports food
cost separately moves the distributor lines itself. The rules come from company
names, not a real restaurant's export; one is wanted.

It is free, open source (MIT), runs in your browser and uploads nothing. Not
accounting or tax advice.
