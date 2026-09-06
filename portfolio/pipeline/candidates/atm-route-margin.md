# ATM route margin calculator

Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage). Same deliberate
floor as this portfolio's other route-pricing calculators: the arithmetic is
deterministic and there is no model in the loop, which is what keeps the
per-user cost at zero and the output auditable by the operator who typed the
inputs.

Independent ATM route operators — deploying their own cash machines into
third-party locations (bars, convenience stores, laundromats, barbershops)
under a placement agreement, not a bank branch network and not a marketplace
— are paid almost entirely from the surcharge fee charged to the cardholder
on each withdrawal. Judging a location by "it does 200 withdrawals a month"
hides four things that decide whether the placement is actually worth
keeping: the location-owner's cut of that surcharge (paid as a percentage
split, a flat monthly placement fee, or both), the per-transaction fee owed
to the processor/network that routes the withdrawal, the cost of the vault
cash sitting idle in the machine (the operator's own capital, or a
cash-servicing company's fee for it), and the machine's own monthly cost
(lease or amortized purchase, plus wireless/telecom) — none of which show up
in a raw transaction count. Search phrases include "atm route profit
calculator," "how much does an atm business make," and "atm placement
commission calculator."

The browser-local tool prices one location's monthly economics from the
operator's own transaction count and cost inputs, then rolls a list of
locations up into total route profit and compares it to a stated income
goal — the same two-layer shape as `pool-route-pricing`,
`dog-walking-route-pricing`, and `vending-machine-route-margin` (a per-stop
calculation, then a route total), applied to a genuinely different buyer with
genuinely different arithmetic: surcharge revenue split as a percentage, a
flat fee, or both (both structures exist in real placement agreements); a
per-transaction processor fee rather than a percentage-of-sale card fee;
vault cash modeled as a cost of capital on the cash balance sitting in the
machine, which no other calculator in this portfolio models; and refill/
service visits that carry drive time, mileage, and an optional armored-
transport cost distinct from the operator's own labor. It is free, private,
and usable without an account or API key.

Existing alternatives are generic small-business profit calculators that do
not model a surcharge-split-plus-flat-fee placement structure, a
per-transaction processor fee, or vault cash as a capital cost — and
ATM-specific software is sold as route-management/monitoring SaaS (cash
forecasting, remote diagnostics, compliance reporting) rather than a free
per-location profit planning tool. The wedge is a narrow, transparent
calculator for the "is this placement worth keeping, and does my route hit my
income goal" decision specifically. A future hosted tier could add saved
location lists or CSV export; launch has zero per-user hosting or inference
cost.

Outputs are arithmetic observations, not financial or business advice, and
the tool does not audit an operator's books, verify a placement agreement,
process a live transaction, or replace a contract, insurance, or accountant —
that positioning is in the disclaimer on every page. No location, transaction,
or route data leaves the browser; the route table is not persisted across a
page refresh; and no personal or scraped data is used anywhere in the
product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a solo route operator finding and using a free calculator inside weeks is plausible, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | Same as the portfolio's other route-pricing calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, low-competition search terms ("atm route profit calculator") with no incumbent free tool built around the surcharge-split/processor-fee/vault-cash arithmetic specifically |
| Liability containment | 8 | Business-math arithmetic, not advice-of-record, and the tool never touches a live transaction, card data, or cash-handling compliance; the disclaimer is explicit that it does not audit books, verify a placement agreement, or replace insurance or an accountant |
| Ethical robustness | 9 | Gets more useful to an operator as they add locations; no direction in which the operator profits from the tool being wrong, and no adverse incentive on scale |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`pool-route-pricing`, `dog-walking-route-pricing`, and
`vending-machine-route-margin`'s scoring pattern) rather than a defect
needing mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every input as a user-supplied planning
assumption rather than a benchmark; measure repeat use before adding any
integration or AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any of the existing `*-bid-calculator` one-off job
quotes (an ATM placement is a recurring, unattended revenue stream, not a
single job); it is not `pool-route-pricing`, `dog-walking-route-pricing`, or
`vending-machine-route-margin` (different buyer, different unit economics —
surcharge revenue split as percentage and/or flat fee, a per-transaction
processor fee rather than a percentage sale/card fee, and vault cash modeled
as a cost of capital, none of which those three model); it is not
`card-processing-fee-audit` (that audits a merchant's own card-processing
statement for a sale-based business, not an ATM operator's surcharge and
network economics); and it does not appear in `screened-out.md` under any
name.

## Verdict

**Build now.** Graduated 2026-09-06 as `ventures/atm-route-margin` — a
static, deterministic browser calculator with a tested pricing engine, a
route-profit rollup, usage counting (including the fleet-standard
`sponsor_link_clicked` event from v0), and the standard disclaimer/privacy/
sponsor copy. Repeat usage, organic search demand, and distribution remain
unmeasured, same as every other calculator at graduation.
