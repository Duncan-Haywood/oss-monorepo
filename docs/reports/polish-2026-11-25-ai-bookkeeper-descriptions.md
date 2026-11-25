---
kind: polish
topics: [seo]
date: 2026-11-25
---
# Polish 2026-11-25: ai-bookkeeper meta descriptions under 160

Picked item 1 of "Still weakest" in
`polish-2026-11-24-paid-front-page-descriptions.md` (the rest of the paid
products' pages), narrowed to ai-bookkeeper (subscription row 3 in
`transition.py`): all 46 of its pages on `description-length-baseline.json`.

## What changed

- 46 `<meta name="description">` values rewritten to 136 to 160 characters
  (were 165 to 289). Facts only from the old text and page body; trade
  guides now open with "<Trade> bookkeeping:" so the query word is in the
  snippet. `og:description`, titles, JSON-LD untouched.
- Baseline rewritten with `--write`: 3,089 to 3,043 pages.
- Post: `docs/posts/2026-11-25-ai-bookkeeper-snippets-name-the-trade.md`.

## Verified

- `node platform/pages/description-length.mjs`: 0 not in baseline.
- `node --test platform/pages/description-length.test.mjs`: 5/5.
- `node --test ventures/ai-bookkeeper/page.test.mjs`: 28/28; full suite via
  `run_venture_tests.py ai-bookkeeper` (result in the run record).

## Still weakest, and what I would do next

1. **Paid products still on the baseline**: einvoice-preflight 101,
   clothing-design-studio 51, wall-framing-takeoff 43,
   league-schedule-generator 40, shift-roster-builder 22, quick-pick-survey 17
   (filter the baseline by slug). Same approach; einvoice country guides
   would benefit from a "<Country> e-invoicing:" lead, like the trade lead here.
2. **og:description** on these pages is still the old long text (share cards
   cut at about 200). A matching ratchet could follow.
3. ai-bookkeeper pages still call the tool "free, open-source" in body text
   and `og:description` (vs-quickbooks-xero-wave, mint-export,
   rental-property). Once its paid edition ships, those claims need checking
   against `LICENSING_TRANSITION.md`; I left them as they are (true today).
4. Carried: 4 orange primaries; og:title on einvoice country guides;
   `writing/` and `research/` mid-title ellipses; 28 px band buttons on phones.
