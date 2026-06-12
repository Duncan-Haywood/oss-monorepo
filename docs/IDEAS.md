# Ideas (agent-maintained)

Score each idea: **Impact** (1–5), **Effort** (1–5), **Novelty** (1–5), **Pillar-fit** (1–5).  
**Priority** = (Impact × Pillar-fit × Novelty) / Effort

## Seed ideas (2026-06-08)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Artist earnings calculator in artist-portal | demo | 4 | 2 | 4 | 5 | 40 | backlog |
| Investor `/investor` dashboard | content | 5 | 3 | 5 | 4 | 33 | ready |
| Shared mock catalog across storefront + artist portal | platform | 4 | 2 | 3 | 5 | 30 | ready |
| Supabase artist onboarding vertical slice | tech | 5 | 4 | 5 | 5 | 31 | backlog |
| Outreach sequence builder with reply tracking | demo | 5 | 3 | 4 | 5 | 33 | backlog |
| CI build gate on every PR | platform | 3 | 1 | 2 | 4 | 24 | ready |

## Ten-lens invention pass (2026-06-08 — shared catalog run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Competitor payout comparator across Print Atelier, Society6, Saatchi, Artfinder, Redbubble | Strategy | 5 | 2 | 4 | 5 | 50 | ready |
| AI catalog launch-readiness score for proof, metadata, mockups, and margin blockers | Product | 4 | 2 | 4 | 5 | 40 | shipped |
| Typed marketplace contract with unit tests for payout math and catalog health | Engineering | 4 | 2 | 3 | 5 | 30 | shipped |
| Metadata confidence dashboard for AI tags, SEO copy, and mockup coverage | AI/ML | 5 | 3 | 4 | 5 | 33 | ready |
| Programmatic artist-niche landing pages generated from catalog tags | GTM | 4 | 3 | 4 | 5 | 27 | backlog |
| Outreach CRM reply classifier with next-step queue and artist fit scoring | Sales | 5 | 3 | 4 | 5 | 33 | ready |
| Ad creative variant generator using catalog images, tags, and payout proof | Marketing | 4 | 2 | 4 | 5 | 40 | ready |
| Catalog operations SLA board for proof review, mockup gaps, and low-margin listings | Operations | 4 | 2 | 3 | 5 | 30 | backlog |
| CAC, payout, and POD sensitivity simulator tied to shared catalog economics | Finance | 5 | 2 | 4 | 5 | 50 | ready |
| Artist agreement acceptance tracker with license scope and payout acknowledgement | Legal | 4 | 3 | 3 | 4 | 16 | backlog |

## Research-backed notes (2026-06-08)

- See `docs/research/2026-06-08-competitor-payouts.md` for payout positioning against Society6, Saatchi Art, Artfinder, and Redbubble.
- Strategic implication: Print Atelier should make per-print payout math visible in artist and buyer surfaces because the 30% net-profit share is more credible when tied to transparent fulfillment, payment, and AI costs.

## Ten-lens invention pass (2026-06-08 16:30 UTC — channel economics run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Channel CAC payback simulator tied to shared catalog economics | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Buyer room preview A/B test that adjusts expected conversion lift in finance model | Product | 4 | 3 | 4 | 5 | 27 | ready |
| Scenario API contract for demand-channel assumptions and monthly operating metrics | Engineering | 4 | 2 | 3 | 5 | 30 | backlog |
| AI creative scoring that predicts CAC reduction from tags, mockups, and copy variants | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Weekly channel budget planner that caps spend when LTV:CAC drops below target | GTM | 5 | 2 | 4 | 5 | 50 | ready |
| Artist-led referral sequence that turns each onboarded artist into a buyer-acquisition node | Sales | 5 | 3 | 4 | 5 | 33 | ready |
| Programmatic ad brief generator for each catalog segment using payout proof and room mockups | Marketing | 4 | 2 | 4 | 5 | 40 | ready |
| Ops exception queue for channels with negative contribution after CAC | Operations | 4 | 2 | 3 | 5 | 30 | backlog |
| CAC, payout, and POD sensitivity simulator tied to shared catalog economics | Finance | 5 | 2 | 4 | 5 | 50 | shipped |
| Artist consent ledger for referral use, payout acknowledgement, and AI-generated ad rights | Legal | 5 | 3 | 4 | 4 | 27 | ready |

## Research-backed notes (2026-06-08 16:30 UTC)

- See `docs/research/2026-06-08-cac-pod-benchmarks.md` for CAC, POD, and competitor-payout assumptions.
- Strategic implication: Finance tooling should model contribution after acquisition, not just per-print margin, because high paid CAC can make an otherwise healthy print SKU unprofitable until repeat purchase behavior catches up.

