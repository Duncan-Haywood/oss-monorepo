# CI and application bloat audit (2026-10-29)

**Asked by:** the owner ("do a blog report on the state of ci and application
bloat. how much is useful versus deadweight"). **Post:**
[`docs/posts/2026-10-29-ci-and-application-bloat-useful-versus-deadweight.md`](../posts/2026-10-29-ci-and-application-bloat-useful-versus-deadweight.md).
This file holds the method and the raw numbers so a later run can make one of
the cuts and measure again. Nothing was cut in this PR.

## Sources and method

| Lens | Source | Window |
|---|---|---|
| Run counts and outcomes | `GET /repos/{repo}/actions/runs?created=A..B`, 30-minute windows, 100 per page | created 2026-10-22T00:00Z to 2026-10-28T23:59Z |
| Job-minutes, checkout share | `python3 platform/ci/ci_profile.py --runs 1000 --top 40` | 1,000 runs, 2026-10-29 02:20-04:03Z |
| Failure causes | job logs of 14 evenly spaced failed `main` runs per workflow | same week |
| Workflow inventory | `yaml.safe_load` of `.github/workflows/*.yml` | `main` at d222a59f |
| Product bytes, copies | `os.walk` + SHA-1 over `ventures/` (no `node_modules`) | same |

Run counts are a **floor**: the runs endpoint returns at most 1,000 results
per query, and 4 of the 336 half-hour windows hit that cap
(2026-10-23 12:00Z, 2026-10-24 01:30Z and two others). A run's wall time
(`updated_at - run_started_at`) includes queue time, so it is used only for
proportions; job-minutes come from `ci_profile.py`.

"Per-product workflow" means a workflow whose `pull_request.paths` name
exactly one `ventures/<slug>/` and nothing but that and its own YAML file
(478 files). The other 71 are "shared".

## CI numbers

- 549 workflow files, 29,355 YAML lines, 2.4 MB. Triggers: 522
  `pull_request`/`push`, 540 `workflow_dispatch`, 21 `schedule`. Only
  `agent-cross-review.yml` and `conflict-markers-ci.yml` lack a path filter.
- Week: 58,776 runs. success 43,236; cancelled 7,880; failure 6,223; skipped
  1,015; startup_failure 417. Shared workflows 53,825 runs; per-product
  4,809 (131 failures, 404 startup failures). 546 of 549 files ran; the 3
  that did not are dispatch-only.
- Timed window: 1,079 jobs, 1,476.0 job-minutes, checkout 329.6, setup 29.3.
  Portfolio Pages 451.6 (heaviest step "Test the site builder", 334.0);
  hetzner-gitops CI 275.2 (46 jobs, `pytest` 250.4); Portfolio validate
  204.1; Page integrity 82.6; agent-permission-harness 65.3; per-product
  `*-ci.yml` that ran 43.1 (photo-editing, shed-designer, cut-list-optimizer,
  shed-install-bid-calculator, dupehound, saints-by-candlelight).

### Red `main`

| Workflow | `main` runs | failures | sampled causes (14 runs) |
|---|---:|---:|---|
| Portfolio validate | 1,301 | 788 | 10 `flagships.yaml` `next:` over 2,000 chars; 2 post front matter; 1 router unit test; 1 stale-mirror check |
| Portfolio Pages | 1,919 | 744 (+875 push cancelled) | 12 "Test the site builder"; 1 "Check the built artifact" (`.whl` not in `SERVED_EXTENSIONS`); 1 "Build the site" |

Validate failures on `main` by day: 22 Oct 12/183, 23 Oct 91/173, 24 Oct
106/188, 25 Oct 128/156, 26 Oct 157/202, 27 Oct 114/184, 28 Oct 180/215. Of
the last 120 `main` runs in the week, 116 failed.

One site-builder failure read in full (run of 2026-10-25T19:59Z): 1,094 ok,
182 not ok. The first is `docs/posts/2026-10-25-camt-samples-from-other-projects.md:
description is 186 characters; keep it to 160`, thrown from `loadPost`
(`platform/pages/writing.mjs`) inside `buildSite`, so every test that builds
the site fails with it.

Deploys: `deploy` needs only `build`, and the `main` build sets
`PAGES_SKIP_BAD_POSTS=1`, so a red `test` job does not stop the site. Jobs of
the 1,035 finished (success or failure) `main` runs, as (run, test, build,
deploy): failure/failure/success/success 394; all success 291;
failure/failure/failure/skipped 256; failure/success/failure/skipped 87;
failure/failure/cancelled/skipped 6; other 2. 685 deploys in the week, median
gap 8 minutes, longest 8.7 h (from 2026-10-25 07:13Z), then 8.3 h
(2026-10-24 04:29Z). A first pass used run conclusion as the deploy signal
and got a 53.5 h gap; that was wrong, and the post does not use it. Median
successful run about 10 minutes; median gap between `main` pushes 2.6
minutes; the workflow cancels in-progress runs (875 `main` pushes).

On `main` at d222a59f, `portfolio/router/validate.py` and
`check_post_frontmatter.py` both pass, and the flagship `next:` lengths are
1,976 (ai-bookkeeper), 1,965 (wall-framing-takeoff), 1,902
(einvoice-preflight), 1,649, 1,646, 1,287, 1,025, 1,023, 908, 595.

### hetzner-gitops CI

134 runs in the week, 99 failures (73 PR, 26 `main`). Last failed `main`
run: `pytest gitops/tests -v`, 1 failed, 565 passed, 62 skipped, 654 s.
Its push and PR paths: `infra/**`, `bootstrap/**`, `gitops/**`,
`platform/pages/build.mjs`, `platform/pages/check.mjs`,
`platform/marketing/**`, `platform/pages/launched.json`, `.sops.yaml`, its
own YAML. The workflow header records that the cluster, Terraform and SSH
jobs were removed between 2026-10-01 and 2026-10-22. Before retiring it,
list which tests in `gitops/tests/` import live code (the header names
`test_site_usage.py` against `platform/pages/build.mjs`, and
`test_publish_branch.py`) and move those.

### Per-product workflows

- 478 per-product files; 418 have only `node --test` run steps.
- 414 of those 418: every test-looking JS file in the product is
  `*.test.mjs`, which `ventures-tests.yml` ("node --test in each touched
  venture", `find ventures/$s -name '*.test.mjs'`) already runs on PRs and
  `main` pushes. Not covered by that pattern: `sponsor-ready` (`*.test.js`),
  `chargeback-evidence-packet`, `cam-reconciliation-check`,
  `cash-runway-planner` (`test.mjs`).
- Branches that set off the most per-product runs in the week:
  `claude/happy-johnson-vpbnp6` 989, `claude/epic-wright-ihwfs4` 492,
  `claude/lucid-edison-tp4252` 341.

## Application numbers

- `ventures/`: 1,324 directories, 1,322 `VENTURE.yaml` (1,319 `prototype`,
  3 `idea`), 22,854 files, 595.2 MB. Top 10 by bytes hold 77.8%, top 100
  83.8%. Median 68 KB total, 48 KB source.
- 54 files over 1 MB, 402 MB in all. MP3: saints-by-candlelight 213.0 MB,
  hearth-and-horizon 174.8 MB (45 files together).
- `local-site-studio` 14.0 MB: `src/lib/process/archive/` 7.1 MB in 54
  `business-decisions-archive-NN.ts`; `src/app/docs/architecture/page.tsx`
  483 KB; `src/lib/process/prompt_process.tsx` 252 KB;
  `src/lib/process/business-decisions.ts` 252 KB. The archive is imported by
  the latter two.
- Byte-identical files: 3,950 redundant copies, 8.9 MB (5.0% of the 177 MB
  of non-binary files). Largest groups: `LICENSE` 1,092 + 227 (two
  versions), `robots.txt` 1,016 + 91 + 64, `sitemap.xml` 693,
  `proposal.mjs` and `proposal.test.mjs` 121 each, `proposal-terms.mjs` and
  its test 60, `share.mjs` 39, `share.test.mjs` 38.
- Usage: `portfolio/usage/site-visits.json` has 2026-10-24 (13 loads: about
  4, ask 3, c 3, hearth-and-horizon 3) and 2026-10-26 (7 loads).
  `usage.yaml` lists 298 products; 6 have any non-zero signal, all
  agent-generated (local reports, `tools_published`).
- Other trees for scale: `research/` 1,064 directories, 221 MB (largest
  `marriage-divorce-evidence` 44.6 MB, `homebot` 24.8 MB); `docs/podcast`
  53 MB; `docs/posts` 998 files, 896 dated 24-28 October; `.git` pack
  539 MB in a shallow clone.

## Suggested cuts, for the next run

Search open PRs for each before starting it.

1. Retire `hetzner-gitops-ci.yml` after moving the tests that guard live
   code. Measure with `ci_profile.py` before and after.
2. Make metadata length caps (post `description`, flagship `next:`) stop
   turning `main` red: have `build.test.mjs` skip a bad post the way the
   `main` build does, and catch the caps on the PR, or trim in a
   pre-merge fixer (`platform/ci/shorten_descriptions.py` already exists for
   descriptions). Track `main` failure rate of the two workflows as the
   outcome.
3. Widen `ventures-tests.yml` to `*.test.js` and `test.mjs`, then delete the
   414 per-product workflows it covers.
4. Move `local-site-studio/src/lib/process/archive/` out of the app's import
   graph.
5. One shared `proposal.mjs` / `share.mjs` module.
6. New narrated audio outside git history.

## What this cannot tell

- Whether a guard that never fails is preventing mistakes or checking for
  ones nobody makes.
- Whether any product is used. Unmeasured is not zero (CLAUDE.md).
- Monthly cost: the job-minute window is 103 minutes on one night.
