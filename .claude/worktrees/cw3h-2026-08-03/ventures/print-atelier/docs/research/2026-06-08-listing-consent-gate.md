# Listing consent gate research note

Run: 2026-06-08 22:05 UTC

## Tooling note

`parallel-cli` is not installed in this cloud environment, so this run did not add new live-search claims. The consent gate is grounded in the existing source-backed artist terms and payout research from `docs/research/2026-06-08-listing-release-workflow.md` and `docs/research/2026-06-08-artist-payout-trust.md`.

## Signals reused

- INPRNT's artist terms separate artist copyright retention from the platform license to reproduce, display, distribute, create products, and market artwork, which supports storing channel-specific consent instead of treating "artist agreed" as one boolean [INPRNT Artist Terms](https://www.inprnt.com/info/artist_terms/).
- BetterShared's artist terms also preserve artist copyright while granting a non-exclusive worldwide license for platform operation, order fulfillment, storefront promotion, social media, and paid advertising [BetterShared Artist Terms](https://bettershared.co/pages/artist-terms-of-use).
- BetterShared defines artist payout as net profit after sales commission, production costs, shipping, and card handling fees, reinforcing that payout acknowledgement should be tied to current SKU economics before release copy uses the payout promise [BetterShared Artist Terms](https://bettershared.co/pages/artist-terms-of-use/).
- Society6 terms and community guidance pair artist ownership with platform distribution and promotional rights, which supports gating Print Atelier's paid ads and AI room-scene previews separately from basic storefront publication [Society6 Terms](https://society6.com/policies/terms-of-service), [Society6 Community Guidelines](https://help.society6.com/en-US/community-guidelines-2567793).

## Implication

Print Atelier should treat consent as a channel release contract. A listing can be economically release-ready but still blocked from paid ads or AI room previews until the artist has accepted that specific usage. This keeps the marketplace software-first and trust-forward: the admin console should expose what channels are allowed now, what consent is missing, and whether release blockers should be resolved before asking for more rights.

## Sources

- [INPRNT Artist Terms of Use & Code of Conduct](https://www.inprnt.com/info/artist_terms/)
- [BetterShared Artist Terms of Use](https://bettershared.co/pages/artist-terms-of-use)
- [Society6 Terms of Service](https://society6.com/policies/terms-of-service)
- [Society6 Community Guidelines](https://help.society6.com/en-US/community-guidelines-2567793)
