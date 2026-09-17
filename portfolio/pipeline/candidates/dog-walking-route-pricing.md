# Dog walking & pet sitting route pricing calculator

Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is deterministic and there is no model in the loop,
which is what keeps the per-user cost at zero and the output auditable by the
operator who typed the inputs.

Independent dog walkers and pet sitters running their own recurring client
book — not a marketplace app like Rover or Wag that sets or suggests the rate
for them — usually price a walk with a flat, memorized number ("$20 a walk").
That number ignores four things that change the real economics: drive time
between stops, extra pets at the same household, the on-call exposure of an
overnight stay (as opposed to a daytime walk's few active minutes), and
whatever a payment app takes in processing fees. Search phrases include "how
much should I charge for dog walking," "pet sitting rate calculator," and
"dog walking pricing calculator."

The browser-local tool prices one visit (walk, drop-in, or overnight) from
the operator's own time and cost inputs, then rolls a recurring client list
up into monthly route revenue and compares it to a stated income goal — the
same two-layer shape as `pool-route-pricing` (a per-unit price, then a route
total), applied to a genuinely different buyer with genuinely different
arithmetic: per-visit duration tiers rather than a fixed service window,
per-pet surcharges, overnight on-call hours billed separately from active
minutes, and a payment-processing gross-up so a target margin survives the
processor's cut. It is free, private, and usable without an account or API
key.

Existing alternatives are marketplace apps (which set the rate structure and
take a booking fee) and generic hourly calculators that do not model drive
time between stops, multi-pet households, or overnight on-call time. The
wedge is a narrow, transparent calculator built for an operator who keeps
their own client book. A future hosted tier could add saved client lists or
CSV export; launch has zero per-user hosting or inference cost.

Outputs are arithmetic observations, not financial or business advice, and
the tool does not evaluate whether an animal is fit to be walked or boarded,
screen clients, or replace a contract or insurance — that positioning is in
the disclaimer on every page. No customer data leaves the browser; the route
table is not even persisted across a page refresh; and no personal or scraped
data is used anywhere in the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a solo operator finding and using a free calculator inside weeks is plausible, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | Same as the portfolio's other route-pricing calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, low-competition search terms ("dog walking rate calculator") with no incumbent free tool built for a route rather than a single job |
| Liability containment | 8 | Business-math arithmetic, not advice-of-record; the disclaimer is explicit that the tool does not assess an animal's fitness, screen clients, or replace insurance |
| Ethical robustness | 9 | Gets more useful to an operator as they add clients; no direction in which the operator profits from the tool being wrong, and no adverse incentive on scale |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimension at or below 5 is
`ai_leverage` and `defensibility` at 5; per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`pool-route-pricing`'s scoring pattern) rather than a defect needing
mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every input as a user-supplied planning
assumption rather than a benchmark; measure repeat use before adding any
integration or AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `pet-grooming-bid-calculator` (a per-groom
one-off price from coat/size/matting, not a recurring route); it is not
`pool-route-pricing` (different buyer, different unit economics — chemicals
and pool time rather than pets, drive-time clustering, and overnight on-call
hours); and it does not appear in `screened-out.md` under any name.

## Verdict

**Build now.** Graduated 2026-09-06 as `ventures/dog-walking-route-pricing` —
a static, deterministic browser calculator with a tested pricing engine, a
route-revenue rollup, usage counting, and the standard disclaimer/privacy/
sponsor copy. Repeat usage, organic search demand, and distribution remain
unmeasured, same as every other calculator at graduation.
