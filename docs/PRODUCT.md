# Product Maturity — Print Atelier

**Company phase:** 0 → 1 (narrative → interactive prototype)  
**Last updated:** 2026-06-08 (initial scaffold)

## Subsystem maturity

Phases: `0` narrative · `1` interactive prototype · `2` functional MVP · `3` launchable · `4` growth · `5` scale

| Subsystem | Phase | Notes | Next step |
|-----------|-------|-------|-----------|
| Business plan TSX | 1 | All sections + portal routes exist | `/investor` condensed route |
| Capture pipeline | 0 | `setTimeout` simulation | Real file upload + job queue stub |
| Artist portal | 0 | Hardcoded portfolio | Shared `src/lib/mock-data.ts` + CRUD path |
| Storefront / buyer | 0 | Static UI | Catalog from shared lib |
| Outreach / CRM | 0 | Static copy in sales-portal | Prospect table + sequences |
| Marketing hub | 0 | Static UI | Ad variant generator wired to mock catalog |
| Payments | — | Not started | Stripe test mode after catalog |
| Database | — | Not started | Choose Supabase or Convex for onboarding slice |
| CI | 0 | Orchestrator workflow only | `ci.yml` build on PR |

## Tech decisions

| Area | Choice | Rationale | Date |
|------|--------|-----------|------|
| Frontend | Next.js 14 App Router | Already in repo | — |
| Hosting | Vercel | Matches Next.js | — |
| DB | _TBD_ | Agent decides at Phase 2 with vertical slice | — |
| Payments | Stripe + Connect | Artist payouts per RevenueModel | — |

## Active vertical slice

**Focus:** _None yet — orchestrator will set on first product run_  
**Definition of done:** _TBD_
