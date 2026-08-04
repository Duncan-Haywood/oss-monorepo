# Integration report — 2026-08-02

**Branch built:** `agent/full-integration-2026-08-02` (local only, not pushed)
**Base:** `agent/security-audit-dependency-free-package` (the fullest existing line, 111 ahead)
**Result:** 125 commits ahead of `origin/main`, up from 111 on the fullest single branch.

`origin/main` is still `a4b8f23` (2026-07-31). 18 components — every deployable
thing in the repository — are running without their committed changes.

---

## What this branch adds over the fullest existing branch

Nothing on the pile was a fork of the product; the two lineages had simply never
met. The base line had absorbed almost everything, but was missing:

| From | What |
|---|---|
| `agent/ship-verify-2026-08-02` | backs out two coverage floors that had been raised over the test files themselves |
| `agent/verify-contract-gate` | fails closed when the two CI gate declarations drift |
| `agent/pairwise-pricing-claims-2026-08-02` | stops the pricing page selling a plan nobody can buy |
| `agent/venture-contract-validation-and-flake-fix` | `scripts/ci/release_lag.py` + budget caps, `branch_collisions.py`, and `security-audit-log-integrity.test.mjs` |

## Defects that only appeared once the branches were merged

These are the return on integrating. None of them is visible on any single branch.

**1. The security register named three findings twice.** The two lineages had
independently assigned SEC-020, SEC-021 and SEC-022. SEC-020 and SEC-021 were
the same finding recorded twice; SEC-022 was two genuinely different findings
(the homepage ConfigMap exposure and a Stripe webhook crash) sharing one id.
The collision had already leaked into `docs/ENGINEERING-ROADMAP.md`, where
"SEC-021" refers to two different things in two places.

The gate that catches this — `security-audit-log-integrity.test.mjs`, which
asserts ids are unique and contiguous — exists only on the
`venture-contract-validation` line. It was not on the base branch, so the base
branch carried a colliding register with nothing to detect it. Merging made the
gate real and it failed immediately.

Renumbered away from the most-referenced assignment: SEC-022 keeps the ConfigMap
exposure (5 external references); Listing Lens anonymous docs access becomes
SEC-023; the Stripe crash becomes SEC-025 and the Stripe signature-expiry item
SEC-026. SEC-024 had a narrative section and no matrix row and now has one.
Register is unique and contiguous at SEC-001..SEC-026; all four integrity checks
pass.

**2. A CI exception list contradicted the catalog it excepts from.** One branch
added `build` to the Dagger catalog for quick-pick-survey and local-site-studio;
another kept both listed in `CI_ONLY_GATES` as gates only CI runs. Merged, the
catalog runs the gate the exception says it does not. `gate-contract.test.mjs`
fails closed on it. Both entries removed; `ai-first-markets`' `cf:build`
exception is still real and kept. **80/80 CI engine tests pass.**

**3. A false completion claim on the venture with live production traffic.**
`docs/ENGINEERING-ROADMAP.md` stated that quick-pick-survey's route-posture
contract "covers all 32 handlers, leaving 0 registered gaps" and that "all 5
route-bearing ventures now hold active, verified" contracts. Introduced by
`85f4f94`. On that same lineage the contract file does not exist, and
`route-auth-posture-coverage.test.mjs` carries quick-pick-survey as a
**registered gap of 32 undeclared handlers** expiring 2026-11-01.

The control was right and the prose was wrong, which is the dangerous direction:
an owner reading the roadmap would believe the production route surface had been
reviewed. Corrected in place, with the gap restated.

---

## Decisions left for the owner — these are review calls, not merge conflicts

**A. Two complete implementations of the route auth-posture control.**
- Node: `platform/ci/test/route-auth-posture-coverage.test.mjs` — on the merged line.
- Python: `scripts/ci/route_posture_contract.py` + `platform/route-posture-registry.yaml` — on `agent/route-posture-repo-gate` and `agent/route-posture-repo-control`.

