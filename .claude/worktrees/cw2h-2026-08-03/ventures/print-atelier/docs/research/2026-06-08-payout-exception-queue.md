# Payout Exception Queue Research Note

Run: 2026-06-08 20:09 UTC

## Tooling note

`parallel-cli` is not installed in this cloud environment, so this run did not add new live-search claims. The payout exception queue is grounded in the existing source-backed artist payout research from `docs/research/2026-06-08-artist-payout-trust.md`.

## Signals reused

- Society6's March 18, 2025 earnings update sets artist markup at 10% for wall art products, creating a concrete low-burden POD benchmark for Print Atelier's 30% net-profit promise to beat [Society6 artist earnings update](https://help.society6.com/en-US/updates-to-pricing-and-artist-earnings-effective-march-18-2025-1261599).
- Redbubble benchmark coverage describes tiered account fees that can reduce artist markup economics, making "best POD alternative" a useful comparison rather than a single static royalty rate [Redbubble profit guide](https://abetterfounder.com/redbubble-print-on-demand-complete-profit-guide-fees-margins-calculator/).
- Artist marketplace comparisons continue to show high commission variance across platforms, so Print Atelier should prove payout trust per SKU instead of relying on broad positioning claims [Foundmyself platform comparison](https://www.foundmyself.com/blog/where-to-sell-artwork-online/).
- Outreach research in the prior note supports personalization, which makes SKU-specific payout proof more useful than generic "we pay 30%" copy [Hunter state of cold email](https://hunter.io/the-state-of-cold-email) and [PitchBrand state of pitching](https://www.pitchbrand.co/statistics/state-of-pitching-2026).

## Implication

Payout transparency needs an operational guardrail. If a listing's retail price and POD cost cannot beat the best low-burden POD benchmark or meet the artist payout floor, the software should hold outreach, recommend a safer retail price, and produce artist-specific trust copy only after the economics are defensible.

## Sources

- [Society6 artist earnings update](https://help.society6.com/en-US/updates-to-pricing-and-artist-earnings-effective-march-18-2025-1261599)
- [Redbubble profit guide](https://abetterfounder.com/redbubble-print-on-demand-complete-profit-guide-fees-margins-calculator/)
- [Foundmyself platform comparison](https://www.foundmyself.com/blog/where-to-sell-artwork-online/)
- [Hunter state of cold email](https://hunter.io/the-state-of-cold-email)
- [PitchBrand state of pitching](https://www.pitchbrand.co/statistics/state-of-pitching-2026)
