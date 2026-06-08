# Outreach Reply Triage Notes — 2026-06-08

## Why it matters

Prior CAC research says paid ecommerce acquisition can sit around the high double digits and should be judged against lifetime gross profit, not first-order revenue ([CAC + POD Benchmark Notes](2026-06-08-cac-pod-benchmarks.md)). That makes artist-led and reply-driven acquisition strategically important for Print Atelier because each onboarded artist can become both supply and a lower-CAC demand node.

Prior creative research also says wall-art demand depends on realistic room mockups and long-tail room/aesthetic intent ([Creative Diversity Demand Notes](2026-06-08-creative-diversity-demand.md)). Outreach replies should therefore be routed directly into the next asset that reduces friction: upload link, payout/licensing answer, or proof mockup.

## Product implication

The sales portal should not display static "AI outreach" theater. It needs a CRM loop that scores prospects, classifies replies, and routes each artist into the next onboarding action. This run ships the first Phase 1 version in `src/lib/outreach.ts` and `/sales-portal`: reply classification, priority scoring, projected artist-payout value, and interactive queue filters.

## Tooling note

The preferred `parallel-cli` web-search tool was unavailable in this environment (`parallel-cli: command not found`), so this note reuses the already sourced research files above instead of adding uncited live-search claims.

## Sources

- [CAC + POD Benchmark Notes](2026-06-08-cac-pod-benchmarks.md)
- [Creative Diversity Demand Notes](2026-06-08-creative-diversity-demand.md)
