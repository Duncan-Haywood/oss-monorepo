# CI perf 2026-11-26: a data-only change runs only the unwired checks that read it

Perf track, version 0. The perf backlog's three items (P063, P064, P086) are
owner rows, so this run took a fresh pool reading.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-26 03:26Z to
04:07Z: 638 jobs, 800.4 job-minutes. Not counting `priv-*` workflows (owner-gated),
the biggest consumers were `Portfolio Pages` (106.5, many earlier passes),
`ventures tests` (78.3) and `Portfolio validate` (71.1, see
`ci-perf-2026-11-25-validate-sparse.md` for why its checkout stays). In
`ventures tests`, the "node --test in each touched venture" step cost 50.2 of
the 78.3 minutes. Its median was 96 s, and most runs touched no venture at all.

Why: since 2026-11-13 that step also runs `unwired_checks.run_everything()`,
every tree check and suite no workflow names (299 items). `docs/reports/**` is in
the workflow's trigger list so that `doc_index.py check` sees new agent docs.
Of the last 150 commits on `main`, **72 changed only `docs/reports/`**,
usually with a run record. Each one ran all 299 items twice, once on the PR
and once on the push to `main`. Today's earlier pass
(`ci-perf-2026-11-26-unwired-tree-scan-once.md`) had already brought the pool
close to its 4-core floor, so cutting total work was the only lever left.

## Profile: what each item reads

`strace -f -e trace=%file,execve` on every item, run the way the pool runs it,
under Python 3.12 (the CI version). I recorded each path an item opened,
probed (including ENOENT) or listed, cut to two levels (`docs/reports`,
`ventures/<slug>`, a root file's name). `ventures/*` means the item listed
`ventures/` itself, and `*` means it listed the root or ran `git`. 94 of 299
items read everything. Replaying the last 150 `main` commits against the map
(the per-item times from a warm run summed to 292 s serial):

| commits that start ventures-tests | 130 |
|---|---:|
| with code in the diff (everything runs) | 26 |
| data only | 104 |
| data only: median share of serial work still needed | 43% |
| all 130: share of serial work run | 64% |

## Change

- `platform/ci/unwired_reads.py` holds the selection rule, the `trace`
  command that regenerates the map (needs `strace`, about 10 minutes), and
  `show <paths>`, which names the items a change would run.
- `platform/ci/unwired_reads.json` is the map: 299 items, each with its
  source file's sha256.
- `unwired_checks.run_everything(changed=...)` drops the items the map shows
  reading none of the changed paths, and names them in the summary line.
  `run_venture_tests.py --since` passes the diff to it.

It fails open. Any changed path that is code runs everything: `platform/`,
`.github/`, a root file, or a `portfolio/` script. The map lives in
`platform/ci`, so a PR cannot widen its own skip list. These also run: an
item missing from the map, an item whose source hash changed since the trace,
and every item when the change list is empty or git cannot answer.

**Also fixed (found while tracing):** `unwired_checks` decided "wired" by
looking for the name anywhere in the workflow text, comments included.
`ventures-tests.yml` has the comment "The unwired tree checks
(unwired_checks.py, doc_index.py check) run from this workflow". So
`doc_index.py check` (EXTRA) and `test_unwired_checks.py` counted as wired,
and neither ran anywhere. Whole-line YAML comments are now ignored, which can
only add items to the run. Both now run, and both pass.

## Verification

- Before and after on this container (4 cores, Python 3.12):
  `run_venture_tests.py --since HEAD` with one new `docs/reports/` file. I
  timed each twice, alternating, with the map moved away for "before":

  | | run 1 | run 2 | items run |
  |---|---:|---:|---:|
  | before (no map) | 83.8 s | 78.7 s | 302 |
  | after | 36.2 s | 37.4 s | 100 |

  Both runs went red identically on one item, `test_doc_index.py`, because
  the probe file had no tags. That is the fault the trigger exists to catch.
- Seeded faults, with the map in place: a U+202E character in a new
  `docs/reports/*.md` and a malformed `docs/reports/*.json`. Red:
  `check_hidden_unicode.py`, `test_check_hidden_unicode.py`,
  `check_json_valid.py`, `check_posts.py`, `doc_index.py check` and
  `test_doc_index.py`.
- `python3.12 -m unittest test_unwired_reads test_unwired_checks
  test_run_venture_tests`: all pass (12 new tests for the rule, the trace
  parser and the drop path).
- Not measurable here: the CI job's own after number. Read it from
  `ci_profile.py` once some reports-only PRs have run. The job also
  spends about 45 s on checkout (P063), which this does not change.

## What it cannot see

The map comes from one run on the real tree. An unchanged helper whose reads
depend on data in a way that run did not exercise would be missed. This is
narrow, because the trace records failed probes as well as reads, and any
code change runs everything. As the map ages, more items fail the hash check
and run, so a stale map costs time, not coverage. When the summary line's
"not run" count shrinks, refresh it with `python3 platform/ci/unwired_reads.py
trace`.

## Not changed (ranked for the next run)

1. **The ventures-tests checkout** (about 45 s of a reports-only job): P063,
   owner-gated. The unwired items still read most of the tree.
2. **`test_check_hidden_unicode.py`**: 46 s cold, the pool's longest item on
   the first run here (5 s warm). It and `check_hidden_unicode.py` are in
   `.github/CODEOWNERS`.
3. **A venture-only diff** still runs most items, because 114 list
   `ventures/` and so read `ventures/*`. A finer key (the listing plus the
   suffixes an item filters on) could cut that, but it would need a second
   trace format.
