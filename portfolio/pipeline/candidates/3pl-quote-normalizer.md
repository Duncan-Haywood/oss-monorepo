# 3PL quote normalizer

## Customer and painful problem

Small ecommerce brands and independent 3PL warehouse operators often receive
rate cards whose receiving, storage, pick-and-pack, packaging, shipping,
returns, fixed fees, and monthly minimums cannot be compared directly. The
buyer needs the monthly cost and break-even volume before signing, plus a
line-by-line record for negotiation.

## Product and differentiation

The browser tool converts rate-card inputs into a common monthly basis, exposes
the minimum-charge effect, compares an in-house estimate, and produces a
buyer-facing negotiation summary. It is local-first: no account, upload,
carrier integration, or paid API is needed. The differentiation is transparent
arithmetic and a portable review artifact rather than a black-box fulfillment
recommendation.

## Market, economics, and automation

Search terms include `3PL cost calculator`, `compare 3PL fulfillment quotes`,
`3PL minimum monthly spend`, and `3PL break even calculator`. A static browser
page costs $0 per user on existing infrastructure and has no variable
inference, database, or support queue. A later paid model could add team
history, rate-card libraries, or an optional customer-supplied AI key, while
the deterministic comparison remains free.

## Risks and evidence

The result is an arithmetic comparison, not financial, tax, legal, engineering,
or procurement advice; the user verifies the rate card and makes the decision.
Inputs remain in local storage and usage events contain no quote content. This
is new to the portfolio: it compares warehouse fulfillment rate-card
components and minimums, unlike eBay, Amazon FBA, LTL class, or generic margin
calculators.

## Validation plan

The vertical slice in `ventures/3pl-quote-normalizer/` has deterministic tests,
local draft persistence, line-item export, and an opt-out local event counter.
The first experiment is 14 days at a $0 budget. Measure completed
normalizations, copied summaries, repeat local use, and whether users identify
a hidden fee or minimum in a real quote.
