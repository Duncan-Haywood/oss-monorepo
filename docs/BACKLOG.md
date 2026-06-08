# Backlog

Agent-maintained. Only work marked `ready` should be picked up. Invent new items every run.

## ready

- [ ] [hygiene] Close superseded PRs #23–#26 outside automation write limits; cherry-pick any unique simulator work still valuable
- [ ] [demo] Cherry-pick embedded outreach + marketing simulators into `PlatformDemo` if not on `main`
- [ ] [content] Add `/investor` condensed dashboard route
- [ ] [demo] Wire capture upload to persist file metadata (Phase 2 prep)
- [ ] [ai-ml] Add AI metadata confidence dashboard for tags, SEO copy, and mockup coverage
- [ ] [legal] Add artist consent ledger for referral use, payout acknowledgement, and AI-generated ad rights
- [ ] [platform] Persist creative tests with predicted CAC, actual CAC, winning concept, and channel
- [ ] [gtm] Generate programmatic SEO pages from artwork tags, room intent, and artist payout proof
- [ ] [platform] Persist weekly channel budget plans with actual spend, CAC, orders, and room-preview lift by source channel
- [ ] [ops] Add budget exception queue for channels held back by LTV:CAC or negative contribution guardrails
- [ ] [platform] Persist outreach prospects, replies, source channel, and next-action state as first-class CRM records
- [ ] [ai-ml] Add audited LLM reply classifier with confidence thresholds and deterministic fallback categories
- [ ] [marketing] Generate proof-mockup response kits for artists asking to see examples
- [ ] [legal] Add payout/licensing objection templates for artists asking about rights and terms
- [ ] [gtm] Add response-to-live-listing metric and 7-day artist cohort launch planner
- [ ] [product] Add product detail preview CTA that compares flat listing vs in-room preview behavior by artwork
- [ ] [platform] Persist room-preview experiment events with preview opens, add-to-cart, orders, and source channel
- [ ] [ai-ml] Generate prioritized room mockup assets by style tag, margin, and missing-preview demand
- [ ] [finance] Feed actual room-preview lift into weekly channel budget allocation
- [ ] [legal] Add consent gate for artist artwork in AI-generated room scenes and paid ad previews
- [ ] [sales] Add outreach personalization field for why each artist should trust the payout math
- [ ] [finance] Add payout sensitivity price-floor optimizer by artist trust, CAC, and POD cost
- [ ] [ops] Add payout exception queue for listings where POD cost makes the 30% promise unsafe
- [ ] [legal] Add artist terms explainer for copyright retention, POD license, ad rights, and payout acknowledgement

## in_progress

_(agent assigns at run start)_

## done

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
