# Research homepage build, second pass (2026-11-20)

Perf track. I worked through the "not changed" list in
`research-homepage-perf-2026-11-20.md`, which landed earlier the same day,
plus one cost a fresh profile turned up.

## Reading

`python3 -m cProfile -o` of `research/_homepage/build.py --out <dir>` on
`main` (b52c2896c), warm file cache, 4.9 s under the profiler:

| function | cumulative s | note |
|---|---:|---|
| `log_html` | 1.48 | 1,080 projects, 39 with a LOG.md |
| `md_spans` (38,263 calls) | 1.24 | 291,884 `re.Pattern.sub` calls, 1.0 s own time |
| `summary_paragraphs` | 0.69 | 0.47 s own time in the per-character loop |
| `short_lede` (8,619 calls) | 0.46 | for 1,080 distinct ledes |

Wall and CPU, `time` (bash builtin), three alternating runs of the old and
new file on the same box:

| | real s | user s |
|---|---|---|
| before | 3.78 / 3.81 / 3.78 | 2.72 / 2.99 / 3.01 |
| after | 2.95 / 2.75 / 2.38 | 2.12 / 1.94 / 1.69 |

Five more alternating wall-clock runs: before 2.94 / 4.35 / 4.23 / 3.79 / 3.85 s
(median 3.85), after 2.46 / 3.26 / 2.95 / 3.03 / 3.07 s (median 3.03). The box
has 4 shared cores, so the numbers are noisy. User CPU dropped by about 30%.

## Changes (all in `research/_homepage/build.py`)

1. **`log_html` renders each body line once.** Before, it rendered every
   line twice: once without the slug to count words, once with it for the
   page. The two renderings differ only through `LINK`, which needs `](` in
   the text, so the word count reuses the page rendering for any line
   without `](`. Lines that have one still get the slug-less render, which
   keeps the fold point exactly where it was. A plain relative link counts
   differently in the two renderings ("draft." versus "draft ."), so
   sharing the render for those lines would have moved some folds.
2. **`md_spans` skips any pass whose marker is absent.** `ENTITY` needs
   `&amp;`, `CODE` needs a backtick, `STRONG` needs `**`, `EM` needs `*`,
   `LINK` needs `](`, and the placeholder restore needs at least one code
   span. A pattern can't match without its marker, so the output is the
   same. `sub` calls went from 291,884 to 79,570.
3. **`short_lede` is memoised** on `(lede, limit)`. Each lede is cut on its
   own page and again on up to about eight neighbour cards.
4. **`summary_paragraphs` jumps to the next `<`, `(`, `)` or space** with a
   regex. The characters it skips only affect `prev_end`, and any
   non-whitespace character clears it, so `not s[i:k].isspace()` gives the
   same state.

## Verification

- `diff -r` of the full build output, before against after: identical
  (1,080 projects, 31 topics).
- A differential fuzz in the scratchpad (not committed) ran the old module
  from `git show HEAD:` against the new one on 30,000 random token strings.
  The strings mixed milestone markers, abbreviations, `<br>`, inline tags,
  parentheses, entities, code spans, emphasis and both link kinds, and each
  went through `summary_paragraphs`, `short_lede`, `md_spans` and
  `inline_md` at several limits: 0 mismatches. A second fuzz monkeypatched
  `read_log` and compared `log_html` on 3,000 random logs with relative,
  absolute and `../` links: 0 mismatches.
- `test_research_homepage_publish`, `test_research_summary_paragraphs` and
  `test_research_md_spans` all pass (43 tests, 3.9 s).

## Not changed, ranked for the next run

1. **`third_party_imports`**, 0.67 s: it reads every `.py` file of every
   project to find imports. A cache keyed on file mtime would work, but the
   build runs on fresh CI checkouts, so it would help only local reruns.
2. **`io.open` / `read_text`**, about 13,300 opens: 0.1 s warm and up to
   5 s on a cold page cache (the first profile of this session). Most come
   from `slug_files` / `test_count` walking each project's test files. The
   cost is in the I/O, not in the Python.
3. **`summary_paragraphs`' greedy split** still recounts `_words(s[start:k])`
   from the paragraph start at each cut. A running count would remove it,
   but it is now under 0.1 s.
4. **`plain()`** (49,918 calls, 0.23 s): its `re.sub` plus `html.unescape`
   could get the same marker-guard fast path as `md_spans`.
