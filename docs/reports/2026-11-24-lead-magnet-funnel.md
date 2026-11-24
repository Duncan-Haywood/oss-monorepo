---
kind: analysis
date: 2026-11-24
subjects: [wall-framing-takeoff, ai-bookkeeper, sales-export-to-journal, shift-roster-builder]
topics: [money, usage-tracking, distribution]
---
# Lead-magnet → product funnel (2026-11-24)

**What:** `portfolio/monetization/funnel.json` maps 85 free tools to 14 of the
20 proprietary products (`LICENSING_TRANSITION.md`). `platform/pages/product-offer.mjs`
renders one footer line per feeder ("Doing this as part of a bigger job?
<Product> <pitch>.") through `injectChrome` in `build.mjs`. Clicks count locally as
`product_offer_click:<slug>` (the `data-pf-offer` attribute), separate from
`cross_tool_click`.

**Why hand-curated:** scoring each free tool against each product with
`relatedToolScores` (the footer's word-overlap index) put 156 tools above the
lowest non-zero score (about 4), and many of those pairs were wrong:
docker-build-secrets-check → shift-roster-builder (4.97, "build"),
freelancer-schedule-c-categorizer → league-schedule-generator ("schedule"),
land-survey-bid-calculator → quick-pick-survey, roth-conversion-bracket-fill →
league ("bracket"). Don't switch to automatic matching without a semantic check.

**Rules for edits** (enforced by `platform/pages/product-offer.test.mjs`):
every product is on the proprietary track, every feeder is a venture and not a
product, one product per feeder, a pitch of 140 characters or fewer with no
price, paid tier or superlative. A product that the build doesn't publish
(local-site-studio, ig-media-pipeline, retail-pilot-intel today) gets no line.

**Left out on purpose:** einvoice-preflight (the nearest free tool,
eu-vat-oss-calculator, serves B2C OSS, not B2B e-invoicing), babysitting-business-kit
and ids-model-check (no close feeder). Add one when a fitting free tool ships.

**Next:** when a product's paid edition goes live, keep the line pointing at
the public product page; that page carries the upgrade path. After a few weeks,
read the `product_offer_click` counts to see which pairings people follow.
