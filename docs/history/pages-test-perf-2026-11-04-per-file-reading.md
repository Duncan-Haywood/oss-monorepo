# Pages tests: per-file reading (2026-11-04)

**Reading.** `ci_profile.py --runs 100 --top 15`: "Test the site builder" is
17.5 of 77.2 job-minutes, still the heaviest step. Following the 2026-11-03
note ("a per-test profile is next"), each of the 64 test files was run alone
(`node --test <file>`, 4-core sandbox, warm card cache): all pass, sum 776 s.

| file | seconds |
|---|---|
| build.test.mjs | 297.8 |
| build-determinism.test.mjs | 292.5 |
| custom-domain.test.mjs | 120.2 |
| surface-budget.test.mjs | 8.8 |
| faq-coverage.test.mjs | 8.2 |

Three files, each doing its own full `buildSite`, are 91% of the sum. The
sandbox is several times slower than a runner (sys time was 29% of CPU), so
use the ratios, not the seconds.

**Not changed.** No code change this run: the sandbox cannot show the runner
saving, and the files run in parallel, so only cutting the longest
(build.test) or the CPU contention among the three moves wall time. Filed as
backlog P062 with the candidate fixes (concurrent builds in the determinism
test; one shared build for custom-domain and build.test).

**Ranked next.** 1. P062. 2. Per-test spans inside build.test.mjs (the spec
reporter grep returned nothing here; use `--test-reporter=spec` to a file).
