# CI performance pass (2026-11-02): agent-permission-harness regressed to 31 s

Follow-up to `ci-perf-2026-10-24.md`, which took `harness.py` from 54.7 s to
4.5 s by indexing the tree once.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25` (546 jobs, 2026-11-02
03:12 to 04:06 UTC): `agent-permission-harness CI` was 37 jobs, 103.7
job-minutes, median 205 s, third largest workflow; its `unittest discover`
step alone was 64.2 min.

## Profile

`python3 -m cProfile -o out harness.py` (cloud container): 31 s wall, 30 s user.
One list comprehension, `_expand_prompt_path`'s bare-filename branch, took 61
of 65 profiled seconds: for each of ~2,900 specs it ran
`[f for f in index if f.rsplit("/", 1)[-1] == name]` over the ~47,000-file
index, i.e. 138 million `rsplit` calls. The tree has grown since 4.5 s, and
the scan was per spec, so the cost is specs x files.

## Change

`_by_basename(index)` builds basename -> files once per index object (memo
keyed by `id` and holding the list, so a reused `id` cannot return another
list's map). The branch is now a dict lookup; order is index order, as before.

## Verification

| Check | Result |
|---|---|
| `harness.py` wall time | 30.9 s -> **2.5 s** |
| `harness.py` and `--json` output | byte-identical (`cmp`) |
| `unittest discover -p 'test_*.py'` | 94 tests OK in 13.5 s (was over 60 s for the module here); one new test pins the table against the linear scan and the reused-list case |
| `check_results_current.py` | exit 0 |

Expected CI effect: the unit-test step and the two `harness.py` runs drop from
about 3.4 min median to well under 1 min, about 70 of 690 job-minutes in the
window. Re-run `ci_profile.py` after a day of merges.

## Not changed, ranked

1. `Portfolio Pages` "Test the site builder" is still the largest step (172.6
   min of 690 in the window); see `pages-test-perf-*` notes.
2. Checkout is 116 of 690 job-minutes (17%); small guards still spend 45 to
   77% of their job in checkout.
3. `Portfolio validate` 115.8 min over 49 jobs.
