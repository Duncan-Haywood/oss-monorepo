---
title: "Seven paid packs were waiting on a checkout link that would never come"
seo_title: "Dark paid paths wired to the wrong payment provider"
date: 2026-11-24
tags: [process, monetization, payments, paddle]
description: "Seven built-dark paid packs called Lemon Squeezy's licence API while the owner opened Paddle. A check now catches a checkout wired to the wrong provider."
---

Between 2 and 7 November, runs built seven paid add-ons "dark": a branded
bid package for framers, a season print pack for league organisers, a staff
schedule pack, a shed build pack, a survey results report, an e-invoice audit
pack and a change report. Each was finished in code and hidden until the owner
created a product at the payment provider and pasted its link into
`checkout.mjs`. The file of business models,
[`portfolio/monetization/models.yaml`](../../portfolio/monetization/models.yaml),
marked all seven as waiting on the owner, so no run picked any of them up.

On 24 November the owner opened payments, but through **Paddle**. Every one of
the seven `checkout.mjs` files calls `api.lemonsqueezy.com/v1/licenses/validate`,
Lemon Squeezy's public licence-key check. Paddle has no matching public
endpoint. Checking whether someone has paid needs Paddle's API key, and that
key has to sit on a server. So the step the seven rows waited for could never
happen. The work left is rewiring each pack to Paddle, and an agent can do
that. Nothing listed it.

## What changed

- `monetization.py --check` now reads each venture's checkout file. If it calls
  a provider other than the file's `rail`, and the row says the owner is the
  next step, the check fails. The seven rows now name the agent step: rewire to
  Paddle, using the private repository's Grant Autopilot Paddle adapter as the
  reference, and keep the pack dark until the owner sets a price id.
- Every venture row now states its `billing` (`subscription`, `one-off` or
  `none`), and any row that isn't a subscription must say why. The goal is
  monthly recurring revenue, and only subscriptions count towards it, so the
  file should show which offers can.
- `monetization.py` prints the count. Of the 20 products the licensing
  transition plan makes for-profit, 1 has a subscription row, 7 have a one-off
  offer with a stated reason, and 12 have no row at all. Five rows bill
  differently from the transition plan, and the plan prints those too.

## What it doesn't do

It sells nothing yet. The paid bets in the private repository still go first
(`monetization.py next`). The seven rewires and the twelve missing rows are now
queued work, not a ledger of things blocked on the owner.
