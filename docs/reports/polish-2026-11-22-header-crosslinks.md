---
kind: polish
topics: [design, seo]
date: 2026-11-22
---
# Polish 2026-11-22: "see also" notes move out of tool headers

Picked by measurement rather than a queued item. In `venture-fold-baseline.json`,
appointment-deposit-calculator (1,613 px) is the first real tool after two false
positives (see item 1 below). Its header stacked six link notes above the form. A
static scan of `ventures/*/index.html` found 5 headers with two or more `p.note`
linking to another venture. No open PR had `polish` in its title.

## What changed

1. **5 pages** (appointment-deposit-calculator 6 notes moved, quarterly-estimated-tax-calendar 6,
   turo-host-payout-calculator 4, equipment-auction-buyer-premium-calculator 4,
   1099k-reconciliation-worksheet 3): every header `p.note` with a link, except a note that
   says "Nothing is uploaded", moved word for word into
   `section.card.related-links` "Related guides and tools", inserted before "Common questions".
   The moved notes include links to the page's own guide pages. No text was cut.
2. **Check**: `platform/pages/header-crosslinks.test.mjs` allows at most 1 cross-tool note per
   venture header (14 pages have exactly 1). It fails on main (these 5) and passes now.
3. **Ratchet**: the 5 keys deleted from `venture-fold-baseline.json` (330 → 325).

## Measured (`venture-fold.mjs`, Chromium; before = full build of main at 06fcf31ef,
after = `--only` preview of the 5)

| page | 390 field before → after |
|---|---:|
| appointment-deposit-calculator | 1613 → 798 |
| quarterly-estimated-tax-calendar | 1460 → 737 |
| 1099k-reconciliation-worksheet | 1234 → 787 |
| turo-host-payout-calculator | 1128 → 775 |
| equipment-auction-buyer-premium-calculator | 1069 → 759 |

Totals: 360 wide 0 → 3 of 5 on the first screen (1099k 836, turo 856 still need a nudge);
390×844 0 → 5 of 5; 1280 4 → 5 of 5. Screenshots (390×844, 2x):
`img/polish-header-crosslinks-{before,after}-deposit-390.png`.
The 5 ventures' suites pass (320 tests); `node --test 'platform/pages/*.test.mjs'` see the PR.

## Still weakest, and what I would do next

1. **`venture-fold.mjs` counts the footer's opt-out checkbox as the "first field"** on pages
   with no form: testimonial-keeper (3,803) and monastery-site (3,399) top the baseline but are
   self-hosted product pages, not tools. Restrict the field search to before `footer`, or skip
   `#optout`, and rewrite the baseline; the top of the list then shows real tools.
2. **Next real tools by depth**: open-robot-mower (1,513, check whether it is a tool page),
   s-corp-reasonable-compensation-calculator 1,456, devsec-toolkit 1,428,
   bank-statement-pdf-to-csv 1,395, patreon-fee-calculator 1,365 (three ledes:
   `polish-2026-11-21-answer-lead-fold.md` item 3).
3. The `related-links` card has no shared style beyond `.card`. If more pages adopt it, a
   compact list style in the site CSS would read better than a stack of `p.note`.