Not merged, because taking either means taking a second repo-level control that
measures the same property. **This one blocks real work:** the quick-pick-survey
posture contract covering all 32 handlers exists on both of those branches
(`4be387b`, `2ce17a3` — themselves two versions of the same file). Until the
control is chosen, the production venture's 32 handlers stay a registered gap.

**B. Two complete implementations of the security-scan integrity gate.**
`security/scan-integrity-gate` (`d29a55e`) reimplements the audit-gap gate the
base already has, with 19 conflicting hunks across three files. Not merged.
The base version already covers pnpm-workspace parents and gap recording, so
the loss is probably nil — but that is an assertion I did not test, and
hand-splicing two versions of a security control is not a scheduled run's call.

**C. Two implementations of `release_lag.py`** — `09e46a9` (merged here; has the
`MAX_DECLARED_*` caps) and `e131e50` on `agent/release-lag-signal-2026-08-02`
(stronger on CI checkout depth: a shallow clone is reported as a third state,
never a pass). The merged one is the proven-working copy. The checkout-depth
behaviour is worth porting; the two use different policy filenames
(`release-lag-budget.yaml` vs `release-lag-policy.yaml`) so they do not conflict
cleanly, they silently double.

**D. The homepage release-surface test** existed on both sides. Kept the base
version — it checks published keys against a `SERVABLE_EXTENSIONS` allowlist
(which rejects `Dockerfile` for having no servable extension) and guards its own
parser against matching nothing. The other used a denylist of build-file names.
Reversible; the other is `e1c3dbc`.

---

## Verification

- `platform/ci/test/*.test.mjs` — **80 tests, 80 pass**
- `pytest` — **774 pass, 2 fail** (both explained below)
- `quick-pick-survey` (the only venture whose product code this branch changes,
  and the only one serving live production traffic) — `npm ci` then
  **`vitest run`: 57 files, 409 tests, all pass**; `tsc --noEmit` clean;
  `eslint` 0 errors (11 pre-existing unused-var warnings).

Only one venture's product code differs from the base branch — quick-pick-survey's
pricing page — so the base line's own earlier full-suite verification still
carries for the other 14 components. Everything else this branch adds is
repo-level control code, which is what the Node and Python suites above cover.
- Node 26 locally; CI pins Node 22 (`.nvmrc`, `ci-cd.yml`). Coverage numbers are
  known to move between Node majors, so the coverage figures below are not
  authoritative until re-run on 22.

**`test_coverage_ratchet` fails on uninstalled components** — the ratchet
refuses to score a component whose `node_modules` is absent rather than
reporting 0%. That is the control failing closed correctly in a fresh worktree,
not a defect. It needs `npm ci` per venture to evaluate.

**`test_release_lag` fails: 140 unshipped commits against a declared budget of
135.** I did not raise the budget. Raising it is the documented failure mode for
this control, and the number is the point: the gate is refusing to go green
until the work ships.

There is a real design tension worth recording, though. Consolidating branches
*increases* the measured lag, because merge commits are themselves commits — so
the control penalises the one action that would let the pile ship, and fails
hardest immediately before the merge that would zero it. Measuring unshipped
work with `--no-merges`, or exempting a declared integration branch, would fix
it. I did not change the control: two other branches own competing copies of
that file (decision C), so editing it here would deepen the duplication this
report exists to resolve.

---

## The bottom line

Everything above is engineering quality on a branch that has not shipped. The
homepage's accessibility fixes, SEC-019 through SEC-026, the pricing page that
stops selling an unbuyable plan — none of it is live. `origin/main` has not moved
in two days and the measured effect of all of it on revenue is currently zero.

Pushing and merging triggers deploys (`.gitea/workflows/*` deploy on push to
`main`), so this run stopped at building and verifying the branch. The merge
decision is yours. Decisions A and B should be settled first — A in particular,
because it is holding the production venture's route review hostage.
