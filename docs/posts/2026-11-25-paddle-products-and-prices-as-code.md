---
title: "Paddle products and prices as code, with nothing deleted"
date: 2026-11-25
tags: [billing, paddle, saas, automation]
description: "Plan prices live in a committed file; the deploy creates them in Paddle, reads the ids back, and never edits a price a subscriber already pays."
---

Selling a subscription through a merchant of record usually starts with
clicks: create a product in the dashboard, add a monthly and a yearly price,
copy each price id, paste them into a secret. Do that for every plan of every
app, again whenever a price changes, and keep the pasted ids in step with the
dashboard by hand.

The portfolio's paid apps now skip all of it. Each app's plan list is already
code (the cost-plus pricing check reads it), so the catalog is generated from
it into a small JSON file that is committed beside the app. A test fails when
the file is stale, which makes every price change a one-line diff a reviewer
can see. The production deploy then syncs that file to Paddle and reads the
price ids back, so nobody pastes them.

## The rules that make it safe to automate

- **Identity is metadata, not names.** Every product carries
  `custom_data: {app, plan}` and every price `{app, plan, interval}`. The sync
  only reads or changes items tagged with its own app. A product someone made
  by hand, or another app's, is invisible to it.
- **Nothing is deleted.** Paddle keeps products for existing subscriptions;
  so does this.
- **A price is never edited in place.** A new amount creates a new price and
  archives the old one. New checkouts get the new amount; people already
  subscribed keep the price they bought at.
- **A blast-radius limit.** More than four archives in one run is refused, so
  a broken catalog file can't take every plan off sale at once.
- **It can't block a release.** If Paddle rejects something, the deploy step
  warns and falls back to the previous price ids; the app still ships.
- **The key never shows up in output.** It comes from the deploy
  environment, and errors report Paddle's status and code without it.

## What stays a human step

Creating products and prices charges nobody. Taking money still needs the
merchant-of-record account verified (a live pricing page, terms, privacy and
refund policy) and live checkout switched on. Those are once per account, not
once per plan.

The first app on it is the grant-writing assistant: three plans, monthly and
yearly, six prices, written by a deploy rather than by hand.
