# Duplicate payment audit

Scored 2026-09-07. Composite 6.875 · floor 1 (ai_leverage). The floor is the
point: the matching is deterministic hashmap grouping, not a model, which is
what keeps the per-user cost at zero and the output auditable — an AP clerk
can trace exactly which two rows and which rule produced each flagged pair.

An entire "duplicate payment audit" / "duplicate payment recovery audit"
industry already exists (firms such as twice2much.com market this exact
service on a contingency fee), and Ramp, Brex, NetSuite, Stripe, Klippa,
Precoro, Fiscaltec, and Illumis all publish content marketing targeting the
search phrases "duplicate payment audit," "how to find duplicate invoices in
accounts payable," and "duplicate invoice checker" — a density of content
investment from vendor-neutral fintech and AP-automation companies that is
itself evidence of real, recurring search volume, verified by web search
during this write-up rather than assumed. Recovery-audit firms work large
enterprise ledgers for a cut of what they recover; a business too small to be
worth that engagement has no free self-serve equivalent today.

Duplicate vendor payments happen in a few concrete, well-documented shapes:
the same invoice re-entered and paid twice, the same invoice number typo'd on
a second entry, and the same amount paid twice under two different invoice
numbers within a short window. The browser-local tool groups a payment ledger
CSV by vendor and by vendor+amount (the two shapes any real duplicate must
share), then flags: an exact vendor+invoice+amount match (high confidence), a
vendor+invoice match at a different amount (medium — a possible partial
payment or entry error), an edit-distance-1-or-2 invoice-number typo at the
same vendor+amount (high), and same vendor+amount within a configurable
date window with no invoice link (the lowest-confidence tier, explicitly
labeled "review" because a legitimate recurring charge — rent, a
subscription, a retainer — produces the identical pattern).

That last tier is also the honest limit of the product, disclosed on the page
itself rather than glossed over: the tool cannot distinguish a duplicate
payment from a recurring one on amount and timing alone, so it says so on
every row that tier produces and tells the reader to check whether the
vendor is paid this amount on a schedule before acting on it. This keeps the
liability position clean — the product never asserts fraud, wrongdoing, or a
confirmed duplicate; it surfaces a statistical pattern in the user's own data
for the user to verify, the same evidence-not-advice positioning as every
other audit-shaped tool in this portfolio.

No advice-of-record, no filing on the user's behalf, no scraped or
third-party data — every row comes from a CSV the user already has and
chooses to upload, and nothing leaves the browser. `duplicate_check.py`
returned no match at or above the "read this first" threshold (top score
0.16, against `invoice-payment-terms-calculator`, which computes due-date and
late-fee arithmetic on a single invoice rather than comparing a ledger for
duplicates) run against the one-line description before this write-up was
started. It is not `payment-reconciliation-workbench` (matches processor
payouts to bank deposits, not vendor payments to each other), and it is not
listed in `screened-out.md` under any name; the closest screened category,
"automated dispute and chargeback filing at volume," does not apply because
this tool never files anything — it only produces a list for the user's own
review.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic hashmap grouping and bounded edit-distance comparison; no model in the loop |
| Autonomous ops | 10 | Static page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a bookkeeper finding and using a free checker inside weeks is plausible via the existing search-term cluster and bookkeeping communities, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user |
| Defensibility | 5 | A transparent, narrow tool with no data moat, defensible only by being first and correct for the specific underserved segment (too small for a contingency recovery-audit firm) |
| Distribution | 6 | Named channels: the "duplicate payment audit" / "how to find duplicate invoices" search-term cluster (independently targeted by at least eight fintech/AP-automation content programs, verified by web search), plus r/Bookkeeping, r/Accounting, r/smallbusiness, and r/QuickBooks, where AP-process questions of this shape recur |
| Liability containment | 8 | Never asserts fraud, wrongdoing, or a confirmed duplicate — flags a statistical pattern in the user's own data for their own review, with the same-amount/near-date tier explicitly disclosed as also matching legitimate recurring charges; no filing, no vendor contact, no action taken on the user's behalf |
| Ethical robustness | 9 | Gets more useful to a user as they check more of their own ledger; no revenue model that rewards a false positive or a false negative, and the lowest-confidence tier is deliberately the one most likely to include legitimate recurring payments rather than silently inflating the flagged count to look more valuable |

Composite 6.875 (mean of eight). Both gates — `liability_containment` (8) and
`ethical_robustness` (9) — clear the floor of 5 with room, so this write-up
does not carry a gate mitigation. The only dimensions at or below 5 are
`ai_leverage` (1) and `defensibility` (5); per the pipeline's own rule that is
the deliberate floor of a deterministic checker (matching
`pour-cost-calculator`, `dumpster-rental-margin-calculator`, and
`atm-route-margin`'s scoring pattern) rather than a defect needing
mitigation.

**Mitigation for the sub-5 dimension (`ai_leverage`, 1):** keep the matching
deterministic and explainable per row; measure repeat use and false-positive
reports before adding any integration, direct QuickBooks/Xero connector, or
AI-assisted feature.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `payment-reconciliation-workbench` (matches
processor payouts to bank deposits, not vendor payments to each other); it is
not `invoice-payment-terms-calculator` (single-invoice due-date and late-fee
arithmetic, not a ledger-wide duplicate check); it is not
`card-processing-fee-audit` or `freight-accessorial-auditor` (both audit a
fee schedule against a contract, not a ledger for repeated payments); and it
does not appear in `screened-out.md` under any name. `duplicate_check.py`
returned no match above the read-this-first threshold.

## Verdict

**Build now.** Graduated 2026-09-07 as `ventures/duplicate-payment-audit` — a
static, deterministic browser checker with a tested matching engine (exact,
near-duplicate-invoice, and same-amount/near-date tiers), a reviewable CSV
export, usage counting, and the standard disclaimer/privacy/sponsor copy.
Repeat usage, organic search demand, and false-positive rate against a real
ledger remain unmeasured, same as every other checker at graduation.
