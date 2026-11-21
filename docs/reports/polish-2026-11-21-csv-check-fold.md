---
kind: polish
topics: [design, accessibility, software-for-routine]
date: 2026-11-21
---
# Polish 2026-11-21: the 29 `*-csv-check` heroes fold their list of checks

Picked item 1 of "Still weakest" in `polish-2026-11-21-eyebrow-names.md` (the
`*-csv-check` family), and item 5 of the same report (measurement scripts were
throwaway). No open PR had `polish` or `csv-check` in its title.

## What changed

1. **29 pages** (every `ventures/*csv-check*`, including `1099-vendor-csv-checker`):
   the 66–96 word intro was one sentence "Paste or drop … before you import: [list].
   Then …". The first-sentence split the journal run used does not fit that shape,
   so the split is at the colon: `p.lede` = the clause before the colon + the
   "Then …" sentence (22–49 words; 1099-vendor is 49, under the 50-word cap in
   `hero-fold.test.mjs`); the list goes into `details.hero-more` "What it checks"
   as "It flags [list]." with the same per-page `/* hero-fold */` style as the
   journal pages (summary in the h1 colour, 3 px focus outline). Notes
   (privacy, independence, consent) untouched and visible.
   wix: "Variant rows" lowercased mid-sentence. Text inside the list unchanged.
2. **`platform/pages/venture-fold.mjs`** (+ `venture-fold.test.mjs`, README
   section): first `main .card` and first visible form field top for
   `--slugs`/`--match`/`--all` at `--widths`, against `DIST` (works on an
   `--only` preview). Replaces the scratchpad probe both of today's polish runs wrote.
   It measures; it does not gate (no baseline yet).

## Measured (Chromium, `--only` previews of main and of this branch)

`DIST=… node platform/pages/venture-fold.mjs --match csv-check --widths 360,390,1280`

| Screen | first card on screen | median card top | first field on screen | median field top |
|---|---:|---:|---:|---:|
| 360×780 | 7 → 23 | 804 → 642 | 0 → 7 | 986 → 810 |
| 390×844 | 23 → 27 | 755 → 600 | 0 → 20 | 920 → 775 |
| 1280×844 | 29 → 29 | 427 → 418 | 29 → 29 | 546 → 536 |

No sideways scroll before or after. Screenshots (390×844, 2x):
`img/polish-csv-check-hero-{before,after}-quickbooks-import-390.png`.
All 29 ventures' own `*.test.mjs` pass; `node --test 'platform/pages/*.test.mjs'`: 1,900 tests pass (after shortening the post's description).

## Still weakest, and what I would do next

1. **9 csv-check pages still put the field below 390×844** (field top 831–1,022):
   brevo, klaviyo, mailchimp, shopify-customer (65–68 word consent note under the
   privacy note), payroll-hours, shopify-inventory (two notes), meta-catalog (39-word
   lede), irs-iris-1099 (57-word note), 1099-vendor (card note ≈290 px before the
   field). Don't fold the consent note; consider merging the privacy and
   independence notes into one shorter line, or shortening the card note on 1099-vendor.
2. **Finance calculators with an `answer-source` lead** (48 of the 378 pages with the
   first input below 390×844 in the 11-21 survey): fold the plain intro *after* the AEO lead.
   Run `venture-fold.mjs --all --rows` on a full build to rank families first.
3. **`venture-fold.mjs` has no baseline.** Once a few families are folded, a
   baseline file and an exit 1 on regressions (like `fold-check.mjs`) would keep it fixed.
4. Carried over from `polish-2026-11-21-eyebrow-names.md`: item 2 (card intro note
   between heading and input), item 3 (ko-fi breadcrumb category), item 4 (117 heroes over 80 words).
