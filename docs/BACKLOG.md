# Backlog

Agent-maintained. Only work marked `ready` should be picked up. Invent new items every run.

## ready

- [ ] [platform] Connect Meta/Google/Pinterest catalog APIs to `buildAdCatalogSyncHealth`-cleared feeds with webhook refresh on consent updates
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
- [ ] [product] Add product detail preview CTA that compares flat listing vs in-room preview behavior by artwork
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
