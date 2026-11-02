# Page-integrity sweep: 193 s to 17 s (2026-11-02)

Perf track. `ci_profile.py --runs 100` ranked "Sweep every product page" (page-integrity-ci.yml) at 7.2 min on one run, the heaviest step outside the site-builder tests.

## Reading

`node platform/webcheck/check_pages.mjs` over 3,335 pages, local, cold: **192.8 s** (user 154 s, sys 30 s). 1,705 of the 1,732 inline scripts are modules, and each one spawned `node --check`.

## Profile (`node --cpu-prof`, after fix 1)

Removing the spawns left 90 s, of which **77 s was one regex**: `out.replace(/\s+$/, '')` in `scanSource`, run on a growing buffer. `\s+$` retries from every whitespace run, so it is quadratic on large minified sources. Next: `CONTROL_FLOW_PAREN` at 5.5 s.

## Changes

1. `checkScriptSyntax` parses a module in-process with `vm.SourceTextModule` (compile only, never evaluates). On any failure it falls through to the original `node --check` spawn, so messages are byte-identical. `check_pages.mjs` re-executes itself once with `--experimental-vm-modules` so the workflow file is unchanged.
2. `.replace(/\s+$/, '')` became `.trimEnd()` (same whitespace set, linear).

## After

193 s -> 90 s (fix 1) -> **16.7 s** (both). Same output on all 3,335 pages ("all sound"); a deliberately broken module page produces the identical FAIL line before and after (checked with `git stash`); `node --test platform/webcheck/*.test.mjs`: 61 pass, 2 skip (history blobs, needs full-depth clone), 0 fail.

## Not changed, ranked

1. `CONTROL_FLOW_PAREN.test(out.trimEnd())` (5.5 s): test only the tail of `out`.
2. Classic scripts (27) still spawn.
3. The checkout (`fetch-depth: 0`, blob-less) is the job's other cost.
