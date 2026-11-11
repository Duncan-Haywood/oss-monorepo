---
kind: polish
topics: [design, platform]
date: 2026-11-11
---
# Polish 2026-11-11: every site-owned count grouped ("1,073", not "1073")

## Why this item

Screenshots of the hub, wall-framing-takeoff, /research/, /stories/ and /writing/ at 390 px and
1280 px (local build of e0670d57). No sideways scroll on any. The visible weakness that repeated
across the front-door pages was number formatting: /research/'s stat row read "1073 research
projects" beside "8,985 unit tests"; the hub said "Search 1338 tools and 1073 research projects";
/writing/'s chip said "All 3591". The research tests total went through Python's `:,`; every other
count was a raw interpolation. One shared fix, many pages.

## What changed

- `platform/pages/count.mjs`: `formatCount(n)` (en-US grouping; a non-number passes through as
  text), `UNGROUPED_COUNT` (the pattern), `ungroupedCounts(html)` (visible text + title + meta
  description, scripts/styles/comments dropped), `SITE_COUNT_PAGES` (the seven pages checked).
- Callers: `build.mjs` (hub search label, stat tiles, meta description, all-tools page, category
  counts, guides and compare counts, About page boilerplate, feedback page, llms.txt, manifest
  footer), `home.mjs`, `writing.mjs` (chips, count line, the client-side filter count),
  `engineering.mjs`, `assistant.mjs`, `offline.mjs`, `research/_homepage/build.py` (PROJECT_COUNT
  and the share description).
- `showcase.mjs`: the hub count-up animation ends on `toLocaleString('en-US')`. It already parsed
  with `replace(/[^0-9]/g, '')`, so a grouped start value reads correctly.
- `check.mjs`: fails the build when a page in `SITE_COUNT_PAGES` carries an ungrouped four-digit
  count. It caught two lines this run missed on the first pass (/guides/ "1161 pages across", and
  the matching /compare/ line), which is the point of having it.

## Measured

`ungroupedCounts` over marisstella.app before (live, 2026-11-11) and the local build after:
hub 6 → 0, research 5 → 0, about 5 → 0, /c/ 3 → 0, engineering 3 → 0, writing 2 → 0, guides 2 → 0.
`node --test` on home, writing, engineering, assistant, offline, showcase, check and count tests:
192/192 pass. Full `check.mjs` on the rebuilt dist: see the run record's notes.

## Still weakest, and what I would do next

1. **Tool pages are not covered.** The check is limited to site-owned indexes because tool pages
   are full of form numbers, CPT codes and prices the pattern would misread. A tool-page sweep
   would need a per-noun allowlist; probably low value, most tool counts are under 1,000.
2. **Hub hero copy on a phone.** At 390 px the lede under the headline is about 13 lines before the
   search box. A shorter lede (the last two sentences repeat what the eyebrow says) would bring the
   search box above the fold. Editorial, so measure first: where does the fold land now?
3. **/guides/ still lists "Free … checker" pages** (`sales-agent` cold-email checkers,
   `shift-roster-builder` template): second entry points, not guides. Carried over from
   `polish-2026-11-11-guides-not-guides.md`.
4. Carried over: `--min-a11y=100` in the nightly browser checks (control plane, own PR).
