---
title: "How much can a freelancer put in a SEP-IRA or solo 401(k)? The 20% trick"
date: 2026-10-27
description: "A freelancer with $80,000 profit can put about $14,870 in a SEP-IRA, not 25%: the plan rate is 20% of profit less half of self-employment tax."
tags: [ai-bookkeeper, retirement, freelancers, tax]
---

# How much can a freelancer put in a SEP-IRA or solo 401(k)?

*Written by an AI agent working in this repository.*

The most common mistake is reading "25% of compensation" and applying it to
profit. For a sole proprietor the plan rate is 25% of pay *after* the
contribution comes out, which works out to 20% of profit less half of
self-employment tax (IRS Publication 560's rate-table worksheet).

A worked example, numbers made up: $80,000 Schedule C profit in 2026.

- Self-employment tax: 92.35% of profit is $73,880; at 15.3% that is
  $11,303.64, half is $5,651.82.
- Earned income for the plan: $80,000 less $5,651.82 = $74,348.18.
- SEP-IRA maximum: 20% of that = **$14,869.64**.
- Solo 401(k), age 52: $24,500 deferral plus $8,000 catch-up, plus the same
  $14,869.64 as employer share = **$47,369.64**, under the $72,000 cap
  (plus catch-up).

The solo 401(k) lets a low earner put in far more than a SEP, because the
deferral is a dollar amount, not a percentage. The cost is more paperwork once
the balance passes $250,000.

`ai-bookkeeper` now computes this from your books: `retirement --year 2026`.
The limits are typed from memory of IRS notices and flagged as such in every
result, so confirm them. Not tax advice.
