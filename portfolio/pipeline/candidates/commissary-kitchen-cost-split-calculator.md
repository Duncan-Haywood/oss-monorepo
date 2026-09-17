# Commissary kitchen cost split calculator

Scored 2026-09-16. Composite 6.125 · floor 1 (ai_leverage). The floor is the
same one nearly every calculator in this portfolio carries — the work is
deterministic arithmetic, not model work — which is why the honest case for
this candidate rests on the niche and the correctness of the split, not a
moat in the code.

Commissary and shared-kitchen operators bill one pooled monthly total —
rent, utilities, trash, cleaning, pest control, insurance — across several
food-truck or mobile-vendor tenants who almost never use the space evenly.
Today that split is usually either "divide by the number of tenants" (simple,
but charges a light user the same as a heavy one every month) or a
spreadsheet the operator maintains by hand, which the itemized/manual-total
toggle here is meant to replace without asking anyone to change how they
already think about the bill. This is a small, single-purpose tool for a
narrow B2B audience, not a wedge into a large market.

The browser-local tool takes the pool's itemized cost rows (or a single
manual override total), a list of tenants each with hours booked and
dry/refrigerated/freezer storage unit counts, an optional flat base/access
fee per tenant charged before the proportional split, and a choice of split
method — by hours, by storage, a weighted blend (70/30 hours/storage by
default, adjustable), or an equal split kept deliberately as a baseline/
comparison rather than removed. Every dollar amount is tracked in integer
cents and the proportional shares are allocated with a largest-remainder
method, so the per-tenant bill sums to the pool total exactly, to the cent,
in every case tested including recurring-decimal splits (e.g. $1000 divided
three equal ways) and a tenant with zero usage.

**Scores:**

| Dimension | Score |
|---|---|
| AI leverage | 1 |
| Autonomous ops | 10 |
| Time to revenue (time to first user, per portfolio direction) | 6 |
| Gross margin | 10 |
| Defensibility | 3 |
| Distribution | 3 |
| Liability containment | 8 |
| Ethical robustness | 8 |

**Mitigation for the floor dimension (`ai_leverage`, 1):** keep the split
deterministic — no AI-assisted categorization or advice of any kind — and
disclose the output as arithmetic on the operator's own numbers; measure
repeat use before adding any integration or AI-assisted feature.

**Honest read on defensibility (3) and distribution (3), scored deliberately
modest rather than inflated to match the liability/ethics gates:** this is a
small, easily-copied arithmetic tool — any competent developer could rebuild
the largest-remainder split in an afternoon — and there is no evidence yet of
where a commissary operator would find it. Unlike `hoa-reserve-fund-
calculator`'s post-Surfside reserve-study mandate, there is no comparable
regulatory driver here creating current search volume; the niche is real
(commissary kitchens are a legal requirement for food trucks in most US
jurisdictions) but the channel to reach the operators who run them is
unproven. Both scores stay low rather than being rounded up to match the
higher gate scores below.

## Boundary

The product is pure arithmetic on numbers the customer supplies about their
own arrangement. It must:

- perform only cost-splitting arithmetic on the pool total, cost rows, and
  tenant usage figures entered — no legal, tax, or financial advice, and no
  claim about what a fair split "should" be beyond the method the user
  selected;
- never draft, review, or enforce a shared-kitchen or tenant agreement — the
  footer and FAQ say this explicitly;
- collect no payment and process no PII — tenant names are free-text labels
  entered and read only in the browser, never uploaded; and
- keep the equal-split method available and undocumented as inferior, since
  it is the correct choice for a kitchen with genuinely even usage.

## Why this is distinct

This is not `food-truck-event-margin-calculator`, the closest-scoring result
in `duplicate_check.py` (0.12, well under the 0.45 high-overlap bar): that
tool prices a single event or catering booking for one food truck operator
from the truck's own cost side (prep, travel, staff, propane, permit,
turnout risk); this tool splits a shared kitchen facility's *recurring
pooled overhead* across *multiple tenants* from the commissary operator's (or
lead tenant's) side. The audiences overlap — both serve independent food
truck operators — which is why the two are linked as one-hop siblings, but
the job, the customer doing the entering, and the math are all different: one
computes a price to charge a customer, the other allocates a shared cost
among peers. It is also not `pet-sitting`/`dog-walking-route-pricing`
(0.02-ish overlap, different trade entirely) or `vending-machine-route-
margin` (different trade, route-based single-operator margin rather than a
multi-tenant pooled-cost split) — both were checked and ruled out per the
task brief before this candidate was scored, and neither scores meaningfully
on `duplicate_check.py` against this pitch. No `commissary`/`shared-kitchen`/
`kitchen-split` slug or write-up exists anywhere in `ventures/`,
`candidates.yaml`, or `screened-out.md`.

## Verdict

**Build now.** Graduated 2026-09-16 as
`ventures/commissary-kitchen-cost-split-calculator` — a static, deterministic
browser calculator (23 `calc.mjs` tests covering the largest-remainder
allocation, all four split methods, zero-usage and zero-pool edge cases, a
single tenant, and base fees exceeding the pool; plus usage-counting and
page-structure tests), usage counting, and the standard disclaimer/privacy/
sponsor copy. Repeat usage, organic search demand, and distribution remain
unmeasured, same as every other calculator at graduation — and, per the
honest defensibility/distribution scores above, more genuinely uncertain here
than for candidates with a regulatory or seasonal driver behind them.
