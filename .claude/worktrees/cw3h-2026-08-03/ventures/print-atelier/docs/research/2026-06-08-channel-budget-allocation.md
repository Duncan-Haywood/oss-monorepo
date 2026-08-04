# Channel Budget Allocation Notes — 2026-06-08

Light research for the weekly channel budget allocator.

## Tooling note

The configured `parallel-cli` research tool is not installed in this cloud environment, so this note does not add new live-search claims. It synthesizes existing sourced research already committed in this repo.

## Findings

- Ecommerce CAC needs a guardrail against lifetime gross profit, not first-order revenue alone. The existing CAC/POD benchmark note cites broad online retail CAC ranges around the high double digits and a `3:1` CLV:CAC healthy benchmark from LoyaltyLion (`docs/research/2026-06-08-cac-pod-benchmarks.md`).
- POD cost and payment fees make first-order contribution fragile for lower-priced prints, so spend allocation should use platform gross after fulfillment, payment, and AI compute rather than GMV (`docs/research/2026-06-08-cac-pod-benchmarks.md`).
- Creative diversity and room mockups are demand quality inputs, not just marketing assets. Existing creative research cites Meta guidance on creative fatigue/similarity and wall-art mockup/SEO sources (`docs/research/2026-06-08-creative-diversity-demand.md`).
- Room preview engagement can materially change conversion assumptions, but it should remain operator-tunable until measured. Existing room-preview research cites Saatchi Art WebAR, Shopify 3D ecommerce, Rebecca Minkoff, and Interior Define examples (`docs/research/2026-06-08-room-preview-conversion.md`).

## Product implication

The allocator should recommend spend only for channels that clear positive contribution after CAC and a configurable LTV:CAC threshold. If safe channels hit caps or channels fail guardrails, the product should show held-back dollars instead of forcing budget into negative contribution.

## Sources

- `docs/research/2026-06-08-cac-pod-benchmarks.md`
- `docs/research/2026-06-08-creative-diversity-demand.md`
- `docs/research/2026-06-08-room-preview-conversion.md`
