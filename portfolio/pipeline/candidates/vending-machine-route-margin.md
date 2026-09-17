# Vending machine route profit calculator

Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is deterministic and there is no model in the loop,
which is what keeps the per-user cost at zero and the output auditable by the
operator who typed the inputs.

Independent vending-machine route operators — placing snack/drink or bulk
candy/toy machines in third-party locations under a commission agreement, not
a vending franchise or marketplace — usually judge a location by its gross
sales total ("this machine did $73 since the last restock"). That number
hides four things that decide whether the stop is actually worth keeping: the
location-owner commission taken off the top of every sale, card processing
fees on an increasing share of vends, shrink (theft, spoilage, or damage —
product already paid for and never sold), and the machine's own monthly cost
(lease or amortized purchase price), which applies whether or not the
location performs. Search phrases include "vending machine route profit
calculator," "how to price vending machine locations," and "vending
commission calculator."

The browser-local tool prices one location's restock visit from the
operator's own sales reading and cost inputs, then rolls a location list up
into monthly route profit and compares it to a stated income goal — the same
two-layer shape as `pool-route-pricing` and `dog-walking-route-pricing` (a
per-stop calculation, then a route total), applied to a genuinely different
buyer with genuinely different arithmetic: a location-commission split taken
from gross sales (the standard vending placement structure), shrink modeled
as extra product cost on top of units sold rather than a revenue discount,
and a machine's fixed monthly cost amortized per visit rather than a labor-
only overhead line. It is free, private, and usable without an account or API
key.

Existing alternatives are generic markup or "cost-plus" calculators that do
not model a location-commission split, shrink as a cost rather than a
discount, or machine amortization — and vending-specific software is sold as
route-management SaaS (inventory, telemetry, invoicing) rather than a free
profit-per-location planning tool. The wedge is a narrow, transparent
calculator for the "is this location worth keeping" decision specifically. A
future hosted tier could add saved location lists or CSV export; launch has
zero per-user hosting or inference cost.

Outputs are arithmetic observations, not financial or business advice, and
the tool does not audit an operator's books, verify a commission agreement,
or replace a contract, insurance, or accountant — that positioning is in the
disclaimer on every page. No location, sales, or route data leaves the
browser; the route table is not even persisted across a page refresh; and no
personal or scraped data is used anywhere in the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a solo route operator finding and using a free calculator inside weeks is plausible, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | Same as the portfolio's other route-pricing calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, low-competition search terms ("vending machine route profit calculator") with no incumbent free tool built around the commission/shrink/amortization arithmetic specifically |
| Liability containment | 8 | Business-math arithmetic, not advice-of-record; the disclaimer is explicit that the tool does not audit books, verify a commission agreement, or replace insurance or an accountant |
| Ethical robustness | 9 | Gets more useful to an operator as they add locations; no direction in which the operator profits from the tool being wrong, and no adverse incentive on scale |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`pool-route-pricing` and `dog-walking-route-pricing`'s scoring pattern)
rather than a defect needing mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every input as a user-supplied planning
assumption rather than a benchmark; measure repeat use before adding any
integration or AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any of the existing `*-bid-calculator` one-off job
quotes (a vending location is a recurring placement, not a single job); it is
not `pool-route-pricing` or `dog-walking-route-pricing` (different buyer,
different unit economics — a location-commission split on gross sales,
shrink as extra product cost, card processing fees, and machine amortization,
none of which those two calculators model); and it does not appear in
`screened-out.md` under any name.

## Verdict

**Build now.** Graduated 2026-09-06 as `ventures/vending-machine-route-margin`
— a static, deterministic browser calculator with a tested pricing engine, a
route-profit rollup, usage counting (including the fleet-standard
`sponsor_link_clicked` event from v0), and the standard disclaimer/privacy/
sponsor copy. Repeat usage, organic search demand, and distribution remain
unmeasured, same as every other calculator at graduation.
