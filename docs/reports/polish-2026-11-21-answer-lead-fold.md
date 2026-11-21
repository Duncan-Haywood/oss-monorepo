---
kind: polish
topics: [design, seo, accessibility]
date: 2026-11-21
---
# Polish 2026-11-21: 37 answer-lead calculators fold their plain intro

Picked item 2 of "Still weakest" in `polish-2026-11-21-csv-check-fold.md`
(finance calculators with an `answer-source` lead). No open PR had `polish`
in its title.

## What changed

1. **37 venture pages** whose header is `h1` → `p.answer-source[data-answer-lead]`
   → a plain `<p>` intro of 40 or more words (40–104; median 59). The plain intro
   moved into `details.hero-more` right after the lead, summary "What it
   calculates" ("What it checks" on actions-timeout-check and
   uk-vat-registration-checker, "What it plans" on the two planners). The
   answer lead, the sourced fact with its as-of date that answer engines
   quote, is untouched and stays visible; so are every `p.note` (privacy,
   disclaimer) and every `p.seo-link` (the marketplace fee pages' FAQ and
   worked-example links). Text inside the fold is unchanged.
   Per-page `/* hero-fold */` style as on the journal and csv-check pages:
   summary in the page's h1 colour where the page sets one (8 colours), else
   `inherit`; patent-maintenance-fee-planner (the only one with a dark mode)
   uses `var(--accent)`. 3 px `:focus-visible` outline.
   Selection: every `ventures/*/index.html` with `data-answer-lead` (59) whose
   lead is followed directly, inside the header, by an unclassed `<p>` of ≥ 40
   words. Skipped: pages with only a `p.note` after the lead (13), plain intros
   under 40 words (5), patreon-fee-calculator (three `p.lede` blocks, a
   different shape), three pages with no `<header>` hero.
2. **`platform/pages/hero-fold.test.mjs`** now also accepts a fold directly after
   the answer lead (the lead is not word-capped there: it is the AEO content).
   A fold separated from the lead by another paragraph still fails. Two new
   helper cases.

## Measured (Chromium, `--only` previews of main and of this branch)

`DIST=… node platform/pages/venture-fold.mjs --slugs <the 37> --widths 360,390,1280`
(22 of the 37 use `main .card`; the 15 marketplace fee pages use a grid layout).

| Screen | first card on screen | median card top | first field on screen | median field top |
|---|---:|---:|---:|---:|
| 360×844 | 1 → 17 | 968 → 791 | 0 → 10 | 1,057 → 876 |
| 390×844 | 2 → 20 | 877 → 742 | 0 → 18 | 974 → 835 |
| 1280×844 | 22 → 22 | 515 → 466 | 37 → 37 | 645 → 583 |

No sideways scroll (aca-subsidy-cliff-calculator, scrollWidth 390 before and
after). Screenshots (390×844, 2x):
`img/polish-answer-lead-fold-{before,after}-aca-subsidy-cliff-390.png`.
Each of the 37 ventures' own `*.test.mjs` passes; `node --test
'platform/pages/*.test.mjs'` result in the PR's run record.

## Still weakest, and what I would do next

1. **19 of the 37 still put the first field just below 390×844** (845–1,043 px;
   qbi-deduction 1,043, merchant-of-record 942, 401k-plan-fee 939). What is left
   above the field is the answer lead (73–99 words on most of them) and the card's
   own heading and intro. Do not fold or trim the lead for layout: it is the AEO
   content. The card intro note (item 2 in `polish-2026-11-21-eyebrow-names.md`)
   is the next lever; on qbi-deduction two `p.note` blocks (23 + 40 words) could
   become one line.
2. **13 answer-lead pages have only a `p.note` after the lead** (auto-loan,
   charitable, child-tax-credit, gambling-loss, hsa, medicare-irmaa, no-tax-on-tips,
   sep-ira, social-security-*, exempt-salary): nothing to fold; measure them with
   `venture-fold.mjs` before deciding anything.
3. **patreon-fee-calculator** has three `p.lede` paragraphs (83 + 30 + 31 words)
   after its answer lead: fold the second and third.
4. Carried over: `venture-fold.mjs` still has no baseline; breadcrumb category
   on the journal pages; 117 heroes over 80 words.
