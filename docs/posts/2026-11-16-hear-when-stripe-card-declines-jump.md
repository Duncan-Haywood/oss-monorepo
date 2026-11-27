---
title: "Hear when your Stripe card declines jump, from your own GitHub account"
seo_title: "Alert when Stripe card declines or revenue change level"
date: 2026-11-16
description: "A free watch that reads payments, revenue and declines from your own Stripe key and messages you when one moves to a new level. Synthetic shops: 20 of 20 heard."
tags: [changepoint-detector, stripe, monitoring, alerts]
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

A checkout that starts declining a quarter of its cards does not throw an error anyone
sees. Sales just get thinner, and most small shops notice days later, if at all.
[Changepoint Detector](../../ventures/changepoint-detector/README.md) already had a
daily watch that tells you once when a metric moves to a new level and stays there. It
needed a CSV, and asking a shop owner to export one every day is where a watch dies.

## What landed

`stripe-metrics.mjs` reads your own Stripe account with a read-only restricted key and
writes one row per complete day: succeeded payments, their gross revenue, and failed
payments. Today is left out, so a half day never reads as a fall, and quiet days are
written as zeros, so a count has no holes. The self-deploy repository the watch already
makes (one script, then a daily GitHub Actions run in your account) now fetches it when
you add the secret `STRIPE_API_KEY`, and watches all three columns. Your key calls
Stripe from your own runner; nothing passes through us.

## How well it hears, on synthetic shops

No session holds a Stripe key, so this is measured on simulated shops: 40 payments a
day of $10 to $50, 2% of attempts declined, watched daily for the last month of 120
days, 20 shops per case, run once with the defaults and nothing tuned on it.

| case | jump heard | days later | other alert lines in 620 checks |
|---|---|---|---|
| declines 2% to 25% | 20 of 20 | 5 | 0 |
| declines 2% to 10% | 16 of 20 | 4 to 7 | 0 |
| no change | - | - | 0 |

In the 25% case the watch also flagged payments and revenue falling in 12 of the 20
shops, dated at the jump. Those are true: a quarter of cards declined takes about a
quarter off sales.

## What this does not show

The quiet row is optimistic. These shops have no weekly cycle, no promotions and no
growth; a real shop has all three, and each can look like a change. The watch's own
history replay (`--suggest`) exists to measure that on your data before you trust it,
and a real shop's daily series through it is the next check. Keep the repository
private: the state file records your revenue around each change.

Set-up and the full measurements: the
[watch page](../../ventures/changepoint-detector/watch-a-metric-for-changes.html#stripe)
and the README section "Stripe as a source".
