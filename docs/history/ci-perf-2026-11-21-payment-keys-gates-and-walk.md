# Payment-key check: gated literals and a pruned walk (2026-11-21, perf run)

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --steps 30` (300 runs,
2026-11-21 19:46 to 20:53 UTC): in Portfolio validate, "Payment-account
checker unit tests" (3.1 job-min over 20 jobs, median 10 s) and "Check no
venture hardcodes a payment account" (1.7 job-min, median 5 s) were among
the largest steps. The perf backlog's two open items (P063, P064) both
touch `.github/` paths in CODEOWNERS, so neither could land in a run.

On 2026-11-04 the same guard was cut to 1.15 s with a literal prefilter
(`ci-perf-2026-11-04-payment-keys-literal-prefilter.md`). Since then it
has gained eight literals (merchant-of-record links and keys, PayPal
links), two more trees (`platform/`, `docs/`) and a lowercase pass, and
had drifted back to 5.2 s.

## Profile

`python3 -m cProfile -m unittest test_check_payment_keys` (15.9 s profiled):

- 4.5 s in the literal list comprehension: eleven `needle in lowered`
  tests, each one full pass over every file. The scanned trees hold
  42,400 text files, about 410 MB.
- 5.3 s in `Path.resolve()`, called on every file to compare against the
  guard's own test file.
- about 1 s in `rglob` plus `relative_to().parts` per file, and building a
  `Path` per file.

Measured outside the profiler on one full scan: walk 0.4 s, read 0.6 s,
lowercase 0.5 s, the eleven literal passes 2.4 s (about 0.25 s each),
resolve 1.0 s.

A single alternation regex over the bytes in place of the eleven `in`
tests was tried and is 12x slower (32 s): `re` has no multi-literal
search, so it tries the alternation at every position.

## Change (`platform/ci/check_payment_keys.py`)

1. **Gates.** Five short literals (`_live_`, `polar`, `.com/`,
   `hosted_button_id`, `paddle.io/hsc_`) each sit inside one or more of
   the eleven pattern literals. A file without the gate cannot hold any
   literal behind it, so five passes decide almost every file. The four
   `.com/` literals are then tried only on the 7,400 files (110 MB) that
   contain `.com/`. The grouping is computed (`_gated`), and a test pins
   that every literal sits under a gate it contains.
2. **Resolve only what can resolve to the test file**: a file with its
   name, or a symlink.
3. **`os.scandir` walk** that never enters a skipped directory and takes
   the file type from the directory entry. Paths stay strings until a
   finding is yielded; the suffix test re-implements `Path.suffix`
   (`"..png"` has a suffix, `".png"` does not).

## Before and after

Warm page cache, 4-core container, alternating runs.

| | before | after |
|---|---|---|
| `python3 platform/ci/check_payment_keys.py` | 5.32 / 5.28 / 5.07 s | 2.38 / 2.33 / 2.39 s |
| `python3 -m unittest test_check_payment_keys` | 9.99 / 9.73 s (33 tests) | 4.62 / 4.59 s (38 tests) |

Together about 8 s off every Portfolio validate run.

## Same answers

- `findings_in` of the old module (from `HEAD`) against the new one on
  `ventures/`, `platform/` and `docs/`: identical (0 findings each).
- A differential fuzz in the scratchpad (not committed): 300 random trees
  with every pattern kind, decoys (`polar bear`, `.com/`, `_live_`,
  `sk_test_`), NUL-led files, skip-dir names as directories and as file
  names, odd suffixes (`..png`, `a.`, `.png`, `x.Gz`), symlinked files,
  symlinked directories, broken symlinks and copies named like the test
  file. 0 mismatches; 278 of the trees had findings.
- Five new unit tests pin the walk's behaviour (suffix rules, skip-dir
  file names, symlinked directories not followed, a symlink to the test
  file skipped, gate coverage). The first four also pass against the old
  module.

## Not changed, ranked for the next run

1. **The `.com/` gate** is the weakest: it matches 110 of the 410 MB. A
   gate on the raw bytes before lowercasing would need case-free
   literals, and none of these are.
2. **The lowercase pass** (0.3 s): it is needed only for the hostnames.
3. **Read** (0.6 s warm). That is I/O, and the tree is what it is.
4. **The unit tests scan the real tree twice** (`test_repo_is_clean` and
   `test_served_trees_beyond_ventures_are_scanned`), and the workflow runs
   the script a third time. Sharing one scan would save about 2 s, but the
   tests would have to trust a cache.
5. Other Portfolio validate steps of similar size: "Local workflow-runner
   unit tests" (median 10 s, 12 s locally) and "Storage-guard checker unit
   tests" (8 s locally, 7.9 s of it user CPU).
