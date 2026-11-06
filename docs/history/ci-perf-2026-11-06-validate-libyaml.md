# CI perf, 2026-11-06: `portfolio/router/validate.py` through libyaml

**Reading.** `ci_profile.py --runs 300` (267 jobs, 170 job-minutes): in Portfolio
validate the heaviest step was "Validate VENTURE.yaml schema" (1.3 min).
`cProfile` of the script: 11.5 s, of which `yaml.safe_load` (pure-Python
`SafeLoader`) was 11.2 s over 1,333 files.

**Change.** `validate.py` loads with `CSafeLoader` when PyYAML has libyaml
(CI's pip wheel does), else `SafeLoader`, as `allocate._load_yaml` already did.

**Verification.** Same output before and after on the same tree
(`/usr/bin/python3.13`, libyaml present): 2.93 s before, 0.33 s after.
Output identical (both listed the same one error, below).

**Also fixed.** The run found `main` failing this very check:
`changepoint-detector`'s `next:` in `portfolio/flagships.yaml` was 2,064
characters (cap 2,000). Trimmed to under the cap by shortening wording only
(no open item removed); now "All 1332 VENTURE.yaml files are valid."

**Not changed, ranked.** `ventures tests` (30.9 job-min, already ordered
longest-first); "Test the site builder" (19 min, worked on repeatedly);
Conflict markers "Guard unit tests" (0.8 m).
