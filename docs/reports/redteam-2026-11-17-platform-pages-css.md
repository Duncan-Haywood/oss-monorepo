---
kind: note
date: 2026-11-17
topics: [redteam, ci]
---
# platform/pages CSS mutants and the selector lint (redteam, 2026-11-17)

**What changed.** `platform/pages/css-lint.mjs` now has `badSelectors(css)`, which flags a style rule's
selector that no browser parses (a comparison such as `>=` or `<`, a lone `-` or `/` combinator, an empty
list entry). `unitlessLengths` now also covers the `border`, `outline` and `column-rule` shorthands.
`css-lint.test.mjs` runs both over every page and stylesheet in the tree and over every
`const *_CSS` / `*STYLE*` template literal in `platform/pages`. All were clean on the first run.
`styleBlocks()` now drops `<script>` bodies first: before, it read a `"<style>"` string in
`ventures/csshound/index.html` as CSS.

**Measurement note for the next red-team run.** `redteam.py` measures a `platform/pages/<x>.mjs` target
with `<x>.test.mjs` only. CI (portfolio-pages, `node --test "*.test.mjs"` in `platform/pages`) also runs
`css-lint.test.mjs`, which scans every module's CSS. So a unitless-length mutant in any module's stylesheet
is caught in CI but reads as escaped in a campaign. On 2026-11-17, 3 of the 6 escapes on `stories.mjs` were
of this kind. The quick fix used here: the page's own test lints its rendered CSS
(`stories.test.mjs`, "the page stylesheet has no declaration or selector a browser silently drops"). The same
three lines will also help any other page module that has a test file. The class fix is for `suite_for` in
`prompts/redteam.py` to add `platform/pages/css-lint.test.mjs` to a `platform/pages/*.mjs` target's suite,
like the 2026-11-15 usage-contract patch does for `usage.mjs`. That file is control plane, so the change
needs its own PR.

**Real defect fixed.** All three Hearth & Horizon shelves on `/stories/` linked to the bare
`hearth-and-horizon/` index, so the Little Lamps and For Other Minds links opened 336 stories above their
shelf. Each shelf now links to `hearth-and-horizon/#<shelf id>`.