## Ten-lens invention pass (2026-06-08 17:10 UTC — creative demand engine run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Creative diversity scorer that gates paid spend by proof, mockups, SEO tags, margin, and similarity risk | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Buyer room-preview experiment that feeds conversion lift back into CAC forecasts | Product | 5 | 3 | 4 | 5 | 33 | ready |
| Persist creative tests as first-class records with predicted CAC, actual CAC, and winning concept | Engineering | 5 | 4 | 4 | 5 | 25 | ready |
| AI mockup coverage dashboard that identifies which listings need more room scenes before spend | AI/ML | 4 | 2 | 4 | 5 | 40 | ready |
| Programmatic SEO pages generated from artwork tags, room intent, and artist payout proof | GTM | 5 | 3 | 4 | 5 | 33 | ready |
| Artist referral kit that converts each approved listing into creator-led posts and collector emails | Sales | 4 | 2 | 4 | 5 | 40 | ready |
| Creative concept pipeline with weekly quota for new visual angles, hooks, and formats | Marketing | 5 | 2 | 4 | 5 | 50 | shipped |
| Ops queue for creative blockers: missing proof, room mockups, SEO tags, or weak margin | Operations | 4 | 2 | 3 | 5 | 30 | backlog |
| Channel spend allocator that shifts budget toward concepts with positive contribution after CAC | Finance | 5 | 3 | 4 | 5 | 33 | ready |
| Consent check that prevents paid ads until artist marketing-rights acceptance is recorded | Legal | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-08 17:10 UTC)

- See `docs/research/2026-06-08-creative-diversity-demand.md` for creative-diversity, room mockup, and long-tail SEO sources.
- Strategic implication: demand tooling should decide whether a catalog item is safe to spend against before generating more ads, because similar or under-proofed creative can inflate CAC even when per-print margins look healthy.

## Ten-lens invention pass (2026-06-08 17:38 UTC — outreach reply triage run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Response-to-live-listing compression metric that tracks how fast a replied artist can become a sellable catalog item | Strategy | 5 | 3 | 4 | 5 | 33 | ready |
| Reply-to-onboarding next-best-action queue for upload, payout/legal, proof mockup, nurture, and referral-kit work | Product | 5 | 2 | 4 | 5 | 50 | shipped |
| Persist outreach prospects, replies, source channel, and next-action state as first-class CRM records | Engineering | 5 | 4 | 4 | 5 | 25 | ready |
| Audited LLM reply classifier with deterministic fallback categories and confidence thresholds | AI/ML | 5 | 3 | 4 | 5 | 33 | ready |
| Artist cohort launch planner that converts hot replies into a 7-day zero-CAC supply campaign | GTM | 5 | 3 | 4 | 5 | 33 | ready |
| Reply SLA workbench that prioritizes high-fit artists before passive opens and drafts | Sales | 5 | 2 | 4 | 5 | 50 | shipped |
| Proof-mockup response kit that turns "send examples" replies into room scenes and payout proof | Marketing | 4 | 2 | 4 | 5 | 40 | ready |
| Stale-reply rescue queue for opened/sent prospects that need better personalization | Operations | 4 | 2 | 3 | 5 | 30 | backlog |
| Outreach cohort payout forecast that sums expected artist earnings before onboarding spend | Finance | 4 | 2 | 3 | 5 | 30 | shipped |
| Payout/licensing objection explainer templates for artists asking about rights and terms | Legal | 4 | 2 | 3 | 5 | 30 | ready |

## Research-backed notes (2026-06-08 17:38 UTC)

- See `docs/research/2026-06-08-outreach-reply-triage.md` for the outreach reply-triage rationale and the tooling limitation on live web research.
- Strategic implication: artist acquisition should be measured by reply-to-live-listing speed, not raw message volume, because the marketplace only compounds when replies become capture uploads, proofed listings, artist referral kits, and buyer demand.

## Ten-lens invention pass (2026-06-08 18:00 UTC — room preview conversion run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Buyer room-preview experiment that converts visualization lift into adjusted CAC and artist payout upside | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Product detail preview CTA that compares flat listing vs in-room preview behavior by artwork | Product | 5 | 3 | 4 | 5 | 33 | ready |
| Persist room-preview experiment events with preview opens, add-to-cart, orders, and source channel | Engineering | 5 | 4 | 4 | 5 | 25 | ready |
| AI mockup asset generator that prioritizes room scenes by style tag, margin, and missing-preview demand | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Retargeting audience builder for buyers who opened preview but did not add to cart | GTM | 4 | 3 | 4 | 5 | 27 | backlog |
| Designer-trade preview share link for decorators to send client-ready room scenes | Sales | 4 | 2 | 4 | 5 | 40 | ready |
| Programmatic landing blocks showing room scenes by decor intent, artwork tag, and payout proof | Marketing | 5 | 3 | 4 | 5 | 33 | ready |
| Ops queue for listings where paid demand is blocked by missing proofed room mockups | Operations | 4 | 2 | 3 | 5 | 30 | backlog |
| Room-preview CAC feedback loop that feeds actual lift into weekly channel budget allocation | Finance | 5 | 3 | 4 | 5 | 33 | ready |
| Consent gate for using artist artwork in AI-generated room scenes and paid ad previews | Legal | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-08 18:00 UTC)

