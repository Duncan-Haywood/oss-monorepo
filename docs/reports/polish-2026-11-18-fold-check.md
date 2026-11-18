---
kind: polish
topics: [design, accessibility]
date: 2026-11-18
---
# Polish: fold-check.mjs, a browser check for "a tool on the first phone screen"

Date: 2026-11-18. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-18-audience-intros.md` ("Turn the measurement into a check"), also item 1 of
`polish-2026-11-18-audience-starting-notes.md`.

This session first made the same intro fix as PR #17145 and then the same follow-up as PR #17147;
both landed while this PR waited on CI. The branch keeps main's tree for those files (merged with
`-s ours`), and carries only what neither PR did: the check all three reports asked for.

## What changed

- `platform/pages/fold.mjs`: the rule. First tool card (`.start-grid li`, else `main .card`) must
  start by 828 px on a 390×844 screen (16 px of it visible). No card at all is a failure.
- `platform/pages/fold-check.mjs`: the browser half over every `dist/c/for-*/`. Exit 0 / 1 / 2
  per the `browser_checks.py` contract. `WIDTH`, `HEIGHT`, `ONLY_SLUGS`, `BASE_URL`, `DIST`.
- `platform/pages/fold.test.mjs`: 5 tests, including the real readings (retirees 846 fails,
  821 passes) and a fractional miss that must not print "starts at 764, needs 764".
- `platform/ci/test_browser_checks.py`: `fold-check` in `pending` beside framerate, band-gap and
  sticky-fit-check (registering it edits `browser-checks-ci.yml`, a control-plane file).
- `platform/pages/README.md`: a section beside sticky-fit-check.

## Measured (full local build of main at 1924d0e0d, Chromium)

- 390×844: 31 audience pages, all pass; deepest first card c/for-homeowners at 821 px.
- 360×780 (a smaller phone): **20 of 31 fail**; deepest c/for-homeowners at 903 px. The trade
  pages that pass at 390 (roofers 820, electricians 768) are 1 to 60 px short at 360×780.
- `ONLY_SLUGS=nope` exits 2 with a message; `ONLY_SLUGS=for-retirees` checks one page.

## Still weakest, and what I would do next

1. **360×780 is mostly a miss.** 20 of 31 pages. Copy can't fix all of it: the hero (eyebrow,
   h1 of two to four lines, lede, starting note, count line) is about 700 px before "Start here"
   at that width. A layout option: move the `starting` note below the Start here row on phones
   (it reads as advice about those tools anyway), which would lift every card by ~120 to 200 px.
   Measure with `WIDTH=360 HEIGHT=780 node platform/pages/fold-check.mjs`.
2. **Register the check.** One control-plane PR adding framerate, ask-voice-icon, band-gap,
   sticky-fit-check and fold-check to both `CHECKS` tuples and `browser-checks-ci.yml`.
3. **Three runs took the same item within an hour** (#17145, #17147, this one). Nothing claims a
   `polish_queue.py` item when a run starts; an open draft PR is the only signal, and two of the
   three opened theirs after building. Opening the draft PR before the build would have let the
   later runs see it.
4. **Five audience pages have no Start here row** (found while measuring) (childcare, ebay-sellers, etsy-sellers, photographers, pool-hot-tub).
