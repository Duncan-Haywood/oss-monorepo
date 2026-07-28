# Competitive Battlecards + Programmatic SEO — 2026-06-12

Research backing the GTM enablement run: interactive battlecards for sales/outreach and SEO landing page generation from shared catalog.

## Sources (reused from prior research)

- Saatchi Art commission rates: [Help Center](https://support.saatchiart.com/hc/en-us/articles/14567125883547-Commission-Rate)
- Society6 POD royalties: [POD Sellers overview](https://podsellers.com/pod-marketplaces/society6/)
- Artfinder seller payouts: [How much will I be paid?](https://sellers.artfinder.com/article/481-how-much-will-i-be-paid)
- Redbubble payment calculation and account fees: [Redbubble Help](https://help.redbubble.com/hc/en-us/articles/202270799-How-is-my-payment-calculated)

## Strategic implications

- Battlecards must combine **payout math** (tested in `compareArtistPayoutModels`) with **software moat** (capture, catalog, ads, consent gates) — nominal royalty percentages alone do not win artist conversations.
- Programmatic SEO should only publish pages for listings that pass proof, mockup, and consent readiness — blocked pages remain in the lab as a pre-launch queue, not live thin content.
- Capture upload metadata persistence (localStorage stub) is the Phase 2 bridge before Convex/Supabase + R2 job queues.