- See `docs/research/2026-06-08-room-preview-conversion.md` for Saatchi Art WebAR, Shopify 3D ecommerce, Rebecca Minkoff, and Interior Define references.
- Strategic implication: room visualization should be measured as a conversion-quality and CAC lever, not a decorative buyer feature; listings without approved proofs or room mockups should be blocked from paid-preview lift assumptions.

## Ten-lens invention pass (2026-06-08 18:52 UTC — channel budget allocator run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Weekly channel budget allocator that caps spend by contribution after CAC, LTV:CAC, and room-preview lift | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Operator budget holdback panel that shows why unsafe dollars remain unspent instead of forcing full allocation | Product | 4 | 2 | 4 | 5 | 40 | shipped |
| Persist weekly budget plans with actual spend, CAC, orders, and source channel cohorts | Engineering | 5 | 4 | 4 | 5 | 25 | ready |
| AI-assisted bid recommendation that proposes channel caps from creative readiness, preview lift, and cohort quality | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| 7-day launch budget calendar that shifts spend from artist loops into paid demand only after proofed listings clear guardrails | GTM | 5 | 3 | 4 | 5 | 33 | ready |
| Designer-trade spend lane that prioritizes high-repeat buyer channels before cold paid-social tests | Sales | 4 | 2 | 4 | 5 | 40 | ready |
| Channel-specific creative quota that ties budget eligibility to enough distinct room mockups and hooks | Marketing | 4 | 2 | 4 | 5 | 40 | ready |
| Budget exception queue for channels held back by low LTV:CAC or negative contribution after CAC | Operations | 5 | 2 | 3 | 5 | 38 | ready |
| Actual-lift feedback loop that replaces assumed room-preview lift with measured channel cohorts | Finance | 5 | 3 | 4 | 5 | 33 | ready |
| Spend approval audit log for artist consent, ad rights, and payout-impact disclosure before paid scaling | Legal | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-08 18:52 UTC)

- `parallel-cli` was unavailable in this cloud environment, so no new live-search claims were added.
- See `docs/research/2026-06-08-channel-budget-allocation.md`, which synthesizes existing sourced CAC, POD, creative-diversity, and room-preview research into the channel-budget allocation decision.
- Strategic implication: Print Atelier should make "do not spend" a first-class product outcome, because software-first growth should protect artist payouts and marketplace margin before scaling paid channels.

## Ten-lens invention pass (2026-06-08 19:30 UTC — artist payout trust run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Artist payout trust battlecard that compares Print Atelier against POD marketplace royalty benchmarks before outreach | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Payout objection simulator that drafts artist-specific answers when the 30% net-profit promise is weaker than a benchmark | Product | 5 | 3 | 4 | 5 | 33 | ready |
| Shared payout comparison contract with tested benchmark assumptions and blocker output | Engineering | 4 | 2 | 3 | 5 | 30 | shipped |
| AI-assisted payout proof copy generator that only uses approved economics and source-backed benchmark language | AI/ML | 4 | 3 | 4 | 5 | 27 | ready |
| High-intent artist landing pages by payout wedge: low-burden POD, transparent net profit, or original-sale alternatives | GTM | 4 | 3 | 4 | 5 | 27 | backlog |
| Outreach personalization field for "why this artist should trust our payout math" | Sales | 5 | 2 | 4 | 5 | 50 | ready |
| Competitor battlecard ad concepts aimed at artists frustrated by fixed royalties or tiered account fees | Marketing | 4 | 2 | 4 | 5 | 40 | ready |
| Ops review queue for listings where POD cost makes the payout promise unsafe to lead with | Operations | 5 | 2 | 3 | 5 | 38 | ready |
| Payout sensitivity model that optimizes price floors by artist trust, CAC, and POD cost | Finance | 5 | 2 | 4 | 5 | 50 | ready |
| Artist terms explainer that separates copyright retention, POD license, ad rights, and payout acknowledgement | Legal | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-08 19:30 UTC)

- See `docs/research/2026-06-08-artist-payout-trust.md` for Society6, Redbubble, Artfinder, Hunter, and PitchBrand sources used to ground payout benchmarks and supply-side outreach positioning.
- Strategic implication: Print Atelier should only lead with the 30% net-profit promise when the software can prove it beats realistic POD alternatives for that SKU; otherwise ops should fix price or POD cost before outreach.

