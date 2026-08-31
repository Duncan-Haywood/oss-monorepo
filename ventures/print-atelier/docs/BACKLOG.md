# Backlog

Agent-maintained. Only work marked `ready` should be picked up. Invent new items every run.

## ready

- [ ] [platform] Persist outreach cohort attribution events with stage timestamps and source channel
- [ ] [platform] Convex order persistence — migrate in-memory `src/lib/orders.ts` records to database
- [ ] [platform] Persist Printful fulfillment submissions with HTTP status, payload snapshot, and retry queue
- [ ] [platform] Persist Printful variant mappings to Convex with operator audit log
- [ ] [platform] Wire partner credential vault to Vercel env pull and mask secrets in admin UI
- [ ] [platform] Persist proof-mockup kit send events with channel, artwork slug, and copy version
- [ ] [hygiene] Close superseded PRs #23–#26 outside automation write limits; cherry-pick any unique simulator work still valuable
- [ ] [demo] Cherry-pick embedded outreach + marketing simulators into `PlatformDemo` if not on `main`
- [ ] [platform] Persist Stripe webhook events to artist payout ledger (transfer.created, payout.paid)
- [ ] [legal] Add artist consent ledger for referral use, payout acknowledgement, and AI-generated ad rights
- [ ] [platform] Persist creative tests with predicted CAC, actual CAC, winning concept, and channel
- [ ] [platform] Persist weekly channel budget plans with actual spend, CAC, orders, and room-preview lift by source channel
- [ ] [ops] Add budget exception queue for channels held back by LTV:CAC or negative contribution guardrails
- [ ] [platform] Persist outreach prospects, replies, source channel, and next-action state as first-class CRM records
- [ ] [ai-ml] Add audited LLM reply classifier with confidence thresholds and deterministic fallback categories
- [ ] [legal] Add payout/licensing objection templates for artists asking about rights and terms
- [ ] [platform] Persist room-preview experiment events with preview opens, add-to-cart, orders, and source channel
- [ ] [ai-ml] Generate prioritized room mockup assets by style tag, margin, and missing-preview demand
- [ ] [finance] Feed actual room-preview lift into weekly channel budget allocation
- [ ] [legal] Add consent gate for artist artwork in AI-generated room scenes and paid ad previews
- [ ] [sales] Add outreach personalization field for why each artist should trust the payout math
- [ ] [finance] Add payout sensitivity price-floor optimizer by artist trust, CAC, and POD cost
- [ ] [legal] Add artist terms explainer for copyright retention, POD license, ad rights, and payout acknowledgement
- [ ] [platform] Persist payout exception decisions with current economics, suggested retail, override reason, and remediation history
- [ ] [gtm] Add payout-safe outreach segment builder that only enrolls artists whose SKU economics clear trust guardrails
- [ ] [ai-ml] Add POD cost sensitivity recommender for cheaper fulfillment options before raising retail price
- [ ] [platform] Persist listing release decisions with owner, status, override reason, and artist-facing copy snapshot
- [ ] [ops] Add release SLA aging for finance override reviews and ops holds
- [ ] [platform] Persist consent ledger events with signer, timestamp, source, copy version, and accepted channel rights
- [ ] [legal] Add channel-specific artist terms copy preview for storefront, outreach, paid ads, and AI room-scene use
- [ ] [ops] Add consent SLA aging for release-ready listings blocked by missing rights

## in_progress

_(agent assigns at run start)_

## done

- [x] [product] Print-file preflight compare: rank up to five local masters by implied DPI at a chosen size
- [x] [product] Private print-file preflight at `/print-file-preflight` with dated JSON export and anonymous usage events

