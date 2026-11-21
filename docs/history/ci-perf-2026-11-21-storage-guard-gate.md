# Storage-guard checker: 4.1 s -> 2.6 s, its tests 6.2 s -> 3.7 s (2026-11-21)

Perf track, prompt 0. This was item 5 of the "not changed" list in
`ci-perf-2026-11-21-payment-keys-gates-and-walk.md`. Portfolio Validate runs
two steps on every PR: "Check usage.mjs never reads localStorage outside try"
(`python3 platform/ci/check_storage_guard.py`) and "Storage-guard checker unit
tests" (`python3 -m unittest test_check_storage_guard`).

## Reading (before)

Warm cache, this container, three runs each with bash `time`:

| step | before | after |
|---|---|---|
| `check_storage_guard.py` (text checks + node contract) | 4.15, 4.14, 3.99 s | 2.60, 2.56, 2.54 s |
| `check_tree(ventures)` alone (in-process) | 3.26, 3.30, 3.16 s | 1.69, 1.71, 1.74 s |
| `unittest test_check_storage_guard` (46 tests) | 6.23, 6.01, 6.24 s | 3.70, 3.70, 3.77 s |

The first, cold-cache test run took 10.7 s; CI runners start cold too.

## Profile

`cProfile` of `check_tree` (4.6 s under the profiler): `re.Pattern.sub`
took 1.37 s self (1.81 s cumulative) in 44k calls, all from `_strip`, the
comment/string blanker. Of the 7,116 scripts the checker reads (8,699 page
files, HTML split into scripts), only 531 contain the word `localStorage`.
`default_param_reads` and `bare_storage_args` already returned early on the
other 6,585, but `unguarded_typeof` and `inline_reads` stripped every script
before asking `unguarded_reads`, which then returned `()` because the word was
absent. Next: `sorted(Path(root).rglob("*"))` sorted all 34k entries of the
tree as `Path` objects (300k `__lt__` calls, about 0.3 s) to keep 8.7k.

In the tests, `test_repo_is_clean` runs `main` on the real tree (text checks
plus the node contract), and `test_default_root_is_the_ventures_dir_and_not_empty`
stubbed `check_tree` but still ran the real 0.8 s contract a second time.

## Change

1. `unguarded_typeof` and `inline_reads` return `[]` when `"localStorage"`
   is not in the source. Both only report lines that `unguarded_reads`
   returns, and that returns `()` for such sources, so the answer is the same.
2. `_strip`'s block-comment blanker splits on newlines and rebuilds with
   spaces instead of running a nested `re.sub("[^\n]", " ")` per comment.
3. `_pages` walks with `os.walk`, prunes `node_modules`/`dist`/`.git`,
   filters names by `os.path.splitext` (the same rule as `Path.suffix`) before
   building a `Path`, and sorts only the kept paths. Same set, same order.
4. The default-root test stubs `run_contract` as well, and now asserts the
   contract is given the same root as the text checks. The real contract on
   the real tree still runs in `test_repo_is_clean` and in the workflow step.

## Verification

- An equivalence dump (`/tmp/claude-0/dump.py`, kept below as a recipe) wrote,
  for every page file: `bare_storage_args`; for every script in it:
  `default_param_reads`, `unguarded_typeof`, `inline_reads`,
  `unguarded_reads` and `_strip` output; for every 7th file, the same four
  checks on a mutated copy (first `try` broken, a bare default parameter and
  `typeof localStorage` appended) so positives are exercised; and for each
  `usage.mjs`, `unguarded_reads` and `unshaped_parses`. 18,219 records,
  `cmp` byte-identical before and after.
- `python3 -m unittest test_check_storage_guard`: 46 tests OK.
- `python3 platform/ci/check_storage_guard.py`: exit 0, "usage.mjs contract:
  1308 files OK (73 of another design skipped)", the same line as before.

Recipe: iterate `_pages(ventures)`, read each, append the outputs above to a
list, `json.dump` it; run on `main` and on the branch; `cmp`.

## Not changed, ranked for the next run

1. **`_unguarded_reads`** (0.4 s self over 1,760 calls): the brace walk on
   the 531 scripts that use storage. It is already a token `finditer`; the
   remaining cost is real work.
2. **`script_sources`** (0.26 s): the `<script>` regex over 8.7k pages. A
   `"<script" in src` gate would not help much: almost every page has one.
3. **`_DEFAULT_PARAM`** (0.15 s on 531 scripts): a backtracking pattern with
   nested groups. A literal pre-gate on `= localStorage`/`=localStorage`
   spellings would need care with `window.`/`globalThis.`/`self.` prefixes.
4. **The node contract** (0.8 s): imports 1,308 modules. It runs once in the
   workflow step and once in the tests; sharing would mean the tests trust a
   cache.