## Ten-lens invention pass (2026-06-08 20:09 UTC — payout exception guardrail run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Payout promise guardrail queue that holds unsafe listings before outreach and recommends price/POD fixes | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Listing hold/release workflow with override reasons, owner, and artist-facing trust copy preview | Product | 5 | 3 | 4 | 5 | 33 | ready |
| Persist payout exception decisions with current economics, suggested retail, override reason, and remediation history | Engineering | 5 | 4 | 4 | 5 | 25 | ready |
| AI-assisted POD cost sensitivity recommender that proposes cheaper fulfillment options before raising retail price | AI/ML | 4 | 3 | 5 | 5 | 33 | ready |
| Payout-safe outreach segment builder that only enrolls artists whose SKU economics clear trust guardrails | GTM | 5 | 3 | 4 | 5 | 33 | ready |
| Artist-specific payout trust line injected into outbound copy only after guardrail pass | Sales | 5 | 2 | 4 | 5 | 50 | ready |
| Payout-proof creative eligibility badge for artist recruitment ads and landing pages | Marketing | 4 | 2 | 4 | 5 | 40 | backlog |
| Payout exception SLA board for proof approval, room mockups, retail price, and POD cost remediation | Operations | 5 | 2 | 3 | 5 | 38 | shipped |
| Price-floor optimizer that balances artist trust, CAC, POD cost, and conversion risk | Finance | 5 | 2 | 4 | 5 | 50 | ready |
| Terms acknowledgement gate tying copyright retention, POD license, ad rights, and payout proof disclosure to listing release | Legal | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-08 20:09 UTC)

- `parallel-cli` was unavailable in this cloud environment, so no new live-search claims were added.
- See `docs/research/2026-06-08-payout-exception-queue.md`, which reuses the existing source-backed artist payout benchmark research for the payout exception guardrail.
- Strategic implication: payout trust must become a hold/release workflow, not a static calculator, because artist acquisition copy should only lead with the 30% net-profit promise when SKU economics, proof approval, and room mockups are defensible.

## Ten-lens invention pass (2026-06-08 21:20 UTC — listing release workflow run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Listing release decision desk that converts payout guardrails into release-ready, finance-review, and ops-hold states | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Artist-facing trust copy preview that is hidden until SKU economics, proof, and mockups clear release criteria | Product | 5 | 2 | 4 | 5 | 50 | shipped |
| Persist listing release decisions with owner, status, override reason, and artist-facing copy snapshot | Engineering | 5 | 4 | 4 | 5 | 25 | ready |
| AI-assisted release reviewer that proposes cheaper POD, retail price, or mockup remediation before an operator overrides | AI/ML | 4 | 3 | 5 | 5 | 33 | ready |
| Release-gated artist cohort launcher that only enrolls approved listings into outbound sequences | GTM | 5 | 3 | 4 | 5 | 33 | ready |
| Finance-approved override sequence for strategic artists whose payout advantage is thin but cohort value is high | Sales | 4 | 2 | 4 | 5 | 40 | backlog |
| Artist recruitment landing blocks that show real payout proof only for release-ready examples | Marketing | 4 | 2 | 4 | 5 | 40 | backlog |
| Release SLA aging board for finance override reviews and ops holds | Operations | 5 | 2 | 3 | 5 | 38 | ready |
| Price-floor optimizer that balances artist trust, CAC, POD cost, and conversion risk before release | Finance | 5 | 2 | 4 | 5 | 50 | ready |
| Listing release consent checklist for POD license, ad rights, AI room-scene use, and payout acknowledgement | Legal | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-08 21:20 UTC)

- See `docs/research/2026-06-08-listing-release-workflow.md` for artist marketplace terms, copyright-retention, license-grant, and payout-transparency sources from INPRNT, BetterShared, and Society6.
- Strategic implication: Print Atelier should treat payout proof and rights language as a release artifact, not generic copy, because artist-facing promises need current SKU economics and clear license/payout context before outreach.

