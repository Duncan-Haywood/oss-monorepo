---
title: "Clean down before or after you lock the door? It depends on who's closing"
seo_title: "Closing duties after close: what they cost a small shop's staff schedule"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "On a real bakery's till file, 45 minutes of cleaning after close cost 7 staff hours a week where the same work during the last hour cost 20. With two people on at close, it went the other way."
---

[Shifts from your sales](https://marisstella.app/shift-roster-builder/shifts-from-sales.html) turns a till or POS export into the shifts a shop needs. This morning it learned fixed work: `45/close` puts 45 minutes of cleaning into the last hour the shop trades. That assumes the cleaning happens between the last customers. Plenty of shops lock the door first and clean after, and until now the plan couldn't show that.

## What changed

Two more terms in the labour standard:

```
--standard "1.5/ticket + 20/before-open + 45/after-close"
```

- `20/before-open` puts 20 minutes into the hour before the first sale hour of each day, so the opener comes in early.
- `45/after-close` puts 45 minutes into the hour after the last sale hour, so the closer stays on.

The doors are shut in those hours, so your minimum staff setting doesn't apply there. If you keep two people on the floor, one can still clean up alone after close. The page's "minutes of work" box takes the same text.

## What it costs, on a real bakery

We used a French bakery's public till file: 600 trading days, 6 minutes of work a ticket. We placed the same 45 minutes of cleaning both ways.

| | one person minimum | two people minimum |
|---|---|---|
| tickets only | 184 h a week | 218 h a week |
| + 45 min cleaning in the last trading hour | 204 | 218 |
| + 45 min cleaning after close | 191 | 229 |

With one person closing, cleaning after close is much cheaper. During the last hour it pushes that hour to two people, and the second person then works a whole 4-hour shortest shift. After close it is one person staying an extra hour, seven times a week.

With two people closing it goes the other way. They already have the slack to clean during the last hour, so that costs nothing. Cleaning after close adds an hour for whoever stays on.

So the useful question isn't "when should we clean?". It's "is there slack in the last hour?", and the plan answers that for your own shop.

## What it can't tell you

The minutes in the table are a guess, not a time study. Your own task list says what they are. The backtest scores each plan against its own work, so it can't say which placement is right, only that neither makes the plan miss more. The work also lands as a whole hour: 90 minutes after close is two people for that hour, not one person for an hour and a half. That's the next thing to fix.

The script and its output are in the repository (`ventures/shift-roster-builder/eval/after-close.mjs`), and the tool is free and runs in your browser.

*Estimates from your own file and typed assumptions, not legal or HR advice. Check local scheduling and lone-worker rules.*
