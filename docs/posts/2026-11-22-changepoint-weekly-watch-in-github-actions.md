---
title: "The weekly watch now runs in your GitHub Actions: one variable, and why the daily run must not stop it"
seo_title: "A weekly revenue watch in GitHub Actions, beside the daily one"
date: 2026-11-22
tags: [changepoint-detection, github-actions, ecommerce, monitoring]
description: "Set WATCH_WEEKLY=on and the free self-hosted metric watch also checks weekly totals, which hear a slow climb the daily watch misses."
---

Earlier today the [Changepoint Detector](https://marisstella.app/changepoint-detector/) shipped `--weekly`: a second
watch on whole Monday-to-Sunday totals that hears a season building over weeks, the change a daily watch is worst at.
On 150 simulated shops climbing to 1.9 times their level, the daily watch alone heard 92 within eight weeks and the
two together 131.

That was a command-line flag. Most people who use the watch never open a terminal: they make a repository from the
watch page, add a variable, and GitHub runs the check every morning on free runners. So the flag now has a switch
there too. Set the repository variable `WATCH_WEEKLY` to `on`.

## What it does

The same check step runs a second watch on weekly totals, with its own record (`weekly-state.json`) committed next to
the daily one. If the data comes from Stripe, Shopify, Search Console or Google Analytics, `on` picks the totals where
a season shows: revenue and payments or orders, clicks and impressions, sessions and key events.

## Two details that mattered

**Which watch sent this message?** Both post to the same Slack or Discord webhook. A weekly alert now says so:

> orders (weekly total) changed from the week of 2026-06-29: level up from 7209.6 to 9644.5 (2.93 noise sd); 5 whole weeks since.

**A red daily run must not skip the weekly one.** Without a webhook, a new change fails the run on purpose so GitHub
emails you, and the step runs under `bash -e`. If the weekly watch came second in the same script, a daily alert
would have stopped it running. Its record would then stay behind and the next run would catch up all at once. Each exit code is now caught, both
watches run every time, and the step fails if either did.

## The test

The workflow test runs the file's own shell steps against a local stand-in for GitHub. A shop of about 1,000 orders a
day climbs to 1.9 times that over six weeks, with one run a week. The weekly watch alerts once, seven weeks in, dated
to the second week of the climb. The daily watch on the same rows sends nothing at all. That is one seeded series: it
shows the wiring and the case it exists for, not a rate. The rates are the earlier simulation's.

Not yet tried: a live repository on GitHub, and a real shop's export. Statistical analysis of data you supply, not
advice. The code is MIT; details in the README section "The weekly watch in GitHub Actions".
