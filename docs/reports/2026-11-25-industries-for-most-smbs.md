---
kind: analysis
topics: [money]
date: 2026-11-25
title: Industries for most kinds of small business
description: The site's industries grew from 5 to 19; what changed, how an industry gets promoted, and catalogue depth per new industry for choosing the next paid bet.
---

# Industries for most kinds of small business (2026-11-25)

**Owner, 2026-11-25:** "we want to expand the industries we address for sure i
think. most types of smbs", "on the website and in general".

## What changed

- `platform/pages/business.mjs` `INDUSTRIES` grew from 5 to 19. The first five
  keep their product lines (bets.md order). The 14 new ones have no paid
  product, so each carries 3 or 4 plain-words jobs and 4 or 5 free tools that
  exist in `ventures/` (tested).
- `platform/pages/products.mjs`: `/industries/` now has two groups, "Products
  in development" and "Free tools today, products next". A page for an
  industry with no product says so in its first paragraph. It lists the jobs
  and the free tools, then has two calls to action: a mailto
  "Build first for <industry>" to the agent-managed inbox, and the free
  custom-development queue.
- `platform/pages/company.mjs` `INDUSTRIES` (llms.txt wording) names the new
  ones as free tools with products to follow.
- `prompts/goals.md`: the direction, quoted, under the 2026-11-24 pivot.

To promote an industry, add a `PRODUCT_LINES` entry with its slug. The page
then switches to the product layout, and the business.test.mjs honesty checks
apply to it.

## Which new industry next: catalogue depth (a supply signal, not demand)

Ventures whose slug matches each industry's keywords (rough regex over 1,443
slugs, run 2026-11-25; overlaps and misses are expected):

| Industry | Ventures |
|---|---:|
| Freelancers and solo | 39 (verticals.py counts 156 in its broader `freelancers` vertical) |
| Home services | 36 |
| Landlords and property | 33 |
| Restaurants and food | 32 |
| Trucking and delivery | 30 |
| Farms and growers | 24 |
| Weddings and events | 24 |
| Childcare and education | 22 |
| Health practices | 16 |
| Auto services | 16 |
| Beauty | 13 |
| Retail shops | 10 |
| Fitness | 6 |
| Professional services | 6 |

These counts measure how many free tools we already have, not how many people
want a product. Usage is unmeasured (`portfolio/usage/usage.yaml`). The "Build
first" mailto subjects land in the inbox, so count them by industry once there
are any. Until then, home services, restaurants and trucking look like the
strongest next bets: deep catalogues, many small operators, and recurring jobs
(quoting and routing, food and labor cost, per-mile cost and IFTA) that suit a
hosted product with a subscription.

## Not done here

- `portfolio/monetization/verticals.py` keeps its 13 verticals. Front-door
  status follows the bets, not the vertical, so splitting `local-services` and
  `other` into these industries would rewrite `verticals.json` without changing
  any decision. Do it when one of these industries gets a bet.
- `front-doors-map.mjs` maps tools only to industries that have a product, as
  it should. Its door line names a paid product.
