# Research homepage build: a quadratic sentence check, and three serial test builds (2026-11-20)

Perf track. Picked from the "not changed" list in
`ci-perf-2026-11-20-unwired-orphans-and-fetch.md`, item 2:
`platform/ci/test_research_homepage_publish.py` was the longest item in the
unwired-checks pool (16.9 s serial, 23.6 s pooled).

## Reading

- `python3 research/_homepage/build.py --out <dir>`: 5.7 s wall (one run;
  4.9 / 5.1 / 5.7 s on three later runs of `main`'s code on the same box).
- `python3 -m unittest test_research_homepage_publish` (from `platform/ci`):
  24.1 s, 20 tests. The module builds the site three times, one after another
  (bare, with `--base-url`, with `--base-url --site-chrome`).
- `python3 -m cProfile -s tottime` of the build: `summary_paragraphs` 1.47 s
  own time, plus 1.28 s in `re.Pattern.search` called from it (16,688 calls).

## Cause

`summary_paragraphs` walks a summary character by character. At every space
outside tags and parentheses it did `before = s[:i].rstrip()` and
`_ABBREV.search(before)`. `_ABBREV` ends in `\.$` but is not anchored at the
start, so each search scanned the whole prefix: quadratic in the summary
length, and summaries grow by a milestone per run (research/cell-fidelity's
is 6,894 words). `short_lede` did the same with `lede[:i]`.

## Change

1. `research/_homepage/build.py`: the sentence-end check reads the text in
   place: `s.endswith(_ENDS, 0, j)` and `_ABBREV.search(s, max(0, j - 16), j)`,
   where `j` is `i` with trailing whitespace stepped over. A match of
   `_ABBREV` is at most 8 characters and must end at `j`, and with `pos`
   Python's `\b` still looks at the character before `pos` (checked:
   `_ABBREV.search("xe.g.", 1)` is `None`), so it is the same search.
   Same for `short_lede`.
2. The `<br` test runs only on a `<` (2.4 M `startswith` calls before).
3. `summary_html` keeps each summary's paragraphs: a project page and its
   topic card split the same summary (2,160 calls for 1,080 projects).
4. `test_research_homepage_publish.py`: the three builds start together on
   first use (`builds()`), and the classes read the one they need. No test
   or assertion changed; all 20 still run.

## Verification

- `diff -r` of the full build output before and after: identical (1,080
  projects, 31 topics).
- `test_research_homepage_publish` and `test_research_summary_paragraphs`
  pass (38 tests).

## After

- Build: 3.3 / 3.6 / 4.0 s wall (from 4.9 / 5.1 / 5.7 s the same session,
  `main`'s code, alternating runs). About 30% less; every Pages build and
  research-CI run pays it once.
- Test module: 24.1 s -> 5.7 / 6.4 s (two runs).

The box is noisy (4 cores, shared); the numbers are wall time of one-off
runs with `time`, not medians of many.

## Not changed, ranked for the next run

1. **`log_html` renders every log body twice**, once to count words
   (`inline_md(t)` without a slug) and once to print it (with the slug). The
   two differ for relative links, so sharing one needs care: about 0.4 s.
2. **`summary_paragraphs`' per-character loop** is still about 1 s of own
   time; a regex jump to the next interesting character (`<`, `(`, `)`, space)
   would cut most of it.
3. **`_words(s[start:k])` in the greedy split and `_words(lede[:k])` in
   `short_lede`** recount from the start for each cut; a running count would
   remove the last quadratic term.
