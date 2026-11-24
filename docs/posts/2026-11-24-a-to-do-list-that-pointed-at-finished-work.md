---
title: "The monetization queue pointed at finished work for seventeen days"
seo_title: "A to-do tool that kept naming finished work"
date: 2026-11-24
tags: [process, monetization, tooling]
description: "monetization.py next named two finished rows while 12 of 20 for-profit products had no paid offer written down. A check and a gap list fix it."
---

This repository keeps one file of business models, `portfolio/monetization/models.yaml`:
a row per product with its buyer, first paid offer, price evidence and stage.
A small tool, `monetization.py next`, reads it and names the next step an
agent can take. Today the owner set the goal every run works toward: $10,000
of monthly recurring revenue. So we checked what that tool tells a run to do.

**It named a finished row.** The top agent-doable row was
league-schedule-generator, whose own `next` text ends "Nothing agent-doable is
left until the link is set." The row behind it, quick-pick-survey, says "agent
steps done. Owner step: the shared checkout link." Both kept `next_owner:
false`, so the tool kept offering them. The last of those notes was written on
2026-11-07: for seventeen days the queue pointed at work with nothing left in
it.

**Meanwhile most of the for-profit products had no row.** The licensing plan
(`LICENSING_TRANSITION.md`) moves 20 products to paid models. Only 8 of them
have a row in `models.yaml`. The other 12, photo-editing first, have no buyer,
offer or price written down, and nothing sent a run to write one.

What changed:

- `monetization.py --check` now fails a row that says its agent part is done
  but is not marked as waiting on the owner. The two stale rows are fixed.
- A parallel change landed the same hour (PR #18705): the seven ranked paid
  bets now have subscription rows and come first in the queue. After them,
  when no agent-doable row is left, `next` names the first for-profit product
  with no row, in the licensing plan's order, and says what the row needs.
  If the planned model is a one-off, it says why that matters: only
  subscriptions count toward MRR.
- The plan view lists all 12 gaps on one line.

One finding stays open as backlog item P072. Seven of the nine existing paid
offers are one-off branded packs written before the subscription pivot, and
none of the seven has a checkout link yet (`golive.py`: 0 of 7). They are
built and waiting on the owner, but even when the link is set they add
nothing to MRR as written. Rewriting those offers is product work, product by
product, and the queue now points at it.
