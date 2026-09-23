# OSHA TRIR & DART rate calculator

Scored 2026-09-23. Composite 6.625 · floor 1 (ai_leverage). Same deliberate
floor as this portfolio's other route- and deployment-pricing calculators:
the arithmetic is deterministic and there is no model in the loop, which is
what keeps the per-user cost at zero and the output auditable by the safety
coordinator who typed the inputs.

EHS coordinators and safety managers at construction and manufacturing
contractors repeatedly need their company's current Total Recordable
Incident Rate (TRIR) and DART rate — the two numbers a general contractor's
prequalification form, a bid package, or a workers'-comp renewal actually
asks for. Many GCs set a TRIR ceiling (often 3.0, or a trade's own published
industry average) below which a subcontractor cannot bid, and the rate is
one input to a comp renewal premium. In practice a company often computes
the rate once a year, when the OSHA 300A summary is posted, from a count
already sitting on its OSHA 300 log — this is arithmetic that should take a
minute and instead gets rebuilt from scratch in a spreadsheet, or gets
checked for the first time on the same form that is about to gate a bid.
`duplicate_check.py` found no existing venture or screened-out entry for
this niche (top score 0.12, against `cra-evidence-desk`; a related but
distinct idea, `coi-compliance-tracker`, was previously screened out for a
different reason — see "Overlap" below).

The browser-local tool prices one period's rates from a company's own
recordable-case count, DART-case count, and total hours worked, using
OSHA's own 200,000-hour base rate, then compares the result to a target
rate the user sets (a GC's ceiling, a trade average, or an internal goal)
and computes the additional injury-free hours it would take to dilute the
current rate down to that target — the same "one figure, then a target
comparison" shape as this portfolio's other rate/margin calculators, applied
to a safety-compliance number instead of a pricing one. It is free, private,
and usable without an account.

Existing alternatives are mostly lead-generation calculators in front of
EHS-software or safety-consulting vendors, requiring an email or a sales
call before showing a result; a free-standing, no-signup calculator that
also converts the gap into a planning figure (hours, optionally months) was
not found.

## Overlap

`coi-compliance-tracker` was screened out (`screened-out.md`) because
tracking a certificate of insurance's expiry puts the tracker in the causal
chain of an uninsured loss — an ongoing monitoring duty with a real failure
mode if it lapses silently. This candidate does not track anything over
time or monitor for a lapse; it is a single-use arithmetic calculator on
counts the user already has, with the same liability shape as this
portfolio's other rate calculators, not a monitoring service.

Outputs are arithmetic observations, not a compliance determination: the
tool never decides whether a specific case is OSHA recordable (that
judgment call stays the employer's own, against 29 CFR 1904.7) and never
claims a company is compliant with any OSHA rule — that positioning is
explicit in the disclaimer and the page's own FAQ. No case data leaves the
browser, and no personal or scraped data is used anywhere in the product.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a solo EHS coordinator finding and using a free calculator inside weeks is plausible, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 4 | Same as the portfolio's other rate/margin calculators: a transparent, narrow tool with no data moat, defensible only by being first and correct for this exact buyer |
| Distribution | 6 | Clear, recurring search terms ("TRIR calculator," "how to calculate TRIR," "DART rate calculator") dominated by lead-gen vendor forms, plus a named community channel (r/safety) and professional forums (ASSP-adjacent, EHS Today) that discuss this exact rate |
| Liability containment | 8 | Business-math arithmetic on user-supplied counts, not advice-of-record; the tool never determines OSHA recordability or claims compliance with any OSHA rule — the disclaimer and FAQ are explicit that it prices the rate arithmetic only, and recordability stays the employer's own judgment call |
| Ethical robustness | 8 | Gets more useful to a safety program as it checks the rate more often; no direction in which the user is harmed by the tool being wrong beyond their own review of the OSHA 300 log inputs, and no adverse incentive on scale |

Composite 6.625 (mean of eight). Both gates — `liability_containment` (8)
and `ethical_robustness` (8) — clear the floor of 5 with room, so this
write-up does not carry a gate mitigation. The only dimensions at or below
4 are `ai_leverage` (1) and `defensibility` (4); per the pipeline's own
rule that is the deliberate floor of a deterministic calculator (matching
`cat-adjuster-fee-calculator` and this portfolio's other rate/margin
calculators' scoring pattern) rather than a defect needing mitigation, and
the mitigation in `candidates.yaml` names it anyway per the "any dimension
at 4 or below" rule.
