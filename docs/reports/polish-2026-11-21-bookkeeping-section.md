---
kind: polish
topics: [seo, information-architecture]
date: 2026-11-21
---
# Polish 2026-11-21: a bookkeeping section; the evidence rule stops shadowing six named placements

Look-first pass: hub, /research/, /writing/, /stories/, a blog post, and the top
ten flagships at 390 and 1280 (main build, Chromium). No sideways scroll anywhere.
The hub stat tiles looked inconsistent in a 300 ms screenshot (643 research
projects against 1,080 in the search label), but that was the count-up animation
caught mid-run. The finished HTML agrees (1,085 + 67 + 266 = 1,418 tools; 1,080
projects), and the animation is skipped under reduced motion. Not a defect.

The visible defect was in the flagship breadcrumbs: AI Bookkeeper under
"Compliance checks & evidence records" (also item 3 of
`polish-2026-11-21-eyebrow-names.md`, there for ko-fi-payout-to-journal), and
Sales Agent under "Creator & solo earner income". No open PR had `polish` in its
title.

## What changed

1. **New `bookkeeping` category** ("Bookkeeping, bank files & journals",
   `/c/bookkeeping/`), placed just before `evidence` in `CATEGORY_RULES`:
   `/-to-journal$/` plus `BOOKKEEPING_SLUGS` (21 exact slugs). 46 tools. Its
   `CATEGORY_PAGE_COPY` entry has a 59-char title and a 161-char description.
   Hub icon in `home.mjs`.
2. **Marketplace rule** skips `-to-journal` (amazon-settlement, ebay-payout,
   etsy-statement, kdp-royalty and shopify-payout journals had landed there).
3. **`NOT_EVIDENCE_SLUGS`**: expense-tracker, time-tracker, freelance-lead-tracker,
   sales-call-notes-desk (now solo-earner, as that rule's own list says),
   s-corp-basis-tracker and grant-writer-proposal-price-calculator (now backoffice).
4. **Tests** (`build.test.mjs`): bookkeeping placements plus "every `*-to-journal`
   is in bookkeeping"; "no tool in evidence is also claimed by a later section".
   `home.test.mjs` icon list includes the new id.

Counts before → after: evidence 121 → 84, backoffice 181 → 173, marketplace
100 → 95, solo-earner 73 → 77, bookkeeping 0 → 46.

## Measured

- `--only=ai-bookkeeper,ko-fi-payout-to-journal,c/bookkeeping` preview: AI
  Bookkeeper's `BreadcrumbList` position 2 is "Bookkeeping, bank files & journals"
  → `/c/bookkeeping/`. Category page: 46 tool cards, scrollWidth 390 at 390 and
  1280 at 1280.
- Targeted tests: 18/18 pass. Full `node --test 'platform/pages/*.test.mjs'`
  result is in the PR's run record.

## Still weakest, and what I would do next

1. **Sales Agent's breadcrumb is "Creator & solo earner income".** The sales
   cluster (sales-agent, sales-cadence-builder, sales-call-notes-desk,
   freelance-lead-tracker, freelance-proposal-maker, invoice-maker, estimate-maker,
   time-tracker) is a freelancer's or small seller's pipeline. A section like
   "Sales, quotes & invoicing" would describe it better. Check the offline-bundle
   bound in `build.test.mjs` before splitting.
2. **evidence still mixes three jobs**: EU/US regulation checkers (~30), import
   CSV checks for CRMs and email tools (hubspot, salesforce, klaviyo, mailchimp,
   brevo, pipedrive, zoho, activecampaign, google-contacts: ~12), and dated
   evidence records. The CRM/email import checks could join the other `*-csv-check`
   pages (backoffice/marketplace) or get a "Data imports" section.
3. Carried over from `polish-2026-11-21-answer-lead-fold.md`: 19 answer-lead pages
   with the first field just below 390×844; patreon-fee-calculator's three ledes;
   `venture-fold.mjs` has no baseline yet.
4. The bookkeeping category's count line names AI Bookkeeper as the one tool that
   sends data out. `externalCallExceptions` derives that from the tool's code (the
   optional AI call), so it is accurate. But the AI Bookkeeper page's eyebrow
   says "Nothing uploaded". Reconcile the two wordings, for example "Nothing
   uploaded unless you turn on AI".