## Ten-lens invention pass (2026-06-08 22:05 UTC — listing consent gate run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Channel consent gate that separates storefront, outreach, paid-ad, and AI room-scene rights before release | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Operator consent desk that shows allowed channels, missing rights, and release blockers per listing | Product | 5 | 2 | 4 | 5 | 50 | shipped |
| Persist consent ledger events with signer, source, copy version, and accepted channel rights | Engineering | 5 | 4 | 4 | 5 | 25 | ready |
| AI-assisted rights-risk reviewer that flags ad copy or room scenes whose usage exceeds accepted consent | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Release-gated cohort launcher that enrolls only listings with both payout proof and required channel rights | GTM | 5 | 3 | 4 | 5 | 33 | ready |
| Rights-aware outreach personalization that explains why a specific artist is safe to launch now | Sales | 4 | 2 | 4 | 5 | 40 | backlog |
| Paid creative eligibility badge that only appears for listings with accepted ad and AI room-scene rights | Marketing | 4 | 2 | 4 | 5 | 40 | backlog |
| Consent SLA aging queue for release-ready listings blocked only by missing rights | Operations | 5 | 2 | 3 | 5 | 38 | ready |
| Consent-to-revenue leakage report that estimates demand dollars blocked by missing channel rights | Finance | 4 | 2 | 4 | 5 | 40 | backlog |
| Channel-specific artist terms preview for POD license, ad rights, AI room scenes, and payout acknowledgement | Legal | 5 | 2 | 4 | 5 | 50 | ready |

## Research-backed notes (2026-06-08 22:05 UTC)

- `parallel-cli` was unavailable in this cloud environment, so no new live-search claims were added.
- See `docs/research/2026-06-08-listing-consent-gate.md`, which reuses the existing source-backed artist terms and payout research from INPRNT, BetterShared, and Society6.
- Strategic implication: consent should be a channel-specific release contract, not one generic checkbox, because a listing can be safe for storefront publication while still blocked from paid ads or AI room-scene previews.

## Ten-lens invention pass (2026-06-11 UTC — investor + market launch run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Investor dashboard aggregating catalog, outreach, finance, and partner readiness | Strategy | 5 | 2 | 5 | 5 | 63 | shipped |
| Visual Business Overview tab with product-map cards and launch score | Product | 5 | 2 | 4 | 5 | 50 | shipped |
| `buildInvestorSnapshot` contract with tests for pipeline stages | Engineering | 4 | 2 | 3 | 5 | 30 | shipped |
| AI metadata confidence dashboard for tags, SEO copy, and mockup coverage | AI/ML | 5 | 3 | 4 | 5 | 33 | ready |
| Programmatic SEO pages from artwork tags + payout proof | GTM | 5 | 3 | 4 | 5 | 33 | ready |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | ready |
| Ad catalog sync health monitor (pixel + feed + creative quota) | Marketing | 5 | 2 | 4 | 5 | 50 | backlog |
| Competitive battlecards (Saatchi, Artfinder, Society6, Redbubble) | Strategy | 4 | 2 | 3 | 5 | 30 | shipped |
| Programmatic SEO pages from artwork tags + payout proof | GTM | 5 | 3 | 4 | 5 | 33 | shipped |
| Wire capture upload to persist file metadata (Phase 2 prep) | Product | 5 | 4 | 5 | 5 | 31 | shipped |
| Stripe Connect payout simulator for artist onboarding | Finance | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-11 UTC)

- See `docs/research/2026-06-11-market-launch-readiness.md` for fulfillment API and programmatic ad catalog requirements.
- Strategic implication: market launch should be a single scored decision (supply + demand + ops + fulfillment) before scaling outreach or ad spend.

## Ten-lens invention pass (2026-06-12 UTC — battlecards + SEO + capture run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Competitive battlecards with payout + software moat for sales enablement | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Programmatic SEO lab with publish blockers tied to proof/consent readiness | GTM | 5 | 3 | 4 | 5 | 33 | shipped |
| Capture upload metadata stub with localStorage before R2/Convex job queue | Product | 5 | 3 | 5 | 5 | 42 | shipped |
| Static `/prints/[slug]` route generator from SEO lab output | Engineering | 5 | 3 | 4 | 5 | 33 | ready |
| AI metadata confidence dashboard for tags, SEO copy, and mockup coverage | AI/ML | 5 | 3 | 4 | 5 | 33 | ready |
| Battlecard objection snippets injected into outreach CRM reply drafts | Sales | 5 | 2 | 4 | 5 | 50 | ready |
| Ad catalog sync health monitor (pixel + feed + creative quota) | Marketing | 5 | 2 | 4 | 5 | 50 | backlog |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | ready |
| Stripe Connect payout simulator for artist onboarding | Finance | 5 | 3 | 4 | 5 | 33 | ready |
| Visual docs hub embedding investor, battlecards, and SEO lab in business plan | Legal | 4 | 2 | 3 | 4 | 24 | backlog |

## Research-backed notes (2026-06-12 UTC)

- See `docs/research/2026-06-12-competitive-battlecards-seo.md` for battlecard sources and SEO publish-gate rationale.
- Strategic implication: GTM tooling should block publish/spend until listings clear the same consent and proof gates used in admin and investor dashboards — digital stock building is a software workflow, not a content dump.

