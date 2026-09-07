# Pour cost calculator

Scored 2026-09-07. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is deterministic and there is no model in the loop,
which is what keeps the per-user cost at zero and the output auditable by the
operator who typed the bottle costs.

An independent bar, restaurant beverage program, or beverage director has to
know one recurring number: pour cost (also called liquor cost percentage) —
the cost of a drink's ingredients divided by its menu price — checked against
a target the operator sets, commonly 18-24% for spirits. It is simple
arithmetic and almost nobody actually computes it per recipe: it lives in a
spreadsheet that goes stale the moment a supplier's invoice changes, or the
menu price is set by feel and never checked at all. Search phrases include
"pour cost calculator," "liquor cost calculator," and "how to calculate pour
cost."

The sharpest, underserved part of this arithmetic is not the pour cost
percentage itself — several commercial and blog-embedded calculators already
do that — it is the annual dollar cost of a small, specific over-pour on the
primary spirit. A quarter-ounce over a 1.5oz recipe is a few cents on any one
ticket and looks generous rather than expensive. Multiplied across a bar's
actual weekly drink volume and 52 weeks, it becomes a concrete, recoverable
figure that never appears as a line item anywhere, because it left the bottle
without ever touching a price on the menu. That is the number that makes the
tool worth returning to, the same way `shop-rate-calculator`'s billable-hour
share and `atm-route-margin`'s placement-worth-it check each turn an
otherwise-static percentage into something the operator can act on.

The browser-local tool prices a spirit/modifier/mixer recipe from each
ingredient's own bottle cost and bottle size, reports the pour cost
percentage and gross profit against the menu price, computes the price this
exact recipe would need to hit a stated target, and separately reports the
weekly and annual cost of a stated over-pour on the primary spirit across the
operator's own drink volume — deliberately phrased as an arithmetic
observation on a stated number, not an accusation aimed at any bartender.

Existing alternatives are either buried inside paid POS/inventory platforms
(BinWise, BevSpot, Toast) or single-purpose blog calculators with no
over-pour-cost feature and no free-standing, private version. No existing
venture or pipeline candidate models beverage-program recipe costing;
`shop-rate-calculator` computes a labor rate for trade contractors and
`quote-margin-check` compares job-bid margins — neither touches a recipe, a
bottle cost, or a pour size, and this candidate does not touch a labor rate,
a job bid, or a route. `duplicate_check.py` returned no match at or above the
"read this first" threshold (top score 0.13, against `delivery-app-margin-
calculator`) run against the one-line description before this write-up was
started.

Outputs are arithmetic observations, not alcohol-service, tax, accounting, or
business advice, and the tool does not audit a bartender, set a menu price,
or assign blame for an over-pour — that positioning is in the disclaimer on
every page. No recipe, bottle cost, menu price, or drink count leaves the
browser, and no personal or scraped data is used anywhere in the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; an operator finding and using a free calculator inside weeks is plausible via subreddit and search discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | A transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer and this exact over-pour-cost framing |
| Distribution | 6 | Named channels: r/bartenders and r/TendingBar (bar-industry subreddits where recipe costing and pour-cost questions recur), plus the search phrases "pour cost calculator," "liquor cost calculator," and "how to calculate pour cost" — real, recurring search terms with existing commercial tools but no free-standing interactive one built around the over-pour-cost check specifically |
| Liability containment | 8 | Business-math arithmetic on numbers the operator types in, not alcohol-service, tax, or compliance advice; the disclaimer explicitly excludes pour-size/service law, staffing, and what to charge |
| Ethical robustness | 9 | Gets more useful to an operator as they check more of their own recipes and their own scale of over-pour; no direction in which the operator profits from the tool being wrong, and the over-pour framing is deliberately non-punitive (an arithmetic observation, not a claim about any specific bartender) |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`dumpster-rental-margin-calculator`, `atm-route-margin`, and
`custom-farm-rate-calculator`'s scoring pattern) rather than a defect needing
mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every input as a user-supplied bottle
cost or pour size; measure repeat use before adding any integration, POS
connection, or AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `shop-rate-calculator` (labor rate for a trade
contractor's crew hour, no recipe or bottle cost anywhere in it); it is not
`quote-margin-check` (compares job-bid margins, not beverage recipes); it is
not any `*-bid-calculator` or `*-route-margin` venture (no crew bid, no
route, no per-location placement decision); and it does not appear in
`screened-out.md` under any name. `duplicate_check.py` returned no match
above the read-this-first threshold.

## Verdict

**Build now.** Graduated 2026-09-07 as `ventures/pour-cost-calculator` — a
static, deterministic browser calculator with a tested pricing engine
(recipe cost, pour cost percentage, target-price arithmetic, and the
over-pour weekly/annual cost check), a search-intent guide page with a
worked example recomputed by its own test rather than asserted by eye, usage
counting, and the standard disclaimer/privacy/sponsor copy. Repeat usage,
organic search demand, and distribution remain unmeasured, same as every
other calculator at graduation.
