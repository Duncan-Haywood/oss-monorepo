# Poshmark fee calculator

Scored 2026-09-07. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is a two-line published schedule with no model in the
loop, which is what keeps the per-user cost at zero and the output auditable
by the seller who typed the sale price.

An independent Poshmark seller — reselling clothing, shoes, accessories, or
home goods out of a personal closet — has to know one recurring number: what
they actually keep after Poshmark's commission. Poshmark's published US
schedule is two rules, not one flat rate: sales under $15.00 pay a flat
$2.95 fee, and sales of $15.00 or more pay 20% of the sale price. That is a
real cliff — the whole price is taxed under whichever rule applies, not a
marginal rate on the portion above $15 — and a page that says "Poshmark
takes 20%" is silently wrong for the entire low end of a closet's inventory.
Search phrases include "poshmark fee calculator," "poshmark seller fees,"
and "poshmark break even price," with r/poshmark and r/Reseller as named,
recurring communities asking exactly this question.

The sharpest, underserved part of this arithmetic is not the two rules
themselves — Poshmark states them plainly on its own help page — it is what
follows from them that a seller does not compute by hand: the $14.75
break-even price where 20% of the price equals the flat $2.95 fee, the
effective rate on cheap items (a $10 item pays 29.5%, a $5 item pays 59%),
and the direction of the effect when an offer or bundle discount crosses the
$15.00 line. That last one is genuinely counter-intuitive: because 20% of
anything at or above $14.75 is already at least $2.95, crossing down into
the flat tier is a one-time *reduction* in commission, not a penalty — and
very close to the boundary a seller can net *more* by accepting one cent
less (a $15.00 sale nets $12.00; a $14.99 sale nets $12.04). No incumbent
calculator surfaces this, and getting the direction wrong costs real money
in a live negotiation.

The browser-local tool prices one sale from its sale price, item cost, and
packaging cost, reports the commission, effective rate, and profit, solves
for the price needed to hit a stated target profit, and separately compares
a listed price against a lower offer or bundle price — naming how much of
the discount came from Poshmark's own commission shrinking versus the
seller's own payout, and flagging the sign-flip case near the $15.00 line.

Existing alternatives are either a generic "Poshmark fee %" blog post with
no break-even arithmetic, or bundled inside paid reselling suites (Vendoo,
List Perfectly, PoshVA-adjacent tools) that focus on cross-posting and
listing management rather than the fee arithmetic itself. No existing
venture or pipeline candidate models Poshmark's flat/percent schedule;
`where-to-sell-calculator` and `marketplace-fee-compare` both explicitly
exclude Poshmark today (their own source comments name it as unmodeled), and
`whatnot-seller-payout`'s auction-commission-plus-checkout-processing shape
does not resemble a flat-fee/percent-tier cliff at all. `duplicate_check.py`
returned no match at or above the "read this first" threshold against the
one-line description before this write-up was started (top score 0.19,
against `faire-wholesale-calculator`).

Outputs are arithmetic observations on numbers the seller supplies, not
alcohol-, tax-, accounting-, legal-, or selling advice, and the tool does
not connect to Poshmark, create a listing, or submit an offer on the
seller's behalf — that positioning is in the disclaimer on every page. No
sale price, cost, or payout leaves the browser, and no personal or scraped
data is used anywhere in the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic on a two-rule published schedule; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a seller finding and using a free calculator inside weeks is plausible via subreddit and search discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | A transparent, narrow tool with no data moat, defensible only by being first and correct for this exact fee shape and the offer-crossing framing |
| Distribution | 6 | Named channels: r/poshmark and r/Reseller (large, active resale-seller subreddits where "how much did Poshmark actually take" and "should I accept this offer" recur), plus the search phrases "poshmark fee calculator," "poshmark seller fees," and "poshmark break even price" — real, recurring search terms with no free-standing calculator built around the break-even price or the offer-crossing arithmetic specifically |
| Liability containment | 8 | Business-math arithmetic on numbers the seller types in, not tax, accounting, or legal advice; the disclaimer explicitly excludes what price to list at or whether to accept an offer as a decision the tool makes |
| Ethical robustness | 9 | Gets more useful to a seller as they check more of their own sales and their own offer negotiations; no direction in which the seller profits from the tool being wrong, and the arithmetic is a neutral observation on Poshmark's own published schedule rather than a claim about Poshmark's fairness |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`whatnot-seller-payout`, `atm-route-margin`, and `pour-cost-calculator`'s
scoring pattern) rather than a defect needing mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every output as arithmetic on the
seller's own numbers, never a recommended list price or offer decision;
measure repeat use before adding any integration or AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `where-to-sell-calculator` or
`marketplace-fee-compare` (both explicitly exclude Poshmark and model
referral-rate marketplaces, not a flat-fee/percent-tier cliff); it is not
`whatnot-seller-payout` (auction commission plus checkout-total processing
fee, not a two-tier flat/percent schedule on the item price alone); it is
not any `*-bid-calculator` or `*-route-margin` venture (no crew bid, no
route, no per-location placement decision); and it does not appear in
`screened-out.md` under any name. `duplicate_check.py` returned no match
above the read-this-first threshold.

## Verdict

**Build now.** Graduated 2026-09-07 as `ventures/poshmark-fee-calculator` — a
static, deterministic browser calculator with a tested pricing engine
(commission by tier, effective rate, break-even price, target-profit
arithmetic, and an offer/bundle-discount comparison that correctly signs the
payout change across the $15.00 boundary), two search-intent guide pages
with worked examples recomputed by their own tests rather than asserted by
eye, usage counting, and the standard disclaimer/privacy/sponsor copy.
Repeat usage, organic search demand, and distribution remain unmeasured,
same as every other calculator at graduation.
