# Product Maturity — Print Atelier

**Company phase:** 1 (interactive prototype with shared business logic, finance stress tests, demand creative scoring, outreach reply triage, buyer room-preview CAC feedback, guarded channel budget allocation, and artist payout trust proof)
**Last updated:** 2026-06-08 (artist payout trust run)

## Subsystem maturity

Phases: `0` narrative · `1` interactive prototype · `2` functional MVP · `3` launchable · `4` growth · `5` scale

| Subsystem | Phase | Notes | Next step |
|-----------|-------|-------|-----------|
| Business plan TSX | 1 | All sections + portal routes exist; unit economics uses shared formula and artist payout trust battlecard | `/investor` condensed route |
| Capture pipeline | 0 | `setTimeout` simulation | Real file upload + job queue stub |
| Catalog intelligence | 1 | Shared `src/lib/marketplace.ts`, launch-readiness scoring, tested payout and creative-readiness math | Persist catalog records and AI metadata confidence |
| Artist portal | 1 | Shared catalog drives portfolio, payout forecast, and launch queue | Artist proof approval action + CRUD path |
| Artist payout trust | 1 | Tested payout comparator powers an interactive artist-facing battlecard against POD royalty benchmarks | Persist artist-specific payout proof in outreach CRM |
| Storefront / buyer | 1 | Storefront filters live shared-catalog listings, shows artist payout per print, and includes a room-preview conversion lab | Product detail + persisted preview events |
| Buyer conversion analytics | 1 | Room-preview experiment translates preview engagement and conversion lift into adjusted CAC, incremental orders, and artist payout upside | Persist preview opens, add-to-cart, orders, and source channel |
| Outreach / CRM | 1 | Tested `src/lib/outreach.ts` prospect scoring, reply classification, next-action queue, and interactive `/sales-portal` filters | Persist prospects/replies and sync real channel events |
| Marketing hub | 1 | Catalog-driven creative readiness scorer and channel concepts in `/marketing-portal` | Persist creative tests and compare predicted CAC to actual cohorts |
| Finance / unit economics | 1 | CAC payback, LTV:CAC, payout, and POD sensitivity simulator uses shared economics | Persist channel assumptions and compare actual cohorts |
| GTM budget allocation | 1 | Weekly channel allocator in `RevenueModel` shifts spend by contribution after CAC, LTV:CAC guardrails, caps, and room-preview lift | Persist weekly budget plans with actual spend, CAC, orders, and measured preview lift |
| Payments | — | Not started | Stripe test mode after catalog |
| Database | — | Not started | Choose Supabase or Convex for onboarding slice |
| CI | 1 | `ci.yml` build workflow exists; local `npm test` covers catalog, finance, creative, and outreach math | Add PR check status tracking to PROGRESS |

## Tech decisions

| Area | Choice | Rationale | Date |
|------|--------|-----------|------|
| Frontend | Next.js 14 App Router | Already in repo | — |
| Hosting | Vercel | Matches Next.js | — |
| DB | _TBD_ | Agent decides at Phase 2 with vertical slice | — |
| Payments | Stripe + Connect | Artist payouts per RevenueModel | — |
| Catalog data | Typed in-repo mock (`src/lib/marketplace.ts`) | Enables Phase 1 shared demos before persistence | 2026-06-08 |
| Test runner | `tsx --test` | Lightweight TypeScript unit coverage without changing app runtime | 2026-06-08 |
| Finance scenarios | Pure TypeScript calculators in `src/lib/marketplace.ts` | Keeps CAC, payout, and POD assumptions testable across UI surfaces | 2026-06-08 |
| Creative scoring | Pure TypeScript scorer in `src/lib/marketplace.ts` | Gates paid demand by proof, room mockups, SEO tags, margin, and predicted CAC lift before persistence | 2026-06-08 |
| Outreach scoring | Pure TypeScript scorer in `src/lib/outreach.ts` | Turns artist replies into deterministic upload, payout/legal, proof mockup, nurture, and referral-kit actions before persistence | 2026-06-08 |
| Room preview experiments | Pure TypeScript calculator in `src/lib/marketplace.ts` | Connects buyer visualization lift to adjusted CAC forecasts before adding persisted analytics | 2026-06-08 |
| Channel budget allocation | Pure TypeScript allocator in `src/lib/marketplace.ts` | Makes "do not spend" a software-first decision when channels fail contribution or LTV:CAC guardrails | 2026-06-08 |
| Payout benchmark comparison | Pure TypeScript comparator in `src/lib/marketplace.ts` | Lets outreach lead with 30% net-profit proof only when SKU economics beat POD royalty benchmarks | 2026-06-08 |

## Active vertical slice

**Focus:** Catalog intelligence + finance stress testing + creative demand engine + outreach reply triage + buyer room-preview CAC feedback + guarded channel budget allocation + artist payout trust proof
**Definition of done:** Shared catalog and outreach data power artist, buyer, finance, marketing, and sales surfaces; payout, readiness, channel CAC, creative scoring, reply triage, room-preview conversion, weekly budget allocation, and payout benchmark comparison math are covered by tests; next step is persistence plus real uploads, AI metadata, reply sync, preview events, budget plans, payout proof snapshots, and actual channel cohorts.