- [x] [platform] Google/Pinterest CAPI HTTP fire on checkout session (parity with Meta)
- [x] [platform] Gelato order API scaffold from Stripe webhook (parity with Printful)
- [x] [ops] Fulfillment submissions dashboard on `/admin-portal` with `GET /api/fulfillment/submissions`
- [x] [platform] Gelato variant mapping UI at `/partner-setup` with slug → product UID table and EU routing coverage
- [x] [marketing] Live Meta CAPI InitiateCheckout fire on `POST /api/stripe/checkout` when pixel credentials pass
- [x] [platform] Printful variant mapping UI at `/partner-setup` with slug → variant ID table and coverage dashboard
- [x] [gtm] Checkout abandon retargeting pixel events from `POST /api/stripe/checkout` session.created
- [x] [sales] Outreach cohort attribution dashboard (reply → onboard → live) on `/sales-portal` and `/investor`
- [x] [marketing] Live Meta/Google/Pinterest catalog HTTP push via `executeAdCatalogSyncLive` when credentials present
- [x] [ops] Printful order API scaffold from Stripe `payment_intent.succeeded` webhook metadata
- [x] [content] Visual product pipeline diagram on `/docs` and `/investor` with live stage metrics
- [x] [sales] Outreach deep-link from `/sales-portal` queue to `/artist-onboard?handle=&name=&source=outreach`
- [x] [platform] Order records scaffold from `payment_intent.succeeded` webhook metadata (`src/lib/orders.ts`, 94 tests)
- [x] [marketing] Ad catalog API sync orchestrator at `POST /api/ad-catalog/sync` with simulated/live push modes
- [x] [product] Artist onboarding intake at `/artist-onboard` with profile, consent, capture link, and localStorage persistence
- [x] [content] Market launch command center on `/investor` combining supply, demand, payments, and ops gates
- [x] [platform] Stripe webhook payout ledger scaffold with in-memory `recordStripeWebhookToLedger` (86 tests)
- [x] [platform] Wire `POST /api/stripe/checkout` to `stripe.checkout.sessions.create` when test-mode keys present
- [x] [content] Investor checkout funnel metric (cart → Stripe → paid readiness) on `/investor`
- [x] [product] Checkout lab at `/checkout` with consent-gated cart, fulfillment routing, and Stripe session scaffold
- [x] [platform] `POST/GET /api/stripe/checkout` with session payload preview and env readiness checks
- [x] [platform] Shared checkout contracts with tests for eligibility, totals, routing, and session payload (75 total)
- [x] [product] Product detail preview CTA comparing flat vs in-room preview on `/storefront` and `/prints/[slug]`
- [x] [ops] Partner credential vault at `/partner-setup` for Printful, Gelato, Meta, Google, Pinterest, and Stripe env keys
- [x] [demo] Artist earnings calculator in `/artist-portal` payouts tab with 30% net-profit forecast
- [x] [platform] Shared product preview, partner credentials, and artist earnings contracts with tests (68 total)
- [x] [sales] Proof-mockup response kits in `/sales-portal` with room scenes, payout proof, and copy-paste DM/email drafts
- [x] [platform] Stripe Connect webhook scaffold at `/api/stripe/webhook` with signature verification + `.env.example`
- [x] [platform] Shared proof-mockup kit + stripe webhook contracts with tests (63 total)
- [x] [sales] Reply-to-live-listing compression metric + 7-day cohort launch planner in `/sales-portal`
- [x] [marketing] Ad catalog sync health monitor at `/ad-sync-health` with pixel, feed, and creative-quota checks
- [x] [platform] Shared outreach velocity + ad sync health contracts with tests (56 total)
- [x] [marketing] Ad catalog feed lab at `/ad-catalog` with JSON/CSV export from publishable SEO slugs + creative readiness
- [x] [platform] Shared ad-catalog contract with tests for eligibility, platform sync readiness, and feed serialization (52 total)
- [x] [platform] Generate sitemap.xml from publishable `/prints/[slug]` routes + robots.txt
- [x] [product] Visual docs hub at `/docs` embedding investor, battlecards, SEO lab, catalog AI, payout sim
- [x] [gtm] Wire battlecard objection handlers into sales-portal reply personalization
- [x] [platform] Publish eligible SEO lab pages as static `/prints/[slug]` routes with consent gate
- [x] [ai-ml] AI metadata confidence dashboard at `/catalog-intelligence`
- [x] [finance] Stripe Connect payout simulator at `/payout-simulator`
- [x] [platform] Shared SEO publish gate, stripe-connect, and catalog-intelligence contracts with tests (45 total)
- [x] [content] Competitive battlecards page at `/battlecards` vs Society6, Redbubble, Saatchi, Artfinder
- [x] [gtm] Programmatic SEO lab at `/seo-lab` generating landing pages from catalog tags + payout proof
- [x] [demo] Capture upload persists file metadata locally (Phase 2 prep)
- [x] [platform] Shared competitor battlecard + SEO + capture contracts with tests (38 total)
- [x] [content] `/investor` condensed dashboard + visual Business Overview tab on home
- [x] [platform] Partner readiness scoring for fulfillment (Printful/Gelato) and ad platforms (Meta/Google/Pinterest)
- [x] [platform] Market launch score blending supply, demand, ops, and fulfillment readiness
- [x] [hygiene] Merged orchestrator-campaign-flow-4016 to main; renewed campaign window; deleted 22 stale remote `cursor/*` branches
- [x] [legal] Listing release consent checklist for POD license, ad rights, AI room-scene use, and payout acknowledgement in `/admin-portal`
- [x] [platform] Shared listing consent gate contract with tests for cleared, missing-consent, and release-blocked states
- [x] [product] Listing hold/release workflow with override reasons and artist-facing trust copy preview in `/admin-portal`
- [x] [platform] Shared listing release decision contract with tests for release-ready, finance review, and ops hold states
- [x] [ops] Payout exception queue in `/admin-portal` for listings where POD cost, proof, or mockup gaps make the 30% promise unsafe
- [x] [platform] Shared payout exception guardrail contract with tested suggested retail price and blocker output
- [x] [sales] Outreach queue holds upload-link replies when the associated catalog SKU fails payout guardrails
- [x] [finance] Artist payout trust battlecard comparing Print Atelier against POD marketplace royalty benchmarks
- [x] [platform] Shared payout comparison contract with tested benchmark assumptions and blocker output
- [x] [sales] Outreach CRM table with reply classification and next-step queue in `/sales-portal`
- [x] [sales] Reply-to-onboarding next-best-action engine in `src/lib/outreach.ts`
- [x] [product] Buyer room-preview experiment in `/storefront` that feeds conversion lift into adjusted CAC forecasts
- [x] [finance] Channel spend allocator that shifts weekly budget toward positive contribution after CAC
- [x] [marketing] Creative diversity scorer + catalog-generated ad concepts in `/marketing-portal`
- [x] [ai-ml] AI creative scoring that estimates CAC reduction from tags, mockups, proof, and margin
- [x] [finance] CAC, payout, and POD sensitivity simulator tied to shared catalog economics
- [x] [platform] Shared catalog + tested payout/readiness math in `src/lib/marketplace.ts`
- [x] [demo] Artist portal launch-readiness queue powered by shared catalog
- [x] [demo] Storefront filters live shared-catalog listings and shows artist payout per print
- [x] [hygiene] Deleted 17 remote `cursor/*` branches with `ahead=0` and `behind>=10`
- [x] [platform] Add `.github/workflows/ci.yml` — build on PR
- [x] [platform] Orchestrator automation scaffold — this branch
