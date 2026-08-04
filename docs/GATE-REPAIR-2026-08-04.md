# Gate repair, 2026-08-04

`main` was red at its own gates. At `233c558b` a clean checkout failed **26
pytest tests and 7 node contract tests**. It now fails one, and that one is
telling the truth.

Branch: `agent/gate-repair-2026-08-04`.

## What was actually wrong

Almost all of it was one cause, and it was not the thing the failures named.

**Four complete copies of the repository were committed under
`.claude/worktrees/`** — `continue-work-2f-2026-08-03`, `cw2h-2026-08-03`,
`cw3h-2026-08-03` and `cw8-2026-08-03`, 6200 tracked files. `.claude/` had been
in `.gitignore` since before they landed, which is exactly why nobody caught
them: a gitignore rule does not untrack what is already committed, so the entry
that should have prevented this is also the reason it stayed invisible.

Every repository-wide control then saw the repository five times:

| Control | What it reported | What was true |
| --- | --- | --- |
| `audit_exceptions` | 369 lint suppressions against a register describing 63; 306 unregistered findings | 63 suppressions, all registered |
| `audit_exceptions` | four skipped tests | one fixture string, in four copies of the same test file |
| `coverage_ratchet` | import failures measuring five ventures | nested copies with no `node_modules` |
| `dependency-audit-coverage` | unaudited lockfiles | copies of lockfiles already audited once |
| `route-posture-contract` | 20 components serving routes with no posture contract | five, all registered |

None of these were real. A reviewer reading any one of them would have gone
looking for a missing exception register entry that was already there.

## Fixes

1. **`fix(repo)`** — untracked the four snapshots. Index only; the directories
   stay on disk as the scratch space they were meant to be.

2. **`fix(ci)`** — `route-posture-contract` walked the filesystem and skipped a
   hardcoded denylist of seven directory names. Untracking fixes today's
   symptom but not the control: the denylist has to name each offending
   directory in advance, and the next scratch directory is one nobody has named
   yet. `componentsWithRoutes` now enumerates handlers with `git ls-files` —
   the same property for which `dependency-audit-coverage` was kept over its
   three rivals. The fail-closed half is unchanged: a new venture reaches CI
   only by being committed, and once committed its handlers are tracked.

   Guarded by a test that plants an untracked, deliberately **un-ignored**
   component serving a route handler and asserts the scanner passes over it. It
   asserts the fixture is not gitignored precisely so that passing means the
   scanner keys on what git tracks rather than on any denylist. Mutation-checked:
   restoring the `readdirSync` walk fails it.

3. **`advertised-price-coverage`** — `ai-first-markets` carries 94 price
   literals, not the declared 96. The register went stale as work landed; the
   count is lowered to what is there, which is what that ratchet asks for.

Also rescued: ~30 files of gate-repair work found uncommitted and idle in the
shared working tree, which took the failures from 33 to 10 on its own. The two
changes with the most weakening potential were checked before being preserved —
the kill criterion dropped from ten `VENTURE.yaml` files is strictly weaker than
the one retained beside it (identical metrics, $150 against $120, so it could
never bind), and `coverage-baseline.yaml` lowers pairwise lines 91.81 → 88.07
only because `measured.files` rises 54 → 132: lcov reports only files the run
loaded, and counting the other 78 is why the number falls. That baseline got
more honest, not weaker.

## The one remaining failure is the real finding

```
[lag-above-budget] 268 commits are not in origin/main, over the declared
budget of 125. The undelivered pile grew; nothing in it is live.
```

Every component in the repository is listed as running without its committed
changes, including `quick-pick-survey` — the one venture with a customer
surface. This is the release-lag control working exactly as designed, and it is
the single largest thing standing between the work in this repository and any
revenue: none of it is in production.

**It cannot be fixed from inside a gate run.** Shipping is a push to
`origin/main`, which is a human decision, and the budget must be lowered only
*after* the push, never widened to make this green. It is left red deliberately.

## Verification

Run at `3174e37f` on Node 22.22.3 and Python 3.11:

- `platform/ci`: **145/145** node contract tests pass.
- pytest: **1153 pass, 1 fail** — `test_release_lag`, above.

Two caveats on where this was run. It used an independent clone, so
`node_modules` was linked in from the working repository rather than installed
with `npm ci`; and in a clone `origin` is the local repository, so
`test_release_lag` reports "budget-stale" there. The 268-commit figure above was
measured in the real repository against the real remote, not in the clone.

Not run: the Playwright journey suites, and any real-browser check. No
user-visible behaviour changed in this branch.