## Ten-lens invention pass (2026-06-12 01:00 UTC — print routes + payout + metadata run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Static `/prints/[slug]` routes with consent-gated noindex for blocked listings | GTM | 5 | 2 | 4 | 5 | 50 | shipped |
| Stripe Connect payout simulator with per-order waterfall and transfer delay | Finance | 5 | 2 | 4 | 5 | 50 | shipped |
| AI metadata confidence dashboard for tags, SEO copy, mockups, and proof | AI/ML | 5 | 2 | 4 | 5 | 50 | shipped |
| Battlecard reply snippets injected into sales-portal payout/proof replies | Sales | 5 | 2 | 4 | 5 | 50 | shipped |
| Sitemap.xml auto-generated from publishable SEO slugs | Engineering | 4 | 2 | 3 | 5 | 30 | ready |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | ready |
| Ad catalog sync health monitor (pixel + feed + creative quota) | Marketing | 5 | 2 | 4 | 5 | 50 | backlog |
| Visual docs hub embedding investor, battlecards, SEO lab, and catalog AI | Product | 4 | 2 | 3 | 5 | 30 | backlog |
| Convex artist onboarding vertical slice (capture → catalog → listing) | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Artist consent ledger persistence with signer, timestamp, and copy version | Legal | 5 | 3 | 4 | 4 | 27 | ready |

## Research-backed notes (2026-06-12 01:00 UTC)

- See `docs/research/2026-06-12-print-routes-payout-metadata.md` for Stripe Connect timing and publish-gate rationale.
- Strategic implication: programmatic SEO is only market-ready when metadata confidence, consent, and payout math align — static routes should index only when all three gates pass.

## Ten-lens invention pass (2026-06-12 02:00 UTC — sitemap + visual docs hub run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Consent-gated sitemap.xml synced to publishable `/prints/[slug]` slugs only | GTM | 5 | 2 | 4 | 5 | 50 | shipped |
| Visual docs hub at `/docs` with live metrics from investor, SEO, and catalog AI | Product | 5 | 2 | 4 | 5 | 50 | shipped |
| `buildSitemapXml` contract with tests for static routes + publishable prints | Engineering | 4 | 1 | 3 | 5 | 60 | shipped |
| Ad catalog feed generator from publishable SEO slugs + creative readiness | Marketing | 5 | 3 | 4 | 5 | 33 | ready |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | ready |
| Stripe Connect test-mode keys + `transfer.created` webhook handlers | Finance | 5 | 3 | 4 | 5 | 33 | ready |
| Convex artist onboarding vertical slice (capture → catalog → listing) | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Ad catalog sync health monitor (pixel + feed + creative quota) | Marketing | 5 | 2 | 4 | 5 | 50 | backlog |
| Search Console sitemap ping on consent ledger updates | GTM | 4 | 2 | 3 | 5 | 30 | ready |
| Artist consent ledger persistence with signer, timestamp, and copy version | Legal | 5 | 3 | 4 | 4 | 27 | ready |
| AI-assisted bid recommendation from creative readiness + preview lift | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Competitive positioning one-pager export (PDF) from battlecards for investor decks | Strategy | 4 | 2 | 3 | 4 | 24 | backlog |

## Research-backed notes (2026-06-12 02:00 UTC)

- See `docs/research/2026-06-12-sitemap-visual-docs-hub.md` for sitemap/robots conventions and docs-hub rationale.
- Strategic implication: digital stock launch requires a single owner entry point (`/docs`) and an index that only lists consent-cleared inventory — blocked listings stay `noindex` and out of the sitemap.

## Ten-lens invention pass (2026-06-12 03:00 UTC — ad catalog feed run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Ad catalog feed from publishable SEO slugs + creative readiness gates | Marketing | 5 | 2 | 4 | 5 | 50 | shipped |
| Response-to-live-listing compression metric for outreach cohort velocity | Strategy | 5 | 2 | 4 | 5 | 50 | ready |
| Convex artist onboarding vertical slice (capture → catalog → listing) | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Stripe Connect test-mode keys + `transfer.created` webhook handlers | Finance | 5 | 3 | 4 | 5 | 33 | ready |
| Ad catalog sync health monitor (pixel + feed + creative quota) | Marketing | 5 | 2 | 4 | 5 | 50 | ready |
| Search Console sitemap ping on consent ledger updates | GTM | 4 | 2 | 3 | 5 | 30 | ready |
| AI-assisted bid recommendation from creative readiness + preview lift | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | ready |
| Artist consent ledger persistence with signer, timestamp, and copy version | Legal | 5 | 3 | 4 | 4 | 27 | ready |
| Proof-mockup response kit for artists asking to see examples | Sales | 4 | 2 | 4 | 5 | 40 | ready |
| Product detail preview CTA comparing flat listing vs in-room preview | Product | 5 | 3 | 4 | 5 | 33 | ready |

