# Price claims: check out only the ventures that carry a plan catalog (2026-11-28)

Perf track run. `promptctl.py backlog --title perf:` had no agent-workable item
(P063, P064, P086 are owner rows), so this pass took the pool reading.

## Reading

`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-28 10:31 to
11:07 UTC: 437 jobs, 598.9 job-minutes, checkout 180.0 (30%).

| workflow | jobs | job-min | median job | checkout share |
|---|---:|---:|---:|---:|
| Price claims | 18 | 11.2 | 39 s | 87% |

Price claims (`price-claims-ci.yml`, landed the same day in PR #20030) runs on
every PR touching `ventures/**` or `docs/posts/**`, and its real work (ten unit
tests and one scan) takes about a second. The other checkout-heavy workflows in
the reading (CI policy 89%, Conflict markers 81%) are `priv-*`, owner-only in
`.github/CODEOWNERS`, and were not touched. Sibling links (74%) was narrowed on
2026-11-25 (`ci-perf-2026-11-25-page-sweeps-sparse.md`) and needs most of the
venture tree, since it reads every venture's HTML.

## Why the old checkout was too wide

`check_price_claims.py` reads text in three places: `platform/ci/` (itself and
`repo_files.py`), `docs/posts/`, and `ventures/<v>/` for each `<v>` that has an
`apps/*/src/shared/plans.ts`. A venture without a catalog is never a product to
it, so its files are never opened. The old sparse pattern was "everything but
`research/`, `prompts/` and binary media": 52,451 files and 583 MB of blobs at
`d31154bc8`, for four ventures (cmmc, jobshop-quote, payapps, seller-books).

## Change

The checkout now takes `/platform/ci/`, `/docs/posts/` and every
`/ventures/*/apps/*/src/shared/plans.ts`, still blob-less and without binary
media. A new step lists the catalogs from the index (`git ls-files`), and
`git sparse-checkout set --no-cone` widens the tree to those ventures. A new
paid product is scanned with nothing to wire up, and the step fails when it
finds no catalog, so a broken glob cannot turn the gate into a silent pass.
The lazy blob fetch the widening triggers needs no credentials (public
repository; Page integrity already relies on the same for its history reads
with `persist-credentials: false`).

| | old pattern | new pattern |
|---|---:|---:|
| files checked out | 52,451 | 10,731 |
| blob bytes | 583 MB | 73 MB |

Sizes from `git ls-tree -r -l origin/main` filtered by each pattern; the new
file count matches `git ls-files -t` in the sparse worktree (94 MB on disk,
without `.git`).

## Verification

- A `git worktree add --no-checkout` of HEAD, the new checkout pattern, then
  the workflow's widen step run verbatim (pulled out of the YAML): it found
  `cmmc jobshop-quote payapps seller-books`.
- In that tree, `python3 -m unittest test_check_price_claims`: 10 tests OK.
- `check_price_claims.py` and `check_price_claims.py --json`: output `cmp`
  identical to the full tree (0 findings at this commit).
- Seeded "Crew $199" into `ventures/payapps/README.md` and "PayApps Crew: $150"
  into a post in the sparse tree: both reported, so the narrowing did not hide
  either place the gate looks.
- `ci_policy_check.py`: passes.

The after number on the runner is the next pool reading's median job time for
Price claims, and this PR's own Price claims run; no local stand-in for a
runner's clone time was taken. Expect the checkout to drop roughly with blobs
fetched (8x fewer).

**Trap for the next run:** `git sparse-checkout set` inside a linked worktree
turned `core.sparseCheckout` on in the shared config, and the main clone went
sparse on its next checkout. `git sparse-checkout disable` in the main clone
restores it; use a separate `git clone --shared` for sparse experiments.

## Not changed, ranked for the next run

1. **CI policy** (`priv-ci-policy.yml`, 89% checkout, 28.4 job-min) and
   **Conflict markers** (`priv-conflict-markers-ci.yml`, 81%, 22.6 job-min):
   the two biggest checkout shares left, both owner-only.
2. **Portfolio Pages**' "Test the site builder" (44 job-min over 68 jobs) and
   **ventures tests**' `node --test` step (46 job-min): real work, the largest
   remaining compute; a per-file timing of the site builder tests is the next
   measurement.
3. **Doc references** (52%) and **Link contrast** (56%): short jobs (16-17 s
   median), already sparse; little left to take.
