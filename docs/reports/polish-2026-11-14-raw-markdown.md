---
kind: polish
topics: [design, seo]
date: 2026-11-14
---
# Polish 2026-11-14: Markdown shown as source text

Picked from `polish-2026-11-14-footer-link-contrast.md`, item 1 ("related-project cards on research
pages show raw markup"). That item had already been fixed by PR #15883 (the cards render `<em>`
now), so the run widened it to the whole site: which built pages show `code`, *emphasis* or
`[text](path)` as raw text?

## Measured

`platform/pages/raw-markdown.mjs` cuts each built page to its visible text (no script, style,
code, pre, svg, math, textarea, kbd, samp or comments) and looks for a backtick pair around a word,
asterisks around a word, and link syntax.

- **Before:** 25 pages flagged on the 2026-11-14 build (the first version of the pattern), plus the
  secretary-problem post (one-letter emphasis) and a table in the folder-name post found by hand.
- **After:** 1 page, `engineering/`, which lists commit titles as GitHub shows them and is exempt.
- `node platform/pages/check.mjs`: publishable, 9,743 pages, exit 0 with the new pass.
- Screenshot: `img/polish-2026-11-14-raw-md-curl-post-after.png` (390 px, the curl post's dek now
  sets `curl | bash` in code; before, it showed the backticks).

## Causes and fixes

| Cause | Fix |
|---|---|
| Post `description` went through `esc()` only (dek, blog cards, page-N indexes) | `writing.mjs`: `description` is now plain (backticks removed) for meta, feeds, JSON-LD, posts.json; `descriptionHtml` keeps `<code>` for the dek and cards |
| Double-backtick code spans unread (`devlog/markdown.mjs`, research `build.py`) | backtick run closed by a run of the same length, one space trimmed (CommonMark) |
| `\|` in a table cell split the cell (four red-team posts) | `cells()` splits on unescaped pipes, then unescapes |
| `1/*e*`, `Deira/*de ira*` not emphasised | `EM_OPEN` also opens after `/` and an opening quote; not before `.`, so `path/*.md` stays literal |
| Research log relative links left raw (sensing-selfcal, marriage-divorce-evidence) | `inline_md(text, slug)` links to the file under `research/<slug>/` on GitHub; with no slug (homepage cards, already inside an `<a>`) it shows the label only |
| Custom-development request `next` notes (`python3 ...` in backticks) | rendered through `descriptionHtml` |
| Hand-written copy | terraform checker titles (quotes, since `<title>` can't format), codeowners, env-example, pinned-actions, vscode guide, translator comparison, Lab summaries |

Tests: `platform/pages/raw-markdown.test.mjs` (detector, renderer and description cases, including
what must stay plain: `a*b`, `5 * 3`, `η*=0.25`, globs, `[1]`) and
`platform/ci/test_research_md_spans.py` (research links and code runs).

## Still weakest, and what I would do next

1. **The detector does not see table cells that start with a pipe-adjacent backtick run** or a
   span longer than 60 characters; widen it if a later sweep finds misses.
2. **Plain-text formulas on research pages** (`sum_{l>j}`, `e^{j2 pi f tau}` in aerolog-scaling,
   verified-dse, sim2real-inference, capture-sync logs): readable but ugly. Wrapping them in code
   in the LOG.md sources, or a `<sub>`/`<sup>` pass, would read better. Editorial, per project.
3. **The engineering page shows commit titles with raw `*emphasis*`.** On purpose today (as GitHub
   shows them); rendering emphasis there (`entities: false` path) is a one-line choice.
4. Carried over: `contrast.mjs` fallback without axe-core; answer leads on ~22 high-intent tools;
   149 cut selects at 1,280 px; blog post meta row spacing at 1,280 px.
