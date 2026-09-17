# Locksmith bid calculator

Scored 2026-09-06. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the arithmetic is deterministic and there is no model in the loop,
which is what keeps the per-user cost at zero and the output auditable by the
locksmith who typed the inputs.

A mobile or small-shop locksmith pricing a service call — a lockout, a rekey,
a lock or cylinder install, key-fob/transponder programming, or a small
commercial access-control job — has to fold two trade-specific mechanics into
a phone quote that a generic bid calculator does not model: an after-hours or
emergency premium that belongs on billed time only (never on parts, which
cost the same at any hour), and a minimum service charge floor that protects
a short, low-parts job (a five-minute car unlock, a single cut key) from
pricing below what the trip itself cost once drive time, fuel, and standing
overhead come out. Search phrases include "locksmith pricing calculator",
"how much should a locksmith charge for a service call", and "emergency
lockout cost" — the catalogue's own search log (`portfolio/ledger/2026-08.yaml`)
already records "locksmith rekey" as a real query the fleet's own tool-search
fallback could not answer, because nothing in the catalogue served it.

The browser-local tool prices one call from labor and travel minutes, an
hourly rate, an emergency-call toggle and its percentage premium (applied to
billed time only), a trip fee, parts cost and markup, a callback reserve,
overhead, target margin, and the minimum service charge — comparing the
calculated target against the minimum and using whichever is higher. A second
section checks a day's worth of calls, at that average profit, against a
target daily income and reports the shortfall and how many more calls close
it — the same two-layer shape as this portfolio's other per-job trade
calculators (`appliance-repair-quote-calculator`, `notary-trip-quote`) and
route/goal calculators (`atm-route-margin`), applied to a genuinely different
mechanic: an after-hours premium scoped to time only, and a minimum-charge
comparison, rather than a route roll-up or a repair-vs-replace decision.

Existing alternatives are generic field-service or trade bid calculators that
model neither mechanic, and a locksmith's own back-of-envelope math, which is
exactly where the after-hours premium on travel time (not just labor) and the
minimum floor tend to get dropped under phone-call pressure. The wedge is a
narrow, transparent calculator built around this trade's two specific pricing
mechanics. A future hosted tier could add saved rate profiles or a printable
quote; launch has zero per-user hosting or inference cost.

Outputs are arithmetic observations, not legal, licensing, or business
advice, and the tool does not verify a locksmith license or bond, price a
specific make or model of lock or fob, audit a transaction, or replace a
contract, insurance, or accountant — that positioning is in the disclaimer on
every page. Nothing typed leaves the browser; the daily-goal inputs are not
persisted across a refresh; and no personal, scraped, or customer-identifying
data is used anywhere in the product (the tool never asks for a customer
name, address, or the property being accessed — only the locksmith's own
cost inputs).

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a mobile locksmith finding and using a free calculator inside weeks is plausible via trade-forum and search discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | Same as the portfolio's other per-job trade calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer and this exact pair of mechanics |
| Distribution | 6 | Narrow, real search terms ("locksmith pricing calculator", "how much should a locksmith charge") with no incumbent free interactive tool built around the after-hours-premium-on-time-only and minimum-charge-floor arithmetic specifically; volume unmeasured |
| Liability containment | 8 | Business-math arithmetic on the locksmith's own figures, not a license/bond verification, a lock-picking or bypass method, or a determination about a specific customer or property; the disclaimer is explicit that the tool does not replace insurance, a contract, or an accountant |
| Ethical robustness | 9 | Gets more useful to a locksmith as they refine their own labor rate, parts costs, and minimum charge; no direction in which the locksmith profits from the tool being wrong, no customer-facing record for an error to hide in (the output never reaches the locksmith's customer), and no adverse incentive on scale |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic calculator (matching
`atm-route-margin`, `notary-trip-quote`, and
`appliance-repair-quote-calculator`'s scoring pattern) rather than a defect
needing mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the
calculation deterministic and label every output as a pricing planning floor
rather than a quote the tool issues on the locksmith's behalf; measure repeat
use before adding any integration or AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any of the existing home-trade `*-bid-calculator`
directories (a locksmith service call is a short, time-and-parts job priced
with an after-hours premium and a minimum-charge floor, not a construction
project bid from crew-hours and materials); it is not
`appliance-repair-quote-calculator` (that models a diagnostic/repair/travel
labor stack and a repair-vs-replace decision, with no after-hours premium or
minimum-charge mechanic); it is not `notary-trip-quote` (a fee-vs-offer
evaluation for a signing agent, with printing and per-page economics that do
not apply here); it is not `atm-route-margin`, `vending-machine-route-margin`,
`pool-route-pricing`, `dog-walking-route-pricing`, or
`medical-courier-route-margin` (a fixed-placement or repeat-stop route,
rather than a one-off dispatched service call priced with an emergency
premium); and it does not appear in `screened-out.md` under any name —
neither "locksmith" nor an adjacent security-consulting or lock-bypass
category is listed there.

## Verdict

**Build now.** Graduated 2026-09-06 as `ventures/locksmith-bid-calculator` —
a static, deterministic browser calculator with a tested pricing engine
(after-hours premium scoped to billed time, minimum-charge floor comparison,
a daily-income-goal check), usage counting (including the fleet-standard
`sponsor_link_clicked` event from v0), a worked-example guide page, and the
standard disclaimer/privacy/sponsor copy. Repeat usage, organic search
demand, and distribution remain unmeasured, same as every other calculator at
graduation.
