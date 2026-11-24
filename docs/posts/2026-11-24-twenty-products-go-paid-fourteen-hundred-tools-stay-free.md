---
title: "Twenty products go paid, 1,415 tools stay free: how we drew the line"
seo_title: "Which of 1,441 tools go paid, and why"
date: 2026-11-24
tags: [business-model, licensing, open-source, pricing]
description: "We split 1,441 tools by code depth into 20 paid products and 1,415 free MIT tools, and priced each by what serving one user costs."
---

Until today every tool in this catalogue was free and MIT-licensed, and the only income was donations. That changes now. The products with real depth are moving to paid licences: a subscription when serving a customer costs us money every month, a one-off licence when the tool runs on the customer's own machine. The small single-purpose tools stay free and open. Their job is to be found.

The hard part was deciding which tool is which. Nearly every tool's own file says "path to revenue: lead magnet and donations", because that was the only model allowed when it was written, so the label tells you nothing. Code size turned out to be a better signal. Counting non-test source lines across all 1,441 ventures gives a long, flat tail and a short head:

| lines of source | ventures |
|---|---|
| 20,000 or more | 12 |
| 5,000 or more | 25 |
| 2,000 or more | 49 |
| 500 or more | 536 |

Most of the band from 2,000 to 5,000 lines is marketplace fee calculators and bid calculators. They are long because fee tables are long, not because they do more. So we put the line at 5,000 lines, kept every calculator and checker free whatever its size, and counted the flagships as products at any size. Six calls the rules could not make are written down with their reasons. One example: `sales-agent` stays free and self-hosted, because whoever sends the email has to be the sender of record. The result is **20 products, 1,415 free tools, and 6 projects that stay open on purpose** (open hardware, open house plans, liturgical music tooling, and `sales-agent`).

How each product is sold depends on what one more user costs us:

- **Subscription (8):** ai-bookkeeper, einvoice-preflight, shift-roster-builder, league-schedule-generator, local-site-studio, print-atelier, babysitting-business-kit and the real-estate photo app. Each has a server, model calls, stored data or a rule set we keep current. Prices are cost-plus, like our grant-writing app's ($5, $20 and $100 a month, each 1.3 to 2 times what a fully used plan costs us, checked by a test).
- **One-off licence (12):** wall-framing-takeoff, changepoint-detector, the photo pipeline, quick-pick-survey, the IFC and schedule checkers, shed-designer, clothing-design-studio and five more. These run in the browser, so a monthly fee would be rent for nothing.

Two things do not change. Code already published under MIT stays MIT for good: anyone can keep using, forking or selling the versions that are out there, and each product keeps a free edition on this site. And code from someone else keeps its own licence. The script lists every third-party licence file inside each product, so a paid build carries only code we are allowed to ship.

The script is `portfolio/monetization/transition.py`, and the full reasoning is in `portfolio/monetization/LICENSING_TRANSITION.md`. Nothing is for sale yet: the checkout stays off until the payment account is open. The first product to move is wall-framing-takeoff, whose licence-key code was already built and switched off.

*Written with AI assistance.*
