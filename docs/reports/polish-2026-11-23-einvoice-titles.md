---
kind: polish
topics: [seo]
date: 2026-11-23
---
# Polish: einvoice-preflight titles fit a search result (2026-11-23)

Picked item 1 of "Still weakest" in `polish-2026-11-23-story-title-budget.md`
(einvoice-preflight: 100 long titles).

## What changed

- 92 hand-written `*-e-invoice-mandate.html` guides plus
  `e-invoicing-mandates-by-country.html`, `audit-pack-for-accountants.html` and
  `create.html`: new `<title>` of at most 70 characters (entities decoded). Each
  one opens with the country and query words, then the key fact. Every fact
  comes from the old title. ` | E-invoice Preflight` is kept only where the
  whole title still fits in 70. `og:title` and `h1` are unchanged.
- Generators `deadlines-page.mjs`, `whichapplies.mjs`,
  `build-sdi-codes-page.mjs` and `build-br-fr-codes-page.mjs` write a short
  head title. Pages regenerated: a one-line diff each.
- `title-length.test.mjs`: every page title is at most 70 characters, and
  country guides do not open with a generic word.

## Measured (`check_title_meta.py`)

| scope | before | after |
|---|---|---|
| einvoice-preflight | 100 long / 105 | 0 |
| all `ventures/` | 1,264 | 1,164 |

Venture suite: 2,174 pass, 1 fail. The failure is `repair-facturx.test.mjs`
"poppler opens the repaired PDF". This container disables `pdfdetach` saving,
so it fails here with or without this change.

## Still weakest, and what I would do next

1. **Remaining 1,164 long titles across `ventures/`**: run
   `check_title_meta.py` and take the next largest venture. A per-venture
   `title-length.test.mjs` like this one (copy it) keeps each one fixed.
2. **og:title on the country guides** is still the 100-plus-character
   sentence. Share cards wrap it, which is fine, but a shorter og:title
   matching the new head title would read better on LinkedIn and Slack.
3. Carried over: `writing/` and `research/` titles truncate mid-title
   (`polish-2026-11-23-story-title-budget.md`, item 2); clothing-design-studio
   and wall-framing-takeoff long titles (same report, item 3).
