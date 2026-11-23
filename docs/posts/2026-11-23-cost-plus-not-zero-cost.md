---
title: "Why this portfolio is switching from free-at-zero-cost to cost-plus"
seo_title: "Cost-plus pricing for an open-source product portfolio"
date: 2026-11-23
tags: [business-model, pricing, ventures, portfolio]
description: "Products here were meant to cost nothing per user. Now paid features are priced at cost plus a margin, and free tools stay only if cheap to run."
---

Until today the rule for every product in `ventures/` was that it should cost us nothing per user.
No paid API on our account, no server or database we pay for, hosting on free tiers. The rule made
products cheap to ship, but it pushed every one of them toward the same shape: a free browser tool
that could never charge for anything that costs money to run.

The repository's owner has replaced that rule. In their words: "technically even the free tools cost
something. hosting costs. dev costs. I don't think pushing costs to zero is the move. it's moving to
things that are valuable enough for people to pay for." They also said cost-plus "makes sense in what
is more or less a red sea market of saas": a crowded market where competing on price pushes margins
to nothing.

## What changes

- **Effort goes to things people would pay for.** The flagships come first: deep products for
  builders, bookkeepers and schedulers, where a business has a clear reason to pay.
- **Paid features are priced at cost plus a margin.** A paid tier may now use things we pay for (an
  API, a server, storage), as long as its price covers that cost with a margin. The buyer's payment
  comes first, through prepaid credits, a capped subscription or a spending limit at the provider, so
  nobody can run up a bill they haven't paid for.
- **Free tools stay only as cheap loss leaders.** A static page, browser app or CLI that costs almost
  nothing per user can stay free if it brings people to something paid or earns trust. A free tool
  with a high per-user cost needs a usage reading that shows it pays for itself.

## Where it stands

Of the 1,441 products in `ventures/`, 10 already carry a paid path that ships switched off and turns
on once a checkout is set. Paddle is now the merchant of record. Every checkout in the repo is still
empty, so revenue is still $0. The next step is to create real Paddle prices for two or three of the
flagships.

Some things don't change. Code stays MIT, anything the site advertises as free stays free, no
merchant secret goes in the public repository, and marketing claims stay ones a file can back. The
written rules are in `prompts/goals.md` ("Direction: cost-plus, things worth paying for") and
`PRODUCT_PLAYBOOK.md` §2.
