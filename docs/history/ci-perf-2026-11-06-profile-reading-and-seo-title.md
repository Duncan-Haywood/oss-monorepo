# Perf reading, 2026-11-06: nothing big left in the small jobs; one red gate fixed

**Reading.** `ci_profile.py --runs 600 --top 15`: 562 jobs, 388.7 job-minutes,
checkout 136.3 of them. Largest: Portfolio Pages (163.7 min, "Test the site
builder" 52 min), ventures tests (54.6), Conflict markers (31.4, 75% checkout).

**Checked and left alone.**
- Conflict markers already uses a blob-less sparse checkout (P048) and a
  prefiltered scan; checkout is the floor.
- Portfolio validate "Install dependencies" is about 3 s per job
  (`pip install --dry-run pytest pyyaml` 0.9 s locally); pytest is used by
  several steps, so nothing to drop. A pip cache would cost about what it saves.
- `prompts` unit tests: 131 tests, 6.2 s locally, slowest 1 s. Nothing to cut.

**Fixed.** `unittest discover -s prompts` failed on `main`:
`docs/posts/2026-11-06-missed-call-text-back-open-source.md` had a 76
character `seo_title` (limit 70). Shortened to 66 characters; the suite is
green (131 tests). A red gate on main makes every PR rerun, which costs more
runner time than any of the above.

**Not changed, ranked.** 1. Pages "Test the site builder" (52 min per 600
runs) is still the biggest single step; see the pages-test-perf notes.
2. Checkout share across small guard workflows.
