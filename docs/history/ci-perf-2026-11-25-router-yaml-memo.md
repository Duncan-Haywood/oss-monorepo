# Router tests: parse each YAML text once (2026-11-25)

Perf track, version 0. Both open perf backlog items (P063, P064) and P086 are
owner-gated. The pay-application page (bet #1's front door) had its pass
earlier today, and ai-bookkeeper's suite (subscription, #3 in
`transition.py`) is flat: 351 files, 83 s summed, the slowest 2.6 s, so no
single lever there.

## Reading (before)

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, window 19:49 to 20:39
UTC: `Portfolio validate` is the largest workflow that is not `priv-*`
(39 jobs, 111 job-minutes, 209 s median). Per step (`--save` payload, mean
per job): checkout 41 s, then "Local workflow-runner unit tests" 7.5 s and
"Router ranking-logic unit tests" 5.2 s (7 s median).

A local run of the whole workflow
(`run_workflow_locally.py --foreground .github/workflows/portfolio-validate.yml`,
4 min 10 s) ranked the router tests first by far: **50.6 s**, because the
container's bare `python3` has PyYAML without libyaml. That is the run a
session makes before merging a change under `portfolio/router/`.

`python3 -m cProfile -m unittest test_allocate`:

- `_load_yaml` was called **5,933 times**: 6 `load_ventures` calls (from 3
  `main()` runs and the tests) each parse ~1,400 VENTURE.yaml files, the
  ledger files twice and the merit and flagship files. With libyaml
  (`/usr/bin/python3.13`, CI's case) 7.5 s of 8.3 s; without, 152 s
  cumulative under the profiler.
- The test module's own memo for `load_ventures` returned `copy.deepcopy` of
  the cached list: 917k `deepcopy` calls, 2.0 s, as slow as the C parser.
- 835k `Path.__lt__` calls, about 1 s: `sorted()` over 10,424
  `prompts/runs/*.json` paths (twice per table) and the venture directories.

## Change

`portfolio/router/allocate.py`:

- `_load_yaml` keeps `{text: pickle of the parsed result}`. Keyed by the
  text, so an edited file (or main's flagships text, `_FLAGSHIPS_TEXT`)
  parses afresh. Each call unpickles a new object, so callers that hand
  parsed lists into `Venture` (`kill_criteria`, `hypotheses`) or mutate them
  see exactly what a fresh parse gave them. A shared object would not have
  been safe.
- The five `sorted()` calls over one directory's entries sort by `p.name`.
  For entries of the same parent this is the same order as comparing the
  paths.

`portfolio/router/test_allocate.py`: the `load_ventures` memo copies with a
pickle round trip instead of `deepcopy`, and a new `ParsedYamlMemoTests`
class checks that a mutated result does not leak into the next call, dates
still come back as dates, an edited or emptied file re-parses, and the memo's
ventures equal a cold parse's.

## Verification

- **Same answers.** HEAD's `allocate.py` and the new one, run with
  `--no-deepen --no-claims --no-probe` in the default, `--all` and `--brief`
  views: byte-identical (`cmp`), 50,607, 613,529 and 2,635 bytes.
- `python3 -m unittest test_allocate`: 161 tests OK (159 before plus 2 new).
  `test_score_ventures` (imports
  `allocate.load_ventures`) OK; `router/validate.py` OK.

## After

Each timing alone on the container, wall clock of `python3 -m unittest
test_allocate` in `portfolio/router`:

| interpreter | before | after |
|---|---:|---:|
| bare `python3` (no libyaml; sessions) | 50.0 s | **17.0 s** (−66%) |
| `/usr/bin/python3.13` (libyaml; CI-like) | 8.33, 8.37 s | **5.9, 6.1, 6.2 s** (−27%) |

The router CLI (`allocate.py --no-deepen --no-claims --no-probe`) went from
1.69 to 1.27 s bare and 1.31 to 1.06 s with libyaml, since `main()` loads
the ventures twice.

CI is 7 s median for this step, so the pool saving is about 2 s per
Portfolio validate job (about 39 an hour). The larger win is the local run a
session makes.

## Not changed, ranked for the next run

1. **The remaining ~2 s with libyaml is the first parse of each of ~2,900
   distinct texts.** A disk cache keyed by text hash would cut it across
   processes but adds a stale-cache failure mode to the router; not worth it
   for 2 s.
2. **1.4 s of `select.poll`** is the git subprocesses (`main_flagships`,
   `refresh_tip`, shallow checks) that tests run for real. Some tests also
   fetch origin/main over the network in a shallow clone (the "(shallow
   clone: fetching main since ...)" lines); mocking that would change what
   the tests prove.
3. **Supersede-check unit tests** were the second-slowest step locally
   (26.7 s vs 3 s median on CI): unprofiled, likely git network or fixture
   repos in the same way.
4. P063, P064 and P086 remain owner-gated.
