---
kind: polish
topics: [design]
date: 2026-11-18
---
# Polish: shorter "starting" notes on retirees and parents

Date: 2026-11-18. Track: polish/0. Follow-up to `polish-2026-11-18-audience-intros.md` (PR #17145),
item 1 there ("for-retirees is still the tallest … Parents' note (45 words) is the same height").
This run had made the same intro fix in parallel; #17145 landed first, so this PR keeps its intros
and carries only the part it had not done.

## Measured

Playwright at 390x844 on a full local build, with main's intros swapped in. The number is the
page y of the first "Start here" **card**, not the section top that #17145 measured, so it runs
about 75 px deeper than that report's figures. The phone's first screen ends at 844 px.

| page | `starting` words | first card |
|---|---:|---:|
| for-retirees | 42 → 29 | **872** → 821 |
| for-parents | 45 → 35 | 819 → 794 |
| for-homeowners (unchanged) | 39 | 821 |
| for-job-changers (unchanged) | 30 | 794 |

Across all 31 audience pages the deepest first card is now about 821 px, so its top edge shows on the
first screen everywhere. Retirees was the one page still below the fold after #17145.

## What changed

`platform/pages/audiences.mjs`: the `starting` notes of retirees and parents. Both still name the
same tools (Social Security claiming age calculator and withdrawal sequencer; Child Tax Credit,
dependent care FSA vs credit, maternity pay, shared parental pay). Retirees no longer lists IRMAA
and RMDs in the note; the sequencer's card still does.

## Still weakest

1. **A word cap is a poor proxy.** Homeowners has 86 words of intro plus note and starts at 821 px.
   Roofers has 85 and starts at 820. Retirees had 92 and started at 872. The rule is pixels, so
   #17145's item 2 stands: a browser check that fails any `c/for-*` page whose first card starts
   below 844 px at 390 wide.
2. **No page shows a whole card title on the first screen.** The hero (eyebrow, h1, intro, note,
   count) is 450 to 520 px tall on every audience page. Tightening the hero padding on phones in
   `CATEGORY_STYLE` would lift all 31 pages at once.
3. **Three screens to the full list.** "Start here" plus "Questions these tools answer" fill about
   1,600 px before "All N tools" (for-freelancers: `main` starts at 2,709 px). A "Jump to all N
   tools" link in the hero count line would help a visitor who already knows which tool they want.
