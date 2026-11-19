---
kind: polish
topics: [design, accessibility]
date: 2026-11-19
---
# Polish: the shared footer on a phone, 2,128 px to 1,595 px

Date: 2026-11-19. Track: polish/0. Picked item 2 of `polish-2026-11-19-about-one-list.md`
("The shared footer is 2,128 px at 390 on every page"), also item 1 of
`polish-2026-11-14-request-fold.md`. Claimed with draft PR #17498 before the build.

## What was wrong (measured on a local build of main, 390×844)

The footer that closes the hub, all 51 category pages, About, custom development, the Ask page,
lab and queue was 2,128 px on `/c/` (2,254 on the hub). By part:

| Part | Before | After |
| --- | ---: | ---: |
| No warranty (h2 + p) | 247 | 247 |
| Best-effort hosting (h2 + p) | 180 | 180 |
| Privacy lead paragraph | 335 | 246 |
| Counter paragraph + counted/never-stored list + email paragraph | 481 | folded (45 px summary) |
| Support line | 90 | 90 |
| Link block | 447 + 45 | 461 + 39 |
| **Whole footer, `/c/` at 390** | **2,128** | **1,595** |
| Whole footer, hub at 390 | 2,254 | 1,716 |
| Whole footer, `/c/` at 320 | — | 1,859 |
| Whole footer, `/c/` at 1280 | — | 1,014 |

The link block was 24 links in an unlabelled two-column grid: "Lab" next to "Report a problem or
suggest a feature", "llms.txt" next to "Machine-readable catalog". Four labels wrapped onto two
lines at 390.

Screenshots: `img/polish-2026-11-19-footer-before-390.png`, `img/polish-2026-11-19-footer-after-390.png`.

## What changed

- **`disclaimerHtml` (build.mjs).** "No warranty" and "Best-effort hosting" stay open and word
  for word (`PRODUCT_PLAYBOOK.md` §5b: "a disclaimer the user actually sees"). The Privacy section
  keeps its promise, the outside-service exceptions and the feedback-form sentence open (the
  feedback form is an exception to "never uploaded", so it stays beside the promise). The anonymous
  counting, the per-page counter, the counted/never-stored list and the email-retention paragraph
  move into a `<details>` titled "What is counted, and what happens to email you send". Every fact
  is still in the page's HTML and still read by `footer-privacy.test.mjs`; nothing was removed.
- **`renderSiteFooterNav` (site-nav.mjs).** Four labelled groups (Tools, Read, Project, For
  machines) as `<nav aria-label="Site links">` with lists, four columns on desktop and 2×2 on a
  phone. Same 24 destinations; "Report a problem or suggest a feature" → "Report a problem",
  "Request custom development" → "Custom development", "Daily brief & The Merge Report" → "Daily
  brief", "Machine-readable catalog" → "catalog.json". The container keeps `pfs-foot`, which the
  band's CSS selects with `footer:has(.pfs-foot)`.
- **`footer-nav.test.mjs` (new).** Every old destination present once, the four group headings,
  labels ≤ 22 characters (one line in a phone column), no dotted separators, and the warranty,
  hosting and privacy-promise phrases outside any `<details>`.

## Verification

- `node --test 'platform/pages/*.test.mjs'`: pass 1832, fail 0.
- Reach in the built site: the folded privacy block is on 108 pages; the grouped link block on
  1,227 (research project pages carry it without the disclaimer; `/research/` grew 14 px).
- `node platform/pages/check.mjs`: publishable, 11,738 pages, no dead links.
- `WIDTH=320,390 SAMPLE=120 node platform/pages/sideways.mjs`: none scroll sideways.
- Contrast: `contrast.mjs` could not run (no axe-core in the container). The new group headings
  are #eef2f8 on the band's #0b1626 (the same pair as the band's existing h2s); links keep #a8c7f0.

## Still weakest, and what I would do next

1. **The link block is now the largest part (461 px at 390).** The Project column has 8 links;
   "Engineering status", "Development dashboard" and "Daily brief" are for people following the
   build, not tool users. Moving them to one "Build in the open" link on About would make the 2×2
   rows even (6 and 5) and save ~80 px.
2. **The disclaimer paragraphs are 427 px.** They are the playbook's text and stay open; the only
   lever is type (14 px instead of 16 px in the band, as the link block already uses), which would
   save ~60 px. A judgement call on readability of legal text; I left it.
3. **Pages with their own footers** (`/writing/`, `/research/`, tool pages) don't use this block.
   Tool pages' footers weren't measured this run.
4. **`contrast.mjs` needs axe-core**, which no cloud session has; a run that can `npm i axe-core`
   into a scratch dir should rerun it over the hub and a category page.
