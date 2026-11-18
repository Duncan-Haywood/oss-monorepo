# Polish: audience-page intros short enough for the first phone screen

Date: 2026-11-18. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-18-homeowners-audience.md` ("The audience intro runs to about 350 px on a phone").
Open PRs listed (`list_pull_requests`, open, 60): none touch `audiences.mjs`.

## What I measured

Playwright at 390x844, every `c/for-*/` page in a fresh local build: the height of the hero's
`.lede` and the page y of the first "Start here" card (the first tool a visitor can tap).
The first screen ends at 844 px.

| page | intro words | lede height | first card, before | first card, after |
|---|---:|---:|---:|---:|
| for-homeowners | 85 → 45 | 368 → 210 px | **978** | 794 |
| for-parents | 72 → 44 | 289 → 184 px | **951** | 820 |
| for-retirees | 67 → 45 | 289 → 210 px | **951** | 820 |
| for-job-changers | 66 → 46 | 263 → 184 px | **873** | 794 |
| deepest of the other 27 (for-roofers) | 44 | 184 px | 820 | 820 |

Before, four pages started their first card below the first screen; those were the four
life-stage pages, whose intros listed every tool. The other 27 audience pages (21 to 44-word
intros) all start by 820 px. After, all 31 start by 820 px. Parents and retirees also needed the
`starting` callout trimmed (45 → 35 and 42 → 35 words); the intro alone left them at 846 and 872 px.

Screenshots (390x844, first screen), homeowners:
[before](img/polish-2026-11-18-homeowners-hero-before-390.png),
[after](img/polish-2026-11-18-homeowners-hero-after-390.png). After, the first card's top edge and
number badge show at the bottom of the first screen; its title is still about 10 px below the fold.
The same is true of for-roofers and the other pages at 794 to 820 px, so this brings the four
outliers level with the rest rather than putting a full card on screen.

## What changed

- `platform/pages/audiences.mjs`: four intros and two `starting` notes shortened. No tool is
  named that was not named before. The UK markers stay ("two marked UK", "four marked UK", "one marked UK").
  Dropped from the intros, though still listed on the pages: the HOA reserve study, the application
  tracker, the High Income Child Benefit Charge, and the detail of which UK rules apply.
- `MAX_INTRO_WORDS = 50` and `MAX_HERO_WORDS = 85` (intro + `starting`), enforced in
  `audiences.test.mjs`, so the next audience page cannot regrow the problem.

Verification: `node --test platform/pages/audiences.test.mjs` 13/13; full
`node --test 'platform/pages/*.test.mjs'` (see the run record); `node platform/pages/check.mjs`
"looks publishable … no dead links".

## Still weakest, and what I would do next

0. **No audience page shows a whole "Start here" card title on a phone's first screen.** The hero
   (eyebrow, h1, intro, `starting` callout, count line) is 450 to 520 px tall on every one. A
   shared fix would lift all 31 pages: tighter hero padding on phones, or the `starting` callout
   moved below the first card. Measure with the same script (first card top, target about 760 px).

1. **"Start here" + "Questions these tools answer" fill about 1,600 px before "All N tools"** on
   most audience pages (for-freelancers: start-here 1,018 px, answers 581 px; `main` begins at
   2,709 px). For a visitor who wants a specific tool, the jump chips and filter are three screens down.
   Try a "Jump to all N tools" link in the hero `count` line, or collapse the answers list to
   five items on phones. Measure `main` top before and after.
2. Carried over: the renters page needs a fourth tool (ventures work); severance, residency-day and
   FEIE tools still sit in `backoffice`; `llms.txt` has ~4 KB of headroom.
3. The same word-cap idea could apply to category-page intros (`categories.mjs`); not measured this run.
