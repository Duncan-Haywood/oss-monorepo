# Served-page checks on every core (2026-11-12, perf track)

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --steps 30` (300 runs, 19:19 to
19:39 UTC, 290 jobs): Portfolio validate is the second-largest workflow, 54
job-minutes over 20 jobs, median 190 s, but no step heavier than 6 s. Its
weight is many small steps. Five of them are served-page checkers that each
walk every `ventures/**/*.html` page (3,662 to 3,754 files, 70 MB) through
`html.parser`:

| step (portfolio-validate.yml) | script | local before |
|---|---|---|
| Check every form control has an accessible name | `check_control_labels.py` | 5.5 s |
| Check venture pages for markup basics | `check_markup_basics.py` | 3.5 s |
| Check no served page repeats an id | `check_duplicate_ids.py` | 3.1 s |
| Check label and ARIA id references resolve | `check_aria_refs.py` | 3.4 s |
| Check in-page anchors and aria references resolve | `check_inpage_refs.py` | 3.2 s |
| total | | **18.7 s** |

Taken on this 4-core container: wall clock (`date +%s.%N` around
`python3 platform/ci/<script>.py`) on the clean tree, one run each.

`python3 -m cProfile -s cumulative platform/ci/check_control_labels.py`:
9.39 s of 9.40 s under `HTMLParser.feed` (`goahead`, `parse_starttag`,
`parse_endtag`), 3,662 feeds. Reading files: 0.14 s. All CPU, one process,
while the runner's other three cores sit idle (these steps run one after
another in one job).

## Change

1. `platform/ci/page_pool.py`: `map_pages(fn, paths)` maps a per-page
   function over a `fork` process pool sized to the CPU affinity, and returns
   results in input order (`Pool.map`). Under 64 files, one core, or no
   `fork`, it runs serially. Each checker's per-page work is already a pure
   function of one page, so the printed findings are the same bytes in the
   same order.
2. Exact pre-filters where a check can only fire on certain tags.
   `html.parser` only reports a start tag written as `<` plus its name
   (`starttagopen = <[a-zA-Z]`), and it lower-cases tag and attribute names:
   - `check_control_labels.py` parses only pages matching
     `<(input|select|textarea)` (any case): 2,115 of 3,662 pages skip.
   - `check_aria_refs.py` parses only pages containing one of its ARIA
     attribute names or `<label` (any case): 2,180 of 3,754 skip.

## Verification

- **Same output.** The HEAD versions and the new versions, run with `--root`
  on a copy of `ventures/` with 60 random pages each given seven seeded
  faults (unlabelled input, a repeated id, a dangling `#href`, a ghost
  `<label for>`, an `http://` image, a dangling `aria-describedby`): every
  script's stdout `cmp`-identical, exit codes equal (60, 60, 120, 120 and 121
  lines).
- **Pre-filters are exact on the real corpus.** Every page a pre-filter skips
  was parsed in full anyway: 0 controls and 0 references found in them.
- **Tests.** New: pool scan equals serial scan in order on 104 pages
  (`test_check_duplicate_ids.py`; it fails if the pool returns results
  unordered, checked by mutating `page_pool.py`), pre-filter case handling
  (`test_check_control_labels.py`, `test_check_aria_refs.py`). The six test
  modules: 53 tests OK.

## After

Same measurement: 0.54 + 1.07 + 0.88 + 1.07 + 0.97 = **4.5 s** (from 18.7 s),
on 4 cores. GitHub's standard Linux runners for public repositories have 4
vCPUs, so CI should see a similar cut, about 14 s per Portfolio validate job,
or about 4.7 job-minutes per 20 jobs. The next pool reading will show it.

## Not changed, ranked for the next run

1. `check_social_proof.py` (4.5 s) is regex, not `html.parser`, and already
   pre-filtered; `map_pages` would apply directly (its `check(text)` is per
   file).
2. The other ~40 Portfolio validate steps are 3 to 6 s each, mostly unit-test
   modules; the job's floor is checkout (16%) plus their Python start-ups.
   Merging steps would cut start-ups but touches the workflow (owner-gated)
   and the required check names.
3. A shared parse (one tokenisation feeding all five checkers) would cut CPU
   further, but they run as separate steps, so it needs an on-disk token cache
   or a merged step: a bigger change for a 4.5 s remainder.
4. P063 and P064 remain owner-gated.
