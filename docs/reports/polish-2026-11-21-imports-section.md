---
kind: polish
topics: [seo, design]
date: 2026-11-21
---
# Polish 2026-11-21: an Import & upload file checks section

Date: 2026-11-21. Track: polish/0. Picked item 1 of "Still weakest" in
`polish-2026-11-21-sales-section.md` (evidence mixed regulation checkers, CRM and email import CSV
checks, and dated evidence records). `polish_queue.py` showed no open polish PR; claimed with draft
PR #18085 before building.

## What changed

1. **`IMPORT_CHECK_SLUGS`** (exported, 22 exact slugs) and an **`imports` rule placed third** in
   `CATEGORY_RULES` (after `sales`): the ten CRM and email-platform contact checks (hubspot, salesforce,
   pipedrive, zoho, activecampaign, klaviyo, mailchimp, brevo, google-contacts, email-list), vcard,
   ics, google-ads-editor, meta-catalog, gbp-bulk-location, gtin-list, iban-list, payroll-hours,
   redirect-map, youtube-chapters, gpx-track, gtfs-feed.
2. Their 21 dead exact lines removed from `evidence` and one (`email-list-csv-check`) from
   `backoffice`. `internal-link-planner`'s comment updated (it stays in evidence; its "filed beside
   redirect-map-check" no longer held).
3. `CATEGORY_PAGE_COPY.imports`: 59-char title, 146-char description, 41-word intro. Hub icon
   `imports` in `home.mjs` (a document with an arrow into a tray).
4. Tests: `build.test.mjs` "pre-upload file checks file under imports, and no later rule still names a
   member" (plus 8 near-misses that must stay put: shopify/etsy feeds in marketplace, QuickBooks/Xero/OFX
   in bookkeeping, three in evidence); section count 20 → 21; `home.test.mjs` icon list.

Checked before writing "Nothing you upload leaves your browser" in the intro: none of the 22 pages'
HTML or JS calls `fetch`, `XMLHttpRequest` or `sendBeacon` (only `ics-calendar-check/cli.mjs`, the
command-line twin, does).

Kept out on purpose: marketplace product-feed checks (shopify-*, etsy, bigcommerce, woocommerce, wix,
squarespace, square-catalog) and the accounting import and bank-file checks (bookkeeping).

## Measured

Counts over `ventures/` (`categoryFor`): evidence 84 → 63, backoffice 171 → 170, imports 0 → 22.
Catch-all unchanged.

`--only=hubspot-contacts-csv-check,c/imports,c/evidence` preview: HubSpot's `BreadcrumbList`
position 2 is "Import & upload file checks" → `/c/imports/`. Category page at 390×844: filter field
and first card on the first screen; scrollWidth 390 at 390 and 1280 at 1280 (hub the same).

**The site `llms.txt` index is at its 50,000-byte cap.** With the first blurb (365 chars) the new
section took it to 50,106 bytes and `build.test.mjs` "llms.txt is a short index" failed; the blurb was
cut to 227 chars (about 49,968 bytes). Each new section adds roughly 1 KB to the index (heading, blurb,
four bullets, a "more tools" line), so **the next section split will fail that test** unless something
gives first.

## Still weakest, and what I would do next

0. **Make room in `llms.txt` before the next section split.** Options, cheapest first: shorter section
   blurbs in the index only (the hub keeps the long one), 3 bullets per category instead of 4
   (`LLMS_INDEX_TOOLS_PER_CATEGORY`), or `LLMS_INDEX_DESC_MAX` 140 → 120. Measure which keeps the index
   most useful to an assistant.

1. **shopify-customer-csv-check** is a contact import, not a product feed, but sits with the Shopify
   product checks in marketplace. Moving it splits the Shopify family; a "see also" link from
   `/c/imports/` might serve both.
2. **Evidence (63)** still holds employment-law calculators (final paycheck, paid sick leave, employer
   payroll tax, OSHA TRIR) that are back-office arithmetic with a not-legal-advice posture. An HR /
   employment subsection or move is the next taxonomy question.
3. **The imports page has no subcategories**; at 22 it reads fine, but "CRM & email", "Ads & listings",
   "Contacts & calendars", "Lists & feeds" groups (`SUBCATEGORY_RULES`) would help once it passes ~30.
4. Carried over from `polish-2026-11-21-sales-section.md`: item 2 (Sales Agent self-host badge), item 3
   (trades sales tools for an agencies audience page).
