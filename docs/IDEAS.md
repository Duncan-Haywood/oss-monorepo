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
