# Integration report — 2026-08-03

Continues [the 2026-08-02 report](INTEGRATION-REPORT-2026-08-02.md). Branch
`agent/integration-2026-08-03`, 86 commits ahead of `main`.

## Branch topology

34 agent branches existed. Measuring containment rather than reading diffs
settles most of them immediately:

- **`agent/coverage-basis-gate-contract` is a strict superset of `main`** — 68
  commits ahead, 0 behind — and it also contains 22 of the other branches
  outright, plus `main` itself. It is the correct base to integrate from.
  Building from `main` would have re-derived work that already exists.
- **12 branches held unique commits**, 29 in total, mostly 1–6 each.
- The rest are already subsumed and can be deleted once this lands.

Measured with `git rev-list --left-right --count main...<branch>` and
`git rev-list --count <superset>..<branch>`, not by grepping for marker strings.
A branch whose work was independently reimplemented elsewhere still reports
unique commits, so containment is a starting point and not the answer.

## Merged into this branch (6 of the 12)

| Branch | What it carries |
| --- | --- |
| `continue-work-2026-08-02` | print-atelier `"use client"` page serialising masked live credentials into anonymous HTML; image-tag gate that grepped its own hardcoded answer |
| `continue-work-2-2026-08-02` | dependency audit over all 10 committed lockfiles, not the 4 hand-typed; the two non-semver-major Next.js upgrades |
| `continue-work-3b-2026-08-02` | stops a venture declaring a production URL that resolves nowhere |
| `continue-work-6-2026-08-02` | contact routes on `marisstella.dev`, the only live revenue-facing page, which had none |
| `continue-work-2i-2026-08-03` | makes the portfolio budget cap actually cap |
| `portfolio-kill-criteria-2026-08-03` | evaluates the kill criteria the allocator was discarding |

### What merging found

**A duplicate security identifier.** Two branches independently assigned
**SEC-023** to different findings: Listing Lens serving its whole internal site
to an unauthenticated `GET` (High, Application), and the dependency-audit matrix
covering 4 of 10 lockfiles (High, Supply chain). Whichever merged second would
have overwritten the other's row in the register, and the losing finding would
have disappeared from the only document that tracks it. This is the second time
this exact collision class has occurred — the 2026-08-02 report renumbered a
different set for the same reason — and it is a direct consequence of parallel
branches allocating IDs from a shared sequence with no reservation.

Resolved by keeping SEC-023 with the Listing Lens finding (already referenced
from the roadmap) and renumbering the lockfile finding to **SEC-027**, matrix
row and narrative section together.
`platform/ci/test/security-audit-log-integrity.test.mjs` passes on the result.

**A stale identifier the previous integration missed.**
`ventures/print-atelier/docs/BACKLOG.md` still pointed the Stripe
signature-expiry item at SEC-023; that item became SEC-026 during the
2026-08-02 renumbering. Corrected here. Nothing checks cross-document SEC
references, which is why it survived a renumbering that was otherwise complete.

## Deliberately not merged — these need an owner's decision

Each is two independent implementations of the same control. Merging either
mechanically would leave the repository with both, and the conflicts are in
behaviour rather than in text, so resolving them is a judgment call about which
control to keep — not a merge.

| Conflict | Branches | Note |
| --- | --- | --- |
| Academy pricing page | `continue-work-4-2026-08-02` vs. work already in the superset | 37 conflicting hunks across `build.mjs`/`style.css`/`test.mjs`. The superset's version is larger and adds `checkpoint-validator.mjs`; both fix the same overclaiming-pricing defect. The superset's appears to supersede, but that was not verified line by line. |
| Kill criteria | `continue-work-8-2026-08-03` vs. `portfolio-kill-criteria-2026-08-03` | Two incompatible `portfolio/router/kill_criteria.py`. The latter is merged here; the former additionally carries a repo-level control holding the number of ventures with no stopping rule, which is the more complete half and is **not** in this branch. |
| Route auth posture | `route-posture-repo-gate` vs. `route-posture-repo-control` | Both add a repo-level posture gate; the superset already carries `route-auth-posture-coverage.test.mjs`. Each also carries a `quick-pick-survey` contract, which is the venture serving live traffic and currently a registered gap of 32 undeclared handlers. |
| Lockfile gating | `profit-lever-2026-08-02` vs. `continue-work-2-2026-08-02` | The latter is merged. `profit-lever` additionally pins Actions to SHAs and fails the entrypoint when a gate's runner is missing — both unique and unmerged. |
| Release lag | `release-lag-signal-2026-08-02` | Duplicates the release-lag control already in the superset. |

