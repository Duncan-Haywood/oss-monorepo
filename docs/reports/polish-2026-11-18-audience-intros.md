---
kind: polish
topics: [seo, design]
date: 2026-11-18
---
# Polish: audience intros capped at 50 words

Date: 2026-11-18. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-18-homeowners-audience.md` ("The audience intro runs to about 350 px on a phone").
Open polish PRs (`polish in:title`): #11730, #14012 and #12397. None of them touch `audiences.mjs`.

## What changed

- `platform/pages/audiences.mjs`: rewrote the `intro` of retirees (67 → 50 words), parents
  (72 → 43), job-changers (66 → 42) and homeowners (85 → 47). The new intros name the decisions
  and keep the US/UK jurisdiction sentence. They no longer list every tool, because the cards
  already do. job-changers no longer mentions the application tracker (its card still does).
- `platform/pages/audiences.test.mjs`: new test, `intro` and `starting` ≤ 50 words each.

## Measured

A full build (before the edit) of every `c/for-*` page, plus a `--only` preview of the 44 tools on
the four pages (after), at 390×844 with Playwright. "First tool" is the top of `.start-here`:

| page | lede px | first tool px |
|---|---|---|
| for-homeowners | 368 → 210 | 902 → 745 |
| for-parents | 289 → 158 | 875 → 743 |
| for-retirees | 289 → 210 | 875 → 796 |
| for-job-changers | 263 → 184 | 797 → 718 |
| other 27 (unchanged) | 105–184 | 610–766 |

scrollWidth stays at 390 on all four. The script is a throwaway in the session scratchpad. Its
logic is a 30-line Playwright loop over `dist/c/for-*`.

## Still weakest, and what I would do next

1. **for-retirees is still the tallest (796 px).** Its `starting` note (42 words, 203 px) is the
   largest of the 31. Cutting it to about 30 words would bring it in line with the trade pages.
   Parents' note (45 words) is the same height.
2. **Turn the measurement into a check.** `check.mjs` could fail any `c/for-*` page whose
   `.start-here` or first `main .card` top is below 844 px at 390. That is the real rule, and the
   word cap only stands in for it.
3. Carried over from `polish-2026-11-18-homeowners-audience.md`: item 1 (renters page needs a fourth
   real tool), item 3 (household tools still in `backoffice`; the `starting` note's business
   call-out styling) and item 4 (llms.txt audience block headroom).
