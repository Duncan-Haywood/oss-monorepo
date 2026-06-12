# Product Maturity — Print Atelier

**Company phase:** 1 (interactive prototype with shared business logic, finance stress tests, demand creative scoring, outreach reply triage, reply-to-live compression metric, proof-mockup response kits, buyer room-preview CAC feedback, product detail preview CTA comparison, buyer checkout lab with Stripe session scaffold, guarded channel budget allocation, artist payout trust proof, artist earnings calculator, payout exception guardrails, listing release decisions, channel consent gates, investor dashboard, visual docs hub, partner readiness scoring, partner credential vault, competitive battlecards, programmatic SEO lab, static print landing routes, consent-gated sitemap, ad catalog feed lab, ad sync health monitor, Stripe Connect payout simulator + webhook scaffold, AI metadata confidence dashboard, battlecard outreach snippets, and capture upload metadata stub)
**Last updated:** 2026-06-12 (buyer checkout slice + Stripe test-mode session scaffold)

## Subsystem maturity

Phases: `0` narrative · `1` interactive prototype · `2` functional MVP · `3` launchable · `4` growth · `5` scale

| Subsystem | Phase | Notes | Next step |
|-----------|-------|-------|-----------|
| Business plan TSX | 1 | Visual Business Overview tab + all sections + portal routes; links to `/docs` visual hub; unit economics uses shared formula and artist payout trust battlecard | Embed live metrics previews in plan tabs |
| Visual docs hub | 1 | `/docs` aggregates investor, battlecards, SEO lab, catalog AI, payout sim, and sitemap with live shared-lib metrics | Persist owner bookmarks and cohort snapshots |
| Investor / owner dashboard | 1 | `/investor` aggregates catalog, outreach, finance, fulfillment, and ad readiness from shared libs | Persist live metrics + cohort trends |
| Partner integrations | 1 | `src/lib/partners.ts` scores readiness; `src/lib/partner-credentials.ts` + `/partner-setup` vault tracks env keys for fulfillment, ads, and Stripe | Connect real API credentials + webhooks |
| Market launch scoring | 1 | `calculateMarketLaunchScore` blends supply, demand, ops, and fulfillment into one launch score | Tie score to automated spend caps |
| Capture pipeline | 1 | Real file picker + localStorage metadata persistence; simulated AI stages | Backend upload + job queue (Convex/Supabase + R2) |
| Catalog intelligence | 1 | Shared `src/lib/marketplace.ts`, launch-readiness scoring, tested payout and creative-readiness math | Persist catalog records and AI metadata confidence |
| Artist portal | 1 | Shared catalog drives portfolio, payout forecast, interactive earnings calculator, and launch queue | Artist proof approval action + CRUD path |
| Artist payout trust | 1 | Tested payout comparator powers an interactive artist-facing battlecard against POD royalty benchmarks | Persist artist-specific payout proof in outreach CRM |
| Payout promise guardrails | 1 | Tested payout exception queue holds unsafe listings, recommends retail-price fixes, and powers `/admin-portal` operator actions | Persist exception decisions, overrides, and price/POD-cost remediation history |
| Listing release workflow | 1 | Tested release-decision queue classifies listings as release-ready, finance override review, or ops hold and previews artist-facing trust copy in `/admin-portal` | Persist release/hold/override decisions with owner, reason, and artist-facing copy snapshot |
| Legal / rights | 1 | Tested listing consent gate blocks storefront, outreach, paid ads, and AI room-preview channels until POD license, ad rights, AI room-scene use, and payout acknowledgement are recorded | Persist consent ledger events with signer, timestamp, source, and copy version |
| Storefront / buyer | 1 | Storefront filters live shared-catalog listings, shows artist payout per print, product detail preview CTA (flat vs room), room-preview conversion lab, and `/checkout` consent-gated cart with POD routing; print landing pages embed preview CTA | Persisted preview events + live Stripe Checkout Sessions |
| Buyer conversion analytics | 1 | Room-preview experiment translates preview engagement and conversion lift into adjusted CAC, incremental orders, and artist payout upside | Persist preview opens, add-to-cart, orders, and source channel |
| Outreach / CRM | 1 | Tested `src/lib/outreach.ts` prospect scoring, reply classification, payout-guardrail holds, next-action queue, reply-to-live compression + 7-day cohort planner, proof-mockup response kits with room scenes + payout proof in `/sales-portal`, battlecard reply snippets | Persist prospects/replies, pipeline stage timestamps, payout exception state, and sync real channel events |
| Marketing hub | 1 | Creative readiness in `/marketing-portal`, SEO lab at `/seo-lab`, ad catalog feed at `/ad-catalog`, sync health at `/ad-sync-health` | Persist creative tests and sync live catalog feeds to Meta/Google/Pinterest APIs |
| Ad catalog feed | 1 | `buildAdCatalogFeed` generates Meta/Google/Pinterest rows from publishable SEO slugs + creative readiness + paid-ad consent | Connect platform catalog APIs and webhook sync on consent updates |
| Ad sync health | 1 | `buildAdCatalogSyncHealth` monitors pixel, feed, creative-quota, and consent checks per platform at `/ad-sync-health` | Wire platform catalog APIs + webhook refresh on consent updates |
| Competitive positioning | 1 | `/battlecards` interactive deck vs Society6, Redbubble, Saatchi, Artfinder | Wire battlecards into sales-portal personalization |
| Programmatic SEO | 1 | `generateSeoLandingPages` + static `/prints/[slug]` with consent-gated `noindex` + `sitemap.xml` from publishable slugs | Persist published pages + search console sync |
| Payments | 1 | `simulateStripeConnectPayout` models per-order waterfall; `POST /api/stripe/webhook` verifies signatures and routes Connect events; `.env.example` documents test-mode keys | Wire Stripe test mode keys + persist transfer/payout ledger |
| Catalog AI metadata | 1 | `buildCatalogMetadataDashboard` scores tags, SEO copy, mockups, proof confidence | Connect to real AI tagging pipeline on capture upload |
| Operations | 1 | Admin console includes payout promise guardrail queue and listing hold/release workflow before outreach | Persist ops queues and assign owners/SLA |
| Finance / unit economics | 1 | CAC payback, LTV:CAC, payout, and POD sensitivity simulator uses shared economics | Persist channel assumptions and compare actual cohorts |
| GTM budget allocation | 1 | Weekly channel allocator in `RevenueModel` shifts spend by contribution after CAC, LTV:CAC guardrails, caps, and room-preview lift | Persist weekly budget plans with actual spend, CAC, orders, and measured preview lift |
| Database | — | Not started | Choose Supabase or Convex for onboarding slice |
| CI | 1 | `ci.yml` build workflow exists; local `npm test` covers catalog, finance, creative, outreach, outreach velocity, proof-mockup kits, investor, partner, partner credentials, product preview CTA, artist earnings, checkout, competitors, SEO sitemap, ad catalog feed, ad sync health, capture, stripe-connect, stripe webhooks, and metadata confidence (75 tests) | Add PR check status tracking to PROGRESS |

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
| Payout exception guardrail | Pure TypeScript queue builder in `src/lib/marketplace.ts` | Converts payout trust into an ops workflow that holds unsafe listings and recommends price/POD fixes before outreach | 2026-06-08 |
| Listing release decisions | Pure TypeScript release builder in `src/lib/marketplace.ts` | Turns payout guardrails into release-ready, finance-review, and ops-hold decisions with artist-facing copy preview before persistence | 2026-06-08 |
| Listing consent gate | Pure TypeScript consent-gate builder in `src/lib/marketplace.ts` | Keeps POD license, paid-ad rights, AI room-scene use, and payout acknowledgement as channel-specific release checks before persistence | 2026-06-08 |
| Investor snapshot | `src/lib/investor.ts` + `src/lib/partners.ts` | Single owner view of pipeline, unit economics, partner readiness, and guarded channel budget | 2026-06-11 |
| Competitive battlecards | `src/lib/competitors.ts` | Payout + moat battlecards for GTM and artist outreach | 2026-06-12 |
| Programmatic SEO | `src/lib/seo.ts` | Landing page generator from catalog with readiness blockers | 2026-06-12 |
| Capture metadata | `src/lib/capture.ts` | localStorage session stub before backend upload | 2026-06-12 |
| Static print routes | `src/app/prints/[slug]` + `evaluateSeoPagePublishability` | Consent-gated programmatic SEO with noindex for blocked pages | 2026-06-12 |
| Sitemap + robots | `buildSitemapEntries` + `src/app/sitemap.ts` + `robots.ts` | Only consent-cleared print slugs indexed; ops routes disallowed | 2026-06-12 |
| Visual docs hub | `src/components/VisualDocsHub.tsx` + `/docs` | Owner GTM entry point wired to shared libs | 2026-06-12 |
| Stripe Connect simulator | `src/lib/stripe-connect.ts` | Per-order waterfall before test-mode keys | 2026-06-12 |
| Metadata confidence | `src/lib/catalog-intelligence.ts` | AI-ready scoring across tags, SEO, mockups, proof | 2026-06-12 |
| Battlecard outreach snippets | `buildBattlecardReplySnippet` in `src/lib/competitors.ts` | Personalizes payout/proof replies in sales portal | 2026-06-12 |
| Ad catalog feed | `src/lib/ad-catalog.ts` | Meta/Google/Pinterest product rows from consent-cleared SEO slugs | 2026-06-12 |
| Reply-to-live compression | `calculateReplyToListingCompression` in `src/lib/outreach.ts` | Supply-side GTM velocity from reply through live listing | 2026-06-12 |
| Ad sync health monitor | `buildAdCatalogSyncHealth` in `src/lib/ad-catalog.ts` | Pixel + feed + creative-quota checks before catalog API sync | 2026-06-12 |
| Proof-mockup response kit | `buildProofMockupResponseKit` in `src/lib/outreach.ts` | Room scenes + payout proof + DM/email drafts for mockup-classified replies | 2026-06-12 |
| Stripe webhook scaffold | `src/app/api/stripe/webhook` + `src/lib/stripe-webhook-server.ts` | Signature-verified Connect event routing before Phase 3 persistence | 2026-06-12 |
| Product detail preview CTA | `compareProductDetailPreviewModes` in `src/lib/marketplace.ts` | Flat vs room-preview conversion comparison on storefront and print pages | 2026-06-12 |
| Partner credential vault | `src/lib/partner-credentials.ts` + `/partner-setup` | Env-key readiness for fulfillment, ads, and Stripe before API integration | 2026-06-12 |
| Artist earnings calculator | `calculateArtistEarningsForecast` in `src/lib/marketplace.ts` | Interactive 30% net-profit forecast in artist portal payouts tab | 2026-06-12 |
| Buyer checkout lab | `src/lib/checkout.ts` + `/checkout` + `/api/stripe/checkout` | Consent-gated cart, fulfillment routing, Stripe session payload before Phase 3 | 2026-06-12 |

## Active vertical slice

**Focus:** Catalog intelligence + finance stress testing + creative demand engine + outreach reply triage + buyer room-preview CAC feedback + guarded channel budget allocation + artist payout trust proof + payout exception guardrails + listing release workflow + channel consent gate + investor/market-launch readiness + competitive battlecards + programmatic SEO + static print routes + Stripe Connect simulator + metadata confidence + capture metadata stub
**Definition of done:** Shared catalog and outreach data power artist, buyer, finance, marketing, sales, legal, ops, investor, battlecard, SEO, and print landing surfaces; payout, readiness, channel CAC, creative scoring, reply triage, battlecard snippets, outreach payout holds, room-preview conversion, weekly budget allocation, payout benchmark comparison, payout exception queue math, listing release decisions, consent-gated channel eligibility, fulfillment partner scoring, ad campaign readiness, competitor positioning, SEO page generation, publish-state evaluation, Stripe Connect simulation, metadata confidence scoring, and capture metadata are covered by tests; next step is persistence plus backend uploads, real AI metadata pipeline, reply sync, preview events, budget plans, payout proof snapshots, partner API credentials, Stripe test mode, and actual channel cohorts.
