# Pricing proposal (CMMC workspace)

Status: **proposal for the owner**, 2026-11-24. The site shows these prices as "proposed, free during
early access". Nothing is charged yet; checkout belongs to `apps/cmmc` once it ships.

## Proposed plans (billed annually)

| Plan | Price/mo | Billed annually | For | Users |
|---|---|---|---|---|
| Level 1 | $39 | $468 | 15 FAR 52.204-21 requirements, evidence, annual affirmation reminders | 2 |
| Level 2 self-assessment | $149 | $1,788 | + 110 NIST SP 800-171 Rev. 2 requirements, SSP, POA&M, SPRS score | 5 |
| Level 2 + Quality | $249 | $2,988 | + ISO 9001 / AS9100 document control, internal audits, corrective actions | 10 |

Monthly billing, if offered, is +20% (the competitors charge about 2× for monthly; we do not need to).

## Anchors (from oss-monorepo `portfolio/monetization/bets.md`, bet #4, re-checked 2026-11-24)

| Competitor | Published price | Notes |
|---|---|---|
| [FutureFeed](https://futurefeed.co/pricing) Innovator (≤25 FTEs) | $99/mo billed annually ($198 monthly) | CMMC Level 2 is an add-on at $1,008/yr, so a Level 2 shop pays about **$183/mo** |
| FutureFeed Standard (26–999 FTEs) | $399/mo billed annually | + the same Level 2 add-on |
| [PreVeil Pass](https://www.preveil.com/preveil-pass/) | $450/mo for 3 users, 12 months prepaid | Includes encrypted email/file sharing for CUI (an enclave) plus a compliance kit: a different scope |
| Consultant SSP + POA&M | $3,000–$25,000 ([PreVeil](https://www.preveil.com/blog/making-cmmc-compliance-affordable-for-smbs)); $3,500–$20,000 ([Secureframe](https://secureframe.com/hub/cmmc/consultant)) | One-off; upkeep extra |

Note on sources: bets.md cites the $3k–25k range to Secureframe's certification-cost page. Search on
2026-11-24 attributed that exact range to PreVeil's cost article (documentation development including
the SSP and POA&M, counting in-house IT time and outside providers), and Secureframe's own consultant
figure is $3,500–$20,000. The site cites both, each to its own page. Direct page fetches were blocked by
this environment's network policy; the figures were confirmed through search results. Click through
every source before launch.

## Reasoning

1. **Level 2 under FutureFeed's Level 2 total.** $149 < ~$183, with the SSP drafted from the shop's
   own answers rather than a blank template. Being cheapest is not the pitch; being less than the
   obvious alternative removes the price objection for a 5–50 person shop.
2. **A year costs less than the low end of a consultant engagement.** $1,788 < $3,000, and the
   documents stay current (the SSP must match the system at every annual affirmation).
3. **Do not price against PreVeil Pass.** It sells a CUI enclave; we tell shops not to put CUI in the
   workspace (security page). Many Level 2 shops will need both, so we stay well under it.
4. **Level 1 is cheap on purpose.** 15 requirements, no score, no POA&M. $39 is the entry point that
   upgrades to Level 2 when a contract brings CUI. It also matches the job-shop quoting audience,
   most of whom only handle FCI.
5. **Quality tier at +$100.** ISO 9001 / AS9100 records are where the same office manager spends the
   rest of the compliance time; a separate QMS tool typically costs more than this.

## Cost floor (cost-plus check)

The repo's rule (root README) is cost-plus for subscriptions. Estimated full-use cost per shop-month,
with grants' assumptions (Claude `claude-opus-5-5` at $4 / $20 per MTok input/output, Workers hosting,
merchant-of-record 5% + $0.50 per charge, 3% refund reserve):

| | Level 1 | Level 2 | Level 2 + Quality |
|---|---|---|---|
| LLM: SSP drafts (2 full redrafts/mo; ~4k in / 800 out tokens per requirement) | $0.96 | $7.04 | $7.04 |
| LLM: interview turns (~3k in / 300 out each) | $0.90 (50) | $3.60 (200) | $5.40 (300) + QMS drafting $2 |
| Hosting (Workers share, D1, R2 evidence ~5 GB) | $0.30 | $0.50 | $1.00 |
| Merchant fee (annual charge spread over 12) | $1.99 | $7.49 | $12.49 |
| Refund reserve 3% | $1.17 | $4.47 | $7.47 |
| **Total** | **~$5.32** | **~$23.10** | **~$35.40** |
| Price / cost | ~7× | ~6.5× | ~7× |

These are well above grants' 1.3–2.0× band. That band is a choice for charities; this buyer is a
business, the anchors above set what the market pays, and the cost table leaves out the largest real
cost: human help when a shop is stuck on a requirement. **Owner decision:** accept value-based pricing
with this cost floor (recommended), or adopt a cost-plus band and lower prices. Either way, `apps/cmmc`
should carry a test like grants' `plans.test.ts` that fails if any plan drops below 1.3× full-use cost.

## Before charging

- Re-check every anchor price and the CMMC status (dates on the site come from `STATUS_CHECKED` in
  `src/site.mjs`).
- Decide the merchant of record (grants uses Paddle).
- Write refund terms; do not offer "pass or your money back" or anything tied to assessment results.
