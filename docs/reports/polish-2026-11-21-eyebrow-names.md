---
kind: polish
topics: [design, seo, accessibility]
date: 2026-11-21
---
# Polish 2026-11-21: sibling names in eyebrows; journal heroes fold their intro

Not from the queue. Look-first pass (hub, /research/, /writing/, 401k-plan-fee-calculator,
actions-timeout-check, 3pl-quote-normalizer at 390 and 1280) found the long-tail tool pages,
the ones search visitors land on, weaker than the flagships the last ten polish runs worked on.
No open PR had `polish` in its title. PR #17996.

## What changed

1. **Eyebrows naming a sibling (7 pages).** ko-fi, buymeacoffee and teachable payout-to-journal
   said "PATREON PAYOUT TO JOURNAL"; fiverr-earnings-to-journal "UPWORK…"; shopify-payout-to-journal
   "STRIPE…"; phone-repair-shop-profit-calculator "SHOE REPAIR…";
   teachers-pay-teachers-earnings-analyzer "FIVERR EARNINGS FEE ANALYZER". Fixed. Title, og:title,
   h1, `llms.txt` and README `#` lines were scanned the same way across all ventures: no hits.
   Check: `platform/pages/eyebrow-own-name.test.mjs` (eyebrow first item, as a word set, equals
   another venture's slug). On main it fails on exactly these 7.
2. **25 `*-to-journal` heroes** (list: every `ventures/*-to-journal` page): first sentence of the
   intro is `p.lede`; the rest (and the second paragraph on payoneer/revolut/wise) goes into
   `details.hero-more` "What it books and checks", with a per-page `/* hero-fold */` style in the
   h1 colour and a 3 px `:focus-visible` outline. The `p.note` disclaimers are untouched and visible.
   Script used: first `. ` followed by a capital; KDP ("KDP. Every") fixed by hand.
3. **where-to-sell-calculator** already had a fold but a 67-word plain-`p` lede; now `p.lede` of
   ~45 words, the fee and weighting clauses moved into the fold.
4. Check: `platform/pages/hero-fold.test.mjs`: any venture `header` with `details.hero-more` has a
   `p.lede` of ≤ 50 words directly before it (26 pages + flagships that use it).

## Measured (Chromium; before = full build of main at f34bc1c4f, after = `--only` preview)

Survey, all ventures, 390×844, first visible `input/select/textarea` in `main`: 1,411 pages with
one, median 742 px, **378 below 844**, 132 below 1,000. Hero words before `<main>` predict it:
120–150 words → 141/293 below, 150–200 → 112/122, 200+ → 19/20 (under 90 words: 48/442).

The 25 journal pages:

| Screen | first card ≤ fold−16 | median card top | first input ≤ fold−16 | median input |
|---|---:|---:|---:|---:|
| 390×844 | 10 → 25 | 842 → 639 | 0 → 7 | 1,101 → 890 |
| 360×780 | 0 → 24 | 895 → 670 | 0 → 0 | 1,156 → 932 |
| 1280×900 | 25 → 25 | 447 → 415 | 25 → 25 | 608 → 554 |

No sideways scroll before or after. Screenshots (390×844, 2x):
`img/polish-journal-hero-{before,after}-ko-fi-390.png`.

## Still weakest, and what I would do next

1. **353 other tool pages put the first input below 390×844.** The `*-csv-check` family is the
   next template-shaped group (klaviyo, mailchimp, shopify-customer, brevo, shopify-inventory,
   payroll-hours, meta-catalog, activecampaign, quickbooks-*, salesforce, google-ads-editor, wix,
   bigcommerce, woocommerce, xero-*, zoho, pipedrive, squarespace, square-catalog, shopify-product,
   google-contacts, email-list: ~25 pages at 845–1,196 px). Same fold, same check. Then the
   finance calculators with an `answer-source` lead (48 of the 378; median lead 275 px at 390):
   the AEO lead must stay visible, so fold the plain intro after it instead.
2. **The card's own intro note** sits between the card heading and the input (≈150–250 px on the
   journal pages), so only 7/25 inputs are on the first screen. Moving the column list into a
   `<details>` inside the card would bring most inputs up; measure.
3. **Breadcrumb category looks wrong**: ko-fi-payout-to-journal's breadcrumb is "Compliance checks
   & evidence…". Check how the journal tools are categorised (`platform/pages/` category map).
4. **117 venture pages have a first hero paragraph over 80 words** (1,279 with a header hero; 547
   over 60). A ratchet would be noise at that count; fix families first.
5. Measurement scripts for this run were throwaway (in the session scratchpad); `fold-check.mjs`
   covers audience pages only. Extending it to ventures with a baseline would make item 1 visible
   to every run.
