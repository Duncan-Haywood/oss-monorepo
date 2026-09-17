# Dumpster rental margin calculator

Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is deterministic and there is no model in the loop,
which is what keeps the per-user cost at zero and the output auditable by the
operator who typed the inputs.

An independent roll-off dumpster rental operator — one or a few trucks and
containers, dropping an empty container at a job site and hauling it back to
a transfer station or landfill to be weighed, distinct from a junk-hauling
business that loads and disposes of material itself — has to price a rental
around two separate numbers a flat per-size rate card hides: the disposal
cost of the *included* weight allowance the rental price actually promises to
cover, and a per-ton overage rate for anything past it. Search phrases
include "dumpster rental pricing calculator," "roll off overage fee," and
"how much weight does a 20 yard dumpster hold."

The sharpest, underserved part of this arithmetic: an overage rate is only a
safe fee if it is priced above the operator's own tipping fee per ton. Set it
below — which happens easily when the rate is set by "what looks reasonable"
rather than the transfer station's own invoice — and every ton the customer
goes over the allowance costs more to dispose of than it collects, with no
ceiling as the load gets heavier. That risk is invisible on a light cleanout
and only shows up on the heavy job (a shingle tear-off, a concrete tear-out,
wet dirt) that produces enough overage tons to matter, which is exactly why
it goes unnoticed until it has already cost several jobs' worth of margin.

The browser-local tool prices one rental from the included weight allowance,
tipping fee, driver labor, mileage, and equipment cost, at a stated target
margin; separately reports whether the overage rate clears the tipping fee
and, if not, how many overage tons on this specific rental would erase its
entire built-in profit; and lets the operator plug in the real scale ticket
once the container is hauled to see the job's actual profit instead of the
estimate. The proposed-price/actual-outcome check is the same shape as
`photo-booth-event-quote`'s "check a price you're already considering" and
`atm-route-margin`'s placement-worth-it check, applied to a genuinely
different buyer and a genuinely different risk: a per-ton disposal-cost floor
on a second, separately billed fee, rather than a volume-dependent single
cost line inside one price.

Existing alternatives are generic per-size rate cards with no cost-floor
check on the overage fee, and dumpster-rental software aimed at dispatch and
billing rather than the pre-quote pricing decision. `junk-removal-bid-
calculator` is the nearest existing venture and is a different business:
that operator loads and hauls the material themselves and prices the whole
job from estimated tonnage; this operator rents out an empty container the
customer fills over days, prices a base rental against an allowance, and
bills anything over it as a separate line the tipping fee has to clear.

Outputs are arithmetic observations, not waste-management, market-rate, or
business advice, and the tool does not audit an operator's books, set a
market rate, verify a rental or disposal agreement, or replace a contract,
insurance, or accountant — that positioning is in the disclaimer on every
page. No job, price, or scale-ticket weight leaves the browser, and no
personal or scraped data is used anywhere in the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; an operator finding and using a free calculator inside weeks is plausible via trade-forum and search discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | Same as the portfolio's other route/rate calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, low-competition search terms ("dumpster rental pricing calculator," "roll off overage fee") with no incumbent free interactive tool built around the allowance/overage-cost-floor arithmetic specifically |
| Liability containment | 8 | Business-math arithmetic, not waste-management or market advice; the disclaimer is explicit that the tool does not set a market rate, audit books, or replace insurance or an accountant |
| Ethical robustness | 9 | Gets more useful to an operator as they check their own overage rate and scale tickets; no direction in which the operator profits from the tool being wrong, and no adverse incentive on scale |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`atm-route-margin`, `vending-machine-route-margin`, and
`custom-farm-rate-calculator`'s scoring pattern) rather than a defect needing
mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every input as a user-supplied planning
assumption; measure repeat use before adding any integration or AI-assisted
feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `junk-removal-bid-calculator` (that business loads
and hauls material itself and prices the whole job from estimated tonnage;
this one rents an empty container the customer fills, priced from a weight
allowance and a separately billed overage fee); it is not any of the
`*-bid-calculator` building-trade ventures (no crew-bid, material-takeoff
arithmetic here); it is not `atm-route-margin`, `vending-machine-route-
margin`, `pool-route-pricing`, or `dog-walking-route-pricing` (different
buyer and unit economics — none of those model a per-ton disposal-cost floor
on a second billed fee); and it does not appear in `screened-out.md` under
any name.

## Verdict

**Build now.** Graduated 2026-09-06 as `ventures/dumpster-rental-margin-
calculator` — a static, deterministic browser calculator with a tested
pricing engine (including the overage-rate-vs-tipping-fee cost-floor check
and a real-scale-ticket check), a guide page on the overage-rate risk, usage
counting (including the fleet-standard `sponsor_link_clicked` event from v0),
and the standard disclaimer/privacy/sponsor copy. Repeat usage, organic
search demand, and distribution remain unmeasured, same as every other
calculator at graduation.