## Verification

Run at the branch tip:

- `pytest` — **874 passed, 2 failed**
- `platform/ci` `npm test` — **89 passed**
- `platform/ci/test/security-audit-log-integrity.test.mjs` — **4 passed**

Both pytest failures reproduce identically on unmodified `main` and are not
caused by this integration:

- `test_coverage_ratchet.py::test_every_component_matches_its_declared_baseline`
  — declared coverage baselines have drifted.
- `test_release_lag.py::test_this_repository_is_within_its_declared_budget` —
  `[budget-stale]`, the control working as designed: work shipped, so the
  budget must be lowered. Per `platform/release-lag-budget.yaml` this is
  expected to be red until a human pushes and then lowers the budget.

Not run: the Node venture suites (`local-site-studio`, `quick-pick-survey`,
`print-atelier`, and the rest), which need `npm ci` per venture, and the
Playwright journeys. No real-browser check was performed, so the homepage
contact routes merged here are **not** confirmed against a rendered page.

## The blocking action is still a push

`origin/main` is at `a4b8f23` (2026-07-31). This branch is 86 commits beyond
local `main`, which is itself 65 commits beyond `origin/main`. Every control
described here, and every fix in the register, governs code the live services
are not running. Pushing remains a human decision and was not taken by this run.

## `main` moved while this ran, and it took the other side of one duplicate

A concurrent agent committed to `main` during this integration. `main` is now at
`aeffd6d`, three commits ahead of this branch's base, and those three are
`continue-work-8-2026-08-03` — which carries **the rival kill-criteria
implementation**, plus `scripts/ci/kill_criteria_ratchet.py` holding the number
of ventures with no stopping rule.

So the choice listed above as outstanding is now forced rather than optional:
`main` has `continue-work-8`'s `portfolio/router/kill_criteria.py` and this
branch has `portfolio-kill-criteria-2026-08-03`'s. They are incompatible, and
merging this branch into `main` will conflict on that file. Whoever lands this
picks one; `continue-work-8`'s is the more complete of the two because of the
ratchet, which this branch does not have.

`agent/sd-offload-verification-2026-08-03` has already been merged up to current
`main` and is 1 commit ahead of it, conflict-free.

---

# Integration continued — 2026-08-03, second pass

Branch `integrate-2026-08-03`, built on `agent/integration-2026-08-03`. The
previous pass left `main` three commits ahead with the rival kill-criteria
engine; this pass merged `main` and the eleven branches that still held unique
commits, and took the whole set to one branch.

## Topology, re-measured

`agent/integration-2026-08-03` already contained **27 of the 39** branches ahead
of `main` outright. Only 11 held unique commits, so the job was 12 merges rather
than 39.

Merged here: `main`, `academy-test-script`, `ledger-continuity`,
`sd-offload-verification`, `continue-work-4`, `profit-lever`,
`release-lag-signal`, `route-posture-repo-control`, `route-posture-repo-gate`,
`ci/cap-ratchet`, `money-path-fail-closed`. `continue-work-8` was already in
`main`.

## Four things were built twice

Each cost a real choice, and in every case the losing side had merit:

