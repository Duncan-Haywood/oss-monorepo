# Custom farm rate calculator

Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is deterministic and there is no model in the loop,
which is what keeps the per-user cost at zero and the output auditable by the
operator who typed the inputs.

A custom farm operator — someone who owns field equipment (a combine,
planter, sprayer, baler, or tillage tool) and does field work for other
farmers for pay, rather than farming only their own ground — has to decide
what to charge per acre for a job. The common reference is a published
regional custom rate survey (land-grant extension offices publish these
annually), which reports what other operators charged last season, averaged
across many farms and machines. That average is a useful market check; it is
not this operator's own cost structure, and using it directly either
underprices a lightly used machine with a high ownership cost per hour, or
overprices one run hard across many customers. Search phrases include
"custom farming rate calculator," "how to calculate custom combine rate," and
"custom farm rate per acre."

The browser-local tool prices one field job from the operator's own machine
numbers — field speed, implement width, field efficiency (the standard
agricultural-engineering conversion to acres-per-hour), fuel burn, repairs,
the machine's annual ownership cost spread over the hours it actually runs
across all customers and the operator's own ground, and labor — then applies
a target margin and rolls a season of jobs up into total profit against an
income goal. The same two-layer shape as `shop-rate-calculator` (a per-hour
cost derivation) crossed with `atm-route-margin` and
`vending-machine-route-margin` (a per-job calculation rolled into a season
total), applied to a genuinely different buyer and genuinely different
arithmetic: field capacity from speed/width/efficiency rather than a fixed
crew-hour rate, and ownership cost spread over annual machine-hours rather
than a route's fixed monthly placement cost.

Existing alternatives are generic markup or "cost-plus" calculators that do
not model field capacity or machine ownership economics, and the published
survey PDFs report an average rather than letting an operator plug in their
own numbers. The wedge is a narrow, transparent calculator for "what should
this job cost my machine" specifically. A future hosted tier could add saved
machine profiles or CSV export; launch has zero per-user hosting or inference
cost.

Outputs are arithmetic observations, not agronomic, market-rate, or business
advice, and the tool does not audit an operator's books, set a market rate,
verify a custom-farming agreement, or replace a contract, insurance, or
accountant — that positioning is in the disclaimer on every page. No job,
rate, or season data leaves the browser; the season table is not persisted
across a page refresh; and no personal or scraped data is used anywhere in
the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a custom operator finding and using a free calculator inside weeks is plausible via farm-forum and search discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | Same as the portfolio's other route/rate calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, low-competition search terms ("custom farming rate calculator") with no incumbent free interactive tool built around field-capacity/ownership-cost arithmetic specifically |
| Liability containment | 8 | Business-math arithmetic, not agronomic or market advice; the disclaimer is explicit that the tool does not set a market rate, audit books, or replace insurance or an accountant |
| Ethical robustness | 9 | Gets more useful to an operator as they add jobs and refine their own machine numbers; no direction in which the operator profits from the tool being wrong, and no adverse incentive on scale |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`atm-route-margin` and `vending-machine-route-margin`'s scoring pattern)
rather than a defect needing mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every input as a user-supplied planning
assumption rather than a market rate; measure repeat use before adding any
integration or AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any of the existing `*-bid-calculator` one-off job
quotes for building trades (a custom farm job is field work priced by the
acre from machine field-capacity and ownership economics, not a trade bid
from crew-hour and material cost); it is not `shop-rate-calculator` (that
derives a crew-hour rate from payroll and shop overhead, with no field
capacity or machine-ownership-per-acre arithmetic); it is not
`atm-route-margin`, `vending-machine-route-margin`, `pool-route-pricing`, or
`dog-walking-route-pricing` (different buyer, different unit economics — none
of those model field speed, implement width, field efficiency, or an
annually-amortized machine spread over hours of use); and it does not appear
in `screened-out.md` under any name.

## Verdict

**Build now.** Graduated 2026-09-06 as `ventures/custom-farm-rate-calculator`
— a static, deterministic browser calculator with a tested pricing engine, a
season-profit rollup, usage counting (including the fleet-standard
`sponsor_link_clicked` event from v0), and the standard disclaimer/privacy/
sponsor copy. Repeat usage, organic search demand, and distribution remain
unmeasured, same as every other calculator at graduation.
