# CAT adjuster fee schedule & deployment profit calculator

Scored 2026-09-11. Composite 6.625 · floor 1 (ai_leverage). Same deliberate
floor as this portfolio's other route- and deployment-pricing calculators:
the arithmetic is deterministic and there is no model in the loop, which is
what keeps the per-user cost at zero and the output auditable by the
adjuster who typed the inputs.

Independent catastrophe (CAT) claims adjusters — 1099 contractors who
deploy to a storm-affected area for an independent-adjusting (IA) firm and
are paid a flat fee per claim closed, not a wage — decide whether to accept
a deployment from a fee schedule that reads as a single per-claim number.
That number hides the thing that actually decides whether the trip pays: a
realistic claims-per-day pace (which depends on the storm and the firm's
own volume, not just the fee), the daily cost of an estimating-software
subscription, lodging, per diem, and a vehicle while in the field, and the
unpaid travel days spent driving to and from the disaster zone before the
first claim ever closes — days that still cost money and are easy to leave
out of a mental-math estimate entirely. Real, recurring community channels
discuss exactly this trade-off: r/Adjusters and r/InsuranceAdjusters
(active subreddits built around CAT deployment work), CatAdjuster.org's
forums, and Facebook groups for independent and catastrophe adjusters,
where "is this fee schedule worth it" and "how much do CAT adjusters
actually make" are recurring, specific questions rather than a generic
gig-work search term. `duplicate_check.py` found no existing venture or
screened-out entry for this niche (top score 0.18, against the portfolio's
existing `notary-trip-quote`, itself a different per-appointment gig-work
niche).

The browser-local tool prices one deployment's economics from the
adjuster's own pace, fee-schedule, and daily-cost inputs — including a
large-loss share paid a bonus on top of the base fee, and unpaid travel
days that carry the same daily costs as working days but close zero
claims — then lets the adjuster rank two or three named IA firm offers by
net profit, the same "one scenario, then a roll-up comparison" shape as
this portfolio's other route-pricing calculators
(`fire-extinguisher-inspection-route-margin`,
`medical-courier-route-margin`), applied to a genuinely different buyer
and genuinely different arithmetic: a claim-based fee rather than a
per-stop or per-unit one, a blended large-loss bonus, and a day-based cost
structure split explicitly between working days and unpaid travel days —
the input this calculator's fleet peers do not need, because none of them
price a multi-week, away-from-home deployment. It is free, private, and
usable without an account or API key.

Existing alternatives are generic freelance or gig-work rate calculators
that do not model claim pace, a large-loss blended fee, or the
unpaid-travel-day cost specifically, and dedicated IA-firm fee-schedule
comparison tools were not found — adjusters currently compare offers by
memory or an ad hoc spreadsheet, per the recurring forum question the
niche asks. The wedge is a narrow, transparent calculator for the "is this
specific deployment worth taking" decision. A future hosted tier could add
saved deployment history or CSV export; launch has zero per-user hosting
or inference cost.

Outputs are arithmetic observations, not financial or business advice, and
the tool does not determine an adjuster's licensing, appointment, or
authority to handle a claim in any state, and does not evaluate an IA
firm's reputation, payment timeliness, or claim-volume promises — that
positioning is in the disclaimer and the page's own FAQ. No deployment or
fee-schedule data leaves the browser; the offer-comparison table is not
persisted across a page refresh; and no personal or scraped data is used
anywhere in the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a solo independent adjuster finding and using a free calculator inside weeks is plausible, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 4 | Same as the portfolio's other route/deployment calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, low-competition search terms ("CAT adjuster fee calculator," "how much do CAT adjusters make") plus named recurring community channels (r/Adjusters, CatAdjuster.org forums) that already discuss this exact fee-schedule trade-off, with no incumbent free tool built around it |
| Liability containment | 8 | Business-math arithmetic on user-supplied numbers, not advice-of-record; the tool never determines licensing, appointment, or claim-handling authority, and never evaluates a named firm's reputation or payment history — the disclaimer and FAQ are explicit that it prices deployment economics only |
| Ethical robustness | 8 | Gets more useful to an adjuster as they compare more offers; no direction in which the adjuster is harmed by the tool being wrong beyond their own review, and no adverse incentive on scale |

Composite 6.625 (mean of eight). Both gates — `liability_containment` (8)
and `ethical_robustness` (8) — clear the floor of 5 with room, so this
write-up does not carry a gate mitigation. The only dimensions at or below
4 are `ai_leverage` (1) and `defensibility` (4); per the pipeline's own
rule that is the deliberate floor of a deterministic calculator (matching
`fire-extinguisher-inspection-route-margin` and
`medical-courier-route-margin`'s scoring pattern) rather than a defect
needing mitigation, and the mitigation in `candidates.yaml` names it
anyway per the "any dimension at 4 or below" rule.