| Built twice | Kept | Why |
| --- | --- | --- |
| `portfolio/router/kill_criteria.py` | `main`'s | It has `kill_criteria_ratchet.py` behind it. An engine with a gate beats a richer engine with none. |
| `scripts/ci/release_lag.py` | this branch's | It caps its own declared numbers, so the budget cannot be widened into silence. The rival was 159 lines longer and had no such cap. |
| academy `site/` honesty fixes | this branch's | Same fixes or stronger on every point `continue-work-4` raised — verified point by point rather than assumed, including that the calculator is *unclamped* and will say "Subscription is more expensive by:". |
| route auth-posture controls | both | They check different things: one that every venture declares a contract and CI reaches it, one that each handler's declared posture is the one enforced. |

## What merging found that no single branch could

**Two gates demanding opposite things.** The dependency-audit matrix and the
supply-chain exemption register were built on different branches against the same
defect (4 of 10 lockfiles gated). Merged, five packages were audited *and*
exempted. Resolved toward full matrix coverage — see the commit for the cost,
which was measured, not assumed: all five fail `npm audit --audit-level=high`
today, so their jobs go red until semver-major upgrades land. **This is the one
decision here a portfolio owner may want to reverse**, and the waiver mechanism
is kept intact and empty so that reversing it is a two-line change.

**A gate failing a contract that demonstrably runs.** `route-posture-contract`'s
`isCollected` modelled sh globbing, where `**` collapses to one segment, and
never stripped quotes from the token. But `--test 'src/**/*.test.ts'` is passed
through sh untouched and expanded by node's own runner, globstar included.
ai-first-markets' contract was reported unreachable while `npm test` was
observably running it. A false positive on the honest configuration is what gets
such a check deleted.

**Four caps nothing watched.** `ci/cap-ratchet` reads each cap's floor from git
history rather than from another declared number. Its contract test found that
`image_tags`, `route_posture_contract`, `sast_scan` and `coverage_ratchet` had
each grown a `MAX_` constant on a different branch, none of them watched. It
also found `platform/release-lag-budget.yaml` had been raised above its own
historical floor twice — 135 against 125, 35 against 32 — which is precisely the
erosion that file's comment predicted. Restored.

**A sized gap that was quietly already done.** `route-auth-posture-coverage`
carried quick-pick-survey as a dated gap over 32 handlers, deferred on the honest
grounds that the contract is a review of 32 handlers. Another branch had done
that review. It is now a registration: 13 tests, passing, and that is the
repository's largest route surface and its only live production deployment.

**A contract that was red on arrival is now green.** The route-posture registry
held ai-first-markets exempt because its contract declared `/api/subscribe POST`
against a route that was never committed — "it went red the moment it landed and
nothing noticed". The subscribe route was in-flight on another branch. Here they
meet: 9/9 passing, counts corrected from 2/3 to the measured 3/4.

## State

- **978 Python tests pass**, 1 fails. 1254 local-site-studio tests pass. The
  academy, quick-pick-survey and route-posture suites pass.
- The **one failure is `release-lag`, and it is the designed one**: 127 commits
  are not in `origin/main`, against a budget of 125 that the cap ratchet now
  forbids raising. Only a push clears it. That is the control working, not a
  regression — and it is worth noting the number understates the real gap,
  because local `main` is itself far beyond `origin/main`.
- The Node-version gate refuses to run under anything but Node 22. Everything
  above was measured on **Node 22.22.3**, which is what the baselines were
  measured on and what the workflows install.
- Coverage ratchet passes with dependencies installed: `platform-ci` 69.86 /
  85.29 / 82.58 over 1095 lines, `print-atelier` 91.80 / 87.53 / 79.81 over
  13508. The `platform-ci` figure matches the baseline this merge kept, which is
  the check on that resolution having been the right one.

## Still the blocking action: a push

`marisstella.dev` — the only venture with a customer surface — has had **no way
to reach a human** and now has one, a `mailto:` contact route, sitting in this
branch. local-site-studio's checkout no longer fulfils orders whose payment has
not settled, its advertised prices match what `bundles.ts` charges, and its
operator gate fails closed without a password. None of that is live.

Nothing in this run pushed, merged to `main`, or deployed. Those remain human
decisions.
