# Perf reading, 2026-11-09: `check.mjs` parsed 1,460 inline scripts with 1,460 processes

Perf track. Metric: wall time of `node check.mjs <built site>`, the "Check the
built artifact" step of the Pages build job (27 s median in CI, third-largest
step there after the build and the site-builder tests).

## Reading

`python3 platform/ci/ci_profile.py --runs 300 --steps 14`: "Check the built
artifact" 27 s median, 21 jobs, 7.2 job-minutes. `Test the site builder`
(419 s median) is still the largest consumer, but passes on 2026-11-04 to
2026-11-06 ruled out its cheap levers (`pages-test-perf-*`). P063 and P064
need `.github/` edits and wait on the owner.

## Profile

Built the site (`build.mjs --out=/tmp/pdist`, 7,859 pages) and ran
`node --cpu-prof check.mjs /tmp/pdist`: 28.2 s wall, 38 s user, 16 s sys. Of
that, 5.8 s self time in `child_process.spawn` and 8 s idle waiting on children.
The children are `node --check` for each distinct inline script body (about
1,460 after the earlier de-duplication, 8 at a time).

## Change

`platform/pages/parse-batch.mjs` parses every distinct body in one child
(`vm.SourceTextModule` for `.mjs`, `vm.compileFunction` with the CommonJS
wrapper for `.js`, the same goal `node --check` uses). Nothing runs. It reports
only the bodies that parsed; any body missing from the answer, and the whole
batch if the child fails, goes through the old `node --check` path. So the
script never decides that something is broken: a failure keeps node's own
message and the same per-page problems.

## Verification

| | wall |
|---|---:|
| before | 28.2 s |
| after, run 1 | 17.2 s |
| after, run 2 | 17.5 s |

Same verdict line both ways ("1331 products, 45 category pages, 7859 pages, no
dead links"). `node --test check.test.mjs`: 97 pass, including the two
"does not parse" tests (module and classic), which now exercise the fallback.
Timings are one local machine, not a CI runner; the CI number comes from the next
`ci_profile.py` reading.

## Not changed (ranked)

1. The remaining 17 s: file reads and `slice`/`fstat` over 7,859 pages
   (about 5 s self time), plus `checkSite` itself. Reading each page once for
   all checks would be the next step.
2. P063 and P064 (owner, `.github/`).
3. `Test the site builder`: waits on a real share-card cache hit in CI.
