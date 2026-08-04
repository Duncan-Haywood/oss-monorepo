# Outreach cohort attribution — 2026-06-12

## Why this matters

Print Atelier's supply-side GTM compounds only when outreach replies become capture uploads, proofed listings, and sellable catalog SKUs. Reply-to-live compression metrics measure velocity, but attribution answers **which artists and platforms** are producing live inventory and attributed artist payout.

## Design

`buildOutreachCohortAttribution` joins:

1. **Outreach prospects** — CRM status, platform, projected payout
2. **Pipeline cohort** — stage timestamps from reply through live listing
3. **Queue guardrails** — payout holds and deep-link eligibility

Outputs:

- Funnel counts: outreach → replied → onboard-intake → capture-linked → live-listing
- Conversion rates: reply %, onboard %, live %
- Platform breakdown (Instagram, TikTok, Pinterest)
- Attributed monthly payout (live vs pipeline)

## Surfaces

- `/sales-portal` — operator table with drop-off reasons and onboarding deep-links
- `/investor` — supply pipeline card with conversion rates and attributed payout

## Phase 2 path

Persist stage transitions with signer, source channel, and copy version in Convex. Replace mock `outreachPipelineCohort` with webhook events from DM/email tools and `/artist-onboard` intake submissions.

## Sources

- Reuses `docs/research/2026-06-12-gtm-orders-catalog-sync.md` and `docs/research/2026-06-12-reply-velocity-ad-sync.md` for supply velocity context.
