# CI perf, 2026-11-27: `check_py311_syntax.py` reads the C tokenizer's tuples

Perf track run (`prompts/perf/prompt-0.md`). Target: the largest single item in
the unwired tree checks that `ventures tests` runs on every venture pull request
(item 1 of "Not changed" in `ci-perf-2026-11-26-unwired-tree-scan-once.md`).

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --steps 30` (435 jobs,
2026-11-27 04:10 to 04:40 UTC): `ventures tests / changed-ventures`, step
"node --test in each touched venture", 22 runs, **45.5 job-minutes, 89 s
median**, the heaviest step in the pool. One job's log (140310189942, 100 s
step) splits it: the 11 touched venture suites finished in 28 s; the remaining
**72 s was the 307 unwired tree checks and tests** (04:24:56 to 04:26:08).

Earlier perf candidates checked first and set aside: the bet #1 front doors
(`pay-app-guides` 10 kB gz of modules and a 4.8 s suite,
`lien-waiver-checker` 7 kB, `mechanics-lien-deadline-calculator` 11 kB,
`retainage-cashflow-calculator` 8 kB) have nothing a visitor waits on; the
largest checkout shares are `priv-*` workflows.

## Profile

`python3.12 -m cProfile -s tottime platform/ci/check_py311_syntax.py`, 4-core
cloud container, Python 3.12.3 (CI's version): 9.19 M tokens over 5,490 of
the 10,906 tracked `.py` files (the others have no f-string and are skipped).

- `tokenize.py:_generate_tokens_from_c_tokenizer`: 6.0 s self.
- `TokenInfo._make` (namedtuple per token): 4.8 s self, 6.9 s cumulative.
- `__new__`: 1.4 s.

So about 60% of the run was the Python generator wrapping each C tuple in a
`TokenInfo`, not the tokenizer.

## Change

`problems()` now gets its tokens from `_tokens(src)`, which reads
`_tokenize.TokenizerIter(readline, extra_tokens=True)` directly. That is the
exact iterator `tokenize.generate_tokens(readline)` wraps in 3.12, 3.13 and
3.14 (`generate_tokens` is `_generate_tokens_from_c_tokenizer(readline,
extra_tokens=True)`, which yields `TokenInfo._make(info)` per tuple), so the
tuples are the same. The loop unpacks `(type, string, start, end, line)` by
position. `_tokenize` is private, so `_tokens` falls back to the public API
when the import fails, the call's signature changes or the call raises; a file
that does not tokenize therefore still reports tokenize's own `TokenError`
text. No rule, input or message changed.

## Verification

- Token lists, fast vs public, on all 10,906 tracked files: 0 differ under
  3.12.3 and under 3.13.18; the fast path raised on none.
- `problems()` from main's copy vs this one on 1,514 sources (the test
  fixtures, each BAD snippet grafted into 300 random tracked files at a random
  line, and 300 truncated files, many untokenizable): 1,156 flagged by the old
  copy, **0 differ**, and `apply_fixes` output equal on every fixable one.
- `check_py311_syntax.py` output on the tree, main vs this branch: byte
  identical (`cmp`), `ok: 10906 file(s) parse under Python 3.11 rules`.
- `test_check_py311_syntax.py`: 8 tests OK under 3.12 and 3.13 (3 new:
  fast and public tokens equal on the fixtures, five edge sources (CRLF, no
  final newline, non-ASCII, implicit concatenation with a nested format spec)
  and every 40th tracked file; `problems()` equal with the fast path patched
  out; an untokenizable file keeps the public message). Under 3.11 the
  tokenizer tests skip as before. Mutation check: passing
  `extra_tokens=False` to the fast path fails 3 tests.

## Numbers

`time python3.12 platform/ci/check_py311_syntax.py`, same container, warm:

| | run 1 | run 2 | run 3 |
|---|---:|---:|---:|
| before (main) | 10.08 s | 9.91 s | 10.10 s |
| after | 6.82 s | 6.30 s | 6.91 s |

About 3.4 s (34%) off the item here. Of the 6.8 s left under cProfile, 3.9 s
is the C tokenizer itself, 0.9 s the loop in `problems()` and 0.7 s the
f-string prefix regex. The unwired pool runs 6 items at once and its wall
clock is set by total work and its longest items, so the saving on the
ventures-tests step is likely a couple of seconds, not the full 3.4 s (the
runner took about twice this container's time for the same pool on
2026-11-26). The next `ci_profile.py --steps` reading will say.

## Not changed, ranked for the next run

1. **The 72 s unwired pool as a whole.** Nothing records per-item times on
   Actions. Printing each item's seconds in the `--since` summary (or saving
   them like `venture_suite_times.json`) would let the next run rank from CI
   rather than from this container.
2. **`check_insecure_refs.py` and `check_tag_balance.py`**, 4.3 s and 4.1 s
   here, each running `HTMLParser` over about 4,550 pages. A shared parse would
   halve them; the insecure-refs prefilter stays declined for the reason in
   `ci-perf-2026-11-26-unwired-tree-scan-once.md`.
3. **A prefilter for `check_py311_syntax.py`**: a file needs tokenizing only
   if an f-string holds a quote, backslash, `#` or line break inside braces.
   An `ast`-based filter could find those, but byte-offset columns and nested
   format specs make it easy to get wrong; the tokenizer is now 3.9 s.
4. CodeQL, Security gate and CI policy checkouts remain the pool's largest
   consumers and are `priv-*`.
