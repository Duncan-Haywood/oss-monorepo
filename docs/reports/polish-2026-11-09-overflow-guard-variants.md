---
kind: polish
date: 2026-11-09
tagged: auto
---
# Polish 2026-11-09: the hand-pasted overflow guard is two texts, and cannot move into shared chrome as is

**Checked.** The 2026-11-07 note proposed moving the `mobile-overflow-guard` snippet into `pf-chrome.css`. Counting the copies under `ventures/`: 31 use a long form, 29 a short form, nothing else (60 pages; the other matches are build.mjs and docs).

**Finding.** Both forms set `table{display:block;overflow-x:auto;max-width:100%}`, which changes how a table lays out. `build.mjs` already carries the layout-neutral subset (`table{position:relative}`, `pre`, form controls) and left this out on purpose. Putting `display:block` on every table site-wide would restyle tables on ~440 pages and needs a full visual diff, not a blind edit.

**Change.** `platform/pages/overflow-guard-variants.test.mjs` fails if a third variant appears, so the copies cannot drift while the migration waits.

**Next.** Build the site, screenshot ten table-heavy pages with and without `display:block` tables, and if the diff is clean, move the rule into `pf-chrome.css` and delete the 60 copies. Not measured here: no ranking or traffic claim.