## Research-backed notes (2026-06-12 03:00 UTC)

- See `docs/research/2026-06-12-ad-catalog-feed.md` for ad catalog gate stack and platform minimums.
- Strategic implication: paid demand requires a second index (ad catalog feed) generated from the same consent-cleared slug list as the sitemap — sync only when creative quotas are met per platform.

## Ten-lens invention pass (2026-06-12 04:00 UTC — reply velocity + ad sync health run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Reply-to-live-listing compression metric with 7-day cohort launch planner | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Ad catalog sync health monitor (pixel + feed + creative quota) | Marketing | 5 | 2 | 4 | 5 | 50 | shipped |
| Stripe Connect test-mode keys + `transfer.created` webhook handlers | Finance | 5 | 3 | 4 | 5 | 33 | ready |
| Convex artist onboarding vertical slice (capture → catalog → listing) | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Proof-mockup response kit for artists asking to see examples | Sales | 4 | 2 | 4 | 5 | 40 | ready |
| Product detail preview CTA comparing flat listing vs in-room preview | Product | 5 | 3 | 4 | 5 | 33 | ready |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | ready |
| Search Console sitemap ping on consent ledger updates | GTM | 4 | 2 | 3 | 5 | 30 | ready |
| AI-assisted bid recommendation from creative readiness + preview lift | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Artist consent ledger persistence with signer, timestamp, and copy version | Legal | 5 | 3 | 4 | 4 | 27 | ready |
| Competitive positioning one-pager export (PDF) from battlecards | Strategy | 4 | 2 | 3 | 4 | 24 | backlog |
| Buyer retargeting audience for preview-opens without add-to-cart | GTM | 4 | 3 | 4 | 5 | 27 | backlog |

## Research-backed notes (2026-06-12 04:00 UTC)

- See `docs/research/2026-06-12-reply-velocity-ad-sync.md` for supply velocity and demand sync health rationale.
- Strategic implication: digital stock launch requires measuring supply compression (reply→live) and demand sync readiness (pixel+feed+quota) as paired gates before scaling outreach or ad spend.

## Ten-lens invention pass (2026-06-12 05:00 UTC — proof-mockup kits + Stripe webhook run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Proof-mockup response kit with room scenes + payout proof for mockup-classified replies | Sales | 5 | 2 | 4 | 5 | 50 | shipped |
| Stripe Connect webhook scaffold with signature verification and event routing | Engineering | 5 | 2 | 4 | 5 | 50 | shipped |
| Convex artist onboarding vertical slice (capture → catalog → listing) | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | ready |
| Product detail preview CTA comparing flat listing vs in-room preview | Product | 5 | 3 | 4 | 5 | 33 | ready |
| Persist proof-mockup kit send events with channel and copy version | Engineering | 4 | 3 | 3 | 5 | 20 | ready |
| Artist consent ledger persistence with signer, timestamp, and copy version | Legal | 5 | 3 | 4 | 4 | 27 | ready |
| Connect Meta/Google/Pinterest catalog APIs to sync-health-cleared feeds | Marketing | 5 | 4 | 4 | 5 | 25 | ready |
| AI-assisted bid recommendation from creative readiness + preview lift | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Search Console sitemap ping on consent ledger updates | GTM | 4 | 2 | 3 | 5 | 30 | ready |
| Buyer retargeting audience for preview-opens without add-to-cart | GTM | 4 | 3 | 4 | 5 | 27 | backlog |
| Competitive positioning one-pager export (PDF) from battlecards | Strategy | 4 | 2 | 3 | 4 | 24 | backlog |

## Research-backed notes (2026-06-12 05:00 UTC)

- See `docs/research/2026-06-12-proof-mockup-stripe-webhook.md` for mockup kit rationale and Stripe webhook requirements.
- Strategic implication: artist acquisition closes when "send examples" gets economics-backed room scenes in minutes; payments close when webhooks bridge buyer checkout to Connect transfers.

## Ten-lens invention pass (2026-06-12 06:00 UTC — market-ready buyer + partner ops run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Product detail preview CTA comparing flat vs in-room preview by artwork | Product | 5 | 3 | 4 | 5 | 33 | shipped |
| Fulfillment partner API credential vault with margin routing rules | Operations | 5 | 3 | 4 | 5 | 33 | shipped |
| Artist earnings calculator with monthly/annual 30% net-profit forecast | Finance | 5 | 2 | 4 | 5 | 50 | shipped |
| Convex artist onboarding vertical slice (capture → catalog → listing) | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Connect Meta/Google/Pinterest catalog APIs to sync-health-cleared feeds | Marketing | 5 | 4 | 4 | 5 | 25 | ready |
| Buyer retargeting audience for preview-opens without add-to-cart | GTM | 4 | 3 | 4 | 5 | 27 | backlog |
| AI-assisted bid recommendation from creative readiness + preview lift | AI/ML | 5 | 3 | 5 | 5 | 42 | ready |
| Artist consent ledger persistence with signer, timestamp, and copy version | Legal | 5 | 3 | 4 | 4 | 27 | ready |
| Checkout slice with Stripe test mode + room-preview attribution | Product | 5 | 4 | 4 | 5 | 25 | ready |
| Search Console sitemap ping on consent ledger updates | GTM | 4 | 2 | 3 | 5 | 30 | ready |

