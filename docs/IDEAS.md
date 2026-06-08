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
