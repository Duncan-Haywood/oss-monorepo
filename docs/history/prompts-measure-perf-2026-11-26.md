# Perf, 2026-11-26: `promptctl.py measure` from 136 s to 13.5 s, same bytes

Perf track. The backlog had no agent-workable perf item (P063, P064 and P086
are owner rows). The runner-pool reading (600 runs) put its biggest
non-`priv-*` consumers in CodeQL, the Pages build and the security gate. The
bets' front doors are already small (cnc-machining-quote 10 kB gzip,
pay-application 18 kB after the 2026-11-25 pass), and the bet-adjacent suites
added since the 2026-11-17 timing run in 2 to 13 s. So this pass took the
slowest local step: `measure`, which every review run calls.

## Before

`python3 prompts/promptctl.py measure --no-fetch`: **136.0 s** wall (one
run; 137.6 s in another). That is after the default 14-day deepen that
`measure` runs on a shallow clone, which is the state a review session is in.
`cProfile`: 959 `git` subprocesses, 130 of 134 s idle in `poll`:

| caller | calls | seconds |
|---|---:|---:|
| `_changed_note_uncached` (per-file `git log -1 -- <path>`) | 1668 lookups, ~950 processes | 114 |
| `git ls-files '*<name>'` per bare file name in a report | 270 | 4.6 |
| `_landing_order` + the one batch `git log` index | 2 | 11.6 |

The 2026-11-10 pass (`ci-perf-2026-11-10-measure-git-log-batch.md`) added the
batch index and left about 300 per-file fallbacks as "not changed". As the run
records grew past 10,800, the fallbacks grew to 1,668: run records name
paths the index never held.

- **Files only a shallow root lists** (1,230). The index skipped shallow
  roots, because a root "adds" every file.
- **Free text in a `file` field** (401). For example
  `"prompt.md / CLAUDE.md"`, `"apps/payapps/ROADMAP.md (private)"`, or a file
  deleted before the visible history. Git names no commit for these, but it
  takes 70 to 160 ms to say so.
- **Directories** (35) and **globs** (44). Git took 0.5 to 4.3 s per glob,
  21 s in all, because it walks history matching each one.

## Change (`prompts/promptctl.py`)

1. The one `git log` pass keeps shallow-root entries in a second index
   (`_edge_change_index`). It is used only when the main index misses, which
   is when the per-file call would answer with that root.
2. `_index_hit` answers the other three kinds from the same pass. A directory
   gets the first indexed path under its prefix, and a `*`/`?` glob gets the
   first `fnmatch` match (git's pathspec `*` crosses `/`, as `fnmatch`'s does).
   The dict keeps git's log order, so the first match is the newest commit. A
   path that does not exist and is not indexed gets "no commit". Pathspec
   magic (`[`, `\`, a leading `:`) and untracked files still go to git.
3. One `git ls-files` builds a base-name map in place of 270
   `git ls-files '*<name>'` calls. The tokens hold no glob characters, so it
   gives the same lists.
4. `measure()` loads the 10,800 records once, not twice (about 1 s).
5. The batch `git log` now passes `--diff-merges=c --no-renames`. A full
   comparison found the old index already differed from the per-file call on
   4 paths, and my first version on 5. Two causes: a plain `--name-only` log
   lists no files for a merge, but `git log -1 -- path` can stop at one; and
   rename detection lists only a rename's new name
   (`.github/workflows/portfolio-pages.yml` was renamed `priv-…` in #18725).
   With both flags the index matches git on every path. Cost: 0.3 s.

The `prompts` suite also lost 1.5 s in `test_redteam`. The child-kill test
used a 2 s suite timeout and then slept 0.5 s. It now uses a 1 s timeout and
polls for the child's death for up to 2 s.

## Verification

- **Same output.** `measure --no-fetch` before and after: `cmp`-identical,
  396,010 bytes, on the same clone and the same commit.
- **Same answer per path.** A scratch script asked both
  `_changed_note(path)` (new) and `_changed_note_uncached(path)` (git per
  file) for all 1,822 paths `measure` dates: every friction `file` and every
  repo path a report names. Result: 0 differences, after the flags in change 5
  fixed the 5 it found first.
- **Pinned.** The new test
  `LastChangeIndexTest.test_lookups_without_a_git_call_match_the_per_file_call`
  compares one directory, one free-text field, one glob and one shallow-root
  file with git, plus the base-name map with `git ls-files`. It runs in 0.3 s.
  A glob that matches nothing is only asserted, because git walks all history
  for it (5 s).
- **The kill guard still bites.** With `os.killpg` swapped for a parent-only
  `os.kill`, the child-kill test hangs in `communicate()` (the orphan holds
  the pipes) instead of passing.
- `python3 -m unittest discover -s prompts`: 159 tests OK.
  `promptctl.py validate`: ok.

## After

| | before | after |
|---|---:|---:|
| `measure --no-fetch` wall | 136.0 s | **13.1, 13.8, 13.6 s** (−90%) |
| git subprocesses | 959 | 6 |
| `measure --json --no-fetch` | (not taken) | 7.7 s |
| `unittest discover -s prompts`, same clone | 36.9, 36.6 s | **29.9, 29.3 s** |

All figures are from this cloud container, one job at a time, after the
deepen. CI's `prompts-ci.yml` clones with `fetch-depth: 2`, where every `git
log` is cheap, so the CI gain is small: mostly the 1.5 s redteam test.

## Not changed, ranked for the next run

1. **`_landing_order`: 6.4 s** of the remaining 13.5 s. It runs
   `git log --diff-filter=A --name-only -- prompts/runs` on the deepened
   history, and `route` pays it too (8.5 s after a deepen, 1.7 s before).
   The record's `ended` field could order same-day records without git, but
   the 2026-11 reviews chose landing order on purpose (five reviews in one
   day), so changing it is a review-track call.
2. **The batch index: 5.0 s.** It is one `git log --name-only` over about
   4,300 commits. `--since=<oldest friction report>` would cut it, but it
   would change which commit dates a file that has not changed since.
3. **Loading 10,800 JSON records: 0.9 s**, mostly `json.loads` on 73 MB. This
   is already the floor for the stdlib.
