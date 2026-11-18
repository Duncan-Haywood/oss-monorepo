# Agent CLI describe: split each module once (2026-11-05)

Perf track. `ci_profile.py --runs 600`: "Every tool stays callable from the
agent CLI" is the second-heaviest step of Portfolio validate. Follow-up to
`ci-perf-2026-11-03-agent-cli-describe-batches.md`.

## Reading

`node --cpu-prof platform/agents/tools.test.mjs`: `commentFor` (tools.mjs) plus
its per-line regex scan were about 1.4 s of self time in the 7.5 s describe
test. `describe()` calls it once per export, and each call re-split the module
source and ran a regex over every line.

## Change

`commentFor` keeps the last split (one-entry cache keyed on the source string)
and tests `l.includes(name)` before the regex. Results are identical.

## Verification

`node --test platform/agents/tools.test.mjs`, 3 runs each, same machine (4 cores):
before 7589 / 8273 / 7892 ms, after 7848 / 7284 / 7183 ms; 16 pass, 0 fail.
Median 7892 to 7284 ms (about 8%). Noisy; the gain is small.

## Not changed, ranked

1. Module compile (`compileSourceTextModule`, 0.8 s) and file reads: CPU bound, one thread.
2. `Test the site builder` (73.5 m / 122 jobs) remains the largest consumer; see the pages-test-perf notes.
3. Portfolio validate's ~30 short steps (interpreter start each).
