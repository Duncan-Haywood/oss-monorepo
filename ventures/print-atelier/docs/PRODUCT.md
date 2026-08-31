# Product Maturity — Print Atelier

**Company phase:** 1→2 (live Stripe Checkout + webhook orders + live ad catalog HTTP + Printful fulfillment scaffold; Convex next)
**Last updated:** 2026-06-12 (Gelato order API + Google/Pinterest CAPI parity)

## Subsystem maturity

Phases: `0` narrative · `1` interactive prototype · `2` functional MVP · `3` launchable · `4` growth · `5` scale

| Subsystem | Phase | Notes | Next step |
|-----------|-------|-------|-----------|
| Business plan TSX | 1 | Visual Business Overview tab + all sections + portal routes; links to `/docs` visual hub; unit economics uses shared formula and artist payout trust battlecard | Embed live metrics previews in plan tabs |
| Visual docs hub | 1→2 | `/docs` aggregates investor, battlecards, SEO lab, catalog AI, payout sim, sitemap, and animated product pipeline diagram with live stage metrics | Persist owner bookmarks and cohort snapshots |
| Investor / owner dashboard | 1→2 | `/investor` aggregates catalog, outreach, finance, fulfillment, ad readiness, checkout funnel, market launch command center, product pipeline, and webhook payout ledger from shared libs | Persist live metrics + cohort trends |
| Artist onboarding intake | 1 | `/artist-onboard` self-serve profile, rights consent, capture session link with localStorage persistence | Convex vertical slice (capture → catalog → listing) |
| Market launch command center | 1 | `buildMarketLaunchCommandCenter` blends supply compression, ad sync health, checkout readiness, and ops gates on `/investor` | Tie gates to automated spend caps and outreach enrollment |
| Partner integrations | 2→3 | `src/lib/partners.ts` scores readiness; `src/lib/partner-credentials.ts` + `/partner-setup` vault tracks env keys; `src/lib/printful-variant-map.ts` + `PrintfulVariantMapper` maps catalog slugs to Printful variant IDs; `src/lib/gelato-variant-map.ts` + `GelatoVariantMapper` maps slugs to Gelato product UIDs; `src/lib/printful-orders.ts` + `src/lib/gelato-orders.ts` resolve mapped variants on webhook fulfillment for US and EU routing | Persist mapping audit log + fulfillment retry queue |
| Market launch scoring | 1 | `calculateMarketLaunchScore` blends supply, demand, ops, and fulfillment into one launch score | Tie score to automated spend caps |
| Capture pipeline | 1 | Real file picker + localStorage metadata persistence; simulated AI stages | Backend upload + job queue (Convex/Supabase + R2) |
| Catalog intelligence | 1 | Shared `src/lib/marketplace.ts`, launch-readiness scoring, tested payout and creative-readiness math | Persist catalog records and AI metadata confidence |
| Artist portal | 1 | Shared catalog drives portfolio, payout forecast, interactive earnings calculator, and launch queue | Artist proof approval action + CRUD path |
| Artist payout trust | 1 | Tested payout comparator powers an interactive artist-facing battlecard against POD royalty benchmarks | Persist artist-specific payout proof in outreach CRM |
| Payout promise guardrails | 1 | Tested payout exception queue holds unsafe listings, recommends retail-price fixes, and powers `/admin-portal` operator actions | Persist exception decisions, overrides, and price/POD-cost remediation history |
| Listing release workflow | 1 | Tested release-decision queue classifies listings as release-ready, finance override review, or ops hold and previews artist-facing trust copy in `/admin-portal` | Persist release/hold/override decisions with owner, reason, and artist-facing copy snapshot |
| Legal / rights | 1 | Tested listing consent gate blocks storefront, outreach, paid ads, and AI room-preview channels until POD license, ad rights, AI room-scene use, and payout acknowledgement are recorded | Persist consent ledger events with signer, timestamp, source, and copy version |
| Print-file preflight | 2 | `/print-file-preflight` checks a local JPEG/PNG for format, byte size, pixel floor, named-size DPI, aspect ratio, and web-export filenames; compare ranks up to five files by implied DPI at a chosen size and exports a dated JSON record. Artwork never leaves the browser. | Lab-specific bleed/ICC rules stay out of scope |
| Storefront / buyer | 2 | Storefront filters live shared-catalog listings, shows artist payout per print, product detail preview CTA (flat vs room), room-preview conversion lab, and `/checkout` consent-gated cart with POD routing + live Stripe Checkout redirect when keys present; print landing pages embed preview CTA; in-memory order records from `payment_intent.succeeded` webhooks | Persisted preview events + Convex order records |
| Buyer conversion analytics | 1 | Room-preview experiment translates preview engagement and conversion lift into adjusted CAC, incremental orders, and artist payout upside | Persist preview opens, add-to-cart, orders, and source channel |
| Outreach / CRM | 2 | Tested `src/lib/outreach.ts` prospect scoring, reply classification, payout-guardrail holds, next-action queue, reply-to-live compression + 7-day cohort planner, proof-mockup response kits, battlecard reply snippets, deep-links to `/artist-onboard`, and `buildOutreachCohortAttribution` with reply/onboard/live rates + platform breakdown on `/sales-portal` and `/investor` | Persist prospects/replies, pipeline stage timestamps, payout exception state, and sync real channel events |
| Marketing hub | 2→3 | Creative readiness in `/marketing-portal`, SEO lab at `/seo-lab`, ad catalog feed at `/ad-catalog`, sync health + API sync trigger at `/ad-sync-health`, `CheckoutRetargetingPanel` + `src/lib/retargeting-events.ts` + `src/lib/retargeting-events-http.ts` fires live Meta, Google, and Pinterest server-side events on checkout when credentials pass | Persist creative tests + audience sync health |
| Ad catalog feed | 1 | `buildAdCatalogFeed` generates Meta/Google/Pinterest rows from publishable SEO slugs + creative readiness + paid-ad consent | Live API push when credentials configured |
| Ad sync health | 2 | `buildAdCatalogSyncHealth` + `executeAdCatalogSync` + `executeAdCatalogSyncLive` + `POST /api/ad-catalog/sync` orchestrates simulated or live HTTP catalog push per platform | Webhook refresh on consent updates + error retry |
| Competitive positioning | 1 | `/battlecards` interactive deck vs Society6, Redbubble, Saatchi, Artfinder | Wire battlecards into sales-portal personalization |
| Programmatic SEO | 1 | `generateSeoLandingPages` + static `/prints/[slug]` with consent-gated `noindex` + `sitemap.xml` from publishable slugs | Persist published pages + search console sync |
| Payments | 2 | `simulateStripeConnectPayout` models per-order waterfall; `POST /api/stripe/checkout` creates live Checkout Sessions when test keys present; `POST /api/stripe/webhook` verifies signatures, records payout ledger + order records from `payment_intent.succeeded`; investor dashboard shows order summary; `.env.example` documents test-mode keys | Persist orders + transfer/payout ledger to Convex from webhooks |
| Catalog AI metadata | 1 | `buildCatalogMetadataDashboard` scores tags, SEO copy, mockups, proof confidence | Connect to real AI tagging pipeline on capture upload |
| Operations | 1→2 | Admin console includes payout promise guardrail queue, listing hold/release workflow, and `FulfillmentSubmissionsPanel` at `/admin-portal` with `GET /api/fulfillment/submissions` | Persist ops queues, fulfillment retry queue, and assign owners/SLA |
| Finance / unit economics | 1 | CAC payback, LTV:CAC, payout, and POD sensitivity simulator uses shared economics | Persist channel assumptions and compare actual cohorts |
| GTM budget allocation | 1 | Weekly channel allocator in `RevenueModel` shifts spend by contribution after CAC, LTV:CAC guardrails, caps, and room-preview lift | Persist weekly budget plans with actual spend, CAC, orders, and measured preview lift |
| Database | — | Not started | Choose Supabase or Convex for onboarding slice |
| CI | 1 | `ci.yml` build workflow exists; local `npm test` covers catalog, finance, creative, outreach, outreach deep-links, outreach velocity, outreach cohort attribution, proof-mockup kits, investor, partner, partner credentials, product preview CTA, artist earnings, checkout funnel, stripe checkout server, competitors, SEO sitemap, ad catalog feed, ad catalog sync, ad catalog sync HTTP, ad sync health, capture, stripe-connect, stripe webhooks, metadata confidence, artist onboarding, market launch command center, stripe ledger, orders, product pipeline, printful orders, gelato orders, printful variant map, gelato variant map, retargeting events, retargeting CAPI HTTP (Meta/Google/Pinterest), and fulfillment submissions (128 tests) | Add PR check status tracking to PROGRESS |

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
| Live Stripe Checkout | `src/lib/stripe-checkout-server.ts` + `stripe` SDK | Creates real Checkout Sessions when test-mode keys present; redirects buyer to Stripe | 2026-06-12 |
| Checkout funnel metrics | `buildCheckoutFunnelMetrics` in `src/lib/checkout.ts` | Investor-facing cart → session → paid readiness before scaling ads | 2026-06-12 |
| Artist onboarding intake | `src/lib/artist-onboarding.ts` + `/artist-onboard` | Self-serve profile, consent, capture link before Convex persistence | 2026-06-12 |
| Market launch command center | `buildMarketLaunchCommandCenter` in `src/lib/market-launch.ts` | Single owner gate for supply, demand, payments, and ops readiness | 2026-06-12 |
| Stripe payout ledger scaffold | `src/lib/stripe-ledger.ts` | In-memory webhook event ledger before Convex order persistence | 2026-06-12 |
| Outreach onboarding deep-links | `buildArtistOnboardingDeepLink` in `src/lib/outreach.ts` | Sales-portal queue links to pre-filled `/artist-onboard` intake | 2026-06-12 |
| Order records scaffold | `src/lib/orders.ts` | In-memory orders from `payment_intent.succeeded` webhook metadata | 2026-06-12 |
| Ad catalog API sync | `src/lib/ad-catalog-sync.ts` + `/api/ad-catalog/sync` | Programmatic Meta/Google/Pinterest catalog push with credential gating | 2026-06-12 |
| Live ad catalog HTTP | `src/lib/ad-catalog-sync-http.ts` | Real `fetch` to Meta/Google/Pinterest batch endpoints when credentials + sync health pass | 2026-06-12 |
| Product pipeline diagram | `src/lib/product-pipeline.ts` + `ProductPipelineDiagram` | Capture → catalog → storefront → fulfillment + growth engines on `/docs` and `/investor` | 2026-06-12 |
| Printful fulfillment scaffold | `src/lib/printful-orders.ts` + Stripe webhook wiring | POD order payload + API submit from `payment_intent.succeeded` when Printful keys present | 2026-06-12 |
| Printful variant mapping | `src/lib/printful-variant-map.ts` + `PrintfulVariantMapper` on `/partner-setup` | Catalog slug → Printful variant ID with localStorage persistence before Convex | 2026-06-12 |
| Checkout abandon retargeting | `src/lib/retargeting-events.ts` + `POST /api/stripe/checkout` + `/api/retargeting/events` | Meta/Google/Pinterest pixel payloads on session.created for abandon audiences | 2026-06-12 |
| Live Meta CAPI | `src/lib/retargeting-events-http.ts` + checkout route | Server-side InitiateCheckout to Meta Graph API when pixel + token configured | 2026-06-12 |
| Gelato variant mapping | `src/lib/gelato-variant-map.ts` + `GelatoVariantMapper` on `/partner-setup` | Catalog slug → Gelato product UID for EU/APAC margin routing | 2026-06-12 |
| Fulfillment submission ops | `src/lib/fulfillment-submissions.ts` + `/api/fulfillment/submissions` + admin panel | Printful + Gelato webhook submission history before Convex persistence | 2026-06-12 |
| Gelato order API scaffold | `src/lib/gelato-orders.ts` + Stripe webhook wiring | Gelato v4 order payload + API submit from `payment_intent.succeeded` when Gelato keys present | 2026-06-12 |
| Google/Pinterest CAPI | `src/lib/retargeting-events-http.ts` + checkout route | Server-side Google `uploadClickConversions` + Pinterest v5 events on checkout session | 2026-06-12 |

## Active vertical slice

**Focus:** Catalog intelligence + finance stress testing + creative demand engine + outreach reply triage + buyer room-preview CAC feedback + guarded channel budget allocation + artist payout trust proof + payout exception guardrails + listing release workflow + channel consent gate + investor/market-launch readiness + competitive battlecards + programmatic SEO + static print routes + Stripe Connect simulator + metadata confidence + capture metadata stub
**Definition of done:** Shared catalog and outreach data power artist, buyer, finance, marketing, sales, legal, ops, investor, battlecard, SEO, and print landing surfaces; payout, readiness, channel CAC, creative scoring, reply triage, battlecard snippets, outreach payout holds, room-preview conversion, weekly budget allocation, payout benchmark comparison, payout exception queue math, listing release decisions, consent-gated channel eligibility, fulfillment partner scoring, ad campaign readiness, competitor positioning, SEO page generation, publish-state evaluation, Stripe Connect simulation, metadata confidence scoring, and capture metadata are covered by tests; next step is persistence plus backend uploads, real AI metadata pipeline, reply sync, preview events, budget plans, payout proof snapshots, partner API credentials, Stripe test mode, and actual channel cohorts.
