---
kind: polish
topics: [seo]
date: 2026-11-25
---
# Polish 2026-11-25: shift-roster and league-schedule meta descriptions under 160

Picked item 1 of "Still weakest" in
`polish-2026-11-25-ai-bookkeeper-descriptions.md`. einvoice-preflight and
wall-framing-takeoff had already left the baseline (other runs), so this run
took the two subscription products next on it: shift-roster-builder (row 5 in
`transition.py`, 22 pages) and league-schedule-generator (row 8, 40 pages).

## What changed

- 62 `<meta name="description">` values rewritten: shift-roster 184–293 to
  148–160, league 161–260 to 143–160. Facts only from the old text; guides
  that target a query open with it ("Pickleball league schedule for ...").
  Dropped the "Free, private roster builder included" / "Then build yours
  free" tails first. `og:description`, titles, JSON-LD untouched.
- Baseline rewritten with `--write`: 2,898 to 2,836 pages.
- Post: update section in
  `docs/posts/2026-11-24-paid-product-front-pages-fit-a-search-snippet.md`
  (consolidated, not a new post).

## Verified

- `node platform/pages/description-length.mjs`: 0 not in baseline.
- `node --test platform/pages/description-length.test.mjs`: 5/5.
- `run_venture_tests.py shift-roster-builder league-schedule-generator`:
  result in the run record.

## Still weakest, and what I would do next

1. **Paid products still on the baseline**: clothing-design-studio 51 and
   quick-pick-survey 17 (one-off rows), babysitting-business-kit 7,
   sales-agent 7. Then the free calculators that front a bet
   (ebay/shopify/amazon fee calculators, 20+ each).
2. **og:description**: of these 62 pages only weekend-tournament-schedule
   was over 200; it now reuses the meta text (og baseline 796 to 795). The
   rest of the og list: saints-by-candlelight 178 is the largest block.
3. shift-roster-builder pages still say "free, private" in body text; check
   against `LICENSING_TRANSITION.md` when its paid edition ships.
4. Carried: 4 orange primaries; og:title on einvoice country guides;
   `writing/` and `research/` mid-title ellipses; 28 px band buttons on phones.
