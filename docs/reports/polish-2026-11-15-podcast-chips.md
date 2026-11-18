---
kind: polish
topics: [design, accessibility]
date: 2026-11-15
---
# Polish 2026-11-15: podcast topic chips crushed by the blog's phone chip row

Track: polish/0. Full site build, served `dist/`, Playwright screenshots of hub, a flagship
(wall-framing-takeoff), research, stories, blog and podcast at 390 and 1280 px. The podcast
index was the worst: its topic nav, the first thing under the header, had 105 px tall pills
running off the screen. Open PRs searched (`polish`, `podcast` in titles): none touched it.

## Cause

PR #16098 (`polish-2026-11-15-chip-row.md`) added a `max-width:639px` block to
`platform/pages/writing.mjs` making `.chips` nowrap and scrollable, but only gave
`.chips button` `flex:none; white-space:nowrap`. The podcast index (`podcast.mjs`, rendered in
the writing shell) uses `<nav class="chips"><a class="tag">`, so its links shrank and wrapped
internally. That report's "still weakest" item 1 had flagged the podcast nav as wrapping the
old way; it was already broken in a new way by that PR.

## Measured (production build in `dist/`, the CSS change patched in, Playwright 390x844)

| page | row height before | after | tallest chip before | after |
|---|---|---|---|---|
| writing/podcast/ | 117 | 40 | 105 | 32 |
| writing/ | 40 | 40 | 32 | 32 |
| writing/agents/ | 40 | 40 | 32 | 32 |

Other pages with `class="chips"` (research/, open-house-plans/, ats-resume-checker/) carry their
own styles and were unaffected (research: 33 px row; open-house-plans wraps at 111 px by design,
six filter buttons). Screenshots: `docs/reports/img/polish-podcast-chips-before-390.png`,
`-after-390.png`. Hub stat tiles in a screenshot read 692/43/140/692 — that is the count-up
animation caught mid-run, not a bug (the HTML says 1,079/67/219/1,080).

## Changed

- `writing.mjs` phone block: `.chips > * { flex:none; white-space:nowrap; min-height:32px }` and
  `.chips > a { display:inline-flex; align-items:center; margin:0 }`.
- `writing.test.mjs`: asserts both rules.

## Still weakest, and what I would do next

1. **The podcast row has no edge fade.** The fade script lives in the blog finder only; the cut-off
   chip at the right edge is the only cue. Moving `fade()` into a small shared chip-row script
   (used by both pages) would finish the shared-component idea from the last report.
2. **A sweep check for crushed controls**: in `browser_checks.py`, flag any element in a
   `nowrap` flex row whose height is more than twice its row's line height at 390 px. It would
   have caught this before merge.
3. Carried over: Tools and projects is still about half of the blog.
4. Wall Framing Takeoff's breadcrumb ends in the full `<title>` ("— free, private, in your
   browser") rather than the tool name; check how other tools' breadcrumbs pick their last crumb.