## Research-backed notes (2026-06-12 06:00 UTC)

- See `docs/research/2026-06-12-product-preview-partner-vault.md` for preview CTA and partner credential rationale.
- Strategic implication: market launch requires buyer conversion tooling (preview CTA), artist trust tooling (earnings calculator), and ops credential visibility (partner vault) as parallel gates before scaling ads or outreach.

## Ten-lens invention pass (2026-06-12 07:00 UTC — buyer checkout slice run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Checkout lab with consent-gated cart and Stripe session scaffold | Product | 5 | 3 | 4 | 5 | 33 | shipped |
| POD fulfillment routing by region (Printful vs Gelato margin) | Operations | 5 | 2 | 4 | 5 | 50 | shipped |
| Stripe Checkout session API wired to test-mode keys | Engineering | 5 | 3 | 4 | 5 | 33 | ready |
| Convex order persistence from payment_intent.succeeded webhook | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Connect Meta/Google/Pinterest catalog APIs to sync-health-cleared feeds | Marketing | 5 | 4 | 4 | 5 | 25 | ready |
| Buyer retargeting pixel events from checkout abandon | GTM | 4 | 3 | 4 | 5 | 27 | ready |
| Room-preview attribution on checkout line items | AI/ML | 4 | 3 | 4 | 5 | 27 | ready |
| Artist onboarding intake form with localStorage → Convex migration path | Sales | 5 | 3 | 4 | 5 | 33 | ready |
| Multi-currency tax estimator for EU/UK/APAC launch | Finance | 4 | 3 | 3 | 4 | 16 | backlog |
| Checkout terms + refund policy explainer linked to artist POD license | Legal | 4 | 2 | 3 | 4 | 24 | ready |
| Investor dashboard live checkout funnel metric (cart → session → paid) | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |

## Research-backed notes (2026-06-12 07:00 UTC)

- See `docs/research/2026-06-12-checkout-stripe-slice.md` for Stripe Checkout + Connect transfer requirements.
- Strategic implication: "ready to sell" means consent-gated cart eligibility, visible Stripe/POD blockers, and fulfillment routing — not just a pretty storefront.

## Ten-lens invention pass (2026-06-12 08:00 UTC — live Stripe checkout run)

| Idea | Lens | I | E | N | P | Score | Status |
|------|------|---|---|---|---|-------|--------|
| Live Stripe Checkout Sessions via `stripe.checkout.sessions.create` | Engineering | 5 | 3 | 4 | 5 | 33 | shipped |
| Investor checkout funnel metric (cart → Stripe → paid readiness) | Strategy | 5 | 2 | 4 | 5 | 50 | shipped |
| Convex order persistence from `payment_intent.succeeded` webhook | Engineering | 5 | 4 | 5 | 5 | 31 | backlog |
| Connect Meta/Google/Pinterest catalog APIs to sync-health-cleared feeds | Marketing | 5 | 4 | 4 | 5 | 25 | ready |
| Artist onboarding intake form with localStorage → Convex migration path | Sales | 5 | 3 | 4 | 5 | 33 | ready |
| Checkout abandon retargeting pixel events from session.created | GTM | 4 | 3 | 4 | 5 | 27 | ready |
| Room-preview attribution on checkout line items | AI/ML | 4 | 3 | 4 | 5 | 27 | ready |
| Multi-item shipping line item in Stripe session (tax + shipping) | Finance | 4 | 2 | 3 | 4 | 24 | ready |
| Checkout terms + refund policy explainer linked to artist POD license | Legal | 4 | 2 | 3 | 4 | 24 | ready |
| Market launch command center combining funnel + ad sync + outreach velocity | Product | 5 | 3 | 4 | 5 | 33 | ready |
| Printful order API trigger from webhook fulfillment metadata | Operations | 5 | 4 | 4 | 5 | 25 | ready |

## Research-backed notes (2026-06-12 08:00 UTC)

- See `docs/research/2026-06-12-live-stripe-checkout-funnel.md` for live session wiring and investor funnel rationale.
- Strategic implication: payments Phase 2 closes when buyers can complete Stripe Checkout in test mode; Phase 3 closes when webhooks persist orders and trigger POD + Connect transfers.
