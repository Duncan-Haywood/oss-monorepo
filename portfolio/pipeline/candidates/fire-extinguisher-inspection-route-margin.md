# Fire extinguisher inspection route margin calculator

Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage). Same deliberate
floor as this portfolio's other route-pricing calculators: the arithmetic is
deterministic and there is no model in the loop, which is what keeps the
per-user cost at zero and the output auditable by the technician who typed
the inputs.

Independent fire-extinguisher and life-safety-equipment inspection route
operators — a certified technician or small company visiting customer sites
to perform the annual certified maintenance, tagging, recharge, hydrostatic
testing, and replacement that NFPA 10 and most fire-code authorities
require, not the customer's own monthly visual self-inspection and not a
fire-alarm or sprinkler contractor — are paid per unit inspected, plus
whatever share of units at a site need a recharge, a hydrostatic test, or
outright replacement on a given visit. Judging a site by "18 extinguishers
on the schedule" hides the thing that actually decides whether the stop is
worth keeping: the materials cost against each of those three service types
varies site to site and is easy to under-price against a flat per-unit fee,
tags carry their own small fee and cost per unit that adds up on a large
site, drive time and mileage apply whether the site has 4 units or 40, and a
small monthly recordkeeping cost (the compliance-history software or
paper-tag system holding a customer's inspection record) is easy to forget
entirely. Search phrases include "how to price a fire extinguisher
inspection route," "fire extinguisher service pricing calculator," and "how
much do fire extinguisher inspection companies charge."

The browser-local tool prices one site's monthly economics from the
technician's own unit count and cost inputs, then rolls a list of sites up
into total route profit and compares it to a stated income goal — the same
two-layer shape as `pool-route-pricing`, `dog-walking-route-pricing`,
`vending-machine-route-margin`, `atm-route-margin`, and
`custom-farm-rate-calculator` (a per-stop calculation, then a route total),
applied to a genuinely different buyer with genuinely different arithmetic:
three distinct service types (recharge, hydrostatic test, replacement) each
with their own incidence rate, fee, and materials cost; a tag fee and cost
charged on every unit at every visit regardless of service type; and an
annual (not monthly) visit cadence — the one input this calculator's peers
in the fleet do not need, because NFPA 10's certified-maintenance
requirement is yearly by default, unlike a recurring monthly service route.
It is free, private, and usable without an account or API key.

Existing alternatives are generic small-business profit or field-service
scheduling software that do not model the recharge/hydro-test/replacement
materials split or the annual-visit cadence specifically, and
fire-protection-specific software is sold as inspection-scheduling and
compliance-recordkeeping SaaS (which this tool explicitly does not attempt
to be or replace) rather than a free per-site profit planning tool. The
wedge is a narrow, transparent calculator for the "is this site worth
keeping, and does my route hit my income goal" decision specifically. A
future hosted tier could add saved site lists or CSV export; launch has zero
per-user hosting or inference cost.

Outputs are arithmetic observations, not financial, business, or fire-code
compliance advice, and the tool does not perform, certify, or replace a
professional fire-extinguisher inspection, does not determine or record
NFPA 10 (or any other) compliance status, and does not audit an operator's
books or replace a service contract, insurance, or accountant — that
positioning is in the disclaimer and the page's own FAQ. No site, pricing,
or route data leaves the browser; the route table is not persisted across a
page refresh; and no personal or scraped data is used anywhere in the
product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a solo inspection-route operator finding and using a free calculator inside weeks is plausible, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | Same as the portfolio's other route-pricing calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, low-competition search terms ("fire extinguisher inspection route pricing") with no incumbent free tool built around the recharge/hydro-test/replacement materials split specifically |
| Liability containment | 8 | Business-math arithmetic, not advice-of-record, and the tool never determines or certifies compliance status, inspects a live unit, or replaces insurance, licensing, or an accountant; the disclaimer and FAQ are explicit that it prices route economics only |
| Ethical robustness | 9 | Gets more useful to an operator as they add sites; no direction in which the operator profits from the tool being wrong, and no adverse incentive on scale |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8)
and `ethical_robustness` (9) — clear the floor of 5 with room, so this
write-up does not carry a gate mitigation. The only dimensions at or below 5
are `ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule
that is the deliberate floor of a deterministic calculator (matching
`pool-route-pricing`, `dog-walking-route-pricing`, `vending-machine-route-margin`,
and `atm-route-margin`'s scoring pattern) rather than a defect needing
mitigation.
