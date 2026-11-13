# Social-proof and DOM-ref checks on every core (2026-11-12, perf track)

Perf track. Both open perf backlog items (P063, P064) touch workflow files and
wait for the owner, so the run took ranked "Not changed" items from today's
history docs.

## 1. Measured, not changed: `check_conflict_markers.py`

Item 1 of
[`ci-perf-2026-11-12-js-syntax-one-process.md`](ci-perf-2026-11-12-js-syntax-one-process.md)
("11.1 s alone"). Reading in this container (4 cores, 57,275 tracked files,
1.07 GB): **2.3 s wall warm** (`time python3 platform/ci/check_conflict_markers.py`).
A first `cProfile` run took 24.5 s with 21 s inside `TextIOWrapper.read`: that
was a cold page cache, not the script. Reading every tracked file as bytes in a
bare loop takes 0.86 s, so the script is within about 1.5 s of the disk floor.

Tried and measured as a loss: read bytes, search the three marker byte strings
first, decode only files that contain one (exact same answers). 2.2 s against
1.6 to 1.8 s for the current code, in one process over the same file list:
three `bytes in` passes over 1.07 GB (448 MB of it MP3s) cost more than text
decoding, which fails on the first bad chunk of a binary file. Not landed.

## 2. Landed: `check_social_proof.py` and `check_js_dom_refs.py`

Item 1 of
[`ci-perf-2026-11-12-page-checks-pool.md`](ci-perf-2026-11-12-page-checks-pool.md)
and item 2 of the js-syntax doc. Both walk every page under `ventures/` and
compute a pure per-file answer, one process, while three cores sit idle.
`check_social_proof.py` is a Portfolio validate step
(`portfolio-validate.yml`); both run inside `main_health.py`.

### Profile (before)

`python3 -m cProfile -s tottime platform/ci/check_js_dom_refs.py`: 4.0 of
5.6 s self time in `page_problems`, almost all of it the `DEFINED` regex
iterating over page + scripts to collect every defined id. That set is only
used to judge the page's literal `getElementById` / `querySelector('#…')`
lookups, and most pages have none.

### Change

- Both scripts map their per-file function over `page_pool.map_pages` (fork
  pool, results in input order, serial under 64 files). `check_social_proof.py`
  gains a module-level `check_file(path)` so it pickles.
- `check_js_dom_refs.page_problems` collects the lookups first and returns `[]`
  when there are none (after the existing `${…}` filter), before the `DEFINED`
  scan. The result is `sorted(wanted - defined)`, the same set as before.

### Verification

- **Same output on the real tree**: before and after stdout `cmp`-identical
  (both clean: 0 findings).
- **Same output with findings**: the HEAD scripts and the new ones, run with
  `--root` on a copy of the tracked `ventures/` text files where 80 seeded
  pages (seed 20261112) each got two of eight injected snippets (unattributed
  "Trusted by", "Rated 4.8/5 stars", "Award&#8209;winning", an attributed
  "e.g. trusted by", a missing-id lookup, a `querySelector('#…')` miss, a
  defined id, a commented-out lookup): exit codes 1 and 1, stdout
  `cmp`-identical, 61 and 29 lines.
- **Tests**: new `test_pooled_scan_prints_in_file_order` (70 files, over
  `MIN_POOL`, so it goes through the pool), `test_main_over_a_pool_matches_page_by_page`
  and `test_template_ids_are_never_flagged_even_with_no_other_lookup`. Both
  modules: 29 passed.

### After

Same measurement (`date +%s.%N` around the script, two runs each, warm):

| script | before | after |
|---|---:|---:|
| `check_social_proof.py` | 5.03 / 4.78 s | 1.46 / 1.42 s |
| `check_js_dom_refs.py` | 5.39 / 5.43 s | 1.17 / 1.18 s |
| total | **10.3 s** | **2.6 s** |

On CI only the social-proof step is in a PR workflow: about 3.4 s off each
Portfolio validate job on a 4-vCPU runner. Inside `main_health.py`, which runs
every check in parallel, the pool shares cores with the other checks, so the
gain there is the CPU cut from the short-circuit (about 4 s) more than the
wall-clock fan-out.

## Not changed, ranked for the next run

1. `check_conflict_markers.py` is at the read floor (see 1); a cut would have
   to read less, e.g. skip `BINARY_SUFFIXES` files that are present, which is an
   output change on a hypothetical UTF-8 `.png` and needs its own argument.
2. Other serial per-page walkers in `platform/ci/check_*.py` that do not yet use
   `page_pool`: `grep -L page_pool platform/ci/check_*.py` and time the ones that
   `rglob("*.html")`.
3. P063 and P064 remain owner-gated.
