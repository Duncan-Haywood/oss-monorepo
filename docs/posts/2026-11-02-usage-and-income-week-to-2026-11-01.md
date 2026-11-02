---
title: "Usage and income, week to November 1, 2026: 70 page loads, $0 recorded"
date: 2026-11-02
tags: [usage-report, weekly-report, usage, monetization]
description: "70 counted page loads over the week to 2026-11-01; no income recorded."
---

The weekly reading for 2026-10-26 to 2026-11-01 (UTC): how use of [the site](https://marisstella.app/) moved, what people opened, and what money came in. Each day also has a [daily report](https://marisstella.app/writing/?tag=daily-report).

## Usage

**70 page loads** across 15 pages. The week before was counted on only 2 of its 7 days (13 loads), too little to compare with.

| Day | Page loads | Crawler beacons |
|---|---:|---:|
| 2026-10-26 | 7 | not counted |
| 2026-10-27 | 0 | not counted |
| 2026-10-28 | 4 | not counted |
| 2026-10-29 | 6 | not counted |
| 2026-10-30 | 21 | 4,410 |
| 2026-10-31 | 16 | 12,393 |
| 2026-11-01 | 16 | 12,464 |

Most-opened pages (the last column reads n/a until a whole earlier week was counted):

| Page | Loads | Week before |
|---|---:|---:|
| [the catalogue](https://marisstella.app/c/) | 21 | n/a |
| [Ask (the assistant page)](https://marisstella.app/ask/) | 14 | n/a |
| [shed-designer](https://marisstella.app/shed-designer/) | 14 | n/a |
| [About](https://marisstella.app/about/) | 9 | n/a |
| [c/self-hosted](https://marisstella.app/c/self-hosted/) | 2 | n/a |
| [amusement-route-location-calculator](https://marisstella.app/amusement-route-location-calculator/) | 1 | n/a |
| [c/for-childcare](https://marisstella.app/c/for-childcare/) | 1 | n/a |
| [c/services](https://marisstella.app/c/services/) | 1 | n/a |
| [c/trades](https://marisstella.app/c/trades/) | 1 | n/a |
| [flag-keeper](https://marisstella.app/flag-keeper/) | 1 | n/a |

First counted this week: [shed-designer](https://marisstella.app/shed-designer/), [c/self-hosted](https://marisstella.app/c/self-hosted/), [amusement-route-location-calculator](https://marisstella.app/amusement-route-location-calculator/), [c/for-childcare](https://marisstella.app/c/for-childcare/), [c/services](https://marisstella.app/c/services/), [c/trades](https://marisstella.app/c/trades/), [flag-keeper](https://marisstella.app/flag-keeper/), [furnace-bid-calculator](https://marisstella.app/furnace-bid-calculator/), [open-floor-robots](https://marisstella.app/open-floor-robots/), [referral-keeper](https://marisstella.app/referral-keeper/).

- **Where readers came from** (kind of referring site): other 7, github 1. Loads with no referrer are not split out.
- **Countries:** US 41, PL 1 (recorded for 42 of the 70 loads: this split started on 2026-10-30).
- **Devices:** desktop 42 (recorded for 42 of the 70 loads: this split started on 2026-10-30).
- **Crawler beacons** (not page loads, not people): 29,267 (headless 29,251, yandexbot 16); counted only from 2026-10-30.
- **Feedback-form messages:** 0.

## Income

No income is recorded for this week. Everything in the catalogue is free and full-featured; the open ways to pay are GitHub Sponsors and Buy Me a Coffee, and their balances sit in the owner's accounts, so a payment shows here only once it is written into `portfolio/usage/income.json`.

The ledger (`portfolio/ledger/2026-10.yaml`) records no recurring revenue: 209 of its 209 entries state `mrr_end` and every stated value is 0.

## How this is counted

Counts come from the site's first-party, cookieless counter (`platform/counter/`), copied into `portfolio/usage/site-visits.json`. A page load is one browser opening one page; it is not a person, and nothing identifies anyone. Browsers sending Do Not Track or Global Privacy Control are not counted. Written by `platform/daily/usage-report-build.mjs` from committed files only.
